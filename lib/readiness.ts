// lib/readiness.ts
// تخزين نتائج الاختبارات وحساب «الجاهزية» لكل كتاب (تصميم 2.0).
//
// النتائج تُحفظ على الجهاز مثل محتوى الوحدات المولّد (unitContent) — لا جداول
// جديدة على السيرفر. لكل كتاب سجلّ: حالة كل سؤال أُجيب عنه، ولقطة يومية للجاهزية
// (لحساب «ارتفعت جاهزيتك ٨٪ هذا الأسبوع»)، وآخر يوم اختُبر فيه / سُمع ملخصه.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getUserId } from "./auth";
import { getLastPage } from "./readerPrefs";
import {
  applyAnswer,
  computeReadiness,
  daysUntil,
  dueQuestions,
  questionId,
  unitAccuracy,
  weeklyDelta,
  type QuestionState,
  type QuizItem,
} from "./readinessCore";
import { supabase } from "./supabase";
import { getSyllabus } from "./syllabus";

type BookLog = {
  q: Record<string, QuestionState>;
  snaps: Record<string, number>; // YYYY-MM-DD → جاهزية ذلك اليوم
  quizDay?: string; // آخر يوم أُكمل فيه اختبار
  summaryDay?: string; // آخر يوم سُمع فيه ملخص وحدة
};

function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const logKey = (pdfPath: string) => `quizlog:v1:${hashKey(pdfPath)}`;
const examKey = (bookId: string) => `exam:v1:${bookId}`;

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function readLog(pdfPath: string): Promise<BookLog> {
  try {
    const raw = await AsyncStorage.getItem(logKey(pdfPath));
    const v = raw ? (JSON.parse(raw) as BookLog) : null;
    return { q: v?.q ?? {}, snaps: v?.snaps ?? {}, quizDay: v?.quizDay, summaryDay: v?.summaryDay };
  } catch {
    return { q: {}, snaps: {} };
  }
}

async function writeLog(pdfPath: string, log: BookLog): Promise<void> {
  await AsyncStorage.setItem(logKey(pdfPath), JSON.stringify(log)).catch(() => {});
}

/** كل الأسئلة المُجابة في هذا الكتاب */
export async function getAnswered(pdfPath: string): Promise<QuestionState[]> {
  return Object.values((await readLog(pdfPath)).q);
}

/** يسجّل إجابة واحدة ويُرجع الحالة الجديدة لكل أسئلة الكتاب */
export async function recordAnswer(
  pdfPath: string,
  item: QuizItem,
  where: { unit: number | null; page: number | null },
  correct: boolean
): Promise<QuestionState[]> {
  const log = await readLog(pdfPath);
  const id = questionId(item.q);
  log.q[id] = applyAnswer(log.q[id], item, where, correct, Date.now());
  await writeLog(pdfPath, log);
  return Object.values(log.q);
}

/** أُكمل اختبار اليوم (لمسار اليوم) */
export async function markQuizDone(pdfPath: string): Promise<void> {
  const log = await readLog(pdfPath);
  log.quizDay = todayISO();
  await writeLog(pdfPath, log);
}

/** سُمع ملخص وحدة اليوم (لمسار اليوم) */
export async function markSummaryHeard(pdfPath: string): Promise<void> {
  const log = await readLog(pdfPath);
  log.summaryDay = todayISO();
  await writeLog(pdfPath, log);
}

/** الأسئلة الخاطئة التي حان موعد إعادتها */
export async function getDueMistakes(pdfPath: string): Promise<QuestionState[]> {
  return dueQuestions(await getAnswered(pdfPath), Date.now());
}

export async function getExamDate(bookId: string): Promise<string | null> {
  return (await AsyncStorage.getItem(examKey(bookId)).catch(() => null)) || null;
}

