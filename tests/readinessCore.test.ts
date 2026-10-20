// tests/readinessCore.test.ts
// اختبارات حساب الجاهزية والمراجعة المتباعدة ومسار اليوم.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAnswer,
  buildDailyPath,
  computeReadiness,
  daysUntil,
  dueQuestions,
  mastery,
  unitAccuracy,
  weeklyDelta,
  type PathInput,
  type QuestionState,
  type QuizItem,
} from "../lib/readinessCore.ts";

const DAY = 86_400_000;
const item = (q: string, level: QuizItem["level"] = "medium"): QuizItem => ({ q, options: ["a", "b"], answer: 0, level });
const ans = (q: string, unit: number | null, correct: boolean, level: QuizItem["level"] = "medium", now = 0) =>
  applyAnswer(undefined, item(q, level), { unit, page: null }, correct, now);

test("wrong answer comes back after two days; first-time correct needs no review", () => {
  const w = ans("س١", 0, false, "medium", 1000);
  assert.equal(w.dueAt, 1000 + 2 * DAY);
  const c = ans("س٢", 0, true, "medium", 1000);
  assert.equal(c.dueAt, null);
});

test("correct after a mistake is re-checked in a week, then mastered", () => {
  const w = ans("س", 0, false, "easy", 0);
  const c1 = applyAnswer(w, w.item, { unit: 0, page: null }, true, 3 * DAY);
  assert.equal(c1.dueAt, 3 * DAY + 7 * DAY);
  const c2 = applyAnswer(c1, w.item, { unit: 0, page: null }, true, 10 * DAY);
  assert.equal(c2.dueAt, 10 * DAY + 21 * DAY);
  const c3 = applyAnswer(c2, w.item, { unit: 0, page: null }, true, 31 * DAY);
  assert.equal(c3.dueAt, null);
  assert.equal(c3.tries, 4);
});

test("one correct question does not mean full mastery", () => {
  assert.equal(mastery([ans("س", 0, true)]).value, 0.2);
  const five = ["١", "٢", "٣", "٤", "٥"].map((q) => ans(q, 0, true));
  assert.equal(mastery(five).value, 1);
});

test("hard questions weigh more than easy ones", () => {
  const qs = [
    ...["١", "٢", "٣", "٤"].map((q) => ans(q, 0, true, "easy")),
    ans("٥", 0, false, "hard"),
  ];
  // 4 من 6 أوزان
  assert.ok(Math.abs(mastery(qs).value - 4 / 6) < 1e-9);
});

test("readiness mixes reading (30%) and unit mastery (70%); untested units count as zero", () => {
  const unit0 = ["١", "٢", "٣", "٤", "٥"].map((q) => ans(q, 0, true));
  const r = computeReadiness({ questions: unit0, unitCount: 2, readFraction: 0.5 });
  // 0.3*0.5 + 0.7*(1+0)/2 = 0.5
  assert.equal(r.score, 50);
  assert.equal(r.weakUnit, 1);
  assert.equal(r.weakUntested, true);
});

test("weakest tested unit below 75% is reported", () => {
  const qs = [
    ...["١", "٢", "٣", "٤", "٥"].map((q) => ans("أ" + q, 0, true)),
    ...["١", "٢", "٣", "٤", "٥"].map((q, i) => ans("ب" + q, 1, i < 2)),
  ];
  const r = computeReadiness({ questions: qs, unitCount: 2, readFraction: 1 });
  assert.equal(r.weakUnit, 1);
  assert.equal(r.weakUntested, false);
  assert.equal(unitAccuracy(qs, 1), 0.4);
  assert.equal(unitAccuracy(qs, 3), null);
});

test("without a syllabus, page quizzes need ~15 answers for full weight", () => {
  const qs = ["١", "٢", "٣", "٤", "٥"].map((q) => ans(q, null, true));
  const r = computeReadiness({ questions: qs, unitCount: 0, readFraction: 0 });
  assert.equal(r.score, Math.round(100 * 0.7 * (5 / 15)));
  assert.equal(r.weakUnit, null);
});

