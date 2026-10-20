// tests/scheduleCore.test.ts — توزيع الوحدات على الأيام، وحالة كل وحدة، والمخطط مقابل الفعلي
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { daysBetween, distribute, phaseOf, planStatus } from "../lib/scheduleCore.ts";

test("التوزيع متصل بلا فجوات ولا تداخل، والوحدة الأكبر تأخذ أيامًا أكثر", () => {
  const u = distribute("2026-11-01", "2026-11-30", [20, 40, 20, 40]);
  assert.equal(u[0].start, "2026-11-01");
  assert.equal(u[3].end, "2026-11-30");
  for (let i = 1; i < u.length; i++) assert.equal(daysBetween(u[i - 1].end, u[i].start), 1);
  assert.ok(daysBetween(u[1].start, u[1].end) > daysBetween(u[0].start, u[0].end));
});

test("أيام أقل من الوحدات: كل وحدة لها يوم داخل المدى", () => {
  const u = distribute("2026-11-01", "2026-11-02", [1, 1, 1, 1]);
  for (const w of u) assert.ok(w.start >= "2026-11-01" && w.end <= "2026-11-02" && w.start <= w.end);
});

test("حالة الوحدة", () => {
  const w = { start: "2026-11-05", end: "2026-11-07" };
  assert.equal(phaseOf(w, 0.95, "2026-11-01"), "done");
  assert.equal(phaseOf(w, 0.2, "2026-11-06"), "now");
  assert.equal(phaseOf(w, 0.2, "2026-11-09"), "late");
  assert.equal(phaseOf(w, 0, "2026-11-01"), "upcoming");
});

test("المخطط مقابل الفعلي: متقدم ومتأخر", () => {
  const s = { start: "2026-11-01", end: "2026-11-04", units: distribute("2026-11-01", "2026-11-04", [1, 1, 1, 1]) };
  const behind = planStatus(s, [1, 0, 0, 0], "2026-11-02");
  assert.ok(behind.expected > behind.actual && behind.diffUnits < 0);
  const ahead = planStatus(s, [1, 1, 1, 0], "2026-11-02");
  assert.ok(ahead.diffUnits > 0);
  assert.equal(planStatus(s, [1, 1, 1, 1], "2026-11-02").projectedEnd, "2026-11-02");
});
