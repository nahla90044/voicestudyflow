// lib/scheduleCore.ts
// منطق جدول مذاكرة الوحدات (خالص، مُختبَر): توزيع الوحدات على الأيام بحسب حجمها، وحالة كل وحدة،
// ومقارنة «المخطط حتى اليوم» بالإنجاز الفعلي (مثل جداول Kaplan Schweser: يظهر أثر الاجتهاد بوضوح).

export type UnitWindow = { start: string; end: string }; // YYYY-MM-DD (يشمل الطرفين)
/**
 * جدول الكتاب. الحقول الاختيارية (exam/days/minutes) تأتي من «إنشاء الخطة» بوقت المذاكرة؛
 * الجداول القديمة (من/إلى فقط) تبقى صالحة بدونها.
 */
export type BookSchedule = {
  start: string;
  end: string;
  units: UnitWindow[];
  exam?: string | null; // موعد الاختبار
  days?: number[]; // أيام الدراسة في الأسبوع (٠ = الأحد … ٦ = السبت)
  minutes?: number; // دقائق المذاكرة في اليوم
};
export type UnitPhase = "done" | "now" | "late" | "upcoming";
export type PlanStatus = {
  expected: number; // ٠..١ ما يُفترض إنجازه حتى اليوم
  actual: number; // ٠..١ الإنجاز الفعلي
  diffUnits: number; // موجب = متقدم بعدد وحدات، سالب = متأخر
  daysLeft: number; // حتى نهاية الجدول
  projectedEnd: string | null; // متى ينتهي بالوتيرة الحالية
};

const DAY = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);

/**
 * يوزّع الوحدات على الأيام من start إلى end بحسب وزن كل وحدة (عدد صفحاتها):
 * الوحدة الأكبر تأخذ أيامًا أكثر، وكل وحدة يوم واحد على الأقل، وبلا فجوات ولا تداخل.
 * إن قلّت الأيام عن الوحدات تشترك وحدات في اليوم نفسه.
 */
export function distribute(start: string, end: string, weights: number[]): UnitWindow[] {
  const n = weights.length;
  if (!n) return [];
  const days = Math.max(1, daysBetween(start, end) + 1);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  const total = w.reduce((a, b) => a + b, 0);
  const out: UnitWindow[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const from = Math.floor((acc / total) * days);
    acc += w[i];
    const to = Math.max(from, Math.ceil((acc / total) * days) - 1);
    out.push({ start: addDays(start, Math.min(from, days - 1)), end: addDays(start, Math.min(to, days - 1)) });
  }
  // تصحيح: بداية كل وحدة بعد نهاية السابقة إن اتسعت الأيام
  for (let i = 1; i < n; i++) if (days >= n && out[i].start <= out[i - 1].end) out[i].start = addDays(out[i - 1].end, 1);
  for (let i = 0; i < n; i++) if (out[i].end < out[i].start) out[i].end = out[i].start;
  return out;
}

/** حالة الوحدة اليوم: منجزة (٩٠٪ فأكثر)، الآن، متأخرة (انتهت نافذتها ولم تنجز)، قادمة */
export function phaseOf(w: UnitWindow | undefined, progress: number, today: string): UnitPhase {
  if (progress >= 0.9) return "done";
  if (!w) return "upcoming";
  if (today > w.end) return "late";
  if (today >= w.start) return "now";
  return "upcoming";
}

/** المخطط حتى اليوم مقابل الفعلي، والفرق بعدد الوحدات، والانتهاء المتوقع بالوتيرة الحالية */
export function planStatus(s: BookSchedule, progress: number[], today: string): PlanStatus {
  const n = s.units.length || 1;
  let expected = 0;
  for (const w of s.units) {
    const len = daysBetween(w.start, w.end) + 1;
    // المخطط حتى نهاية أمس: اليوم ما زال متاحًا، فلا يُحسب تأخيرًا قبل أن ينتهي
    const gone = Math.min(len, Math.max(0, daysBetween(w.start, today)));
    expected += gone / len;
  }
  expected /= n;
  const actual = progress.slice(0, n).reduce((a, b) => a + Math.min(1, Math.max(0, b)), 0) / n;
  const elapsed = Math.max(1, daysBetween(s.start, today) + 1);
  const pace = actual / elapsed; // نسبة الإنجاز في اليوم
  const projectedEnd = actual >= 1 ? today : pace > 0 ? addDays(today, Math.ceil((1 - actual) / pace)) : null;
  return { expected, actual, diffUnits: Math.round((actual - expected) * n * 10) / 10, daysLeft: daysBetween(today, s.end), projectedEnd };
}

/** عند تغيّر عدد الوحدات (حذف/إعادة إنشاء): جدول جديد بنفس الإعدادات */
export function fitSchedule(s: BookSchedule | null, weights: number[]): BookSchedule | null {
  if (!s) return null;
  if (s.units.length === weights.length) return s;
  if (s.days?.length && s.minutes) {
    const p = buildPlan({ start: s.start, exam: s.exam ?? null, days: s.days, minutes: s.minutes, pages: weights });
    return { ...s, units: p.units, end: p.end };
  }
  return { ...s, units: distribute(s.start, s.end, weights) };
}

// ===== إنشاء الخطة من وقت المذاكرة =====

