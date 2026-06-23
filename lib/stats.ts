// lib/stats.ts
// تتبّع إحصائيات المذاكرة + سلسلة الأيام (Streak) محليًا.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vsf:stats:v1";

export type Stats = {
  streak: number; // أيام متتالية
  lastActive: string; // YYYY-MM-DD
  totalMinutes: number;
  totalPages: number;
  booksCompleted: number;
};

const EMPTY: Stats = {
  streak: 0,
  lastActive: "",
  totalMinutes: 0,
  totalPages: 0,
  booksCompleted: 0,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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

  s.totalMinutes += Math.max(0, Math.round(opts.minutes ?? 0));
  s.totalPages += Math.max(0, Math.round(opts.pages ?? 0));

  await save(s);
  return s;
}

export async function recordBookCompleted(): Promise<void> {
  const s = await getStats();
  s.booksCompleted += 1;
  await save(s);
}
