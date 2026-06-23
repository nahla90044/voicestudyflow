// lib/settings.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_MIN_PER_PAGE = "settings:min_per_page";

// افتراضي: 1.5 دقيقة لكل صفحة (عدليه مثل ما تبين)
const DEFAULT_MIN_PER_PAGE = 1.5;

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
