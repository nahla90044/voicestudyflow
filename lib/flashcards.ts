// lib/flashcards.ts
// بطاقات مراجعة بالتكرار المتباعد (نظام Leitner مبسّط).
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vsf:flashcards:v1";

// فواصل المراجعة بالأيام لكل صندوق
const INTERVALS = [0, 1, 3, 7, 16, 35];

export type Card = {
  id: string;
  front: string; // السؤال
  back: string; // الإجابة
  bookId?: string;
  bookTitle?: string;
  box: number; // 0..5
  due: string; // YYYY-MM-DD
  createdAt: string;
};

export type Rating = "again" | "good" | "easy";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getCards(): Promise<Card[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function save(cards: Card[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cards));
}

/** يضيف بطاقات جديدة (تستحق المراجعة اليوم). */
export async function addCards(
  items: { front: string; back: string; bookId?: string; bookTitle?: string }[]
): Promise<number> {
  const clean = items.filter((i) => i.front?.trim() && i.back?.trim());
  if (clean.length === 0) return 0;
  const cards = await getCards();
  const today = todayISO();
  for (const i of clean) {
    cards.push({
      id: newId(),
      front: i.front.trim(),
      back: i.back.trim(),
      bookId: i.bookId,
      bookTitle: i.bookTitle,
      box: 0,
      due: today,
      createdAt: today,
    });
  }
  await save(cards);
  return clean.length;
}

/** البطاقات المستحقّة اليوم. */
export async function getDueCards(): Promise<Card[]> {
  const today = todayISO();
  return (await getCards()).filter((c) => c.due <= today);
}

export async function countDue(): Promise<number> {
  return (await getDueCards()).length;
}

/** مراجعة بطاقة → تحديث الصندوق وموعد المراجعة القادم. */
export async function reviewCard(id: string, rating: Rating): Promise<void> {
  const cards = await getCards();
  const c = cards.find((x) => x.id === id);
  if (!c) return;

  if (rating === "again") c.box = 0;
  else if (rating === "good") c.box = Math.min(INTERVALS.length - 1, c.box + 1);
  else c.box = Math.min(INTERVALS.length - 1, c.box + 2); // easy

  const interval = INTERVALS[c.box] ?? 1;
  c.due = addDays(todayISO(), Math.max(rating === "again" ? 0 : 1, interval));
  await save(cards);
}

export async function removeCard(id: string): Promise<void> {
  const cards = await getCards();
  await save(cards.filter((c) => c.id !== id));
}
