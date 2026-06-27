// supabase/functions/ocr-page/index.ts
// OCR لصفحة من كتاب PDF مصوّر:
//  1) ننزّل الـPDF (service role) من حاوية pdfs
//  2) نحوّل الصفحة المطلوبة إلى صورة PNG عبر MuPDF (WASM)
//  3) نرسل الصورة إلى Google Vision (DOCUMENT_TEXT_DETECTION, ar) ونرجّع النص
// إن لم يوجد مفتاح Vision: نرجّع معلومات التحويل فقط (للاختبار).
import * as mupdf from "npm:mupdf@1.3.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

type WordBox = { t: string; x: number; y: number; w: number; h: number };

// نستخرج مربّع كل كلمة من نتيجة Vision (إحداثيات مطبّعة 0..1 بالنسبة لأبعاد الصفحة)
function extractWords(vJson: any): WordBox[] {
  const fta = vJson?.responses?.[0]?.fullTextAnnotation;
  const page0 = fta?.pages?.[0];
  const W = Number(page0?.width) || 0;
  const H = Number(page0?.height) || 0;
  if (!page0 || !W || !H) return [];
  const out: WordBox[] = [];
  for (const block of page0.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const word of para.words ?? []) {
        const t = (word.symbols ?? []).map((s: any) => s.text ?? "").join("");
        if (!t.trim()) continue;
        const vs = word.boundingBox?.vertices ?? [];
        if (vs.length < 2) continue;
        const xs = vs.map((v: any) => Number(v.x) || 0);
        const ys = vs.map((v: any) => Number(v.y) || 0);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        out.push({ t, x: minX / W, y: minY / H, w: (maxX - minX) / W, h: (maxY - minY) / H });
      }
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const pdfPath = String(body.pdfPath ?? "");
    const page = Math.max(1, Number(body.page ?? 1));
    if (!pdfPath) return json({ error: "Missing pdfPath" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing Supabase env");

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: file, error: dErr } = await sb.storage.from("pdfs").download(pdfPath);
    if (dErr || !file) throw dErr ?? new Error("Failed to download PDF");

    const buf = new Uint8Array(await file.arrayBuffer());

    // تحويل الصفحة إلى صورة بدقة محددة
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const totalPages = doc.countPages();
    const p = Math.min(page, totalPages);
    const pg = doc.loadPage(p - 1);
    const renderB64 = (scale: number): { b64: string; bytes: number } => {
      const pix = pg.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
      const png = pix.asPNG() as Uint8Array;
      return { b64: bytesToBase64(png), bytes: png.length };
    };

    const ocrSpaceKey = Deno.env.get("OCR_SPACE_API_KEY");
    const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!ocrSpaceKey && !visionKey) {
      const r0 = renderB64(2);
      return json({ rendered: true, pngBytes: r0.bytes, page: p, totalPages });
    }

    let text = "";
    let words: WordBox[] = [];

    // 1) Google Vision أولًا (احترافي، أدقّ للعربي، بلا حدود حجم تقريبًا)
    if (visionKey) {
      try {
        const b64 = renderB64(2).b64;
        const vRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: b64 },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                imageContext: { languageHints: ["ar", "en"] },
              },
            ],
          }),
        });
        const vJson = await vRes.json();
        if (vRes.ok) {
          text = String(vJson?.responses?.[0]?.fullTextAnnotation?.text ?? "");
          // مربّعات الكلمات الدقيقة (للعدسة/الهايلايت) — من نفس الطلب بلا تكلفة إضافية
          words = extractWords(vJson);
        }
      } catch {
        // نتابع للبديل المجاني
      }
    }

    // 2) بديل احتياطي: OCR.space المجاني (مع تخفيض الدقة لتجاوز حد الحجم)
    if (text.trim().length < 40 && ocrSpaceKey) {
      const callOcrSpace = async (b64: string, engine: string): Promise<string> => {
        const form = new URLSearchParams();
        form.set("base64Image", `data:image/png;base64,${b64}`);
        form.set("language", "ara");
        form.set("OCREngine", engine);
        form.set("isOverlayRequired", "false");
        form.set("scale", "true");
        const r = await fetch("https://api.ocr.space/parse/image", {
          method: "POST",
          headers: { apikey: ocrSpaceKey, "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        const j = await r.json();
        if (j?.IsErroredOnProcessing) return "";
        return String(j?.ParsedResults?.[0]?.ParsedText ?? "");
      };
      for (const scale of [1.5, 1.1, 0.85]) {
        const { b64, bytes } = renderB64(scale);
        if (bytes > 1_000_000 && scale > 0.85) continue;
        text = await callOcrSpace(b64, "1");
        if (text.trim().length >= 40) break;
        text = await callOcrSpace(b64, "2");
        if (text.trim().length >= 40) break;
      }
    }

    return json({ text, words, page: p, totalPages });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
