// tests/nextActions.test.ts
// اختبارات محرّك «الخطوة التالية الذكية» في الرئيسية.

import { test } from "node:test";
import assert from "node:assert/strict";
import { goalProgress, lastSevenDays, pickNextActions, type NextActionInput } from "../lib/nextActions.ts";

const base: NextActionInput = {
  books: 2,
  dueCards: 0,
  todayMinutes: 0,
  goalMinutes: 20,
  streak: 0,
  studiedToday: false,
  hasContinueBook: false,
  todayPlan: null,
  hour: 10,
};

const ids = (input: NextActionInput) => pickNextActions(input).map((a) => a.id);

test("بلا كتب: أول اقتراح إضافة كتاب", () => {
  assert.equal(ids({ ...base, books: 0, dueCards: 9 })[0], "addFirstBook");
});

test("سلسلة مهدّدة مساءً تتقدّم على كل شيء", () => {
  const r = ids({ ...base, streak: 5, hour: 21, dueCards: 20, hasContinueBook: true, todayPlan: { pagesTarget: 10, pagesDone: 0 } });
  assert.equal(r[0], "protectStreak");
});

test("السلسلة لا تُعرض صباحًا ولا إن ذاكر اليوم", () => {
  assert.ok(!ids({ ...base, streak: 5, hour: 9 }).includes("protectStreak"));
  assert.ok(!ids({ ...base, streak: 5, hour: 22, studiedToday: true }).includes("protectStreak"));
});

test("خطة اليوم المنجزة لا تظهر", () => {
  assert.ok(!ids({ ...base, todayPlan: { pagesTarget: 10, pagesDone: 10 } }).includes("plan"));
  assert.equal(ids({ ...base, todayPlan: { pagesTarget: 10, pagesDone: 3 } })[0], "plan");
});

test("البطاقات الكثيرة تتقدّم على متابعة الكتاب، والقليلة لا", () => {
  assert.deepEqual(ids({ ...base, hasContinueBook: true, dueCards: 12 }).slice(0, 2), ["review", "continue"]);
  assert.deepEqual(ids({ ...base, hasContinueBook: true, dueCards: 1 }).slice(0, 2), ["continue", "review"]);
});

test("لا يتجاوز الحد، وفي الحالة الفارغة يقترح التركيز", () => {
  assert.ok(pickNextActions({ ...base, streak: 3, hour: 20, dueCards: 5, hasContinueBook: true, todayPlan: { pagesTarget: 4, pagesDone: 0 } }).length <= 3);
  assert.ok(ids({ ...base, todayMinutes: 30 }).includes("focus"));
});

test("نسبة الهدف محصورة بين 0 و1", () => {
  assert.equal(goalProgress(10, 20), 0.5);
  assert.equal(goalProgress(50, 20), 1);
  assert.equal(goalProgress(5, 0), 0);
});

test("آخر ٧ أيام تعبر حدود الشهر وتنتهي باليوم", () => {
  const days = lastSevenDays(new Date(2026, 2, 3)); // 3 مارس
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-02-25");
  assert.equal(days[6], "2026-03-03");
});
