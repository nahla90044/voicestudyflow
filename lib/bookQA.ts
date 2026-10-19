// lib/bookQA.ts
// «كتابك يجيب»: يجلب صفحات الكتاب المخزّنة، يختار الأقرب للسؤال، ويسأل الذكاء
// عبر أمر «ask» الموجود (لا تغيير على السيرفر)، ثم يستخرج أرقام الصفحات المستشهد بها.
// المنطق الصافي والمُختبَر في bookQACore.ts.
import { aiAssist } from "./ai";
import { getUserId } from "./auth";
import { buildContext, citationInstruction, parseCitations, selectPages, type BookPage, type Citation } from "./bookQACore";
import { supabase } from "./supabase";

export type QABook = { id: string; title: string; pdf_path: string; page_count: number | null };
export type QAAnswer = { text: string; cites: (Citation & { bookId: string; bookTitle: string; pdfPath: string })[] };

/** صفحات كتاب جاهزة النص (المستخرجة سابقًا عند القراءة أو تحميل الكتاب). */
async function cachedPages(pdfPath: string, bookIndex: number, limit = 1200): Promise<BookPage[]> {
  const { data } = await supabase
    .from("page_cache")
    .select("page,text,tashkeel")
    .eq("pdf_path", pdfPath)
    .neq("source", "empty")
    .order("page")
    .limit(limit);
  return (data ?? [])
    .map((r: any) => ({ book: bookIndex, page: Number(r.page), text: String(r.text || r.tashkeel || "") }))
    .filter((p) => p.text.trim().length > 20);
}

/** كم صفحة جاهزة للبحث من أصل صفحات الكتاب. */
export async function coverage(pdfPath: string): Promise<number> {
  const { count } = await supabase
    .from("page_cache")
    .select("page", { count: "exact", head: true })
    .eq("pdf_path", pdfPath)
    .neq("source", "empty");
  return count ?? 0;
}

/** كل كتب المستخدم غير المؤرشفة (لنطاق «كل كتبي»). */
export async function myBooks(): Promise<QABook[]> {
  const uid = await getUserId();
  const { data } = await supabase
    .from("books")
    .select("id,title,pdf_path,page_count")
    .eq("user_id", uid)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  return (data ?? []) as QABook[];
}

/**
 * يسأل كتابًا واحدًا أو عدة كتب. يرمي خطأ «NO_TEXT» إن لم تكن أي صفحة جاهزة بعد.
 */
export async function askBooks(books: QABook[], question: string): Promise<QAAnswer> {
  const perBook = books.length > 1 ? 400 : 1200;
  const all = (await Promise.all(books.map((b, i) => cachedPages(b.pdf_path, i + 1, perBook)))).flat();
  if (all.length === 0) throw new Error("NO_TEXT");

  const chosen = selectPages(question, all);
  const raw = await aiAssist("ask", buildContext(chosen), question.trim() + citationInstruction(), undefined, undefined, undefined, undefined, question.trim());
  const { text, cites } = parseCitations(raw);

  // نُبقي فقط الاستشهادات بصفحات أُرسلت فعلًا (لا نعرض رقم صفحة اخترعه الذكاء)
  const sent = new Set(chosen.map((p) => `${p.book}:${p.page}`));
  return {
    text,
    cites: cites
      .filter((c) => sent.has(`${c.book}:${c.page}`))
      .map((c) => {
        const b = books[c.book - 1];
        return { ...c, bookId: b.id, bookTitle: b.title, pdfPath: b.pdf_path };
      }),
  };
}
