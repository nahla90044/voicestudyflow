// supabase/functions/book-toc/index.ts
// فهرس الكتاب من فهرس ملف الـPDF المدمج (العناوين وصفحاتها) — نفس طريقة تطبيق «حاكي».
// الطلب: { pdfPath }  الرد: { chapters: [{ title, page, level }], totalPages }
// المتصل يصل لملفاته فقط (مجلّد uid) أو ملفات العيّنات.
import { canAccessPdf } from "../_shared/paths.ts";
import { pdfCleared } from "../_shared/bookCheck.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy } from "https://esm.sh/unpdf@1.6.2";
import { requireUpdatedApp } from "../_shared/client.ts";
import { logCost } from "../_shared/cost.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

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


// ===== الفهرس المطبوع (للكتب بلا فهرس مدمج، مثل الروايات): صفحة «الفهرس/المحتويات» في أول الكتاب أو آخره =====
const TOC_HEAD = /(الفهرس|فهرس المحتويات|المحتويات|محتويات الكتاب|قائمة المحتويات|table of contents|contents)/i;
const norm = (x: string) =>
  x.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
const toWestern = (x: string) => x.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

async function pageText(pdf: any, n: number): Promise<string> {
  try {
    const pg = await pdf.getPage(n);
    const c = await pg.getTextContent();
    return (c.items as { str?: string; hasEOL?: boolean }[]).map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : " ")).join("").normalize("NFKC");
  } catch {
    return "";
  }
}

/** هل يظهر العنوان فعلًا في الصفحة (أو قريبًا منها)؟ — التحقق قبل عرض أي عنصر */
function titleOnPage(title: string, text: string): boolean {
  const t = norm(title).split(" ").filter((w) => w.length > 1);
  if (!t.length) return false;
  const body = " " + norm(toWestern(text)) + " ";
  const hits = t.filter((w) => body.includes(" " + w + " ") || body.includes(w)).length;
  return hits / t.length >= 0.7;
}

async function printedToc(req: Request, pdf: any, n: number): Promise<{ title: string; page: number; level: number }[]> {
  const cand = [...Array(Math.min(20, n)).keys()].map((i) => i + 1).concat([...Array(Math.min(20, n)).keys()].map((i) => n - i));
  const tocPages: { p: number; text: string }[] = [];
  for (const p of [...new Set(cand)].filter((x) => x >= 1 && x <= n)) {
    const text = await pageText(pdf, p);
    if (TOC_HEAD.test(text.slice(0, 400)) || (tocPages.length && tocPages[tocPages.length - 1].p === p - 1 && /\d\s*$/m.test(toWestern(text)))) {
      tocPages.push({ p, text });
      if (tocPages.length >= 6) break;
    }
  }
  if (!tocPages.length) return [];
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return [];
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system:
      'أنت محلّل فهارس كتب. يصلك نص صفحات «الفهرس/المحتويات» من كتاب (قد يكون النص مستخرجًا من PDF بترتيب مضطرب). استخرج عناصر الفهرس كما هي بالترتيب: عنوان كل فصل/باب/قسم ورقم صفحته المطبوع. لا تخترع عناصر ولا أرقامًا غير موجودة. level: 0 للأبواب أو الفصول الرئيسية، 1 لما تحتها. أعد فقط JSON: [{"title":"…","printed":12,"level":0}]. إن لم يكن النص فهرسًا فأعد [].',
    messages: [{ role: "user", content: tocPages.map((x) => x.text).join("\n-----\n").slice(0, 20000) }],
  });
  void logCost(req, { fn: "book-toc", action: "printed-toc", model: "claude-sonnet-4-6", input_tokens: msg.usage?.input_tokens, output_tokens: msg.usage?.output_tokens });
  const raw = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const m = raw.match(/\[[\s\S]*\]/);
  let items: { title: string; printed: number; level: number }[] = [];
  try {
    items = (m ? JSON.parse(m[0]) : []).filter((x: any) => x && typeof x.title === "string" && Number.isFinite(Number(x.printed)));
  } catch {
    return [];
  }
  if (items.length < 2) return [];

  // رقم الصفحة المطبوع ≠ رقم صفحة الملف: نجد الإزاحة التي تطابق أكثر العناوين صفحاتها فعلًا
  const sample = items.slice(0, 8);
  const cache = new Map<number, string>();
  const textOf = async (p: number) => {
    if (!cache.has(p)) cache.set(p, await pageText(pdf, p));
    return cache.get(p)!;
  };
  let best = { off: 0, score: -1 };
  for (let off = -5; off <= 40; off++) {
    let score = 0;
    for (const it of sample) {
      const p = Number(it.printed) + off;
      if (p >= 1 && p <= n && titleOnPage(it.title, (await textOf(p)).slice(0, 600))) score++;
    }
    if (score > best.score) best = { off, score };
    if (score === sample.length) break;
  }
  if (best.score < Math.ceil(sample.length * 0.5)) return []; // لا تطابق موثوق → لا نعرض فهرسًا غير مؤكد

  // تحقق لكل عنصر: العنوان في صفحته أو قبلها/بعدها بصفحتين؛ وما لم يتأكد يُحذف
  const out: { title: string; page: number; level: number }[] = [];
  for (const it of items) {
    const base = Number(it.printed) + best.off;
    let found = -1;
    for (const d of [0, 1, -1, 2, -2]) {
      const p = base + d;
      if (p >= 1 && p <= n && titleOnPage(it.title, (await textOf(p)).slice(0, 800))) {
        found = p;
        break;
      }
    }
    if (found > 0) out.push({ title: fixOrder(it.title.replace(/\s+/g, " ").trim()), page: found, level: Math.min(2, Number(it.level) || 0) });
  }
  return out.length >= 2 && out.length >= items.length * 0.6 ? out : [];
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
    if (!canAccessPdf(pdfPath, user.id)) return json({ error: "Forbidden" }, 403);
    // الكتاب لم يجتز فحص الرفع الإلزامي (أو رُفض) → لا معالجة
    if (!(await pdfCleared(pdfPath))) return json({ error: "NOT_CLEARED" }, 403);

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
    if (out.length >= 2) return json({ chapters: out, source: "outline", totalPages: pdf.numPages });
    // لا فهرس مدمج → الفهرس المطبوع في الكتاب (مُتحقق منه صفحة صفحة)
    const printed = await printedToc(req, pdf, pdf.numPages).catch((e) => {
      console.error("printedToc", (e as Error).message);
      return [];
    });
    return json({ chapters: printed, source: printed.length ? "printed" : "none", totalPages: pdf.numPages });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
