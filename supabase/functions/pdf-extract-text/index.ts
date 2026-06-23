// supabase/functions/pdf-extract-text/index.ts
// تستخرج نص صفحة محددة من ملف PDF مخزّن في bucket: pdfs
// الطلب:  { pdfPath: string, page?: number }   (page تبدأ من 1)
// الرد:   { page, totalPages, text }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@1.6.2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase env vars");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const pdfPath: string | undefined = body.pdfPath;
    const requestedPage = Math.max(1, Number(body.page ?? 1) || 1);

    if (!pdfPath) return json({ error: "Missing pdfPath" }, 400);

    const { data: file, error: dErr } = await supabase.storage
      .from("pdfs")
      .download(pdfPath);
    if (dErr || !file) throw dErr ?? new Error("Failed to download PDF");

    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);

    // نص كل الصفحات كمصفوفة
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];

    const page = Math.min(requestedPage, totalPages);
    const pageText = (pages[page - 1] ?? "").replace(/\s+/g, " ").trim();

    return json({ page, totalPages, text: pageText });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
