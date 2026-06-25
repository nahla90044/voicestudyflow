// lib/sessionMeta.ts
// نوع كل جلسة (مذاكرة/قراءة/…) — يُحفظ محليًا حسب معرّف الجلسة.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "session:types:v1";

export const SESSION_TYPES = ["مذاكرة", "قراءة", "مراجعة", "حفظ", "حل تمارين"];
export const DEFAULT_SESSION_TYPE = "مذاكرة";

export async function getSessionTypes(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function setSessionType(id: string, type: string): Promise<void> {
  const all = await getSessionTypes();
  all[id] = type;
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}
