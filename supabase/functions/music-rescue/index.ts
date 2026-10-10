// supabase/functions/music-rescue/index.ts
// إنقاذ الموسيقى المولّدة سابقًا (ElevenLabs) من جوال المالكة: التطبيق يرفع كل مقطوعة
// محفوظة عنده إلى bucket «music-shared/rescued/» فتُحفظ نسختها على السيرفر.
// للمالكة فقط (حساب نهلة). الطلب: { name, audio: base64 mp3 }
import { getCaller } from "../_shared/plan.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vsf-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const caller = await getCaller(req);
  if (caller?.plan !== "owner") return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 80);
  const audio = String(body.audio ?? "");
  if (!name || !audio) return json({ error: "bad request" }, 400);
  const bin = atob(audio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { error } = await caller.admin.storage
    .from("music-shared")
    .upload(`rescued/${name}.mp3`, bytes, { contentType: "audio/mpeg", upsert: true });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, bytes: bytes.length });
});
