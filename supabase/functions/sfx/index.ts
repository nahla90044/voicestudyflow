// supabase/functions/sfx/index.ts
// توليد مؤثرات صوتية / خلفية موسيقية عبر ElevenLabs Sound Generation.
// المفتاح يبقى سرّيًا بالسيرفر. الطلب: { prompt: string, duration?: number }
// الرد: { audio: base64 mp3 }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? "").slice(0, 400);
    const duration = Math.min(22, Math.max(0.5, Number(body.duration ?? 3)));
    if (!prompt.trim()) return json({ error: "Empty prompt" }, 400);

    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: prompt, duration_seconds: duration, prompt_influence: 0.35 }),
    });
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
