// lib/readerPrefs.ts
// تخزين تفضيلات القارئ محليًا: آخر صفحة لكل كتاب + سرعة القراءة.
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_PAGE_PREFIX = "reader:lastPage:";
const LAST_SENT_PREFIX = "reader:lastSentence:";
const RATE_KEY = "reader:rate";

/** آخر جملة وُقف عندها في الصفحة المحفوظة (لاستئناف دقيق). */
export async function getLastSentence(bookId?: string): Promise<number> {
  if (!bookId) return 0;
  const raw = await AsyncStorage.getItem(LAST_SENT_PREFIX + bookId);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setLastSentence(bookId: string | undefined, idx: number): Promise<void> {
  if (!bookId || !Number.isFinite(idx) || idx < 0) return;
  await AsyncStorage.setItem(LAST_SENT_PREFIX + bookId, String(Math.floor(idx)));
}

/** آخر صفحة وُقف عندها في كتاب معيّن (تبدأ من 1). */
export async function getLastPage(bookId?: string): Promise<number> {
  if (!bookId) return 1;
  const raw = await AsyncStorage.getItem(LAST_PAGE_PREFIX + bookId);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export async function setLastPage(bookId: string | undefined, page: number): Promise<void> {
  if (!bookId || !Number.isFinite(page) || page < 1) return;
  await AsyncStorage.setItem(LAST_PAGE_PREFIX + bookId, String(Math.floor(page)));
}

/** سرعة القراءة المحفوظة (افتراضي 1). */
export async function getReadingRate(): Promise<number> {
  const raw = await AsyncStorage.getItem(RATE_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function setReadingRate(rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0) return;
  await AsyncStorage.setItem(RATE_KEY, String(rate));
}
