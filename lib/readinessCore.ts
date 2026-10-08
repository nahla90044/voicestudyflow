// lib/readinessCore.ts
// حسابات «الجاهزية» الصافية (بلا تخزين ولا شبكة) — قابلة للاختبار.
//
// الجاهزية = ٣٠٪ من التقدّم في القراءة + ٧٠٪ من الإتقان في الاختبارات.
// الإتقان يُحسب لكل وحدة من آخر إجابة على كل سؤال، بوزن الصعوبة (سهل ١،
// متوسط ١٫٥، صعب ٢)، ويُخفَّض إن كانت الأسئلة المُجابة قليلة (أقل من ٥) حتى
// لا يعطي سؤال واحد صحيح جاهزية كاملة. الوحدة التي لم تُختبر = صفر.
//
// السؤال الخاطئ يعود للمراجعة بعد يومين؛ الصحيح بعد خطأ يعود بعد أسبوع ثم ثلاثة.

export type QuizLevel = "easy" | "medium" | "hard";

/** سؤال اختبار كما يولّده الذكاء (نفس شكل QuizQ في syllabus.ts) */
export type QuizItem = { q: string; options: string[]; answer: number; level: QuizLevel };

/** حالة سؤال واحد بعد الإجابة عنه */
export type QuestionState = {
  qid: string;
  item: QuizItem;
  unit: number | null; // وحدة المنهج (null لاختبار الصفحة)
  page: number | null; // صفحة القارئ (null لاختبار الوحدة)
  lastCorrect: boolean;
  at: number; // وقت آخر إجابة (ms)
  tries: number;
  streak: number; // إجابات صحيحة متتالية
  dueAt: number | null; // موعد إعادته للمراجعة (null = لا يلزم)
};

const DAY = 86_400_000;
const LEVEL_WEIGHT: Record<QuizLevel, number> = { easy: 1, medium: 1.5, hard: 2 };
const MIN_FOR_FULL_CONFIDENCE = 5;
export const WEAK_BELOW = 0.75;

