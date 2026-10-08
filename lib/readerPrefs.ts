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

// آخر كتاب فُتح — لبطاقة «تابع القراءة» في الرئيسية
const LAST_BOOK_KEY = "reader:lastBook";

export type LastBook = { id: string; title: string; pdf_path: string };

export async function setLastOpenedBook(book: LastBook): Promise<void> {
  if (!book.id) return;
  await AsyncStorage.setItem(LAST_BOOK_KEY, JSON.stringify(book));
}

export async function getLastOpenedBook(): Promise<LastBook | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_BOOK_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
}

const PAPER_KEY = "reader:paper";
const FONT_KEY = "reader:fontScale";

/** مظهر القارئ: ورقي فاتح (true) أو ليلي (false). الافتراضي ليلي. */
export async function getReaderPaper(): Promise<boolean> {
  return (await AsyncStorage.getItem(PAPER_KEY)) === "1";
}

export async function setReaderPaper(on: boolean): Promise<void> {
  await AsyncStorage.setItem(PAPER_KEY, on ? "1" : "0");
}

/** حجم خط وضع النص (مضاعف: 1 / 1.15 / 1.3). */
export async function getReaderFontScale(): Promise<number> {
  const n = Number(await AsyncStorage.getItem(FONT_KEY));
  return n === 1.15 || n === 1.3 ? n : 1;
}

export async function setReaderFontScale(n: number): Promise<void> {
  await AsyncStorage.setItem(FONT_KEY, String(n));
}
