// supabase/functions/card-image/index.ts
// صورة توضيحية لبطاقة مراجعة (تسهيل الحفظ) عبر نموذج صور جيميناي على Vertex.
// - مشتركة: نفس البطاقة (السؤال+الجواب) تُولَّد مرة واحدة وتُخدم للجميع من المخزن.
// - للمشتركين والمالكة، بسقف شهري لكل باقة (ضبط التكلفة). الصورة بلا أي كتابة.
// الطلب: { front, back }  الرد: { url } أو { error: "PLAN" | "CAP" | ... }
import { requireUpdatedApp } from "../_shared/client.ts";
import { getCaller } from "../_shared/plan.ts";
import { logCost } from "../_shared/cost.ts";
import { isLocked, LOCKED_BODY } from "../_shared/guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vsf-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PROJECT = Deno.env.get("GOOGLE_CLOUD_PROJECT") ?? "gen-lang-client-0211542939";
const MODELS = (Deno.env.get("CARD_IMAGE_MODELS") ?? "gemini-2.5-flash-image").split(",").map((s) => s.trim()).filter(Boolean);
const MONTHLY_CAP: Record<string, number> = { plus: 150, pro: 300, premium: 500 };
const BUCKET = "card-images";

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function generate(front: string, back: string): Promise<{ bytes: Uint8Array; mime: string; model: string }> {
  const key = Deno.env.get("GOOGLE_TTS_API_KEY");
  if (!key) throw new Error("Missing GOOGLE_TTS_API_KEY");
  const prompt =
    `Create one simple, memorable educational illustration that visually represents this flashcard so a student can remember it.\n` +
    `Card question: ${front}\nCard answer: ${back}\n` +
    `Style: clean modern flat vector illustration, soft friendly colors, plain white background, one clear central subject or a simple visual metaphor for abstract ideas, culturally neutral and respectful.\n` +
    `Strict rule: absolutely no text, no letters, no numbers, no words, no captions, no labels anywhere in the image.`;
  let last = "";
  for (const model of MODELS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(`https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
        }),
      });
      if (!res.ok) {
        last = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
        continue;
      }
      const j = await res.json();
      const parts = j?.candidates?.[0]?.content?.parts ?? [];
      const img = parts.find((p: any) => p?.inlineData?.data);
      if (img) return { bytes: b64ToBytes(img.inlineData.data), mime: img.inlineData.mimeType || "image/png", model };
      last = `${model}: no image`;
    } catch (e) {
      last = `${model}: ${(e as Error).message}`;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(last || "no model");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;
  try {
    const body = await req.json().catch(() => ({}));
    const front = String(body.front ?? "").trim().slice(0, 300);
    const back = String(body.back ?? "").trim().slice(0, 500);
    if (!front) return json({ error: "EMPTY" }, 400);

    const caller = await getCaller(req);
    if (!caller) return json({ error: "AUTH" }, 401);
    if (await isLocked(req)) return json(LOCKED_BODY);
    const admin = caller.admin;
    const hash = await sha(`v1|${front.replace(/\s+/g, " ")}|${back.replace(/\s+/g, " ")}`);
    const publicUrl = (path: string) => admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // مولّدة سابقًا (لأي مستخدم) → فورًا وبلا تكلفة
    const { data: hit } = await admin.from("card_images").select("path").eq("hash", hash).maybeSingle();
    if (hit?.path) {
      void logCost(req, { fn: "card-image", action: "image", images: 0, cached: true });
      return json({ url: publicUrl(hit.path), shared: true });
    }

    if (caller.plan === "free" || (caller.trial && caller.plan !== "owner")) return json({ error: "PLAN" });
    if (caller.plan !== "owner") {
      const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
      const { count } = await admin.from("card_images").select("hash", { count: "exact", head: true }).eq("created_by", caller.id).gte("created_at", monthStart);
      if ((count ?? 0) >= (MONTHLY_CAP[caller.plan] ?? 0)) return json({ error: "CAP" });
    }

    const { bytes, mime, model } = await generate(front, back);
    void logCost(req, { fn: "card-image", action: "image", model, images: 1 });
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    const path = `${hash.slice(0, 2)}/${hash}.${ext}`;
    const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "31536000" });
    if (up.error) throw new Error(up.error.message);
    await admin.from("card_images").upsert({ hash, path, created_by: caller.id });
    return json({ url: publicUrl(path) });
  } catch (e) {
    console.error("card-image", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
