// lib/annotations.ts
// علامات مرجعية + تظليل + ملاحظات لكل كتاب (محلي).
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Highlight = {
  id: string;
  page: number;
  text: string;
  note?: string;
};

const BOOKMARKS_KEY = (id: string) => `reader:bookmarks:${id}`;
const HIGHLIGHTS_KEY = (id: string) => `reader:highlights:${id}`;

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------- علامات الصفحات ---------------- */

export async function getBookmarks(bookId?: string): Promise<number[]> {
  if (!bookId) return [];
  const raw = await AsyncStorage.getItem(BOOKMARKS_KEY(bookId));
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function toggleBookmark(bookId: string | undefined, page: number): Promise<number[]> {
  if (!bookId) return [];
  const list = await getBookmarks(bookId);
  const next = list.includes(page) ? list.filter((p) => p !== page) : [...list, page].sort((a, b) => a - b);
  await AsyncStorage.setItem(BOOKMARKS_KEY(bookId), JSON.stringify(next));
  return next;
}

/* ---------------- التظليل والملاحظات ---------------- */

export async function getHighlights(bookId?: string): Promise<Highlight[]> {
  if (!bookId) return [];
  const raw = await AsyncStorage.getItem(HIGHLIGHTS_KEY(bookId));
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveHighlights(bookId: string, list: Highlight[]) {
  await AsyncStorage.setItem(HIGHLIGHTS_KEY(bookId), JSON.stringify(list));
}

export async function addHighlight(
  bookId: string | undefined,
  h: { page: number; text: string; note?: string }
): Promise<Highlight[]> {
  if (!bookId) return [];
  const list = await getHighlights(bookId);
  const item: Highlight = { id: newId(), ...h };
  const next = [...list, item];
  await saveHighlights(bookId, next);
  return next;
}

export async function removeHighlight(bookId: string | undefined, id: string): Promise<Highlight[]> {
  if (!bookId) return [];
  const list = await getHighlights(bookId);
  const next = list.filter((h) => h.id !== id);
  await saveHighlights(bookId, next);
  return next;
}

export async function setHighlightNote(
  bookId: string | undefined,
  id: string,
  note: string
): Promise<Highlight[]> {
  if (!bookId) return [];
  const list = await getHighlights(bookId);
  const next = list.map((h) => (h.id === id ? { ...h, note } : h));
  await saveHighlights(bookId, next);
  return next;
}
