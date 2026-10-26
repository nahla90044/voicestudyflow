// tests/studyKind.test.ts — تخمين «نوع الدراسة» للكتاب وتأكيده
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { guessStudyKind, needsKindConfirm, studyKindOf } from "../lib/studyKindCore.ts";

test("كتاب CMA بالإنجليزية = شهادة مهنية (لا لغة) مع اسم الاختبار وجزئه", () => {
  const g = guessStudyKind([
    "CMA Part 1: Financial Planning, Performance, and Analytics",
    "Section A: External Financial Reporting Decisions. The CMA exam tests...",
    "Unit 1 Budgeting. Reading: cost behavior",
  ]);
  assert.equal(g.kind, "cert");
  assert.equal(g.exam, "CMA — الجزء الأول");
});

test("كتاب قواعد ومفردات = لغة، واختبار IELTS لغة لا شهادة", () => {
  assert.equal(guessStudyKind(["Unit 1: Present simple. Grammar and vocabulary", "Listening: at the airport", "Fill in the blanks"]).kind, "language");
  assert.equal(guessStudyKind(["IELTS Academic", "Listening section", "Vocabulary for writing task 2", "grammar review"]).kind, "language");
  assert.equal(guessStudyKind(["Leçon 1 : grammaire et vocabulaire", "Compréhension orale", "conjugaison du présent"]).kind, "language");
});

test("مقرر جامعي عادي، وذكر عابر لشهادة مرة واحدة لا يغيّره", () => {
  assert.equal(guessStudyKind(["الوحدة الأولى: ماهية التأمين", "عقد التأمين وأركانه"]).kind, "general");
  assert.equal(guessStudyKind(["مبادئ المحاسبة", "يمكن للطالب لاحقًا التقدم لاختبار CMA"]).kind, "general");
  assert.equal(guessStudyKind([]).kind, "general");
});

test("النوع المؤكَّد والمخمَّن وسطر التأكيد", () => {
  assert.deepEqual(studyKindOf(null), { kind: "general", confirmed: false, exam: undefined });
  assert.equal(needsKindConfirm({ kind: "cert" }), true);
  assert.equal(needsKindConfirm({ kind: "cert", kindOk: true }), false);
  assert.equal(needsKindConfirm({ kind: "general" }), false, "العادية لا تُسأل");
  assert.equal(studyKindOf({ kind: "weird" }).kind, "general");
  assert.equal(studyKindOf({ kind: "cert", exam: " PMP " }).exam, "PMP");
});
