// tests/mockExam.test.ts — «الاختبار التجريبي» لكتب الشهادات: الأوزان والتوزيع والاختيار والتقرير
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { allocate, autoMinutes, clock, missingPerUnit, pickMock, unitReport, unitWeights } from "../lib/mockExamCore.ts";

test("أوزان الوحدات بعدد صفحاتها، والمجهولة بالمتوسط", () => {
  const w = unitWeights([{ from: 1, to: 30 }, { from: 31, to: 40 }, null], 3);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(w[0] > w[2] && w[2] > w[1]);
});

test("التوزيع: المجموع بالضبط، وسؤال لكل وحدة على الأقل", () => {
  const a = allocate(40, [0.5, 0.3, 0.15, 0.05]);
  assert.equal(a.reduce((x, y) => x + y, 0), 40);
  assert.ok(a.every((x) => x >= 1));
  assert.ok(a[0] > a[1] && a[1] > a[2]);
  assert.deepEqual(allocate(2, [0.5, 0.3, 0.2]).reduce((x, y) => x + y, 0), 2);
  assert.deepEqual(allocate(0, [1]), [0]);
});

test("الاختيار: نصيب كل وحدة، والنقص يُكمَّل من غيرها، بلا تكرار", () => {
  let s = 3;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const mk = (u: number, n: number) => Array.from({ length: n }, (_, i) => ({ q: `u${u}q${i}` }));
  const out = pickMock([{ unit: 0, qs: mk(0, 10) }, { unit: 1, qs: mk(1, 2) }, { unit: 2, qs: [...mk(2, 5), { q: "u0q1" }] }], [4, 4, 2], rnd);
  assert.equal(out.length, 10);
  assert.equal(new Set(out.map((q) => q.q)).size, 10);
  assert.equal(out.filter((q) => q.unit === 1).length, 2, "الوحدة الصغيرة بما عندها");
  assert.deepEqual(missingPerUnit([4, 4, 2], [10, 2, 0]), [0, 2, 2]);
});

test("التقرير والأضعف والوقت", () => {
  const r = unitReport([
    { unit: 0, correct: true },
    { unit: 0, correct: false },
    { unit: 1, correct: false },
    { unit: 1, correct: false },
    { unit: 2, correct: true },
    { unit: null, correct: false },
  ]);
  assert.deepEqual(r.units.map((u) => u.pct), [50, 0, 100]);
  assert.equal(r.weakest, 1);
  assert.equal(unitReport([{ unit: 0, correct: true }]).weakest, null, "لا أضعف حين الكل صحيح");
  assert.equal(autoMinutes(40), 60);
  assert.equal(clock(3725), "1:02:05");
  assert.equal(clock(65), "1:05");
});
