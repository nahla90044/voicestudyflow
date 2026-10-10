// supabase/functions/tts/index.ts
// تحويل نص إلى صوت بشري عبر ElevenLabs — المفتاح يبقى سرّيًا بالسيرفر.
// كاش مشترك: يُولّد كل (نص+صوت) **مرة واحدة** ويُخزّن في bucket «tts-shared»،
// فأي مستخدم يطلب نفس المحتوى يأخذ الصوت الجاهز بلا تكلفة جديدة (مفتاح بالمحتوى لا بالعنوان).
// الطلب:  { text, gender?, voiceId?, expressive?, book?, page? }   الرد: { audio: base64Mp3, starts: number[] }
//
// مزوّدان: الصوت الأساسي Microsoft Azure (voiceId يبدأ بـ «azure:») — رخيص وبلا سقف،
// والصوت الفاخر ElevenLabs. حصة الاشتراك بالصفحات: إن وصل book+page تُحسب صفحة الكتاب
// مرة واحدة في الشهر (حتى لو كان صوتها في الكاش)، وإلا تُحسب الأحرف (القاموس وغيره).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consume, consumePage, getCaller } from "../_shared/plan.ts";
import { requireUpdatedApp } from "../_shared/client.ts";

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

const VOICES: Record<string, string> = {
  female: "RaelJk8tltOJ5KMrKjDu", // Layla — صوت عربي فصيح سردي (أنثى)
  male: "apsZFlSToM2vmFpwz5jX", // Omar — صوت عربي فصيح سردي (ذكر)
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// بصمة المحتوى (نص + صوت + تعبيري) — مفتاح الكاش المشترك.
//
// الموديل عمدًا خارج المفتاح: الكاش يحوي ~٩١٦ ميجابايت صوتًا مدفوعًا سلفًا،
// وإضافة الموديل للمفتاح تُبطله كله وتُجبرنا على إعادة توليده بتكلفة جديدة.
// نتيجة ذلك أن الصفحات المخبّأة تبقى بالموديل القديم والجديدة بالحديث — ونفس
// الصوت (voiceId) في الحالتين، فالفرق في النبرة لا في هويّة المتحدّث.
async function contentKey(voiceId: string, expressive: boolean, text: string): Promise<string> {
  const data = new TextEncoder().encode(`${voiceId}|${expressive ? 1 : 0}|${text}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SHARED_BUCKET = "tts-shared";

// صوت الاحتياط حين لا يتوفر مفتاح Azure بعد (يُحسب صفحة أساسية مع ذلك)
const AZURE_FALLBACK = { male: "apsZFlSToM2vmFpwz5jX", female: "RaelJk8tltOJ5KMrKjDu" };

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const escapeXml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function langOf(t: string): string {
  const ar = (t.match(/[\u0600-\u06FF]/g) ?? []).length;
  const lat = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (ar >= lat) return "ar-SA";
  return /[àâçéèêëîïôûùüÿœ]/i.test(t) ? "fr-FR" : "en-US";
}

/** Azure Neural TTS → mp3 + توقيت تقريبي لكل حرف (توزيع خطّي على مدة المقطع) */
async function azureTts(voiceName: string, text: string): Promise<{ audio: string; starts: number[] } | null> {
  const key = Deno.env.get("AZURE_SPEECH_KEY");
  const region = Deno.env.get("AZURE_SPEECH_REGION");
  if (!key || !region) return null;
  const lang = langOf(text);
  const body = escapeXml(text.replace(/\s*\n\s*/g, " "));
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${voiceName}"><mstts:silence type="Leading-exact" value="0ms"/><mstts:silence type="Tailing-exact" value="250ms"/><lang xml:lang="${lang}">${body}</lang></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "voicestudyflow",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const duration = Math.max(0.3, (bytes.length * 8) / 96_000 - 0.25);
  const n = Math.max(1, text.length);
  const starts = Array.from({ length: n }, (_, i) => (i / n) * duration);
  return { audio: bytesToBase64(bytes), starts };
}

// موديل التوليد. نبقى على multilingual_v2: جُرّب flash_v2_5 ولم تُرضِ نبرته.
// يبقى قابلًا للتبديل من أسرار المشروع (ELEVENLABS_MODEL_ID) بلا إعادة نشر.
const MODEL_ID = Deno.env.get("ELEVENLABS_MODEL_ID") || "eleven_multilingual_v2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // نسخ التطبيق القديمة (قبل 2.0) تُرفض ويُطلب منها التحديث
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? "").slice(0, 5000);
    if (!text.trim()) return json({ error: "Empty text" }, 400);

    const requested: string = body.voiceId || VOICES[body.gender ?? "female"] || VOICES.female;
    const isAzure = requested.startsWith("azure:");
    const tier: "std" | "prem" = isAzure ? "std" : "prem";
    const voiceId = requested;

    // حصة الصفحات: صفحة الكتاب تُحسب مرة واحدة في الفترة (قبل الكاش — قيمة للمستخدم)
    const book = typeof body.book === "string" ? body.book : "";
    const pageNo = Number(body.page);
    const hasPage = !!book && Number.isFinite(pageNo) && pageNo > 0;
    let caller: Awaited<ReturnType<typeof getCaller>> | undefined;
    if (hasPage) {
      caller = await getCaller(req);
      const pageKey = `${(await sha(book)).slice(0, 20)}:${pageNo}`;
      const r = await consumePage(caller, pageKey, tier);
      if (r === "over") {
        return tier === "prem"
          ? json({ error: "PREMIUM_QUOTA", premiumQuota: true, plan: caller?.plan ?? "free" }, 200)
          : json({ error: "USER_QUOTA", userQuota: true, plan: caller?.plan ?? "free" }, 200);
      }
    }

    // كاش مشترك: هل وُلّد هذا المحتوى من قبل (لأي مستخدم)؟ → أرجعه بلا تكلفة
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const store = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;
    const key = await contentKey(voiceId, !!body.expressive, text);

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

    // الصوت الأساسي: Azure (وإن لم يُضبط مفتاحه بعد → صوت ElevenLabs احتياطي)
    let elevenVoice = voiceId;
    if (isAzure) {
      const az = await azureTts(voiceId.slice("azure:".length), text);
      if (az) {
        if (store) {
          try {
            const mp3Bytes = Uint8Array.from(atob(az.audio), (c) => c.charCodeAt(0));
            await store.storage.from(SHARED_BUCKET).upload(`${key}.mp3`, mp3Bytes, { contentType: "audio/mpeg", upsert: true });
            await store.storage.from(SHARED_BUCKET).upload(`${key}.json`, new TextEncoder().encode(JSON.stringify(az.starts)), {
              contentType: "application/json",
              upsert: true,
            });
          } catch {
            // غير حرج
          }
        }
        return json(az);
      }
      elevenVoice = body.gender === "male" ? AZURE_FALLBACK.male : AZURE_FALLBACK.female;
    }

    // الإعداد الافتراضي المتوازن الواضح، أو إعداد أكثر دفئًا وتعبيرًا (للعرض التقديمي)
    const voiceSettings = body.expressive
      ? { stability: 0.4, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true }
      : { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true };

    // with-timestamps: نفس الصوت + توقيت بداية كل حرف (لتزامن الهايلايت كلمة-بكلمة)
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      // نُرجع 200 مع تفصيل الخطأ ليصل للعميل (يكشف نفاد الرصيد quota)، لا 500 مبهم
      const quota = res.status === 401 || res.status === 402 || res.status === 429 || /quota|credit/i.test(msg);
      return json({ error: `ElevenLabs ${res.status}: ${msg}`, quota }, 200);
    }

    const data = await res.json();
    const audio = data?.audio_base64 ?? "";
    const al = data?.alignment ?? data?.normalized_alignment ?? {};
    const starts = al?.character_start_times_seconds ?? [];
    if (!audio) return json({ error: "No audio in response" }, 200);

    // ارفعه للكاش المشترك (مرة واحدة) ليستفيد منه الجميع لاحقًا
    if (store) {
      try {
        const mp3Bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
        await store.storage
          .from(SHARED_BUCKET)
          .upload(`${key}.mp3`, mp3Bytes, { contentType: "audio/mpeg", upsert: true });
        if (Array.isArray(starts) && starts.length) {
          await store.storage
            .from(SHARED_BUCKET)
            .upload(`${key}.json`, new TextEncoder().encode(JSON.stringify(starts)), {
              contentType: "application/json",
              upsert: true,
            });
        }
      } catch {
        // فشل الرفع غير حرج — الصوت يرجع للمستخدم على أي حال
      }
    }

    return json({ audio, starts });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