export async function setExamDate(bookId: string, iso: string | null): Promise<void> {
  if (iso) await AsyncStorage.setItem(examKey(bookId), iso).catch(() => {});
  else await AsyncStorage.removeItem(examKey(bookId)).catch(() => {});
}

export type BookReadiness = {
  bookId: string;
  pdfPath: string;
  title: string;
  score: number;
  delta: number | null; // تغيّر الجاهزية خلال أسبوع
  unitCount: number;
  unitTitles: string[];
  accuracy: (number | null)[]; // دقة كل وحدة (null = لم تُختبر)
  weakUnit: number | null;
  weakTitle: string;
  weakUntested: boolean;
  answered: number;
  correct: number; // آخر إجابة صحيحة (لدقة الاختبارات في «التقدّم»)
  dueMistakes: number;
  examISO: string | null;
  daysLeft: number | null;
  quizzedToday: boolean;
  summaryToday: boolean;
  readFraction: number;
};

/**
 * جاهزية كتاب واحد. يأخذ مسار الملف (متاح في كل الشاشات) ويجلب الكتاب والمنهج.
 * يحفظ لقطة اليوم ليُحسب تغيّر الأسبوع. يُرجع null إن لم يُعثر على الكتاب.
 */
export async function getBookReadiness(pdfPath: string): Promise<BookReadiness | null> {
  if (!pdfPath) return null;
  try {
    const uid = await getUserId();
    const { data: book } = await supabase
      .from("books")
      .select("id,title,page_count")
      .eq("pdf_path", pdfPath)
      .eq("user_id", uid)
      .maybeSingle();
    if (!book) return null;
    const [syl, page, log, examISO] = await Promise.all([
      getSyllabus(pdfPath).catch(() => null),
      getLastPage(book.id),
      readLog(pdfPath),
      getExamDate(book.id),
    ]);
    const pages = Number(book.page_count) || 0;
    const readFraction = pages > 0 ? Math.min(1, Math.max(0, (page - 1) / pages)) : 0;
    const questions = Object.values(log.q);
    const unitTitles = syl?.data.units.map((u) => u.title) ?? [];
    const r = computeReadiness({ questions, unitCount: unitTitles.length, readFraction });

    const today = todayISO();
    const delta = weeklyDelta(log.snaps, today, r.score);
    if (log.snaps[today] !== r.score) {
      log.snaps[today] = r.score;
      // نحتفظ بآخر ٦٠ لقطة فقط
      const keys = Object.keys(log.snaps).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete log.snaps[k];
      await writeLog(pdfPath, log);
    }

    return {
      bookId: book.id,
      pdfPath,
      title: book.title ?? "",
      score: r.score,
      delta,
      unitCount: unitTitles.length,
      unitTitles,
      accuracy: unitTitles.map((_, i) => unitAccuracy(questions, i)),
      weakUnit: r.weakUnit,
      weakTitle: r.weakUnit !== null ? unitTitles[r.weakUnit] ?? "" : "",
      weakUntested: r.weakUntested,
      answered: questions.length,
      correct: questions.filter((q) => q.lastCorrect).length,
      dueMistakes: dueQuestions(questions, Date.now()).length,
      examISO,
      daysLeft: examISO ? daysUntil(examISO, today) : null,
      quizzedToday: log.quizDay === today,
      summaryToday: log.summaryDay === today,
      readFraction,
    };
  } catch {
    return null;
  }
}

/** بعد حذف وحدات من المنهج: إجابات أسئلة الوحدات تتبع أرقامها الجديدة، وأسئلة الوحدات المحذوفة تُزال */
export async function remapAnsweredUnits(pdfPath: string, map: (unit: number) => number | null): Promise<void> {
  const log = await readLog(pdfPath);
  for (const [id, st] of Object.entries(log.q)) {
    if (st.unit == null) continue;
    const to = map(st.unit);
    if (to === null) delete log.q[id];
    else log.q[id] = { ...st, unit: to };
  }
  await writeLog(pdfPath, log);
}
