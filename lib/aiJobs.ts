// lib/aiJobs.ts
// مهام الذكاء الطويلة على السيرفر (ai-assist بوضع job): الطلب يرجع فورًا برقم المهمة، والسيرفر
// يكمل الكتابة ويحفظها أولًا بأول في ai_jobs — فلا يوقفها قفل الشاشة ولا إغلاق التطبيق.
// التطبيق يتابع المهمة (يعرض ما كُتب أولًا بأول)، ورقمها محفوظ على الجهاز لكل جزء،
// فبعد القفل أو إعادة فتح التطبيق يتصل بنفس المهمة بدل طلب جديد (بلا تكلفة مكررة).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

import type { AiAction } from "./ai";
import { getCurrentLang } from "./i18n";
import { streamPart, whenActive } from "./partsRunner";
import { refreshUsage, requestPaywall } from "./plan";
import { checkSecurity } from "./security";
import { APP_VERSION, SUPABASE_FUNCTIONS_URL, SUPABASE_PUBLIC_KEY, supabase } from "./supabase";
import { recordPerf } from "./perf";

const POLL_MS = 2000;
const MAX_AGE_MS = 9 * 60 * 1000; // مهمة «قيد التشغيل» أقدم من هذا = متوقفة على السيرفر → تُعاد
const jobKey = (k: string) => `vsf:aijob:${k}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startJob(action: AiAction, text: string, extra: { deep?: boolean; mode?: string } = {}): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_PUBLIC_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/ai-assist`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLIC_KEY, "x-vsf-version": APP_VERSION },
      body: JSON.stringify({ action, text, targetLang: getCurrentLang(), job: true, ...extra }),
    });
    const j = (await res.json().catch(() => ({}))) as { jobId?: string; userQuota?: boolean; error?: string };
    checkSecurity(j);
    if (j.userQuota) {
      requestPaywall("ai");
      throw new Error("USER_QUOTA");
    }
    if (!j.jobId) throw new Error(j.error || `HTTP_${res.status}`);
    return j.jobId;
  } finally {
    clearTimeout(timer);
  }
}

type Row = { status: "running" | "done" | "failed"; partial: string; result: string | null; created_at: string };

async function readJob(id: string): Promise<Row | null> {
  const q = supabase.from("ai_jobs").select("status,partial,result,created_at").eq("id", id).maybeSingle();
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 15000));
  const res = (await Promise.race([q, timeout])) as { data: Row | null } | null;
  return res?.data ?? null;
}

/**
 * جزء واحد كمهمة سيرفر. key: هوية ثابتة للجزء (للاتصال بنفس المهمة بعد القفل/إعادة الفتح).
 * يرمي USER_QUOTA، أو JOB_FAILED (يعيد المحرك المحاولة بمهمة جديدة).
 */
export async function jobPart<P>(
  action: AiAction,
  ctx: string,
  key: string,
  parsePartial: (raw: string) => P | null,
  parseFull: (raw: string) => P | null,
  onPartial: (p: P, chars: number) => void,
  extra: { deep?: boolean; mode?: string } = {}
): Promise<P> {
  const t0 = Date.now();
  try {
    const r = await jobPartInner(action, ctx, key, parsePartial, parseFull, onPartial, extra);
    recordPerf(`job.${action}`, Date.now() - t0, true, ctx.length);
    return r;
  } catch (e) {
    const m = (e as Error).message;
    if (m === "USER_QUOTA" || m === "UNSAFE_CONTENT" || m === "ACCOUNT_LOCKED") throw e;
    // احتياط: تعذّرت مهمة السيرفر (أو لم تبدأ الكتابة) → البثّ المباشر المعتاد، فلا يتعطل التوليد أبدًا
    if (m === "JOB_START" || m === "JOB_STALLED") return streamPart(action, ctx, parsePartial, parseFull, onPartial);
    throw e;
  }
}

async function jobPartInner<P>(
  action: AiAction,
  ctx: string,
  key: string,
  parsePartial: (raw: string) => P | null,
  parseFull: (raw: string) => P | null,
  onPartial: (p: P, chars: number) => void,
  extra: { deep?: boolean; mode?: string } = {}
): Promise<P> {
  let id = await AsyncStorage.getItem(jobKey(key)).catch(() => null);
  if (!id) {
    id = await startJob(action, ctx, extra).catch((e) => {
      const m = (e as Error).message;
      throw new Error(m === "USER_QUOTA" || m === "UNSAFE_CONTENT" || m === "ACCOUNT_LOCKED" ? m : "JOB_START");
    });
    await AsyncStorage.setItem(jobKey(key), id).catch(() => {});
  }
  const forget = () => AsyncStorage.removeItem(jobKey(key)).catch(() => {});
  let lastLen = -1;
  let missing = 0;
  for (;;) {
    if (AppState.currentState !== "active") await whenActive(); // السيرفر يكمل؛ نتابع عند الرجوع
    const row = await readJob(id).catch(() => null);
    if (!row) {
      // المهمة غير موجودة (حُذفت/حساب آخر) بعد عدة محاولات → نبدأ من جديد
      if (++missing >= 5) {
        await forget();
        throw new Error("JOB_FAILED");
      }
    } else {
      missing = 0;
      const raw = row.status === "done" ? row.result ?? row.partial : row.partial;
      if (raw.length !== lastLen) {
        lastLen = raw.length;
        const p = parsePartial(raw);
        if (p) onPartial(p, raw.length);
      }
      if (row.status === "done") {
        await forget();
        refreshUsage();
        const p = parseFull(raw);
        if (!p) throw new Error("JOB_FAILED");
        return p;
      }
      const age = Date.now() - new Date(row.created_at).getTime();
      // لم يُكتب حرف خلال ٩٠ ثانية والتطبيق في الواجهة → المهمة لم تعمل على السيرفر
      if (row.status === "running" && !row.partial && age > 90_000) {
        await forget();
        throw new Error("JOB_STALLED");
      }
      if (row.status === "failed" || age > MAX_AGE_MS) {
        await forget();
        throw new Error("JOB_FAILED");
      }
    }
    await sleep(POLL_MS);
  }
}
