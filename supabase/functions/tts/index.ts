// supabase/functions/tts/index.ts
// تحويل نص إلى صوت عبر Google Gemini TTS — المفتاح يبقى سرّيًا بالسيرفر.
// كاش مشترك: يُولّد كل (نص+صوت) **مرة واحدة** ويُخزّن في bucket «tts-shared»،
// فأي مستخدم يطلب نفس المحتوى يأخذ الصوت الجاهز بلا تكلفة جديدة (مفتاح بالمحتوى لا بالعنوان).
// الطلب:  { text, gender?, voiceId?, expressive?, book?, page? }   الرد: { audio: base64Mp3, starts: number[] }
//
// مزوّد واحد: جيميناي (voiceId «gemini:<اسم>»، والمعرّفات القديمة تتحوّل لأقرب صوت).
// حصة الاشتراك بالصفحات: إن وصل book+page تُحسب صفحة الكتاب مرة واحدة في الشهر
// (حتى لو كان صوتها في الكاش)، وإلا تُحسب الأحرف (القاموس وغيره).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consume, consumePage, getCaller } from "../_shared/plan.ts";
import { requireUpdatedApp } from "../_shared/client.ts";
import { geminiMp3, geminiVoiceFor } from "../_shared/gemini.ts";

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

// بصمة المحتوى (نص + صوت + تعبيري) — مفتاح الكاش المشترك
async function contentKey(voiceId: string, expressive: boolean, text: string): Promise<string> {
  return sha(`${voiceId}|${expressive ? 1 : 0}|${text}`);
}

const SHARED_BUCKET = "tts-shared";

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
    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? "").slice(0, 5000);
    if (!text.trim()) return json({ error: "Empty text" }, 400);

    // كل الأصوات جيميناي (المعرّفات القديمة تتحوّل لأقرب صوت) — فئة واحدة للصفحات
    const voiceName = geminiVoiceFor(body.voiceId, body.gender);
    const voiceId = `gemini:${voiceName}`;
    const expressive = !!body.expressive;

    // حصة الصفحات: صفحة الكتاب تُحسب مرة واحدة في الفترة (قبل الكاش — قيمة للمستخدم)
    const book = typeof body.book === "string" ? body.book : "";
    const pageNo = Number(body.page);
    const hasPage = !!book && Number.isFinite(pageNo) && pageNo > 0;
    let caller: Awaited<ReturnType<typeof getCaller>> | undefined;
    if (hasPage) {
      caller = await getCaller(req);
      const pageKey = `${(await sha(book)).slice(0, 20)}:${pageNo}`;
      const r = await consumePage(caller, pageKey, "std");
      if (r === "over") return json({ error: "USER_QUOTA", userQuota: true, plan: caller?.plan ?? "free" }, 200);
    }

    // كاش مشترك: هل وُلّد هذا المحتوى من قبل (لأي مستخدم)؟ → أرجعه بلا تكلفة
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const store = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;
    const key = await contentKey(voiceId, expressive, text);

    if (store) {
      try {
        const { data: mp3 } = await store.storage.from(SHARED_BUCKET).download(`${key}.mp3`);
        if (mp3) {
          const audio = bytesToBase64(new Uint8Array(await mp3.arrayBuffer()));
          let starts: number[] = [];
          try {
            const { data: tj } = await store.storage.from(SHARED_BUCKET).download(`${key}.json`);
            if (tj) starts = JSON.parse(await tj.text());
          } catch {}
          return json({ audio, starts, shared: true });
        }
      } catch {
        // غير موجود → نولّد
      }
    }

    // توليد جديد (ليس في الكاش) خارج صفحات الكتب → يُحسب بالأحرف
    if (!hasPage) {
      caller = await getCaller(req);
      if (!(await consume(caller, "voice", text.length))) {
        // حصة المستخدم انتهت: التطبيق يكمل بصوت الجهاز ويعرض الاشتراك
        return json({ error: "USER_QUOTA", userQuota: true, plan: caller?.plan ?? "free" }, 200);
      }
    }

    if (Date.now() < coolUntil) return json({ error: "RATE_LIMITED", rateLimited: true }, 200);
    let out: { mp3: Uint8Array; seconds: number };
    try {
      out = await geminiMp3(voiceName, text, expressive);
    } catch (e) {
      // نُرجع 200 مع التفصيل ليصل للعميل فيكمل بصوت الجهاز (لا يتوقف)، لا 500 مبهم
      const msg = (e as Error).message;
      console.error("tts gemini failed:", msg.slice(0, 300), "chars:", text.length);
      if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) coolUntil = Date.now() + 60_000;
      // نفاد الرصيد المدفوع فقط يُعدّ «quota»؛ الحد المؤقت والبطء يرجعان لصوت الجهاز
      return json({ error: msg, quota: /billing|prepay|credit/i.test(msg) && !/\b429\b/.test(msg) }, 200);
    }

    // توقيت تقريبي لكل حرف (توزيع خطّي على مدة المقطع) — لتزامن الهايلايت
    const n = Math.max(1, text.length);
    const dur = Math.max(0.3, out.seconds);
    const starts = Array.from({ length: n }, (_, i) => Math.round((i / n) * dur * 1000) / 1000);
    const audio = bytesToBase64(out.mp3);

    // ارفعه للكاش المشترك (مرة واحدة) ليستفيد منه الجميع لاحقًا
    if (store) {
      try {
        await store.storage.from(SHARED_BUCKET).upload(`${key}.mp3`, out.mp3, { contentType: "audio/mpeg", upsert: true });
        await store.storage.from(SHARED_BUCKET).upload(`${key}.json`, new TextEncoder().encode(JSON.stringify(starts)), {
          contentType: "application/json",
          upsert: true,
        });
      } catch {
        // فشل الرفع غير حرج — الصوت يرجع للمستخدم على أي حال
      }
    }

    return json({ audio, starts });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
