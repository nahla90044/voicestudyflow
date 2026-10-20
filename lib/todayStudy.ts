// lib/todayStudy.ts
// «مسار اليوم» من خطة الكتاب: أي كتاب له خطة، وما وحدته اليوم (المتأخرة أولًا)، وأين وصل فيها،
// وما أُنجز منها (صفحات، ملخص، اختبار) — من نفس التقدّم الذي يراه المنهج و«خطتي».
import { getCachedUnitRanges, type UnitRange } from "./glossary";
import { getLastPage } from "./readerPrefs";
import { focusUnit, planDay, planStatus, fitSchedule, isoOf, type BookSchedule } from "./scheduleCore";
import { getRawProgress, unitsProgress, type UnitProgress } from "./studyTrack";
import { supabase } from "./supabase";
import { getUserId } from "./auth";

export type TodayStudy = {
  bookId: string;
  pdfPath: string;
  title: string;
  schedule: BookSchedule;
  /** وحدة اليوم (null: يوم راحة، أو قبل البداية، أو اكتملت الخطة) */
  unit: number | null;
  late: boolean;
  unitTitle: string;
  range: UnitRange | null;
  progress: UnitProgress | null;
  /** أول صفحة لم تُذاكَر في الوحدة (لزر الاستماع) */
  resumePage: number;
  day: number;
  total: number;
  studyDay: boolean;
  next: string | null;
  /** الفرق عن الخطة بعدد الوحدات (موجب = قبلها) */
  diffUnits: number;
};

type Row = { pdf_path: string; data: { units?: { title: string }[]; ranges?: UnitRange[] }; done: boolean[] | null; schedule: BookSchedule | null };

/**
 * خطة اليوم: من كتب المستخدم التي لها خطة، يُفضَّل الكتاب الحالي إن كانت له وحدة اليوم،
 * ثم الأقرب اختبارًا. null إن لم تكن لأي كتاب خطة.
 */
export async function getTodayStudy(preferPdf?: string): Promise<TodayStudy | null> {
  try {
    const uid = await getUserId();
    const { data: rows } = await supabase.from("book_syllabus").select("pdf_path,data,done,schedule").not("schedule", "is", null);
    const list = ((rows ?? []) as Row[]).filter((r) => r.schedule?.start && Array.isArray(r.schedule.units) && (r.data?.units?.length ?? 0) > 0);
    if (!list.length) return null;
    const { data: books } = await supabase.from("books").select("id,title,pdf_path").eq("user_id", uid).in("pdf_path", list.map((r) => r.pdf_path));
    const today = isoOf(new Date());

    const all = await Promise.all(
      list.map(async (r): Promise<TodayStudy | null> => {
        const book = (books ?? []).find((b) => b.pdf_path === r.pdf_path);
        if (!book) return null;
        const titles = r.data.units!.map((u) => u.title);
        const ranges = r.data.ranges?.length === titles.length ? r.data.ranges : (await getCachedUnitRanges(r.pdf_path, titles.length)) ?? [];
        const weights = titles.map((_, i) => (ranges[i] ? ranges[i].to - ranges[i].from + 1 : 1));
        const schedule = fitSchedule(r.schedule, weights)!;
        const prog = await unitsProgress(r.pdf_path, book.id, ranges, titles.length);
        const actual = titles.map((_, i) => (r.done?.[i] ? 1 : prog[i]?.pct ?? 0));
        const d = planDay(schedule, today);
        const f = focusUnit(schedule, actual, today);
        // يوم راحة: لا وحدة جديدة، إلا المتأخرة لا تُفرض أيضًا (الراحة راحة)
        const u = f && d.studyDay ? f.unit : null;
        const range = u !== null ? ranges[u] ?? null : null;
        let resumePage = range?.from ?? 1;
        if (range) {
          const studied = new Set((await getRawProgress(r.pdf_path)).pages?.p ?? []);
          const firstLeft = Array.from({ length: range.to - range.from + 1 }, (_, k) => range.from + k).find((p) => !studied.has(p));
          const last = await getLastPage(book.id);
          resumePage = last >= range.from && last <= range.to ? last : firstLeft ?? range.from;
        }
        const st = planStatus(schedule, actual, today);
        return {
          bookId: book.id,
          pdfPath: r.pdf_path,
          title: book.title ?? "",
          schedule,
          unit: u,
          late: !!f?.late && u !== null,
          unitTitle: u !== null ? titles[u] : "",
          range,
          progress: u !== null ? prog[u] : null,
          resumePage,
          day: d.day,
          total: d.total,
          studyDay: d.studyDay,
          next: d.next ?? (today < schedule.start ? schedule.start : null),
          diffUnits: st.diffUnits,
        };
      })
    );
    const ok = all.filter((x): x is TodayStudy => !!x);
    if (!ok.length) return null;
    const withUnit = ok.filter((x) => x.unit !== null);
    const pool = withUnit.length ? withUnit : ok;
    return (
      pool.find((x) => x.pdfPath === preferPdf) ??
      [...pool].sort((a, b) => (a.schedule.exam ?? "9999").localeCompare(b.schedule.exam ?? "9999"))[0]
    );
  } catch {
    return null;
  }
}
