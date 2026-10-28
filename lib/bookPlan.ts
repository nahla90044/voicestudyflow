// lib/bookPlan.ts
// خطة واحدة لكل كتاب (قرار نهلة ٢٨ أكتوبر): كانت «خطة الكتاب» (study_plans: المكتبة ومسار اليوم والشريحة)
// و«جدول المذاكرة» (book_syllabus.schedule: الوحدات على الأيام) منفصلتين، فيظهر تاريخان متعارضان
// (كتاب الفرنسية: الخطة حتى ٢٨ والجدول ٢٧ ← ٢٦). الآن كل حفظ أو حذف في إحداهما يُطبَّق على الأخرى،
// والكتب الحالية تُوحَّد عند فتح منهجها. الكتابة هنا مباشرة (لا عبر saveSchedule/rebuildBookPlan) فلا تدور المزامنة.
import { getMinutesPerPage } from "./settings";
import { distribute, type BookSchedule } from "./scheduleCore";
import { supabase } from "./supabase";

const validRange = (s: { start?: string; end?: string } | null | undefined): boolean => !!s?.start && !!s?.end && s.end >= s.start;

/** الجدول حُفظ (أو حُذف) → «خطة الكتاب» بالتاريخين نفسيهما (أو تُحذف) */
export async function planFromSchedule(pdfPath: string, s: BookSchedule | null): Promise<void> {
  const { data: book } = await supabase.from("books").select("id,user_id,page_count").eq("pdf_path", pdfPath).limit(1).maybeSingle();
  if (!book?.id) return;
  if (!s) {
    await supabase.from("study_plans").delete().eq("book_id", book.id);
    return;
  }
  if (!validRange(s)) return;
  const { data: cur } = await supabase.from("study_plans").select("start_date,end_date,daily_minutes").eq("book_id", book.id).order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (cur?.start_date === s.start && cur?.end_date === s.end && (!s.minutes || cur?.daily_minutes === s.minutes)) return; // متطابقتان أصلًا
  const { replacePlanRange } = await import("./plans");
  await replacePlanRange({ userId: book.user_id, bookId: book.id, start: s.start, end: s.end, pageCount: Number(book.page_count) || 1, minutesPerPage: await getMinutesPerPage(), minutes: s.minutes });
}

/** الخطة عُدّلت من الشريحة (أو حُذفت) → جدول المذاكرة بالتاريخين نفسيهما، والوحدات موزعة بصفحاتها */
export async function scheduleFromPlan(bookId: string, p: { start: string; end: string; minutes?: number } | null): Promise<void> {
  const { data: book } = await supabase.from("books").select("pdf_path").eq("id", bookId).maybeSingle();
  const pdfPath = book?.pdf_path as string | undefined;
  if (!pdfPath) return;
  const { data: row } = await supabase.from("book_syllabus").select("data,schedule").eq("pdf_path", pdfPath).maybeSingle();
  if (!row) return; // لا منهج: الخطة وحدها
  if (!p) {
    if (row.schedule) await supabase.from("book_syllabus").update({ schedule: null }).eq("pdf_path", pdfPath);
    return;
  }
  if (!validRange(p)) return;
  const units = ((row.data as { units?: unknown[] } | null)?.units ?? []).length;
  if (!units) return;
  const weights = await unitWeights(pdfPath, units);
  const old = row.schedule as BookSchedule | null;
  const next: BookSchedule = { ...(old ?? {}), start: p.start, end: p.end, units: distribute(p.start, p.end, weights), ...(p.minutes ? { minutes: p.minutes } : {}) };
  await supabase.from("book_syllabus").update({ schedule: next }).eq("pdf_path", pdfPath);
}

async function unitWeights(pdfPath: string, n: number): Promise<number[]> {
  const { getCachedUnitRanges } = await import("./glossary");
  const rs = await getCachedUnitRanges(pdfPath, n).catch(() => null);
  return Array.from({ length: n }, (_, i) => (rs?.[i] ? rs[i].to - rs[i].from + 1 : 1));
}

/**
 * توحيد كتاب قائم (مرة لكل كتاب في التشغيل): الجدول المحفوظ السليم هو المرجع وتتبعه الخطة؛
 * والجدول المقلوب التاريخ يُهمل فيُبنى من الخطة. يُرجع الجدول بعد التوحيد إن تغيّر.
 */
const aligned = new Set<string>();
export async function alignBookPlans(pdfPath: string, bookId: string, weights: number[]): Promise<BookSchedule | null> {
  if (!pdfPath || !bookId || aligned.has(pdfPath)) return null;
  aligned.add(pdfPath);
  const { data: row } = await supabase.from("book_syllabus").select("schedule").eq("pdf_path", pdfPath).maybeSingle();
  const saved = row?.schedule as BookSchedule | null;
  if (saved && validRange(saved)) {
    await planFromSchedule(pdfPath, saved).catch(() => {});
    return null;
  }
  const { data: plan } = await supabase.from("study_plans").select("start_date,end_date,daily_minutes").eq("book_id", bookId).order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (!plan?.start_date) {
    // لا خطة سليمة: الجدول المقلوب يُحذف (لا يُعرض «متأخر» على مواعيد خاطئة)
    if (saved) await supabase.from("book_syllabus").update({ schedule: null }).eq("pdf_path", pdfPath);
    return null;
  }
  const end = plan.end_date >= plan.start_date ? plan.end_date : plan.start_date;
  if (end !== plan.end_date) await supabase.from("study_plans").update({ end_date: end }).eq("book_id", bookId).eq("start_date", plan.start_date);
  if (!saved) return null; // بلا جدول محفوظ: يُعرض من الخطة نفسها (getSchedule)
  const next: BookSchedule = { ...saved, start: plan.start_date, end, units: distribute(plan.start_date, end, weights) };
  await supabase.from("book_syllabus").update({ schedule: next }).eq("pdf_path", pdfPath);
  return next;
}