/** بصمة ثابتة للسؤال من نصه (FNV-1a) */
export function questionId(q: string): string {
  let h = 2166136261;
  const s = q.trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** يحدّث حالة السؤال بعد إجابة جديدة */
export function applyAnswer(
  prev: QuestionState | undefined,
  item: QuizItem,
  where: { unit: number | null; page: number | null },
  correct: boolean,
  now: number
): QuestionState {
  const streak = correct ? (prev?.streak ?? 0) + 1 : 0;
  let dueAt: number | null;
  if (!correct) dueAt = now + 2 * DAY;
  else if (prev && (!prev.lastCorrect || prev.dueAt !== null)) dueAt = now + (streak >= 2 ? 21 : 7) * DAY;
  else dueAt = null; // صحيح من أول مرة → لا يحتاج إعادة
  if (correct && streak >= 3) dueAt = null; // أُتقن
  return {
    qid: questionId(item.q),
    item,
    unit: where.unit,
    page: where.page,
    lastCorrect: correct,
    at: now,
    tries: (prev?.tries ?? 0) + 1,
    streak,
    dueAt,
  };
}

/** نسبة الصواب بوزن الصعوبة (٠..١) */
function weightedAccuracy(qs: QuestionState[]): number {
  let w = 0;
  let got = 0;
  for (const s of qs) {
    const lw = LEVEL_WEIGHT[s.item.level] ?? 1;
    w += lw;
    if (s.lastCorrect) got += lw;
  }
  return w > 0 ? got / w : 0;
}

/** إتقان مجموعة أسئلة (٠..١) مع خفضه إن كانت قليلة */
export function mastery(qs: QuestionState[]): { value: number; answered: number } {
  if (qs.length === 0) return { value: 0, answered: 0 };
  const confidence = Math.min(1, qs.length / MIN_FOR_FULL_CONFIDENCE);
  return { value: weightedAccuracy(qs) * confidence, answered: qs.length };
}

/** نسبة الإجابات الصحيحة الخام في وحدة (للعرض «دقة ٥٥٪») أو null إن لم تُختبر */
export function unitAccuracy(all: QuestionState[], unit: number): number | null {
  const qs = all.filter((s) => s.unit === unit);
  if (!qs.length) return null;
  return qs.filter((s) => s.lastCorrect).length / qs.length;
}

export type ReadinessInput = {
  questions: QuestionState[];
  unitCount: number; // ٠ إن لم يوجد منهج
  readFraction: number; // ٠..١ من صفحات الكتاب
};

export type Readiness = {
  score: number; // ٠..١٠٠
  perUnit: { unit: number; mastery: number; answered: number }[];
  weakUnit: number | null; // أضعف وحدة (أو أول وحدة لم تُختبر)
  weakUntested: boolean; // الأضعف لم تُختبر بعد
};

export function computeReadiness({ questions, unitCount, readFraction }: ReadinessInput): Readiness {
  const read = Math.max(0, Math.min(1, readFraction || 0));
  let m = 0;
  const perUnit: Readiness["perUnit"] = [];
  if (unitCount > 0) {
    for (let u = 0; u < unitCount; u++) {
      const r = mastery(questions.filter((s) => s.unit === u));
      perUnit.push({ unit: u, mastery: r.value, answered: r.answered });
    }
    m = perUnit.reduce((a, p) => a + p.mastery, 0) / unitCount;
  } else {
    // بلا منهج: كل الأسئلة (اختبارات الصفحات) كتلة واحدة، وتلزم ١٥ إجابة لثقة كاملة
    m = weightedAccuracy(questions) * Math.min(1, questions.length / 15);
  }
  const score = Math.round(100 * Math.max(0, Math.min(1, 0.3 * read + 0.7 * m)));

  let weakUnit: number | null = null;
  let weakUntested = false;
  const tested = perUnit.filter((p) => p.answered > 0 && p.mastery < WEAK_BELOW);
  if (tested.length) {
    weakUnit = tested.reduce((a, b) => (b.mastery < a.mastery ? b : a)).unit;
  } else {
    const untested = perUnit.find((p) => p.answered === 0);
    if (untested) {
      weakUnit = untested.unit;
      weakUntested = true;
    }
  }
  return { score, perUnit, weakUnit, weakUntested };
}

/** الأسئلة المستحقة للمراجعة الآن (الأقدم استحقاقًا أولًا) */
export function dueQuestions(all: QuestionState[], now: number): QuestionState[] {
  return all.filter((s) => s.dueAt !== null && s.dueAt <= now).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

/** فرق الجاهزية عن لقطة قبل ٧ أيام تقريبًا (أو أقدم لقطة متاحة) — null إن لم توجد */
export function weeklyDelta(snapshots: Record<string, number>, todayISO: string, current: number): number | null {
  const weekAgo = addDaysISO(todayISO, -7);
  const older = Object.keys(snapshots).filter((d) => d < todayISO).sort();
  if (!older.length) return null;
  const atOrBefore = older.filter((d) => d <= weekAgo);
  const base = atOrBefore.length ? atOrBefore[atOrBefore.length - 1] : older[0];
  return current - snapshots[base];
}

/** عدد الأيام من اليوم حتى التاريخ (سالب إن مضى) */
export function daysUntil(targetISO: string, todayISO: string): number {
  const a = Date.parse(todayISO + "T00:00:00Z");
  const b = Date.parse(targetISO + "T00:00:00Z");
  return Math.round((b - a) / DAY);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(Date.parse(iso + "T00:00:00Z") + days * DAY);
  return d.toISOString().slice(0, 10);
}

// ===== مسار اليوم =====

export type PathStepId = "listen" | "cards" | "mistakes" | "quiz" | "summary";
export type PathStep = { id: PathStepId; minutes: number; done: boolean };

export type PathInput = {
  hasBook: boolean;
  todayMinutes: number;
  goalMinutes: number;
  dueCards: number;
  reviewedCardsToday: boolean;
  dueMistakes: number;
  quizzedToday: boolean;
  hasSyllabus: boolean;
  weakUnit: number | null;
  summaryToday: boolean;
};

/**
 * يبني «مسار اليوم»: خطوات قليلة واضحة بترتيب منطقي — استماع، ثم مراجعة ما
 * يوشك أن يُنسى، ثم اختبار يرفع الجاهزية، ثم ملخص صوتي. الخطوة المنجزة تبقى
 * ظاهرة مشطوبة (يرى المستخدم ما أنجز)، والخطوة غير المناسبة اليوم لا تظهر.
 */
export function buildDailyPath(i: PathInput): { steps: PathStep[]; done: number; minutesLeft: number } {
  const steps: PathStep[] = [];
  if (i.hasBook) {
    const left = Math.max(0, i.goalMinutes - i.todayMinutes);
    steps.push({ id: "listen", minutes: left > 0 ? left : Math.min(15, i.goalMinutes), done: left === 0 });
  }
  if (i.dueCards > 0 || i.reviewedCardsToday) {
    steps.push({ id: "cards", minutes: Math.max(3, Math.ceil(i.dueCards * 0.4)), done: i.dueCards === 0 });
  }
  if (i.dueMistakes > 0) {
    steps.push({ id: "mistakes", minutes: Math.max(3, Math.ceil(i.dueMistakes * 0.8)), done: false });
  } else if (i.hasSyllabus && i.weakUnit !== null) {
    steps.push({ id: "quiz", minutes: 8, done: i.quizzedToday });
  }
  if (i.hasSyllabus && i.weakUnit !== null) {
    steps.push({ id: "summary", minutes: 10, done: i.summaryToday });
  }
  const done = steps.filter((s) => s.done).length;
  const minutesLeft = steps.filter((s) => !s.done).reduce((a, s) => a + s.minutes, 0);
  return { steps, done, minutesLeft };
}
