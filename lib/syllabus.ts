// lib/syllabus.ts
// منهج دراسي (syllabus) لكل كتاب: وحدات بعناوين ومواضيع ومخرجات تعلّم،
// مع متابعة التقدّم (تشيك ليست). يُولَّد بالذكاء من نص الكتاب ويُخزّن.
import { aiAssist } from "./ai";
import { supabase } from "./supabase";

export type SyllabusUnit = { title: string; topics: string[]; outcome?: string };
export type Syllabus = { title?: string; units: SyllabusUnit[]; tips?: string[] };

function parseSyllabus(raw: string): Syllabus | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const units: SyllabusUnit[] = Array.isArray(obj.units)
      ? obj.units
          .map((u: any) => ({
            title: String(u?.title ?? "").trim(),
            topics: Array.isArray(u?.topics) ? u.topics.map((t: any) => String(t).trim()).filter(Boolean) : [],
            outcome: u?.outcome ? String(u.outcome).trim() : undefined,
          }))
          .filter((u: SyllabusUnit) => u.title)
      : [];
    if (units.length === 0) return null;
    return {
      title: obj.title ? String(obj.title).trim() : undefined,
      units,
      tips: Array.isArray(obj.tips) ? obj.tips.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

/** يجلب المنهج المخزّن مع حالة الإنجاز (أو null إن لم يُنشأ بعد). */
export async function getSyllabus(
  pdfPath: string
): Promise<{ data: Syllabus; done: boolean[] } | null> {
  const { data } = await supabase
    .from("book_syllabus")
    .select("data,done")
    .eq("pdf_path", pdfPath)
    .maybeSingle();
  if (!data?.data) return null;
  const syl = data.data as Syllabus;
  const done = Array.isArray(data.done) ? (data.done as boolean[]) : [];
  return { data: syl, done };
}

/** يولّد المنهج من نص الكتاب (أول الصفحات) ويخزّنه. */
export async function generateSyllabus(pdfPath: string): Promise<Syllabus> {
  // اجمع نص أوّل الصفحات الحقيقية
  const { data: pages } = await supabase
    .from("page_cache")
    .select("text,page")
    .eq("pdf_path", pdfPath)
    .neq("source", "empty")
    .order("page")
    .limit(15);
  const text = (pages ?? [])
    .map((p: any) => p.text)
    .join("\n")
    .slice(0, 6000);
  if (text.trim().length < 100) {
    throw new Error("لا يوجد نص كافٍ. افتحي الكتاب واقرئي أول صفحاته أولًا.");
  }

  const raw = await aiAssist("syllabus", text);
  const syl = parseSyllabus(raw);
  if (!syl) throw new Error("تعذّر إنشاء المنهج. حاولي مرة أخرى.");

  await supabase.from("book_syllabus").upsert({
    pdf_path: pdfPath,
    data: syl,
    done: new Array(syl.units.length).fill(false),
  });
  return syl;
}

export type QuizQ = { q: string; options: string[]; answer: number };

/** يولّد كويز اختيار من متعدد من محتوى وحدة (بالذكاء). */
export async function generateUnitQuiz(context: string): Promise<QuizQ[]> {
  const raw = await aiAssist("unitquiz", context);
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x: any) => ({
        q: String(x?.q ?? "").trim(),
        options: Array.isArray(x?.options) ? x.options.map((o: any) => String(o).trim()).filter(Boolean) : [],
        answer: Number(x?.answer ?? 0),
      }))
      .filter((x: QuizQ) => x.q && x.options.length >= 2 && x.answer >= 0 && x.answer < x.options.length);
  } catch {
    return [];
  }
}

/** يحدّث حالة إنجاز وحدة. */
export async function setUnitDone(pdfPath: string, done: boolean[]): Promise<void> {
  await supabase.from("book_syllabus").update({ done }).eq("pdf_path", pdfPath);
}

export type UnitSchedule = { startISO: string; endISO: string; dayFrom: number; dayTo: number };

/**
 * يوزّع وحدات المنهج على أيام المذاكرة في خطة الكتاب (توزيعًا متناسبًا)،
 * فتحصل كل وحدة على مدى تواريخ تُذاكر فيه. يرجع [] إن لم توجد خطة.
 */
export async function getUnitSchedule(
  bookId: string,
  unitCount: number
): Promise<UnitSchedule[]> {
  if (!bookId || unitCount <= 0) return [];

  const { data: plan } = await supabase
    .from("study_plans")
    .select("id")
    .eq("book_id", bookId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan?.id) return [];

  const { data: sessions } = await supabase
    .from("plan_sessions")
    .select("session_date,kind,pages_target")
    .eq("plan_id", plan.id)
    .order("session_date");

  const studyDates = (sessions ?? [])
    .filter((s: any) => s.kind === "study" && (s.pages_target ?? 0) > 0)
    .map((s: any) => s.session_date as string);

  const D = studyDates.length;
  if (D === 0) return [];

  const out: UnitSchedule[] = [];
  for (let i = 0; i < unitCount; i++) {
    const lo = Math.min(Math.floor((i * D) / unitCount), D - 1);
    const hi = Math.max(lo, Math.min(Math.floor(((i + 1) * D) / unitCount) - 1, D - 1));
    out.push({ startISO: studyDates[lo], endISO: studyDates[hi], dayFrom: lo + 1, dayTo: hi + 1 });
  }
  return out;
}

/** أي وحدة من المنهج تخصّ هذا التاريخ (لعرضها في الجدول). */
export async function getUnitForDate(
  bookId: string,
  dateISO: string
): Promise<{ index: number; title: string } | null> {
  if (!bookId || !dateISO) return null;
  const { data: book } = await supabase
    .from("books")
    .select("pdf_path")
    .eq("id", bookId)
    .maybeSingle();
  if (!book?.pdf_path) return null;

  const syl = await getSyllabus(book.pdf_path);
  if (!syl) return null;

  const sched = await getUnitSchedule(bookId, syl.data.units.length);
  for (let i = 0; i < sched.length; i++) {
    if (dateISO >= sched[i].startISO && dateISO <= sched[i].endISO) {
      return { index: i, title: syl.data.units[i].title };
    }
  }
  return null;
}
