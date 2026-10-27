// tests/nextStep.test.ts — «الخطوة التالية»: خطوة واحدة واضحة حسب التقدّم وموعد الاختبار
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { nextStep, type UnitState } from "../lib/nextStepCore.ts";

const u = (x: Partial<UnitState> = {}): UnitState => ({ done: false, read: 0, summary: false, accuracy: null, pages: 12, ...x });
const base = { dueMistakes: 0, daysLeft: null, prepActive: false };

test("البداية: ملخّص الوحدة الأولى ثم اختبارها", () => {
  assert.deepEqual(nextStep({ ...base, units: [u(), u()] }), { kind: "summary", unit: 0, minutes: 18, then: "quiz" });
});

test("ملخّص جاهز أو قراءة كاملة: الاختبار", () => {
  assert.equal(nextStep({ ...base, units: [u({ summary: true })] }).kind, "quiz");
  assert.equal(nextStep({ ...base, units: [u({ read: 0.9 })] }).kind, "quiz");
});

test("اختبار ضعيف: مراجعة الوحدة نفسها؛ اختبار ناجح: الوحدة التالية", () => {
  const r = nextStep({ ...base, units: [u({ summary: true, accuracy: 0.4 }), u()] });
  assert.equal(r.kind, "review");
  assert.equal((r as { unit: number }).unit, 0);
  const n = nextStep({ ...base, units: [u({ summary: true, accuracy: 0.9 }), u()] });
  assert.deepEqual([n.kind, (n as { unit: number }).unit], ["summary", 1]);
});

test("الأولويات: الاختبار القريب ثم الأخطاء المستحقة", () => {
  assert.equal(nextStep({ ...base, daysLeft: 2, units: [u()] }).kind, "prep");
  assert.equal(nextStep({ ...base, daysLeft: 2, prepActive: true, units: [u()] }).kind, "summary", "خطة الاستعداد جارية: لا تُقترح ثانية");
  assert.equal(nextStep({ ...base, dueMistakes: 7, units: [u()] }).kind, "mistakes");
  assert.equal(nextStep({ ...base, dueMistakes: 2, units: [u()] }).kind, "summary", "أخطاء قليلة لا تقطع التقدّم");
});

test("كل الوحدات منجزة: اختبار شامل؛ بلا وحدات: لا بطاقة", () => {
  assert.equal(nextStep({ ...base, units: [u({ done: true }), u({ accuracy: 0.8 })] }).kind, "final");
  assert.equal(nextStep({ ...base, units: [] }).kind, "none");
});
