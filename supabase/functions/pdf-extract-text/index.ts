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
    // نقرّر المسافات من مواضع الحروف: حرفان متلاصقان (فراغ ضئيل) يترابطان بلا
    // مسافة، وفراغ كبير = مسافة/كلمة جديدة — يصلح الملفات التي يخرج فيها كل حرف
    // عنصرًا منفصلًا (حروف مقطّعة).
    const pg = await pdf.getPage(page);
    const viewport = pg.getViewport({ scale: 1 });
    const PW = viewport.width || 1;
    const PH = viewport.height || 1;
    const content = await pg.getTextContent();
    type TItem = { str?: string; hasEOL?: boolean; width?: number; height?: number; transform?: number[] };

    // نبني الكلمات مع صندوق إحداثيات مُطبَّع (0..1) لكل كلمة، بنفس منطق المسافات
    type Word = { t: string; x: number; y: number; w: number; h: number };
    const words: Word[] = [];
    let out = "";
    let prev: { e: number; f: number; w: number; h: number; eol: boolean } | null = null;
    let curStr = "";
    let curMinX = Infinity, curMaxX = -Infinity, curMinF = Infinity, curMaxTop = -Infinity;

    const flush = () => {
      if (curStr.trim() && curMinX !== Infinity) {
        words.push({
          t: curStr,
          x: Math.max(0, curMinX / PW),
          y: Math.max(0, (PH - curMaxTop) / PH),
          w: Math.max(0, (curMaxX - curMinX) / PW),
          h: Math.max(0, (curMaxTop - curMinF) / PH),
        });
      }
      curStr = "";
      curMinX = Infinity; curMaxX = -Infinity; curMinF = Infinity; curMaxTop = -Infinity;
    };
    const addGlyph = (s: string, e: number, f: number, w: number, h: number) => {
      curStr += s;
      curMinX = Math.min(curMinX, e, e + w);
      curMaxX = Math.max(curMaxX, e, e + w);
      curMinF = Math.min(curMinF, f);
      curMaxTop = Math.max(curMaxTop, f + h);
    };

    for (const item of content.items as TItem[]) {
      const s = item?.str ?? "";
      if (!s && !item?.hasEOL) continue;
      const tr = item?.transform ?? [1, 0, 0, 1, 0, 0];
      const e = tr[4] ?? 0;
      const f = tr[5] ?? 0;
      const w = item?.width ?? 0;
      const h = item?.height || Math.hypot(tr[1] ?? 0, tr[3] ?? 0) || 12;
      let boundary = false;
      if (prev) {
        if (prev.eol) { out += "\n"; boundary = true; }
        else if (Math.abs(f - prev.f) > h * 0.5) { out += "\n"; boundary = true; }
        else if (Math.abs(e - prev.e) - prev.w > h * 0.32) { out += " "; boundary = true; }
      }
      if (boundary) flush();
      out += s;
      addGlyph(s, e, f, w, h);
      prev = { e, f, w, h, eol: !!item?.hasEOL };
    }
    flush();

    const pageText = out
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .replace(/\s+([.,،:؛!؟)])/g, "$1") // لا مسافة قبل علامات الترقيم
      .replace(/([(])\s+/g, "$1")
      .trim();

    return json({ page, totalPages, text: pageText, words });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