/** تقدير وقت الوحدة: استماع/قراءة صفحاتها + ملخصها (١٠) واختبارها (٨) وبطاقاتها (٧) */
export const MIN_PER_PAGE = 3;
export const UNIT_EXTRA_MIN = 25;
/** أيام المراجعة قبل الاختبار (لا تُجدول فيها وحدات) */
export const REVIEW_DAYS = 2;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const unitMinutes = (pages: number) => Math.max(1, Math.round(pages) || 1) * MIN_PER_PAGE + UNIT_EXTRA_MIN;
const weekday = (iso: string) => toDate(iso).getDay();

/** أيام الدراسة بين a وb (شاملة) التي يقع يومها ضمن days */
export function studyDates(a: string, b: string, days: number[]): string[] {
  const set = new Set(days.length ? days : ALL_DAYS);
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) if (set.has(weekday(d))) out.push(d);
  return out;
}

/** أول n يوم دراسة ابتداءً من start */
function firstStudyDates(start: string, n: number, days: number[]): string[] {
  const set = new Set(days.length ? days : ALL_DAYS);
  const out: string[] = [];
  for (let d = start, guard = 0; out.length < n && guard < 2000; d = addDays(d, 1), guard++) if (set.has(weekday(d))) out.push(d);
  return out;
}

export type PlanInput = {
  start: string;
  exam: string | null;
  days: number[];
  minutes: number;
  pages: number[]; // صفحات كل وحدة
  done?: boolean[]; // وحدات منجزة لا يُعاد جدولتها
  prev?: UnitWindow[]; // تواريخها السابقة (تبقى كما هي للمنجزة)
};
export type PlanEstimate = {
  totalMin: number; // وقت ما بقي من المقرر تقريبًا
  sessions: number; // أيام الدراسة اللازمة بدقائق اليوم المختارة
  available: number | null; // أيام الدراسة المتاحة قبل أيام المراجعة (إن وُجد اختبار)
  fits: boolean; // يكفي الوقت قبل الاختبار
  needMinutes: number | null; // إن لم يكفِ: الدقائق اليومية اللازمة
  finish: string | null; // آخر يوم دراسة في الخطة
  reviewFrom: string | null; // بداية أيام المراجعة
  units: UnitWindow[];
  end: string;
};

/**
 * يبني الخطة: يُقدَّر وقت كل وحدة، ثم تُملأ أيام الدراسة بدقائق اليوم بالترتيب، فتأخذ الوحدة
 * الأكبر أيامًا أكثر. مع موعد اختبار: آخر يومين قبله للمراجعة؛ وإن لم يكفِ الوقت تُوزَّع الوحدات
 * على كل الأيام المتاحة ويُحسب كم دقيقة يوميًا تلزم فعلًا.
 */
export function buildPlan(i: PlanInput): PlanEstimate {
  const days = i.days.length ? i.days : ALL_DAYS;
  const minutes = Math.max(10, Math.round(i.minutes) || 0);
  const cost = i.pages.map((p, k) => (i.done?.[k] ? 0 : unitMinutes(p)));
  const totalMin = cost.reduce((a, b) => a + b, 0);
  const sessions = totalMin > 0 ? Math.ceil(totalMin / minutes) : 0;
  const reviewFrom = i.exam ? addDays(i.exam, -REVIEW_DAYS) : null;
  const avail = i.exam ? (addDays(i.exam, -(REVIEW_DAYS + 1)) >= i.start ? studyDates(i.start, addDays(i.exam, -(REVIEW_DAYS + 1)), days) : []) : null;
  const fits = avail === null || sessions <= avail.length;
  const dates = fits ? firstStudyDates(i.start, Math.max(1, sessions), days) : avail!.length ? avail! : [i.start];
  const needMinutes = !fits && avail!.length ? Math.ceil(totalMin / avail!.length / 5) * 5 : !fits ? null : null;
  const cap = fits ? minutes : totalMin / dates.length;
  const n = dates.length;
  let acc = 0;
  const units = cost.map((c, k) => {
    if (c === 0) return i.prev?.[k] ?? { start: dates[0], end: dates[0] };
    const s = acc;
    acc += c;
    const a = Math.min(n - 1, Math.floor(s / cap + 1e-9));
    const b = Math.min(n - 1, Math.max(a, Math.ceil(acc / cap - 1e-9) - 1));
    return { start: dates[a], end: dates[b] };
  });
  const finish = totalMin > 0 ? dates[n - 1] : null;
  const end = units.reduce((m, w) => (w.end > m ? w.end : m), finish ?? i.start);
  return { totalMin, sessions, available: avail ? avail.length : null, fits, needMinutes, finish, reviewFrom, units, end };
}

// ===== يوم الخطة ووحدة اليوم =====

/** وحدة اليوم: أول وحدة متأخرة لم تُنجز، وإلا أول وحدة «الآن» */
export function focusUnit(s: BookSchedule, actual: number[], today: string): { unit: number; late: boolean } | null {
  const ph = s.units.map((w, i) => phaseOf(w, actual[i] ?? 0, today));
  const late = ph.indexOf("late");
  if (late >= 0) return { unit: late, late: true };
  const now = ph.indexOf("now");
  return now >= 0 ? { unit: now, late: false } : null;
}

/** ترتيب اليوم في الخطة (اليوم ٨ من ٢٠)، وهل اليوم يوم دراسة، وموعد يوم الدراسة التالي */
export function planDay(s: BookSchedule, today: string): { day: number; total: number; studyDay: boolean; next: string | null } {
  const days = s.days?.length ? s.days : ALL_DAYS;
  const all = studyDates(s.start, s.end, days);
  const day = all.filter((d) => d <= today).length;
  const studyDay = all.includes(today);
  const next = all.find((d) => d > today) ?? null;
  return { day, total: all.length, studyDay, next };
}
