// tests/progressCore.test.ts
// اختبارات حسابات شاشة «التقدّم».

import { test } from "node:test";
import assert from "node:assert/strict";
import { periodSeries, splitMinutes } from "../lib/progressCore.ts";

const today = new Date(2026, 9, 9); // ٩ أكتوبر ٢٠٢٦ (الجمعة)
const days = {
  "2026-10-09": { m: 30, p: 5 },
  "2026-10-07": { m: 20, p: 2 },
  "2026-10-01": { m: 15, p: 1 }, // الأسبوع الماضي
  "2026-09-20": { m: 50, p: 9 }, // ضمن آخر ٢٨ يومًا
  "2026-09-05": { m: 40, p: 3 }, // الشهر السابق للمقارنة
};

test("week: seven daily bars ending today, with totals and last-week comparison", () => {
  const s = periodSeries(days, "week", today);
  assert.equal(s.bars.length, 7);
  assert.equal(s.bars[6].key, "2026-10-09");
  assert.equal(s.bars[6].current, true);
  assert.equal(s.bars[6].minutes, 30);
  assert.equal(s.bars[4].minutes, 20);
  assert.equal(s.minutes, 50);
  assert.equal(s.pages, 7);
  assert.equal(s.prevMinutes, 15);
});

test("month: four weekly bars over the last 28 days, compared with the 28 before", () => {
  const s = periodSeries(days, "month", today);
  assert.equal(s.bars.length, 4);
  assert.equal(s.bars[3].current, true);
  assert.equal(s.bars[3].minutes, 50);
  assert.equal(s.minutes, 30 + 20 + 15 + 50);
  assert.equal(s.prevMinutes, 40);
});

test("minutes split into hours and minutes", () => {
  assert.deepEqual(splitMinutes(192), { h: 3, m: 12 });
  assert.deepEqual(splitMinutes(45), { h: 0, m: 45 });
});
