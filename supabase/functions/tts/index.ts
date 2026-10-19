// supabase/functions/tts/index.ts
// تحويل نص إلى صوت عبر Google Gemini TTS — المفتاح يبقى سرّيًا بالسيرفر.
// كاش مشترك: يُولّد كل (نص+صوت) **مرة واحدة** ويُخزّن في bucket «tts-shared»،
// فأي مستخدم يطلب نفس المحتوى يأخذ الصوت الجاهز بلا تكلفة جديدة (مفتاح بالمحتوى لا بالعنوان).
// الطلب:  { text, gender?, voiceId?, style?, expressive?, book?, page? }   الرد: { audio: base64Mp3, starts: number[] }
//
// مزوّد واحد: جيميناي (voiceId «gemini:<اسم>»، والمعرّفات القديمة تتحوّل لأقرب صوت).
// حصة الاشتراك بالصفحات: إن وصل book+page تُحسب صفحة الكتاب مرة واحدة في الشهر
// (حتى لو كان صوتها في الكاش)، وإلا تُحسب الأحرف (القاموس وغيره).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consume, consumePage, getCaller } from "../_shared/plan.ts";
import { requireUpdatedApp } from "../_shared/client.ts";
import { GEMINI_MODEL, geminiMp3, geminiVoiceFor, READ_STYLES, type ReadStyle } from "../_shared/gemini.ts";
import { logCost, userIdFrom } from "../_shared/cost.ts";
import { canAccessPdf } from "../_shared/paths.ts";
import { isLocked, LOCKED_BODY } from "../_shared/guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// بصمة المحتوى (نص + صوت + تعبيري) — مفتاح الكاش المشترك.
// v2: أُزيل التوجيه قبل النص (كان يُقرأ أحيانًا وسط الكلام) — المقاطع القديمة تُولَّد من جديد.
// القراءة العادية تبقى على نفس المفتاح القديم (كاشها صالح)، وكل طريقة قراءة لها مفتاحها.
async function contentKey(voiceId: string, style: ReadStyle, text: string): Promise<string> {
  return sha(style === "normal" ? `v2|${voiceId}|0|${text}` : `v2|${voiceId}|${style}|${text}`);
}

const SHARED_BUCKET = "tts-shared";
// أطول صفحة حقيقية مقيسة ٥٤٤٩ حرفًا؛ ١٠٠٠٠ يغطيها مع التشكيل وإعادة توليد بعض الجمل
const PAGE_CHAR_CAP = 10000;

