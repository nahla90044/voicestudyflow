// lib/goals.ts
// هدف المذاكرة اليومي (بالدقائق).
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vsf:dailyGoalMinutes";
const DEFAULT_GOAL = 20;

export async function getDailyGoal(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL;
}

export async function setDailyGoal(minutes: number): Promise<void> {
  const v = Math.max(1, Math.round(minutes || 0));
  await AsyncStorage.setItem(KEY, String(v));
}