test("due questions are those whose review time has come", () => {
  const a = ans("أ", 0, false, "medium", 0); // due at 2 days
  const b = ans("ب", 0, true, "medium", 0); // none
  assert.deepEqual(dueQuestions([a, b], DAY), []);
  assert.deepEqual(dueQuestions([a, b], 2 * DAY).map((s: QuestionState) => s.item.q), ["أ"]);
});

test("weekly delta compares with the snapshot about a week ago", () => {
  const snaps = { "2026-09-28": 40, "2026-10-01": 50, "2026-10-06": 60 };
  assert.equal(weeklyDelta(snaps, "2026-10-08", 72), 22);
  assert.equal(weeklyDelta({ "2026-10-07": 70 }, "2026-10-08", 72), 2);
  assert.equal(weeklyDelta({}, "2026-10-08", 72), null);
  assert.equal(weeklyDelta({ "2026-10-08": 70 }, "2026-10-08", 72), null);
});

test("days until exam", () => {
  assert.equal(daysUntil("2026-10-20", "2026-10-08"), 12);
  assert.equal(daysUntil("2026-10-08", "2026-10-08"), 0);
  assert.equal(daysUntil("2026-10-01", "2026-10-08"), -7);
});

const basePath: PathInput = {
  hasBook: true,
  todayMinutes: 0,
  goalMinutes: 20,
  dueCards: 0,
  reviewedCardsToday: false,
  dueMistakes: 0,
  quizzedToday: false,
  hasSyllabus: true,
  weakUnit: 3,
  summaryToday: false,
};

test("daily path: listen, quiz on weak unit, audio summary", () => {
  const p = buildDailyPath(basePath);
  assert.deepEqual(p.steps.map((s) => s.id), ["listen", "quiz", "summary"]);
  assert.equal(p.done, 0);
  assert.equal(p.minutesLeft, 20 + 8 + 10);
});

test("daily path: mistakes replace the quiz, cards appear when due, done steps stay visible", () => {
  const p = buildDailyPath({ ...basePath, todayMinutes: 25, dueCards: 10, dueMistakes: 4, summaryToday: true });
  assert.deepEqual(p.steps.map((s) => [s.id, s.done]), [
    ["listen", true],
    ["cards", false],
    ["mistakes", false],
    ["summary", true],
  ]);
  assert.equal(p.done, 2);
  assert.equal(p.minutesLeft, 4 + 4);
});

test("daily path without syllabus or book stays minimal", () => {
  assert.deepEqual(buildDailyPath({ ...basePath, hasSyllabus: false, weakUnit: null }).steps.map((s) => s.id), ["listen"]);
  assert.deepEqual(buildDailyPath({ ...basePath, hasBook: false, hasSyllabus: false, weakUnit: null }).steps, []);
});

test("مسار اليوم من الخطة: صفحات الوحدة ثم ملخصها ثم اختبارها ثم البطاقات؛ ويوم الراحة بطاقات فقط", () => {
  const base = { hasBook: true, todayMinutes: 0, goalMinutes: 60, dueCards: 4, reviewedCardsToday: false, dueMistakes: 3, quizzedToday: false, hasSyllabus: true, weakUnit: 0, summaryToday: false };
  const p = buildDailyPath({ ...base, plan: { restDay: false, listenMin: 45, listenDone: true, summaryDone: false, quizDone: false } });
  assert.deepEqual(p.steps.map((s) => s.id), ["listen", "summary", "quiz", "cards"]);
  assert.equal(p.done, 1);
  assert.equal(p.minutesLeft, 10 + 8 + 3);
  const rest = buildDailyPath({ ...base, plan: { restDay: true, listenMin: 0, listenDone: false, summaryDone: false, quizDone: false } });
  assert.deepEqual(rest.steps.map((s) => s.id), ["cards"]);
});
