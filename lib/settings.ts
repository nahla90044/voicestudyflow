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

/** وضع التركيز: القارئ يناديكِ باسمكِ بين الحين والآخر. */
export async function getFocusMode(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_FOCUS_MODE)) === "1";
}
export async function setFocusMode(on: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_FOCUS_MODE, on ? "1" : "0");
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
