// supabase/functions/book-toc/index.ts
// فهرس الكتاب من فهرس ملف الـPDF المدمج (العناوين وصفحاتها) — نفس طريقة تطبيق «حاكي».
// الطلب: { pdfPath }  الرد: { chapters: [{ title, page, level }], totalPages }
// المتصل يصل لملفاته فقط (مجلّد uid) أو ملفات العيّنات.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy } from "https://esm.sh/unpdf@1.6.2";
import { requireUpdatedApp } from "../_shared/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vsf-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CHAPTER_WORDS = /^(الفصل|الباب|الجزء|القسم|الوحدة|المبحث|المطلب|الكتاب|المقدمة|مقدمة|تمهيد|توطئة|الخاتمة|خاتمة|الملحق|ملحق|chapter|part|unit|prologue|epilogue|introduction|preface)(?=[\s:،.\-–]|$)/i;

// بعض البرامج تحفظ العنوان بترتيب العرض: «البداية:الفصل الأول» بدل «الفصل الأول: البداية»
function fixOrder(t: string): string {
  const m = t.match(/^(.+?)\s*:\s*(.+)$/);
  if (m && !CHAPTER_WORDS.test(m[1]) && CHAPTER_WORDS.test(m[2])) return `${m[2]}: ${m[1]}`;
  return t;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const outdated = requireUpdatedApp(req, corsHeaders);
  if (outdated) return outdated;
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? service;
    const body = await req.json().catch(() => ({}));
    const pdfPath = String(body.pdfPath ?? "");
    if (!pdfPath) return json({ error: "Missing pdfPath" }, 400);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const owner = pdfPath.split("/")[0];
    if (owner !== user.id && owner !== "samples") return json({ error: "Forbidden" }, 403);

    const admin = createClient(url, service);
    const { data: file, error } = await admin.storage.from("pdfs").download(pdfPath);
    if (error || !file) throw error ?? new Error("download failed");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const outline = await pdf.getOutline().catch(() => null);
    const chapters: { title: string; page: number; level: number }[] = [];
    // deno-lint-ignore no-explicit-any
    const walk = async (items: any[], level: number) => {
      for (const it of items ?? []) {
        if (level > 2) continue; // الأبواب والفصول والأقسام الرئيسية
        const dest = typeof it.dest === "string" ? await pdf.getDestination(it.dest).catch(() => null) : it.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (ref) {
          const idx = typeof ref === "number" ? ref : await pdf.getPageIndex(ref).catch(() => -1);
          const title = fixOrder(String(it.title ?? "").replace(/\s+/g, " ").trim());
          if (idx >= 0 && title) chapters.push({ title, page: idx + 1, level });
        }
        await walk(it.items, level + 1);
      }
    };
    await walk(outline ?? [], 0);
    // نفس العنوان والصفحة مكرران → مرة واحدة، وبترتيب الصفحات
    const seen = new Set<string>();
    const out = chapters
      .sort((a, b) => a.page - b.page || a.level - b.level)
      .filter((c) => {
        const k = `${c.page}|${c.title.toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return json({ chapters: out.length >= 2 ? out : [], totalPages: pdf.numPages });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
