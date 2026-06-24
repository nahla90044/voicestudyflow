// supabase/functions/pdf-extract-text/index.ts
// تستخرج نص صفحة محددة من ملف PDF مخزّن في bucket: pdfs
// الطلب:  { pdfPath: string, page?: number }   (page تبدأ من 1)
// الرد:   { page, totalPages, text }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy } from "https://esm.sh/unpdf@1.6.2";

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
    const totalPages = pdf.numPages;
    const page = Math.min(requestedPage, totalPages);

    // نستخرج عناصر النص مع الفواصل: نضيف مسافة بين كل عنصر حتى لا تلتصق
    // الكلمات (مشكلة شائعة في PDF العربي)، ونحترم نهايات الأسطر.
    const pg = await pdf.getPage(page);
    const content = await pg.getTextContent();
    let out = "";
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      const s = item?.str ?? "";
      if (s) out += s + " ";
      if (item?.hasEOL) out += "\n";
    }
    const pageText = out
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .replace(/\s+([.,،:؛!؟)])/g, "$1") // لا مسافة قبل علامات الترقيم
      .replace(/([(])\s+/g, "$1")
      .trim();

    return json({ page, totalPages, text: pageText });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
