// supabase/functions/page-image/index.ts
// يحوّل صفحة PDF إلى صورة PNG عالية الدقة (للعرض القابل للتكبير في القارئ).
// الطلب: { pdfPath, page }   الرد: { image: base64Png, page, totalPages }
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
    const doc = mupdf.Document.openDocument(buf, "application/pdf");
    const totalPages = doc.countPages();
    const p = Math.min(page, totalPages);
    const pg = doc.loadPage(p - 1);
    // دقة عالية (scale 3) لنص واضح عند التكبير
    const pix = pg.toPixmap(mupdf.Matrix.scale(3, 3), mupdf.ColorSpace.DeviceRGB, false);
    const png = pix.asPNG() as Uint8Array;

    return json({ image: bytesToBase64(png), page: p, totalPages });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