// بعد رفض جوجل بسبب الحد (429) نتوقف عن مراسلتها دقيقة: كل طلب جديد يرجع فورًا
// فيكمل التطبيق بصوت الجهاز بدل انتظار رفض جديد في كل جملة.
let coolUntil = 0;

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // نسخ التطبيق القديمة (قبل 2.0) تُرفض ويُطلب منها التحديث
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;

  try {
    if (await isLocked(req)) return json(LOCKED_BODY, 200);
    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? "").slice(0, 5000);
    if (!text.trim()) return json({ error: "Empty text" }, 400);

    // كل الأصوات جيميناي (المعرّفات القديمة تتحوّل لأقرب صوت) — فئة واحدة للصفحات
    const voiceName = geminiVoiceFor(body.voiceId, body.gender);
    const voiceId = `gemini:${voiceName}`;
    // طريقة القراءة يختارها المستخدم؛ النسخ الأقدم ترسل expressive (سرد العرض التقديمي) = قصصية
    const style: ReadStyle = READ_STYLES.includes(body.style) ? body.style : body.expressive ? "story" : "normal";

    // حصة الصفحات: صفحة الكتاب تُحسب مرة واحدة في الفترة (قبل الكاش — قيمة للمستخدم)
    const book = typeof body.book === "string" ? body.book : "";
    const pageNo = Number(body.page);
    // صفحة كتاب محسوبة فقط إن كان الكتاب ملك المستخدم (أو عيّنة) — وإلا تُعامل كنص عادي يُحسب بالحروف
    const uidReq = userIdFrom(req);
    const hasPage = !!book && !!uidReq && canAccessPdf(book, uidReq) && Number.isFinite(pageNo) && pageNo > 0 && pageNo < 100000;
    let caller: Awaited<ReturnType<typeof getCaller>> | undefined;
    const pageKey = hasPage ? `${(await sha(book)).slice(0, 20)}:${pageNo}` : undefined;

    // البحث في الكاش المشترك يبدأ الآن بالتوازي مع حساب الحصة (لا ينتظر أحدهما الآخر)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const store = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;
    const key = await contentKey(voiceId, style, text);
    const cachedP = store
      ? Promise.all([
          store.storage.from(SHARED_BUCKET).download(`${key}.mp3`).then((r) => r.data).catch(() => null),
          store.storage.from(SHARED_BUCKET).download(`${key}.json`).then((r) => r.data).catch(() => null),
        ])
      : Promise.resolve([null, null] as const);

    if (hasPage && pageKey) {
      caller = await getCaller(req);
      const r = await consumePage(caller, pageKey, "std");
      if (r === "over") return json({ error: "USER_QUOTA", userQuota: true, plan: caller?.plan ?? "free" }, 200);
    }

    // كاش مشترك: هل وُلّد هذا المحتوى من قبل (لأي مستخدم)؟ → أرجعه بلا تكلفة
    if (store) {
      try {
        const [mp3, tj] = await cachedP;
        if (mp3) {
          const audio = bytesToBase64(new Uint8Array(await mp3.arrayBuffer()));
          let starts: number[] = [];
          try {
            if (tj) starts = JSON.parse(await tj.text());
          } catch {}
          void logCost(req, { fn: "tts", action: hasPage ? "page" : "voice", model: GEMINI_MODEL, chars: text.length, cached: true, page_key: pageKey });
          return json({ audio, starts, shared: true });
        }
      } catch {
        // غير موجود → نولّد
      }
    }

    // صفحة الكتاب: سقف حروف لكل صفحة في الشهر (أعلى من أطول صفحة حقيقية) — ما يتجاوزه يُحسب بالأحرف
    let pageCovered = false;
    if (hasPage && caller && pageKey) {
      const { data: okCap, error: capErr } = await caller.admin.rpc("add_page_chars", {
        p_user: caller.id,
        p_period: new Date().toISOString().slice(0, 7),
        p_key: pageKey,
        p_chars: text.length,
        p_cap: PAGE_CHAR_CAP,
      });
      pageCovered = caller.plan === "owner" || (!capErr && okCap === true);
    }
    // توليد جديد (ليس في الكاش) خارج صفحات الكتب أو فوق سقف الصفحة → يُحسب بالأحرف
    if (!pageCovered) {
      caller ??= await getCaller(req);
      if (!(await consume(caller, "voice", text.length))) {
        // حصة المستخدم انتهت: التطبيق يكمل بصوت الجهاز ويعرض الاشتراك
        return json({ error: "USER_QUOTA", userQuota: true, plan: caller?.plan ?? "free" }, 200);
      }
    }

    if (Date.now() < coolUntil) return json({ error: "RATE_LIMITED", rateLimited: true }, 200);
    let out: { mp3: Uint8Array; seconds: number; f0: number };
    const t0 = Date.now();
    try {
      out = await geminiMp3(voiceName, text, style);
      void logCost(req, { fn: "tts", action: hasPage ? "page" : "voice", model: GEMINI_MODEL, chars: text.length, audio_seconds: out.seconds, page_key: pageKey });
    } catch (e) {
      // نُرجع 200 مع التفصيل ليصل للعميل فيكمل بصوت الجهاز (لا يتوقف)، لا 500 مبهم
      const msg = (e as Error).message;
      console.error("tts gemini failed:", msg.slice(0, 300), "chars:", text.length);
      if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) coolUntil = Date.now() + 60_000;
      // نفاد الرصيد المدفوع فقط يُعدّ «quota»؛ الحد المؤقت والبطء يرجعان لصوت الجهاز
      return json({ error: msg, quota: /billing|prepay|credit/i.test(msg) && !/\b429\b/.test(msg) }, 200);
    }

    // ثبات صوت القارئة: التطبيق يرسل متوسط طبقة الجمل السابقة (refF0). جملة شاذة (>١١٪)
    // تُولَّد مرة ثانية ببذرة أخرى ونأخذ الأقرب — قيس ١٧ أكتوبر: الشاذة ٢٥٪ → ٠٪، والتفاوت ١٦ → ١٠Hz.
    // فقط إن بقي وقت (لا نتجاوز مهلة التطبيق).
    const ref = Number(body.refF0);
    const off = (f: number) => (f > 0 && ref > 0 ? Math.abs(f - ref) / ref : 0);
    const used = Date.now() - t0;
    if (ref > 0 && off(out.f0) > 0.11 && used < 7000) {
      try {
        const again = await geminiMp3(voiceName, text, style, 11, Math.min(9000, 20000 - used));
        // إعادة التوليد لثبات الصوت تكلفة حقيقية أيضًا
        void logCost(req, { fn: "tts", action: "retry", model: GEMINI_MODEL, chars: text.length, audio_seconds: again.seconds, page_key: pageKey });
        if (again.f0 > 0 && off(again.f0) < off(out.f0)) out = again;
      } catch {
        // المحاولة الثانية اختيارية — نكمل بالأولى
      }
    }

    // توقيت تقريبي لكل حرف (توزيع خطّي على مدة المقطع) — لتزامن الهايلايت
    const n = Math.max(1, text.length);
    const dur = Math.max(0.3, out.seconds);
    const starts = Array.from({ length: n }, (_, i) => Math.round((i / n) * dur * 1000) / 1000);
    const audio = bytesToBase64(out.mp3);

    // ارفعه للكاش المشترك (مرة واحدة) ليستفيد منه الجميع لاحقًا — في الخلفية بعد الرد، فلا ينتظره المستخدم
    if (store) {
      const mp3 = out.mp3;
      const save = Promise.all([
        store.storage.from(SHARED_BUCKET).upload(`${key}.mp3`, mp3, { contentType: "audio/mpeg", upsert: true }),
        store.storage.from(SHARED_BUCKET).upload(`${key}.json`, new TextEncoder().encode(JSON.stringify(starts)), {
          contentType: "application/json",
          upsert: true,
        }),
      ]).catch(() => {}); // فشل الرفع غير حرج
      const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (rt) rt.waitUntil(save);
      else await save;
    }

    return json({ audio, starts, f0: out.f0 });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
