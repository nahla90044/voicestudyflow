import { supabase } from "./supabase";

type GeneratePlanInput = {
  userId: string;
  bookId: string;
  startDateISO: string; // YYYY-MM-DD
  pageCount: number; // عدد صفحات الكتاب
  minutesPerPage: number; // دقيقة لكل صفحة (إعداد عام)
  dailyMinutes: number; // الدقائق اليومية
  bufferEvery?: number; // يوم بفر كل X أيام
};

function addDaysISO(startISO: string, add: number) {
  const d = new Date(startISO + "T00:00:00");
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
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
  } = input;

  const pages = Math.max(1, Number(pageCount || 1));
  const mpp = Math.max(0.1, Number(minutesPerPage || 2));
  const daily = Math.max(5, Number(dailyMinutes || 60));

  const totalMinutes = Math.ceil(pages * mpp);
  const days = Math.max(1, Math.ceil(totalMinutes / daily));
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
