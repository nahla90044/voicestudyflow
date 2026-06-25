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

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          // نبرة شارحة لكن قوية وواضحة: ثبات أعلى قليلًا + أسلوب معتدل
          voice_settings: { stability: 0.55, similarity_boost: 0.9, style: 0.25, use_speaker_boost: true },
        }),
      }
    );

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return json({ error: `ElevenLabs ${res.status}: ${msg}` }, 500);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    return json({ audio: bytesToBase64(bytes) });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
