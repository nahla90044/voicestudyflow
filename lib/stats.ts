// lib/stats.ts
// تتبّع إحصائيات المذاكرة + سلسلة الأيام (Streak) محليًا.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vsf:stats:v1";

export type DayLog = { m: number; p: number }; // دقائق، صفحات

export type Stats = {
  streak: number; // أيام متتالية
  lastActive: string; // YYYY-MM-DD
  totalMinutes: number;
  totalPages: number;
  booksCompleted: number;
  days: Record<string, DayLog>; // نشاط كل يوم (للخريطة الحرارية)
};

const EMPTY: Stats = {
  streak: 0,
  lastActive: "",
  totalMinutes: 0,
  totalPages: 0,
  booksCompleted: 0,
  days: {},
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
// تنسيق محلي (لا UTC) — يتفادى تزحلق اليوم
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00").getTime();
  const b = new Date(bISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export async function getStats(): Promise<Stats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

async function save(s: Stats): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** تسجيل نشاط مذاكرة (دقائق و/أو صفحات) وتحديث السلسلة. */
export async function recordActivity(opts: {
  minutes?: number;
  pages?: number;
}): Promise<Stats> {
  const s = await getStats();
  const today = todayISO();

  // تحديث السلسلة بناءً على آخر يوم نشاط
  if (s.lastActive !== today) {
    const gap = s.lastActive ? daysBetween(s.lastActive, today) : Infinity;
    s.streak = gap === 1 ? s.streak + 1 : 1;
    s.lastActive = today;
  } else if (s.streak === 0) {
    s.streak = 1;
  }

  const mins = Math.max(0, Math.round(opts.minutes ?? 0));
  const pages = Math.max(0, Math.round(opts.pages ?? 0));
  s.totalMinutes += mins;
  s.totalPages += pages;

  // سجل اليوم (للخريطة الحرارية + هدف اليوم)
  if (!s.days) s.days = {};
  const d = s.days[today] ?? { m: 0, p: 0 };
  d.m += mins;
  d.p += pages;
  s.days[today] = d;

  await save(s);
  return s;
}

/** نشاط اليوم (دقائق/صفحات). */
export async function getTodayActivity(): Promise<DayLog> {
  const s = await getStats();
  return s.days?.[todayISO()] ?? { m: 0, p: 0 };
}

export async function recordBookCompleted(): Promise<void> {
  const s = await getStats();
  s.booksCompleted += 1;
  await save(s);
}
