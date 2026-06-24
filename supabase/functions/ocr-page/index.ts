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

    // تحويل الصفحة إلى صورة
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const totalPages = doc.countPages();
    const p = Math.min(page, totalPages);
    const pg = doc.loadPage(p - 1);
    const pix = pg.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
    const png = pix.asPNG() as Uint8Array;

    const ocrSpaceKey = Deno.env.get("OCR_SPACE_API_KEY");
    const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!ocrSpaceKey && !visionKey) {
      // وضع اختبار: نتأكد فقط أن التحويل نجح
      return json({ rendered: true, pngBytes: png.length, page: p, totalPages });
    }

    const b64 = bytesToBase64(png);
    let text = "";

    if (ocrSpaceKey) {
      // OCR.space (مجاني، يدعم العربي عبر المحرّك 1)
      const form = new URLSearchParams();
      form.set("base64Image", `data:image/png;base64,${b64}`);
      form.set("language", "ara");
      form.set("OCREngine", "1");
      form.set("isOverlayRequired", "false");
      form.set("scale", "true");
      const r = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: {
          apikey: ocrSpaceKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const j = await r.json();
      if (j?.IsErroredOnProcessing) {
        const msg = Array.isArray(j?.ErrorMessage) ? j.ErrorMessage.join(" ") : String(j?.ErrorMessage ?? "OCR.space error");
        return json({ error: msg }, 500);
      }
      text = j?.ParsedResults?.[0]?.ParsedText ?? "";
    } else if (visionKey) {
      // Google Vision (دقة أعلى، يتطلب تفعيل الفوترة)
      const vRes = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
        {
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
        }
      );
      const vJson = await vRes.json();
      if (!vRes.ok) {
        const msg = vJson?.error?.message ?? `Vision ${vRes.status}`;
        return json({ error: msg }, 500);
      }
      text = vJson?.responses?.[0]?.fullTextAnnotation?.text ?? "";
    }

    return json({ text, page: p, totalPages });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
