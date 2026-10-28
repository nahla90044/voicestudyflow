// lib/aiJobs.ts
// مهام الذكاء الطويلة على السيرفر (ai-assist بوضع job): الطلب يرجع فورًا برقم المهمة، والسيرفر
// يكمل الكتابة ويحفظها أولًا بأول في ai_jobs — فلا يوقفها قفل الشاشة ولا إغلاق التطبيق.
// التطبيق يتابع المهمة (يعرض ما كُتب أولًا بأول)، ورقمها محفوظ على الجهاز لكل جزء،
// فبعد القفل أو إعادة فتح التطبيق يتصل بنفس المهمة بدل طلب جديد (بلا تكلفة مكررة).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

import type { AiAction } from "./ai";
import { getCurrentLang } from "./i18n";
import { jobText, watchInit, watchResume, watchStep, type JobRead, type JobRow } from "./jobWatchCore";
import { streamPart, whenActive } from "./partsRunner";
import { refreshUsage, requestPaywall } from "./plan";
import { checkSecurity } from "./security";
import { APP_VERSION, SUPABASE_FUNCTIONS_URL, SUPABASE_PUBLIC_KEY, supabase } from "./supabase";
import { aiDownError, reportAiDown } from "./aiDown";
import { recordPerf } from "./perf";

const POLL_MS = 2000;
const jobKey = (k: string) => `vsf:aijob:${k}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * vpart: نصيب جزء الفيديو من خطة الوحدة (ملخّص الفيديو ٢) — حقل منظّم يقرؤه السيرفر، لا تعليمات داخل نص الكتاب.
 * genId: معرّف جلسة التوليد، يتغيّر عند إعادة التوليد اليدوية فقط (حذف ثم توليد) — السيرفر يخصم أول طلب للجزء
 * في كل جلسة، وكل إعادة آلية له بعدها مجانية («رصيد الجزء»، ٢٦ أكتوبر).
 */
// targetLang: لغة مخرجات غير لغة الواجهة (لغة شرح الفيديو)؛ study: نوع دراسة الكتاب (كتب اللغة: شرح القواعد والاقتران)
type JobExtra = { deep?: boolean; mode?: string; qaRetryOf?: string; table?: boolean; vpart?: unknown; genId?: string; targetLang?: string; study?: string; exam?: string };

/** أخطاء لا تُعاد ولا يُبحث لها عن بديل (الحصة، المحتوى، الحساب، الحد اليومي، سقف الإعادات المجانية للجزء) */
const STOP = new Set(["USER_QUOTA", "UNSAFE_CONTENT", "ACCOUNT_LOCKED", "RATE_LIMITED", "RETRY_LIMIT", "AI_UNAVAILABLE"]);
/** رمز الخطأ للسجل (أسماء الأخطاء المعروفة فقط، لا رسائل حرة) */
const code = (m: string) => (/^[A-Z_0-9]+$/.test(m) ? m : "ERROR");

/** آخر مهمة اكتملت لكل جزء (لإعادة توليد مجانية إن رفض وكيل الجودة نتيجتها — للتوافق مع السيرفر السابق) */
const lastDone = new Map<string, string>();
export const lastJobId = (key: string) => lastDone.get(key);
/** مهمة اكتملت لكن نتيجتها تعذّرت قراءتها: إعادة الجزء التالية مجانية (لا يدفع المستخدم ثمن خلل الصيغة) */
const freeNext = new Map<string, string>();

async function startJob(action: AiAction, text: string, extra: JobExtra = {}): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_PUBLIC_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_FUNCTIONS_URL}/ai-assist`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLIC_KEY, "x-vsf-version": APP_VERSION },
        body: JSON.stringify({ action, text, targetLang: getCurrentLang(), job: true, ...extra }),
      });
    } catch {
      // الشبكة/المهلة: لا نعرف إن أُنشئت المهمة — يعيد المحرك الجزء لاحقًا (والسيرفر لا يخصم الإعادة مرتين)
      throw new Error("JOB_START");
    }
    const j = (await res.json().catch(() => ({}))) as { jobId?: string; userQuota?: boolean; retryLimit?: boolean; error?: string };
    checkSecurity(j);
    if (j.userQuota) {
      requestPaywall("ai");
      throw new Error("USER_QUOTA");
    }
    if (aiDownError(j.error)) throw reportAiDown();
    if (j.retryLimit || j.error === "RETRY_LIMIT") throw new Error("RETRY_LIMIT");
    if (j.error === "RATE_LIMITED") throw new Error("RATE_LIMITED");
    // خطأ من السيرفر نفسه (تعذّر إنشاء المهمة هناك) → البثّ المباشر بديلًا؛ وغيره (الدخول، التحديث…) يُعاد كما هو
    if (!j.jobId) throw new Error(res.status >= 500 ? "JOB_CREATE" : j.error && /^[A-Z_]+$/.test(j.error) ? j.error : "JOB_START");
    return j.jobId;
  } finally {
    clearTimeout(timer);
  }
}

/** صف المهمة، أو «غير موجودة» (ردّ فارغ بلا خطأ)، أو «تعذّرت القراءة» (شبكة/مهلة — ليست فقدًا للمهمة) */
async function readJob(id: string): Promise<JobRead> {
  try {
    const q = supabase.from("ai_jobs").select("status,partial,result,updated_at,error").eq("id", id).maybeSingle();
    const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 15000));
    const res = await Promise.race([q, timeout]);
    if (res === "timeout") return { kind: "error" };
    const { data, error } = res as { data: JobRow | null; error: unknown };
    if (error) return { kind: "error" };
    return data ? { kind: "row", row: data } : { kind: "missing" };
  } catch {
    return { kind: "error" };
  }
}

