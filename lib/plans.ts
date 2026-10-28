import { supabase } from "./supabase";

type GeneratePlanInput = {
  userId: string;
  bookId: string;
  startDateISO: string; // YYYY-MM-DD
  pageCount: number; // عدد صفحات الكتاب
  minutesPerPage: number; // دقيقة لكل صفحة (إعداد عام)
  dailyMinutes: number; // الدقائق اليومية
  bufferEvery?: number; // يوم بفر كل X أيام
  /** نهاية محددة (من جدول المذاكرة): الأيام منها، والدقائق اليومية تُحسب */
  endDateISO?: string;
};

// كانت تحسب منتصف الليل المحلي ثم تقرأه بتوقيت UTC، فينقص يومًا في السعودية (+٣):
// خطة يوم واحد كانت تنتهي قبل أن تبدأ (بلاغ ٢٨ أكتوبر: ٢٧ ← ٢٦ أكتوبر)
const addDaysISO = (iso: string, add: number) => new Date(Date.parse(iso + "T00:00:00Z") + add * 86_400_000).toISOString().slice(0, 10);

/** أيام الخطة لعدد صفحات بدقائق يومية (للمعاينة قبل الحفظ) */
export function planDays(pages: number, minutesPerPage: number, dailyMinutes: number): number {
  const total = Math.ceil(Math.max(1, pages) * Math.max(0.1, minutesPerPage || 2));
  return Math.max(1, Math.ceil(total / Math.max(5, dailyMinutes || 60)));
}

export async function generatePlan(input: GeneratePlanInput) {
  const {
    userId,
    bookId,
    startDateISO,
    pageCount,
    minutesPerPage,
    dailyMinutes,
    bufferEvery = 7,
    endDateISO: fixedEnd,
  } = input;

  const pages = Math.max(1, Number(pageCount || 1));
  const mpp = Math.max(0.1, Number(minutesPerPage || 2));
  const totalMinutes = Math.ceil(pages * mpp);
  const spanDays = fixedEnd && fixedEnd >= startDateISO ? Math.round((Date.parse(fixedEnd + "T00:00:00Z") - Date.parse(startDateISO + "T00:00:00Z")) / 86_400_000) + 1 : 0;
  const daily = spanDays ? Math.max(5, Math.ceil(totalMinutes / spanDays)) : Math.max(5, Number(dailyMinutes || 60));
  const days = spanDays || planDays(pages, mpp, daily);
  const endDateISO = addDaysISO(startDateISO, days - 1);

  // 1) create plan
  const { data: plan, error: planErr } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      book_id: bookId,
      start_date: startDateISO,
      end_date: endDateISO,
      daily_minutes: daily,
      buffer_ratio: 0.15,
    })
    .select()
    .single();

  if (planErr) throw planErr;

  // 2) distribute pages
  const bufferDays = bufferEvery > 0 ? Math.floor(days / bufferEvery) : 0;
  const effectiveStudyDays = Math.max(1, days - bufferDays);
  const pagesPerStudyDay = Math.ceil(pages / effectiveStudyDays);

  let remaining = pages;

  const sessions: any[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(startDateISO, i);
    const isBuffer = bufferEvery > 0 && (i + 1) % bufferEvery === 0;

    const pagesTarget =
      !isBuffer && remaining > 0 ? Math.min(pagesPerStudyDay, remaining) : 0;

    if (!isBuffer) remaining -= pagesTarget;

    sessions.push({
      plan_id: plan.id,
      session_date: date,
      kind: isBuffer ? "buffer" : "study",
      minutes: daily,
      status: "pending",
      pages_target: pagesTarget,
      pages_done: 0,
    });
  }

  const { error: sesErr } = await supabase.from("plan_sessions").insert(sessions);
  if (sesErr) throw sesErr;

  return { plan, days, totalMinutes };
}

// ===== تعديل خطة الكتاب وحذفها (طلب نهلة ٢٨ أكتوبر) =====

