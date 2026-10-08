// lib/progressCore.ts
// حسابات شاشة «التقدّم» (صافية، قابلة للاختبار): أعمدة الأسبوع/الشهر، المجموع،
// والفرق عن الفترة السابقة.

export type DayLog = { m: number; p: number };
export type Bar = { key: string; minutes: number; current: boolean; dayIndex: number };
export type PeriodSeries = { bars: Bar[]; minutes: number; pages: number; prevMinutes: number };

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shift(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function sumRange(days: Record<string, DayLog>, end: Date, count: number): { m: number; p: number } {
  let m = 0;
  let p = 0;
  for (let i = 0; i < count; i++) {
    const log = days[iso(shift(end, -i))];
    if (log) {
      m += log.m || 0;
      p += log.p || 0;
    }
  }
  return { m, p };
}

/**
 * الأسبوع: ٧ أعمدة يومية تنتهي باليوم. الشهر: ٤ أعمدة أسبوعية (آخر ٢٨ يومًا).
 * prevMinutes = مجموع الفترة المماثلة التي قبلها (للمقارنة).
 */
export function periodSeries(days: Record<string, DayLog>, period: "week" | "month", today: Date): PeriodSeries {
  if (period === "week") {
    const bars: Bar[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = shift(today, -i);
      bars.push({ key: iso(d), minutes: days[iso(d)]?.m ?? 0, current: i === 0, dayIndex: d.getDay() });
    }
    const cur = sumRange(days, today, 7);
    const prev = sumRange(days, shift(today, -7), 7);
    return { bars, minutes: cur.m, pages: cur.p, prevMinutes: prev.m };
  }
  const bars: Bar[] = [];
  for (let w = 3; w >= 0; w--) {
    const end = shift(today, -7 * w);
    bars.push({ key: `w${4 - w}`, minutes: sumRange(days, end, 7).m, current: w === 0, dayIndex: -1 });
  }
  const cur = sumRange(days, today, 28);
  const prev = sumRange(days, shift(today, -28), 28);
  return { bars, minutes: cur.m, pages: cur.p, prevMinutes: prev.m };
}

/** «٣ س ١٢ د» / «45 د» — الساعات والدقائق */
export function splitMinutes(total: number): { h: number; m: number } {
  const t = Math.max(0, Math.round(total));
  return { h: Math.floor(t / 60), m: t % 60 };
}