/**
 * جزء واحد كمهمة سيرفر. key: هوية ثابتة للجزء (للاتصال بنفس المهمة بعد القفل/إعادة الفتح).
 * يرمي USER_QUOTA/RETRY_LIMIT…، أو JOB_FAILED/JOB_STALLED/JOB_START/JOB_LOST (يعيد المحرك المحاولة).
 */
export async function jobPart<P>(
  action: AiAction,
  ctx: string,
  key: string,
  parsePartial: (raw: string) => P | null,
  parseFull: (raw: string) => P | null,
  onPartial: (p: P, chars: number) => void,
  extra: JobExtra = {},
  /** عدد الأحرف المكتوبة حتى الآن (لتقدّم حقيقي حتى لو لم يكتمل جزء قابل للعرض) */
  onChars?: (chars: number) => void,
  /** إيقاف المتابعة (مهلة خطة الفيديو): المهمة على السيرفر تكمل، والتطبيق يكفّ عن انتظارها */
  signal?: { aborted: boolean }
): Promise<P> {
  const t0 = Date.now();
  try {
    const r = await jobPartInner(action, ctx, key, parsePartial, parseFull, onPartial, extra, onChars, signal);
    recordPerf(`job.${action}`, Date.now() - t0, true, ctx.length);
    return r;
  } catch (e) {
    const m = (e as Error).message;
    // كل عطل يُسجَّل (كان يُسجَّل النجاح وحده)
    if (m !== "ABORTED") recordPerf(`job.${action}.${code(m)}`, Date.now() - t0, false, ctx.length);
    if (STOP.has(m) || m === "ABORTED") throw e;
    // تعذّر إنشاء المهمة على السيرفر → البثّ المباشر بخيارات الطلب نفسها، فلا يتعطل التوليد.
    // أما المهمة المتوقفة فلا يُطلب بجانبها بثّ بعد الآن (٢٦ أكتوبر: كانت المهمة الحية تكمل على السيرفر فيُخصم
    // الاثنان، ثم طلب عادي ثالث): يعيدها المحرك بمهمة جديدة، والسيرفر لا يخصم إعادة الجزء نفسه
    // (المنهج لا بثّ له على السيرفر: بديله إعادة المحرك)
    if (m === "JOB_CREATE" && action !== "syllabus") return streamPart(action, ctx, parsePartial, parseFull, onPartial, extra);
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
  extra: JobExtra = {},
  onChars?: (chars: number) => void,
  signal?: { aborted: boolean }
): Promise<P> {
  let id = await AsyncStorage.getItem(jobKey(key)).catch(() => null);
  if (!id) {
    const free = extra.qaRetryOf ?? freeNext.get(key);
    freeNext.delete(key);
    id = await startJob(action, ctx, free ? { ...extra, qaRetryOf: free } : extra);
    await AsyncStorage.setItem(jobKey(key), id).catch(() => {});
  }
  const forget = () => AsyncStorage.removeItem(jobKey(key)).catch(() => {});
  let lastLen = -1;
  // المتابعة (lib/jobWatchCore): المهمة حية ما دام السيرفر ينبض أو يكتب؛ القراءة المتعذّرة ليست فقدًا
  let w = watchInit(Date.now());
  for (;;) {
    if (signal?.aborted) throw new Error("ABORTED");
    if (AppState.currentState !== "active") {
      await whenActive(); // السيرفر يكمل؛ نتابع عند الرجوع (وقت الغياب لا يُحسب توقّفًا)
      w = watchResume(w, Date.now());
    }
    if (signal?.aborted) throw new Error("ABORTED");
    const read = await readJob(id);
    let raw = "";
    if (read.kind === "row") {
      raw = jobText(read.row);
      if (raw.length !== lastLen) {
        lastLen = raw.length;
        onChars?.(raw.length);
        const p = parsePartial(raw);
        if (p) onPartial(p, raw.length);
      }
    }
    const step = watchStep(w, read, Date.now());
    w = step.state;
    switch (step.verdict) {
      case "done": {
        await forget();
        lastDone.set(key, id);
        refreshUsage();
        const p = parseFull(raw);
        if (!p) {
          freeNext.set(key, id);
          recordPerf(`job.${action}.unreadable`, 0, false, raw.length);
          throw new Error("JOB_FAILED");
        }
        return p;
      }
      case "failed":
        // فشلت على السيرفر (ومنها الردّ الفارغ): السيرفر ردّ خصمها إن لم يصل شيء → نحدّث العدّاد ونعيد الجزء
        await forget();
        refreshUsage();
        // توقف الخدمة من جهتنا (نفاد رصيد المزوّد): لا إعادة، ورسالة صادقة
        if (read.kind === "row" && aiDownError((read.row as { error?: string }).error)) throw reportAiDown();
        throw new Error("JOB_FAILED");
      case "missing":
        // المهمة غير موجودة فعلًا (حُذفت/حساب آخر) بعد عدة قراءات سليمة → نبدأ من جديد
        await forget();
        throw new Error("JOB_FAILED");
      case "stalled":
        // لا نبض ولا نص ٩٠ ثانية والتطبيق في الواجهة → ماتت على السيرفر
        await forget();
        throw new Error("JOB_STALLED");
      case "expired":
        await forget();
        throw new Error("JOB_EXPIRED");
      case "lost":
        // تعذّرت القراءة طويلًا (الشبكة): رقم المهمة يبقى، فالمحاولة التالية تتصل بنفس المهمة لا بمهمة جديدة
        throw new Error("JOB_LOST");
    }
    await sleep(POLL_MS);
  }
}
