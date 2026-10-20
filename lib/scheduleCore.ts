// lib/scheduleCore.ts
// منطق جدول مذاكرة الوحدات (خالص، مُختبَر): توزيع الوحدات على الأيام بحسب حجمها، وحالة كل وحدة،
// ومقارنة «المخطط حتى اليوم» بالإنجاز الفعلي (مثل جداول Kaplan Schweser: يظهر أثر الاجتهاد بوضوح).

export type UnitWindow = { start: string; end: string }; // YYYY-MM-DD (يشمل الطرفين)
export type BookSchedule = { start: string; end: string; units: UnitWindow[] };
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
    const gone = Math.min(len, Math.max(0, daysBetween(w.start, today) + 1));
    expected += gone / len;
  }
  expected /= n;
  const actual = progress.slice(0, n).reduce((a, b) => a + Math.min(1, Math.max(0, b)), 0) / n;
  const elapsed = Math.max(1, daysBetween(s.start, today) + 1);
  const pace = actual / elapsed; // نسبة الإنجاز في اليوم
  const projectedEnd = actual >= 1 ? today : pace > 0 ? addDays(today, Math.ceil((1 - actual) / pace)) : null;
  return { expected, actual, diffUnits: Math.round((actual - expected) * n * 10) / 10, daysLeft: daysBetween(today, s.end), projectedEnd };
}

/** عند تغيّر عدد الوحدات (حذف/إعادة إنشاء): جدول جديد بنفس البداية والنهاية */
export function fitSchedule(s: BookSchedule | null, weights: number[]): BookSchedule | null {
  if (!s) return null;
  if (s.units.length === weights.length) return s;
  return { ...s, units: distribute(s.start, s.end, weights) };
}
