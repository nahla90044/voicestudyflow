// supabase/functions/sfx/index.ts
// توليد مؤثرات صوتية / خلفية موسيقية عبر ElevenLabs Sound Generation.
// المفتاح يبقى سرّيًا بالسيرفر. الطلب: { prompt: string, duration?: number }
// الرد: { audio: base64 mp3 }
import { getCaller } from "../_shared/plan.ts";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // نسخ التطبيق القديمة (قبل 2.0) تُرفض ويُطلب منها التحديث
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;
  try {
    // مستخدم معروف فقط؛ والتوليد الجديد (المدفوع) للمالكة وحدها — الجميع يأخذ المحفوظ مجانًا
    const caller = await getCaller(req);
    if (!caller) return json({ error: "AUTH" }, 401);
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? "").slice(0, 400);
    const duration = Math.min(22, Math.max(0.5, Number(body.duration ?? 3)));
    if (!prompt.trim()) return json({ error: "Empty prompt" }, 400);

    // كاش مشترك في «music-shared/sfx/»: كل مؤثّر يُولَّد مرة واحدة ثم يُخدم للجميع من السيرفر
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const store = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sfx|${duration}|${prompt}`));
    const path = `sfx/${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")}.mp3`;
    if (store) {
      try {
        const { data: mp3 } = await store.storage.from("music-shared").download(path);
        if (mp3) return json({ audio: bytesToBase64(new Uint8Array(await mp3.arrayBuffer())), shared: true });
      } catch {
        // غير موجود → نولّد
      }
    }

    if (caller.plan !== "owner") return json({ error: "NOT_CACHED" }, 404);
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: prompt, duration_seconds: duration, prompt_influence: 0.35 }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      console.error("elevenlabs", res.status, msg.slice(0, 200));
      return json({ error: "GENERATION_FAILED" }, 500);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (store) {
      try {
        await store.storage.from("music-shared").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      } catch {
        // غير حرج
      }
    }
    return json({ audio: bytesToBase64(bytes) });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
