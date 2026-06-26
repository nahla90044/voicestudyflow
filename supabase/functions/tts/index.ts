// supabase/functions/tts/index.ts
// تحويل نص إلى صوت بشري عبر ElevenLabs — المفتاح يبقى سرّيًا بالسيرفر.
// الطلب:  { text: string, gender?: "male" | "female", voiceId?: string }
// الرد:   { audio: base64Mp3 }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? "").slice(0, 5000);
    if (!text.trim()) return json({ error: "Empty text" }, 400);

    const voiceId = body.voiceId || VOICES[body.gender ?? "female"] || VOICES.female;

    // الإعداد الافتراضي المتوازن الواضح، أو إعداد أكثر دفئًا وتعبيرًا (للعرض التقديمي)
    const voiceSettings = body.expressive
      ? { stability: 0.4, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true }
      : { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true };

    // with-timestamps: نفس الصوت + توقيت بداية كل حرف (لتزامن الهايلايت كلمة-بكلمة)
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
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
    return json({ audio, starts });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
