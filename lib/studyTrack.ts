// lib/studyTrack.ts
// تقدّم مذاكرة كل وحدة وجدولها — محفوظان مع المنهج على السيرفر (يتزامنان بين الجوال والآيباد):
// - ما سُمع من الملخص وما شوهد من الفيديو (مقطعًا مقطعًا، فلا تعتمد على الذاكرة)
// - تقدّم الوحدة من أربعة: إجابات الاختبار الصحيحة، الملخص المسموع، الفيديو المشاهَد، البطاقات المُراجَعة
// - جدول الوحدات: تواريخ مذاكرة كل وحدة (يعدّلها المستخدم)، والمخطط مقابل الفعلي
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCards } from "./flashcards";
import { getAnswered } from "./readiness";
import { distribute, fitSchedule, type BookSchedule } from "./scheduleCore";
import { supabase } from "./supabase";
import type { UnitRange } from "./glossaryCore";

type Seen = { s?: number[]; st?: number; v?: number[]; vt?: number };
export type RawProgress = Record<string, Seen>;
export type UnitProgress = {
  quiz: { correct: number; answered: number };
  summary: { heard: number; total: number };
  video: { seen: number; total: number };
  cards: { reviewed: number; total: number };
  pct: number; // ٠..١ متوسط الأربعة
};

const LOCAL = (p: string) => `vsf:track:v1:${p}`;
const mem = new Map<string, RawProgress>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const union = (a: number[] = [], b: number[] = []) => [...new Set([...a, ...b])].sort((x, y) => x - y);
function merge(a: RawProgress, b: RawProgress): RawProgress {
  const out: RawProgress = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const o = out[k] ?? {};
    out[k] = { s: union(o.s, v.s), st: Math.max(o.st ?? 0, v.st ?? 0), v: union(o.v, v.v), vt: Math.max(o.vt ?? 0, v.vt ?? 0) };
  }
  return out;
}

/** التقدّم الخام: الجهاز + السيرفر مدموجان (لا يضيع شيء من أي جهاز) */
export async function getRawProgress(pdfPath: string): Promise<RawProgress> {
  let local: RawProgress = mem.get(pdfPath) ?? {};
  try {
    local = merge(local, JSON.parse((await AsyncStorage.getItem(LOCAL(pdfPath))) || "{}"));
  } catch {}
  try {
    const { data } = await supabase.from("book_syllabus").select("progress").eq("pdf_path", pdfPath).maybeSingle();
    if (data?.progress) local = merge(local, data.progress as RawProgress);
  } catch {}
  mem.set(pdfPath, local);
  return local;
}

async function push(pdfPath: string) {
  const mine = mem.get(pdfPath) ?? {};
  await AsyncStorage.setItem(LOCAL(pdfPath), JSON.stringify(mine)).catch(() => {});
  try {
    const { data } = await supabase.from("book_syllabus").select("progress").eq("pdf_path", pdfPath).maybeSingle();
    const merged = merge((data?.progress as RawProgress) ?? {}, mine);
    await supabase.from("book_syllabus").update({ progress: merged }).eq("pdf_path", pdfPath);
  } catch {}
}

/** يسجّل مقطع ملخص مسموعًا (kind "s") أو مشهد فيديو مشاهدًا (kind "v") لوحدة — الرفع مجمّع كل ٣ ثوانٍ */
export function markSeen(pdfPath: string, unit: number, kind: "s" | "v", index: number, total: number): void {
  if (!pdfPath || unit < 0 || index < 0) return;
  const cur = mem.get(pdfPath) ?? {};
  const u = cur[String(unit)] ?? {};
  cur[String(unit)] = kind === "s" ? { ...u, s: union(u.s, [index]), st: Math.max(u.st ?? 0, total) } : { ...u, v: union(u.v, [index]), vt: Math.max(u.vt ?? 0, total) };
  mem.set(pdfPath, cur);
  if (timers.has(pdfPath)) return;
  timers.set(
    pdfPath,
    setTimeout(() => {
      timers.delete(pdfPath);
      void push(pdfPath);
    }, 3000)
  );
}

