// lib/settings.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_MIN_PER_PAGE = "settings:min_per_page";
const KEY_USER_NAME = "settings:user_name";
const KEY_FOCUS_MODE = "settings:focus_mode";

// افتراضي: 1.5 دقيقة لكل صفحة (عدليه مثل ما تبين)
const DEFAULT_MIN_PER_PAGE = 1.5;

/** اسم المستخدم (يُستخدم في وضع التركيز للمناداة). */
export async function getUserName(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_USER_NAME)) ?? "";
}
export async function setUserName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEY_USER_NAME, name.trim());
}

/**
 * درجة وضع التركيز: 0=مطفأ، 1=خفيف، 2=متوسط، 3=كثيف.
 * تحدّد كل كم جملة يناديكِ القارئ باسمكِ (0 = أبدًا).
 */
export type FocusLevel = 0 | 1 | 2 | 3;
const FOCUS_EVERY: Record<FocusLevel, number> = { 0: 0, 1: 16, 2: 9, 3: 4 };

export async function getFocusLevel(): Promise<FocusLevel> {
  // توافق مع الإعداد القديم (مفعّل = متوسط)
  const lvl = await AsyncStorage.getItem(KEY_FOCUS_MODE);
  if (lvl === null) return 0;
  const n = Number(lvl);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n as FocusLevel;
  return lvl === "1" ? 2 : 0; // القيمة القديمة "1" كانت تعني مفعّل
}
export async function setFocusLevel(level: FocusLevel): Promise<void> {
  await AsyncStorage.setItem(KEY_FOCUS_MODE, String(level));
}
/** كل كم جملة يُنادى الاسم لهذه الدرجة (0 = لا مناداة). */
export function focusEvery(level: FocusLevel): number {
  return FOCUS_EVERY[level] ?? 0;
}

export async function getMinutesPerPage(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY_MIN_PER_PAGE);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MIN_PER_PAGE;
  return n;
}

export async function setMinutesPerPage(value: number): Promise<void> {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) {
    await AsyncStorage.setItem(KEY_MIN_PER_PAGE, String(DEFAULT_MIN_PER_PAGE));
    return;
  }
  await AsyncStorage.setItem(KEY_MIN_PER_PAGE, String(v));
}

export function computeDaysNeeded(params: {
  pageCount: number;
  dailyMinutes: number;
  minutesPerPage: number;
}): number {
  const { pageCount, dailyMinutes, minutesPerPage } = params;
  const pc = Math.max(1, Math.floor(pageCount || 0));
  const dm = Math.max(5, Math.floor(dailyMinutes || 0));
  const mpp = Math.max(0.1, Number(minutesPerPage || 0));

  const pagesPerDay = dm / mpp;
  const days = Math.ceil(pc / Math.max(0.1, pagesPerDay));
  return Math.max(1, days);
}