export type BookPlan = { id: string; start_date: string; end_date: string; daily_minutes: number };

/** أحدث خطة للكتاب (أو null) */
export async function getBookPlan(bookId: string): Promise<BookPlan | null> {
  const { data } = await supabase.from("study_plans").select("id,start_date,end_date,daily_minutes").eq("book_id", bookId).order("start_date", { ascending: false }).limit(1).maybeSingle();
  return (data as BookPlan | null) ?? null;
}

/** حذف خطط الكتاب (وجلساتها معها) */
export async function deleteBookPlan(bookId: string): Promise<void> {
  const { error } = await supabase.from("study_plans").delete().eq("book_id", bookId);
  if (error) throw new Error(error.message);
  // خطة واحدة (دمج ٢٨ أكتوبر): جدول المذاكرة يُحذف معها
  const { scheduleFromPlan } = await import("./bookPlan");
  await scheduleFromPlan(bookId, null).catch(() => {});
}

/** صفحات أُنجزت في الخطة الحالية (تُحفظ عند إعادة بنائها: الجديدة للباقي فقط) */
export async function planPagesDone(planId: string): Promise<number> {
  const { data } = await supabase.from("plan_sessions").select("pages_done").eq("plan_id", planId);
  return (data ?? []).reduce((a: number, r: { pages_done: number | null }) => a + (Number(r.pages_done) || 0), 0);
}

/** خطة جديدة للكتاب من تاريخ بدء ودقائق يومية لما بقي من صفحاته (تحل محل السابقة) */
export async function rebuildBookPlan(o: { userId: string; bookId: string; startDateISO: string; pageCount: number; minutesPerPage: number; dailyMinutes: number }) {
  const old = await getBookPlan(o.bookId);
  const done = old ? await planPagesDone(old.id).catch(() => 0) : 0;
  const left = Math.max(1, o.pageCount - done);
  // الجديدة أولًا ثم حذف القديمة: إن تعثّر الإنشاء تبقى الخطة السابقة كما هي
  const res = await generatePlan({ userId: o.userId, bookId: o.bookId, startDateISO: o.startDateISO, pageCount: left, minutesPerPage: o.minutesPerPage, dailyMinutes: o.dailyMinutes, bufferEvery: 7 });
  if (old) await supabase.from("study_plans").delete().eq("id", old.id);
  // خطة واحدة (دمج ٢٨ أكتوبر): جدول المذاكرة يأخذ التاريخين نفسيهما
  const { scheduleFromPlan } = await import("./bookPlan");
  await scheduleFromPlan(o.bookId, { start: o.startDateISO, end: res.plan.end_date as string, minutes: o.dailyMinutes }).catch(() => {});
  return res;
}

/** خطة من تاريخين محددين (من جدول المذاكرة) لما بقي من الصفحات — تحل محل السابقة، بلا لمس الجدول */
export async function replacePlanRange(o: { userId: string; bookId: string; start: string; end: string; pageCount: number; minutesPerPage: number; minutes?: number }) {
  const old = await getBookPlan(o.bookId);
  const done = old ? await planPagesDone(old.id).catch(() => 0) : 0;
  const res = await generatePlan({ userId: o.userId, bookId: o.bookId, startDateISO: o.start, endDateISO: o.end, pageCount: Math.max(1, o.pageCount - done), minutesPerPage: o.minutesPerPage, dailyMinutes: 60, bufferEvery: 7 });
  // الدقائق التي اختارها الطالب في جدول المذاكرة (لا المحسوبة من الصفحات) تظهر في المكتبة
  if (o.minutes && o.minutes > 0) {
    await supabase.from("study_plans").update({ daily_minutes: Math.round(o.minutes) }).eq("id", res.plan.id);
    await supabase.from("plan_sessions").update({ minutes: Math.round(o.minutes) }).eq("plan_id", res.plan.id);
  }
  if (old) await supabase.from("study_plans").delete().eq("id", old.id);
  return res;
}