/** المشاهد المشاهَدة من فيديو وحدة (لعلامة «شوهد» على كل مشهد) */
export async function seenScenes(pdfPath: string, unit: number): Promise<Set<number>> {
  return new Set((await getRawProgress(pdfPath))[String(unit)]?.v ?? []);
}

/** تقدّم كل وحدات الكتاب */
export async function unitsProgress(pdfPath: string, bookId: string, ranges: UnitRange[], unitCount: number): Promise<UnitProgress[]> {
  const [raw, answered, cards] = await Promise.all([getRawProgress(pdfPath), getAnswered(pdfPath).catch(() => []), getCards().catch(() => [])]);
  const mine = cards.filter((c) => c.bookId === bookId && !c.archived && c.page);
  return Array.from({ length: unitCount }, (_, i) => {
    const qs = answered.filter((q) => q.unit === i);
    const r = ranges[i];
    const uc = r ? mine.filter((c) => c.page! >= r.from && c.page! <= r.to) : [];
    const seen = raw[String(i)] ?? {};
    const p: Omit<UnitProgress, "pct"> = {
      quiz: { correct: qs.filter((q) => q.lastCorrect).length, answered: qs.length },
      summary: { heard: seen.s?.length ?? 0, total: seen.st ?? 0 },
      video: { seen: seen.v?.length ?? 0, total: seen.vt ?? 0 },
      cards: { reviewed: uc.filter((c) => c.box > 0).length, total: uc.length },
    };
    const f = (a: number, b: number) => (b > 0 ? Math.min(1, a / b) : 0);
    const pct = (f(p.quiz.correct, p.quiz.answered) + f(p.summary.heard, p.summary.total) + f(p.video.seen, p.video.total) + f(p.cards.reviewed, p.cards.total)) / 4;
    return { ...p, pct };
  });
}

/** يُعيد ترقيم التقدّم بعد حذف وحدات (map: قديم → جديد أو null) */
export async function remapProgress(pdfPath: string, map: (u: number) => number | null): Promise<void> {
  const raw = await getRawProgress(pdfPath);
  const next: RawProgress = {};
  for (const [k, v] of Object.entries(raw)) {
    const to = map(Number(k));
    if (to !== null) next[String(to)] = v;
  }
  mem.set(pdfPath, next);
  await AsyncStorage.setItem(LOCAL(pdfPath), JSON.stringify(next)).catch(() => {});
  await supabase.from("book_syllabus").update({ progress: next }).eq("pdf_path", pdfPath);
}

// ===== جدول الوحدات =====

/**
 * جدول الكتاب: المحفوظ مع المنهج، وإلا يُبنى من خطة الكتاب القديمة (تاريخ البداية والنهاية) إن وُجدت، وإلا null.
 * weights: صفحات كل وحدة (لتوزيع الأيام بحسب حجمها).
 */
export async function getSchedule(pdfPath: string, bookId: string, weights: number[]): Promise<BookSchedule | null> {
  if (!weights.length) return null;
  const { data } = await supabase.from("book_syllabus").select("schedule").eq("pdf_path", pdfPath).maybeSingle();
  const saved = data?.schedule as BookSchedule | null;
  if (saved?.start && saved?.end && Array.isArray(saved.units)) return fitSchedule(saved, weights);
  if (!bookId) return null;
  const { data: plan } = await supabase.from("study_plans").select("start_date,end_date").eq("book_id", bookId).order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (!plan?.start_date || !plan?.end_date) return null;
  return { start: plan.start_date, end: plan.end_date, units: distribute(plan.start_date, plan.end_date, weights) };
}

export async function saveSchedule(pdfPath: string, s: BookSchedule | null): Promise<void> {
  const { error } = await supabase.from("book_syllabus").update({ schedule: s }).eq("pdf_path", pdfPath);
  if (error) throw new Error(error.message);
}
