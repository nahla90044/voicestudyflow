// supabase/functions/music/index.ts
// توليد موسيقى خلفية عبر ElevenLabs Music (v1/music) — مقطوعات أطول وأغنى من
// مؤثرات الصوت، ومرخّصة للاستخدام التجاري على الخطط المدفوعة. المفتاح سرّي بالسيرفر.
//
// كاش مشترك (نفس نمط دالة tts): كل (وصف + طول) يُولَّد **مرة واحدة** ويُخزَّن في
// bucket «music-shared». المقطوعات ثابتة ومحدودة العدد (قائمة MUSIC_OPTIONS)،
// فبعد أول توليد لكل مقطوعة يحصل عليها كل المستخدمين فورًا وبلا تكلفة.
// بدون هذا الكاش كان كل مستخدم ينتظر توليد ٣٠–١٢٠ ثانية من الصوت ويُحاسَب عليه.
//
// الطلب: { prompt: string, lengthMs?: number }  ·  الرد: { audio: base64 mp3 }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUpdatedApp } from "../_shared/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const SHARED_BUCKET = "music-shared";

// بصمة المقطوعة: الوصف + الطول. أي اختلاف فيهما مقطوعة مختلفة.
async function contentKey(prompt: string, lengthMs: number): Promise<string> {
  const data = new TextEncoder().encode(`${lengthMs}|${prompt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // نسخ التطبيق القديمة (قبل 2.0) تُرفض ويُطلب منها التحديث
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? "").slice(0, 600);
    // 3s..10min حسب حدود الخدمة (نبقى ضمن نطاق مناسب للخلفية)
    const lengthMs = Math.min(600000, Math.max(3000, Math.round(Number(body.lengthMs ?? 60000))));
    if (!prompt.trim()) return json({ error: "Empty prompt" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const store = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;
    const key = await contentKey(prompt, lengthMs);

    // وُلّدت من قبل (لأي مستخدم)؟ → أرجعها فورًا بلا انتظار ولا تكلفة
    if (store) {
      try {
        const { data: mp3 } = await store.storage.from(SHARED_BUCKET).download(`${key}.mp3`);
        if (mp3) {
          const audio = bytesToBase64(new Uint8Array(await mp3.arrayBuffer()));
          return json({ audio, shared: true });
        }
      } catch {
        // غير موجودة → نولّد
      }
    }

    // ليست في الكاش → توليد (المقطوعات المحفوظة تعمل بلا مفتاح ElevenLabs)
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");
    const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        prompt,
        music_length_ms: lengthMs,
        model_id: "music_v1",
        force_instrumental: true, // خلفية بلا غناء
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return json({ error: `ElevenLabs ${res.status}: ${msg}` }, 500);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());

    // ارفعها للكاش المشترك ليجدها من بعده جاهزة
    if (store) {
      try {
        await store.storage
          .from(SHARED_BUCKET)
          .upload(`${key}.mp3`, bytes, { contentType: "audio/mpeg", upsert: true });
      } catch {
        // فشل الرفع غير حرج — المقطوعة ترجع للمستخدم على أي حال
      }
    }

    return json({ audio: bytesToBase64(bytes) });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
