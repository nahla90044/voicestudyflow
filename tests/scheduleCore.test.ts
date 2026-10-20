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
  // اليوم نفسه لا يُحسب تأخيرًا: في ٢ نوفمبر المخطط وحدة واحدة (أمس)
  assert.ok(planStatus(s, [1, 0, 0, 0], "2026-11-02").diffUnits === 0);
  const behind = planStatus(s, [1, 0, 0, 0], "2026-11-03");
  assert.ok(behind.expected > behind.actual && behind.diffUnits < 0);
  const ahead = planStatus(s, [1, 1, 1, 0], "2026-11-02");
  assert.ok(ahead.diffUnits > 0);
  assert.equal(planStatus(s, [1, 1, 1, 1], "2026-11-02").projectedEnd, "2026-11-02");
});

// ===== إنشاء الخطة من وقت المذاكرة =====
import { buildPlan, focusUnit, planDay, studyDates, unitMinutes, REVIEW_DAYS } from "../lib/scheduleCore.ts";

test("أيام الدراسة تحترم أيام الأسبوع المختارة", () => {
  // ٢٠٢٦-١١-٠١ أحد؛ بلا جمعة (٥)
  const d = studyDates("2026-11-01", "2026-11-07", [0, 1, 2, 3, 4, 6]);
  assert.equal(d.length, 6);
  assert.ok(!d.includes("2026-11-06"));
});

test("الخطة تكفي: تنتهي قبل أيام المراجعة، بلا فجوات بين الوحدات، والأكبر يأخذ أيامًا أكثر", () => {
  const pages = [19, 19, 20, 21, 22, 28];
  const p = buildPlan({ start: "2026-11-01", exam: "2026-12-15", days: [0, 1, 2, 3, 4], minutes: 60, pages });
  const total = pages.reduce((a, x) => a + unitMinutes(x), 0);
  assert.equal(p.totalMin, total);
  assert.equal(p.sessions, Math.ceil(total / 60));
  assert.ok(p.fits);
  assert.ok(p.finish! < p.reviewFrom!);
  assert.equal(p.reviewFrom, "2026-12-13");
  for (let i = 1; i < p.units.length; i++) assert.ok(p.units[i].start >= p.units[i - 1].end);
  assert.equal(p.units[0].start, "2026-11-01");
  assert.equal(p.units.at(-1)!.end, p.finish);
  for (const w of p.units) assert.ok(![5, 6].includes(new Date(`${w.start}T00:00:00`).getDay()));
});

test("الوقت لا يكفي: يُقال صراحة كم دقيقة تلزم، وتُوزَّع الوحدات على كل الأيام المتاحة", () => {
  const p = buildPlan({ start: "2026-11-01", exam: "2026-11-10", days: [0, 1, 2, 3, 4, 5, 6], minutes: 30, pages: [100, 100] });
  assert.equal(p.fits, false);
  assert.equal(p.available, 10 - REVIEW_DAYS - 1); // ١–٧ نوفمبر
  assert.ok(p.needMinutes! >= Math.ceil(p.totalMin / p.available!));
  assert.equal(p.needMinutes! % 5, 0);
  assert.equal(p.units.at(-1)!.end, "2026-11-07");
});

test("الوحدات المنجزة لا يُعاد جدولتها وتبقى تواريخها", () => {
  const prev = [{ start: "2026-10-01", end: "2026-10-03" }, { start: "2026-10-04", end: "2026-10-06" }];
  const p = buildPlan({ start: "2026-11-01", exam: null, days: [], minutes: 60, pages: [20, 20], done: [true, false], prev });
  assert.deepEqual(p.units[0], prev[0]);
  assert.equal(p.units[1].start, "2026-11-01");
  assert.equal(p.totalMin, unitMinutes(20));
});

test("وحدة اليوم: المتأخرة أولًا، ثم الحالية؛ وترتيب اليوم في الخطة", () => {
  const s = { start: "2026-11-01", end: "2026-11-06", units: [{ start: "2026-11-01", end: "2026-11-02" }, { start: "2026-11-03", end: "2026-11-04" }, { start: "2026-11-05", end: "2026-11-06" }], days: [0, 1, 2, 3, 4] };
  assert.deepEqual(focusUnit(s, [0.2, 0, 0], "2026-11-03"), { unit: 0, late: true });
  assert.deepEqual(focusUnit(s, [1, 0, 0], "2026-11-03"), { unit: 1, late: false });
  const d = planDay(s, "2026-11-03");
  assert.equal(d.total, 5); // الجمعة ٦ نوفمبر ليست يوم دراسة
  assert.equal(d.day, 3);
  assert.ok(d.studyDay);
  assert.equal(planDay(s, "2026-11-06").studyDay, false);
});
