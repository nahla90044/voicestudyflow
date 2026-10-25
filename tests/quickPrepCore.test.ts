// tests/quickPrepCore.test.ts — «الاستعداد السريع ⏰»: المستويات وحدودها، توزيع الدقائق، إعادة التوزيع،
// كشف الإكمال، اختيار الأسئلة، والتقرير النهائي.
import { test } from "node:test";
import assert from "node:assert/strict";

import { questionId } from "../lib/readinessCore.ts";
import type { QuestionState } from "../lib/readinessCore.ts";
import {
  AHEAD_MARGIN,
  CORE_MIN,
  EXAM_Q,
  KEEP_SLACK,
  MAX_RETRY,
  QUOTA_RETRY_MS,
  RETRY_MS,
  STEP_SPEC,
  autoEndAt,
  buildPlan,
  cardSig,
  cardsChanged,
  countDistinct,
  countFor,
  currentStep,
  dropOrder,
  estimateSummaryRequests,
  fillMinutes,
  isPlanFinished,
  isStepComplete,
  isTimeUp,
  minTotal,
  minutesLeft,
  pickMix,
  pickSubset,
  pickUpgrades,
  planExpired,
  planProgress,
  prepReport,
  quizProgress,
  quotaWaiting,
  replan,
  requeue,
  stepClock,
  tierOf,
  unitWeights,
  unitsToRetry,
  withLiveMastery,
  wrongFor,
} from "../lib/quickPrepCore.ts";
import type { PrepareState, PrepPlan, PrepStep, PrepUnit } from "../lib/quickPrepCore.ts";

const MIN = 60_000;
const T0 = 1_760_000_000_000;

/** مولّد عشوائي ثابت البذرة (mulberry32) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const U = (unit: number, pages: number | null = 10, mastery = 0.5, hasCards = true): PrepUnit => ({
  unit,
  title: `الوحدة ${unit + 1}`,
  pages,
  from: unit * 10 + 1,
  to: unit * 10 + 10,
  mastery,
  hasCards,
});
const PAGES = [8, 12, 20, 5, 15];
const MAST = [0.1, 0.9, 0.4, 0.7, 0];
const mkUnits = (n: number): PrepUnit[] => Array.from({ length: n }, (_, i) => U(i, PAGES[i % 5], MAST[i % 5], i % 3 !== 2));

const st = (q: string, unit: number | null, correct: boolean, at = T0): QuestionState => ({
  qid: questionId(q),
  item: { q, options: ["أ", "ب"], answer: 0, level: "easy" },
  unit,
  page: null,
  lastCorrect: correct,
  at,
  tries: 1,
  streak: correct ? 1 : 0,
  dueAt: null,
});

const live = (p: { steps: PrepStep[] }) => p.steps.filter((s) => s.status !== "dropped");
const sumMin = (xs: PrepStep[]) => xs.reduce((a, s) => a + s.min, 0);
const todoMin = (xs: PrepStep[]) => sumMin(xs.filter((s) => s.status === "todo"));
const unitMin = (p: PrepPlan, u: number) => sumMin(live(p).filter((s) => s.unit === u));
const at = (m: number) => T0 + m * MIN;
const run = (plan: PrepPlan, units: PrepUnit[], minutesPassed: number, steps = plan.steps) =>
  replan({ steps, units, now: at(minutesPassed), deadlineAt: at(plan.totalMin) });

function capOf(p: PrepPlan, s: PrepStep): number {
  if (s.unit !== null) return Math.round(STEP_SPEC[s.kind].base * 3);
  if (s.kind === "exam") return Math.round(EXAM_Q[p.tier] * 0.8);
  return Math.max(6, Math.min(15, Math.round(p.totalMin * 0.04)));
}

// ===== المستويات =====

test("المستوى من الوقت وعدد الوحدات: الحدود والنزول والصعود", () => {
  const cases: [number, number, string, "up" | "down" | null][] = [
    [60, 4, "short", null],
    [120, 4, "short", null],
    [120, 2, "bridge", "up"],
    [121, 8, "bridge", null],
    [179, 8, "bridge", null],
    [180, 8, "mid", null],
    [360, 8, "mid", null],
    [361, 8, "long", null],
    [400, 12, "mid", "down"],
    [200, 15, "bridge", "down"],
  ];
  for (const [T, n, tier, adj] of cases) {
    const r = tierOf(T, n);
    assert.equal(r.tier, tier, `T=${T} n=${n}`);
    assert.equal(r.adjusted, adj, `T=${T} n=${n}`);
  }
  // الأطول ينزل متتاليًا إلى الانتقال إن قلّ الوقت لكل وحدة كثيرًا
  assert.equal(tierOf(400, 25).tier, "bridge");
  assert.equal(tierOf(400, 25).base, "long");
});

test("أقل وقت مقبول وتقدير طلبات الملخص", () => {
  assert.equal(minTotal(1), 10);
  assert.equal(minTotal(3), 10);
  assert.equal(minTotal(8), 24);
  assert.equal(minTotal(20), 60);
  assert.equal(estimateSummaryRequests(null), 1);
  assert.equal(estimateSummaryRequests(9), 1);
  assert.equal(estimateSummaryRequests(25), 3);
  assert.equal(estimateSummaryRequests(0), 1);
});

test("منطقة الانتقال: لا ترقية عند ١٢١ دقيقة، ٦ فأكثر عند ١٧٩، والمرقّاة هي الأضعف، والعدد لا ينقص", () => {
  const units = mkUnits(8);
  const upCount = (T: number) => Object.values(buildPlan({ totalMin: T, units }).levels).filter((l) => l === "brief").length;
  assert.equal(buildPlan({ totalMin: 121, units }).tier, "bridge");
  assert.equal(upCount(121), 0);
  assert.ok(upCount(179) >= 6, `عند ١٧٩: ${upCount(179)}`);
  let prev = -1;
  for (let T = 121; T <= 179; T++) {
    const c = upCount(T);
    assert.ok(c >= prev, `T=${T}: ${c} < ${prev}`);
    prev = c;
  }
  // عند ١٥٠: أربع ترقيات للأضعف إتقانًا
  const p = buildPlan({ totalMin: 150, units });
  const up = units.filter((u) => p.levels[u.unit] === "brief");
  const rest = units.filter((u) => p.levels[u.unit] === "final");
  assert.equal(up.length, 4);
  assert.ok(Math.max(...up.map((u) => u.mastery)) <= Math.min(...rest.map((u) => u.mastery)));
  // الوحدة المرقّاة خطواتها: المختصر (والبطاقات إن وُجدت) والأسئلة
  const u = up[0];
  const kinds = p.steps.filter((s) => s.unit === u.unit).map((s) => s.kind);
  assert.deepEqual(kinds, u.hasCards ? ["brief", "cards", "quiz"] : ["brief", "quiz"]);
});

test("pickUpgrades: حد العدد، وتخطي ما لا يتسع، والترتيب بالأضعف ثم الأكبر", () => {
  const units = [U(0, 10, 0.5), U(1, 30, 0.2), U(2, 5, 0.2), U(3, 10, 0.9, false)];
  assert.deepEqual(pickUpgrades(units, 1000, 2), [1, 2]);
  assert.deepEqual(pickUpgrades(units, 1000, 0), []);
  // ٤٤ أساسًا خفيفًا؛ ترقية واحدة ببطاقات = ٦٣ × ٠٫٦ = ٣٧٫٨ → تتسع في ٣٨ فقط
  assert.deepEqual(pickUpgrades(units, 38, 4), [1]);
  // بلا بطاقات الإضافة ١١ فقط: تُتخطى ذات البطاقات وتُرقّى الوحدة ٣
  assert.deepEqual(pickUpgrades(units, 33, 4), [3]);
});

// ===== توزيع الدقائق =====

test("fillMinutes: المجموع بالضبط، والحدود محترمة، والأكبر طلبًا لا يأخذ أقل", () => {
  const rnd = seeded(7);
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(rnd() * 12);
    const items = Array.from({ length: n }, () => {
      const floor = 1 + Math.floor(rnd() * 5);
      return { want: rnd() * 20, floor, cap: floor + Math.floor(rnd() * 30) };
    });
    const lo = items.reduce((a, it) => a + it.floor, 0);
    const hi = items.reduce((a, it) => a + it.cap, 0);
    const tot = lo + Math.floor(rnd() * (hi - lo + 1));
    const out = fillMinutes(tot, items);
    assert.equal(out.reduce((a, b) => a + b, 0), tot);
    out.forEach((m, i) => {
      assert.ok(Number.isInteger(m));
      assert.ok(m >= items[i].floor && m <= items[i].cap);
    });
  }
  const same = [
    { want: 10, floor: 2, cap: 40 },
    { want: 3, floor: 2, cap: 40 },
    { want: 7, floor: 2, cap: 40 },
  ];
  for (let tot = 6; tot <= 120; tot++) {
    const [a, b, c] = fillMinutes(tot, same);
    assert.ok(a >= c && c >= b, `tot=${tot}: ${a},${b},${c}`);
  }
  assert.deepEqual(fillMinutes(3, same), [2, 2, 2]); // الحدود الدنيا أكبر من الهدف
  assert.deepEqual(fillMinutes(500, same), [40, 40, 40]); // السقوف أصغر من الهدف
  assert.deepEqual(fillMinutes(10, []), []);
});

test("الأوزان: الحجم والحاجة، والصفحات المجهولة تأخذ الوسيط", () => {
  const w = unitWeights([U(0, 10, 0.5), U(1, null, 0.5), U(2, 10, 0.5)]);
  assert.ok(Math.abs(w[0] - 1) < 1e-9 && Math.abs(w[1] - 1) < 1e-9);
  const allNull = unitWeights([U(0, null, 0), U(1, null, 1)]);
  assert.ok(allNull[0] > allNull[1]);
  assert.ok(Math.abs(allNull[0] / allNull[1] - 1.4 / 0.6) < 1e-9);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean(unitWeights(mkUnits(7))) - 1) < 1e-9);
  // الحجم محصور بين نصف وضعف الوسيط
  const big = unitWeights([U(0, 1000, 0.5), U(1, 10, 0.5), U(2, 10, 0.5)]);
  assert.ok(Math.abs(big[0] / big[1] - 2) < 1e-9);
  assert.deepEqual(unitWeights([]), []);
});

// ===== بناء الخطة =====

test("buildPlan: لكل وقت وعدد وحدات — المجموع = الوقت، كل وحدة لها خطوة أساسية، والدقائق ضمن الحدود، والخطة ثابتة عند البدء", () => {
  for (const T of [30, 45, 60, 90, 120, 150, 180, 240, 360, 480, 600]) {
    for (const n of [1, 3, 8, 15]) {
      if (T < minTotal(n)) continue;
      const units = mkUnits(n);
      const p = buildPlan({ totalMin: T, units });
      const tag = `T=${T} n=${n}`;
      assert.equal(sumMin(live(p)) + p.reserveMin, T, tag);
      assert.ok(p.reserveMin >= 0, tag);
      for (const u of units) {
        const core = p.steps.filter((s) => s.unit === u.unit && s.prio === 1);
        assert.equal(core.length, 1, tag);
        assert.equal(core[0].status, "todo", tag);
      }
      for (const s of live(p)) {
        assert.ok(Number.isInteger(s.min), tag);
        assert.ok(s.min >= (p.tight ? CORE_MIN : STEP_SPEC[s.kind].floor), `${tag} ${s.id} ${s.min}`);
        assert.ok(s.min >= s.floor && s.min <= capOf(p, s), `${tag} ${s.id} ${s.min}`);
        assert.equal(s.planned, s.min, tag);
      }
      if (!p.tight) assert.ok(p.steps.every((s) => s.status === "todo"), tag);
      // إعادة التوزيع في لحظة البدء لا تغيّر شيئًا
      assert.equal(run(p, units, 0).changed, false, tag);
    }
  }
});

test("الأضعف تأخذ وقتًا أكثر من المتقنة، والأكبر أكثر من الأصغر", () => {
  const byMastery = [U(0, 10, 0), U(1, 10, 1), U(2, 10, 0.5), U(3, 10, 0.5)];
  for (const T of [90, 240, 480]) {
    const p = buildPlan({ totalMin: T, units: byMastery });
    assert.ok(unitMin(p, 0) > unitMin(p, 1), `T=${T}: ${unitMin(p, 0)} ≤ ${unitMin(p, 1)}`);
  }
  const byPages = [U(0, 20, 0.5), U(1, 5, 0.5), U(2, 10, 0.5), U(3, 10, 0.5)];
  for (const T of [90, 240, 480]) {
    const p = buildPlan({ totalMin: T, units: byPages });
    assert.ok(unitMin(p, 0) > unitMin(p, 1), `T=${T}`);
  }
});

test("البطاقات تغيب عن الوحدة التي لا بطاقات لها", () => {
  const units = [U(0, 10, 0.5, true), U(1, 10, 0.5, false), U(2, 10, 0.5, false)];
  for (const T of [240, 480]) {
    const p = buildPlan({ totalMin: T, units });
    assert.ok(p.steps.some((s) => s.id === "u0:cards"));
    assert.ok(!p.steps.some((s) => s.id === "u1:cards" || s.id === "u2:cards"));
  }
});

test("وقت قليل: المراجعة الأخيرة ثم ٥ أسئلة لكل وحدة، بلا اختبار شامل", () => {
  const units = mkUnits(4);
  const p = buildPlan({ totalMin: 90, units });
  assert.equal(p.tier, "short");
  assert.deepEqual(
    p.steps.map((s) => s.id),
    ["u0:final", "u0:quiz5", "u1:final", "u1:quiz5", "u2:final", "u2:quiz5", "u3:final", "u3:quiz5"]
  );
  assert.ok(p.steps.filter((s) => s.kind === "quiz5").every((s) => s.count === 5));
  assert.ok(Object.values(p.levels).every((l) => l === "final"));
});

test("وقت متوسط: المختصر والبطاقات والأسئلة، والاختبار الشامل في الآخر بعشرين سؤالًا فأقل", () => {
  const units = mkUnits(4);
  const p = buildPlan({ totalMin: 240, units });
  assert.equal(p.tier, "mid");
  const last = p.steps[p.steps.length - 1];
  assert.equal(last.id, "end:exam");
  assert.ok(last.count !== undefined && last.count <= 20 && last.count >= 5);
  assert.equal(last.maxCount, 20);
  assert.deepEqual(
    p.steps.filter((s) => s.unit === 0).map((s) => s.kind),
    ["brief", "cards", "quiz"]
  );
  assert.ok(Object.values(p.levels).every((l) => l === "brief"));
  const quiz = p.steps.find((s) => s.id === "u0:quiz")!;
  assert.equal(quiz.count, Math.max(5, Math.min(15, quiz.min)));
});

test("وقت أطول: الخريطة والاستماع في الوحدات، ثم مراجعة الأخطاء قبل الاختبار الشامل", () => {
  const units = mkUnits(4);
  const p = buildPlan({ totalMin: 480, units });
  assert.equal(p.tier, "long");
  assert.deepEqual(
    p.steps.filter((s) => s.unit === 0).map((s) => s.kind),
    ["brief", "mindmap", "cards", "quiz", "listen"]
  );
  const ids = p.steps.map((s) => s.id);
  assert.deepEqual(ids.slice(-2), ["end:mistakes", "end:exam"]);
  assert.equal(p.steps.find((s) => s.id === "end:exam")!.maxCount, 25);
  assert.equal(p.steps.find((s) => s.id === "end:mistakes")!.count, 15);
});

test("وحدة واحدة: بلا اختبار شامل", () => {
  const one = [U(0, 30, 0.2)];
  for (const T of [10, 60, 240, 480]) {
    const p = buildPlan({ totalMin: T, units: one });
    assert.ok(!p.steps.some((s) => s.kind === "exam"), `T=${T}`);
    assert.equal(p.steps.filter((s) => s.prio === 1).length, 1);
  }
  assert.ok(buildPlan({ totalMin: 480, units: one }).steps.some((s) => s.id === "end:mistakes"));
});

test("عشرون وحدة في ساعة: الوقت ضيق، ولكل وحدة مراجعة أخيرة لا تقل عن دقيقتين، والأسئلة تُحذف من الأقوى أولًا", () => {
  const units = Array.from({ length: 20 }, (_, i) => U(i, 10, i / 19));
  const p = buildPlan({ totalMin: 60, units });
  assert.equal(p.tier, "short");
  assert.equal(p.tight, true);
  assert.equal(sumMin(live(p)) + p.reserveMin, 60);
  for (const u of units) {
    const f = p.steps.find((s) => s.id === `u${u.unit}:final`)!;
    assert.equal(f.status, "todo");
    assert.ok(f.min >= 2);
  }
  const dropped = p.steps.filter((s) => s.kind === "quiz5" && s.status === "dropped").map((s) => units[s.unit!].mastery);
  const kept = p.steps.filter((s) => s.kind === "quiz5" && s.status === "todo").map((s) => units[s.unit!].mastery);
  assert.ok(dropped.length > 0 && kept.length > 0);
  assert.ok(Math.min(...dropped) >= Math.max(...kept));
});

test("وحدات كثيرة جدًا في أقل وقت: الأساسيات وحدها بدقيقتين وبلا احتياط", () => {
  // ستون وحدة في ١٨٠ دقيقة: كل الوحدات بالمراجعة الأخيرة، والباقي محذوف
  const units = Array.from({ length: 60 }, (_, i) => U(i, i % 4 === 0 ? null : 8 + (i % 7), (i % 10) / 10));
  const p = buildPlan({ totalMin: minTotal(60), units });
  assert.equal(p.tight, true);
  assert.equal(sumMin(live(p)) + p.reserveMin, 180);
  assert.equal(p.steps.filter((s) => s.prio === 1 && s.status === "todo").length, 60);
  assert.equal(run(p, units, 0).changed, false);
  // مئة وحدة في ٣٠٠ دقيقة (ينزل المستوى للانتقال بلا ترقية)
  const many = Array.from({ length: 100 }, (_, i) => U(i, 10, 0.5));
  const q = buildPlan({ totalMin: 300, units: many });
  assert.ok(live(q).every((s) => s.min >= CORE_MIN));
  assert.equal(sumMin(live(q)) + q.reserveMin, 300);
  assert.equal(q.steps.filter((s) => s.prio === 1 && s.status === "todo").length, 100);
  // تحت أقل وقت (الشاشة ترفضه، والمنطق لا يتعطل): الأساسيات وحدها بدقيقتين وبلا احتياط
  const ten = Array.from({ length: 10 }, (_, i) => U(i, 10, i / 10));
  const r = buildPlan({ totalMin: 20, units: ten });
  assert.equal(r.tight, true);
  assert.equal(r.reserveMin, 0);
  assert.ok(r.steps.filter((s) => s.prio !== 1).every((s) => s.status === "dropped"));
  assert.ok(r.steps.filter((s) => s.prio === 1).every((s) => s.status === "todo" && s.min === CORE_MIN && s.floor === CORE_MIN));
  assert.equal(run(r, ten, 0).changed, false);
});

test("صفحات مجهولة: الخطة تُبنى وتمر على كل الوحدات", () => {
  const units = [U(0, null, 0.2), U(1, null, 0.8), U(2, 12, 0.5), U(3, null, 0)];
  for (const T of [60, 200, 400]) {
    const p = buildPlan({ totalMin: T, units });
    assert.equal(sumMin(live(p)) + p.reserveMin, T);
    for (const u of units) assert.ok(p.steps.some((s) => s.unit === u.unit && s.prio === 1 && s.status === "todo"));
  }
  const allNull = buildPlan({ totalMin: 240, units: units.map((u) => ({ ...u, pages: null })) });
  assert.ok(unitMin(allNull, 3) > unitMin(allNull, 1));
});

test("المستويات: كلها مراجعة أخيرة في القليل، وكلها مختصر في المتوسط، ومختلطة في الانتقال", () => {
  const units = mkUnits(8);
  assert.ok(Object.values(buildPlan({ totalMin: 100, units }).levels).every((l) => l === "final"));
  assert.ok(Object.values(buildPlan({ totalMin: 300, units }).levels).every((l) => l === "brief"));
  const mixed = Object.values(buildPlan({ totalMin: 150, units }).levels);
  assert.ok(mixed.includes("final") && mixed.includes("brief"));
  assert.equal(Object.keys(buildPlan({ totalMin: 150, units }).levels).length, 8);
});

test("الصعود: ساعتان لوحدتين تصبح انتقالًا بالمختصر، وأربعمئة دقيقة لاثنتي عشرة وحدة تنزل للمتوسط", () => {
  const up = buildPlan({ totalMin: 120, units: mkUnits(2) });
  assert.equal(up.tier, "bridge");
  assert.equal(up.adjusted, "up");
  assert.ok(Object.values(up.levels).every((l) => l === "brief"));
  const down = buildPlan({ totalMin: 400, units: mkUnits(12) });
  assert.equal(down.tier, "mid");
  assert.equal(down.adjusted, "down");
  assert.ok(!down.steps.some((s) => s.kind === "listen" || s.kind === "mindmap"));
});

// ===== ترتيب الحذف =====

test("ترتيب الحذف: الأولوية ٣ للأقوى، ثم الأخطاء، ثم الشامل، ثم الأسئلة، ولا تُحذف الأساسية", () => {
  const units = [U(0, 10, 0.1), U(1, 10, 0.9), U(2, 10, 0.5)];
  const p = buildPlan({ totalMin: 480, units });
  const order = dropOrder(p.steps, units).map((s) => s.id);
  assert.ok(!order.some((id) => id.endsWith(":brief")));
  assert.deepEqual(order.slice(0, 3), ["u1:listen", "u1:cards", "u1:mindmap"]);
  const i = (id: string) => order.indexOf(id);
  assert.ok(i("u0:mindmap") < i("end:mistakes"));
  assert.ok(i("end:mistakes") < i("end:exam"));
  assert.ok(i("end:exam") < i("u1:quiz"));
  assert.deepEqual(order.slice(-3), ["u1:quiz", "u2:quiz", "u0:quiz"]);
});

// ===== إعادة التوزيع =====

test("بلا تأخر لا تغيير، وتأخر ٥ دقائق ضمن الاحتياط لا يغيّر شيئًا", () => {
  const units = mkUnits(4);
  const p = buildPlan({ totalMin: 240, units });
  assert.ok(p.reserveMin >= 5);
  assert.equal(run(p, units, 0).changed, false);
  assert.equal(run(p, units, 5).changed, false);
  // خطوة جارية تأخرت ٥ دقائق عن وقتها
  const steps = p.steps.map((s) => ({ ...s }));
  steps[0].status = "doing";
  steps[0].startedAt = at(0);
  assert.equal(run(p, units, steps[0].min + 5, steps).changed, false);
});

test("تأخر ٢٠ دقيقة في المتوسط: تُقلَّص الأولوية ٣ أولًا بلا حذف", () => {
  const units = mkUnits(4);
  const p = buildPlan({ totalMin: 240, units });
  const r = run(p, units, p.reserveMin + 20);
  assert.equal(r.changed, true);
  assert.equal(r.dropped, 0);
  assert.ok(r.shrunk > 0);
  r.steps.forEach((s, i) => {
    if (s.min !== p.steps[i].min) assert.equal(s.prio, 3, s.id);
  });
  assert.ok(todoMin(r.steps) <= minutesLeft(at(240), at(p.reserveMin + 20)));
  assert.equal(run(p, units, p.reserveMin + 20, r.steps).changed, false); // ثابت
});

test("تأخر كبير: الحذف بالترتيب، ولا تُحذف خطوة أساسية، وكل الوحدات باقية", () => {
  const units = [U(0, 10, 0.1), U(1, 10, 0.4), U(2, 10, 0.7), U(3, 10, 0.9)];
  const p = buildPlan({ totalMin: 480, units });
  const deadline = at(480);

  // ٦٠ دقيقة باقية: تُحذف خطوات الأولوية ٣ للأقوى فقط
  const r60 = replan({ steps: p.steps, units, now: at(420), deadlineAt: deadline });
  const st60 = (id: string) => r60.steps.find((s) => s.id === id)!.status;
  assert.equal(st60("u3:listen"), "dropped");
  assert.equal(st60("u3:mindmap"), "dropped");
  assert.equal(st60("u0:listen"), "todo");
  assert.equal(st60("end:mistakes"), "todo");
  assert.equal(st60("end:exam"), "todo");
  assert.ok(todoMin(r60.steps) <= 60);
  assert.ok(60 - todoMin(r60.steps) < 6); // الفائض بعد الحذف أقل من ست دقائق

  // ٣٠ دقيقة: كل الأولوية ٣، ثم الأخطاء، ثم الشامل، ثم أسئلة الأقوى
  const r30 = replan({ steps: p.steps, units, now: at(450), deadlineAt: deadline });
  const by = (id: string) => r30.steps.find((s) => s.id === id)!;
  assert.ok(r30.steps.filter((s) => s.prio === 3).every((s) => s.status === "dropped"));
  assert.equal(by("end:exam").status, "dropped");
  assert.equal(by("u3:quiz").status, "dropped");
  assert.equal(by("u0:quiz").status, "todo");
  for (const r of [r60, r30]) {
    for (const u of units) {
      const core = r.steps.find((s) => s.unit === u.unit && s.prio === 1)!;
      assert.equal(core.status, "todo");
    }
    assert.equal(r.overdue, false);
  }
  // تقليص الأسئلة إلى ٤ دقائق يجعل عددها ٥، وتقليص الشامل ينقص عدده
  assert.equal(r60.steps.find((s) => s.id === "u0:quiz")!.min, 4);
  assert.equal(r60.steps.find((s) => s.id === "u0:quiz")!.count, 5);
  const exam0 = p.steps.find((s) => s.id === "end:exam")!;
  const exam60 = r60.steps.find((s) => s.id === "end:exam")!;
  assert.ok(exam60.min < exam0.min && exam60.count! < exam0.count!);
  assert.equal(exam60.count, countFor("exam", exam60.min, 25));

  // ١٠ دقائق: الأساسيات وحدها تُضغط حتى دقيقتين
  const r10 = replan({ steps: p.steps, units, now: at(470), deadlineAt: deadline });
  assert.equal(r10.tight, true);
  assert.equal(r10.overdue, false);
  assert.equal(todoMin(r10.steps), 10);
  assert.ok(r10.steps.filter((s) => s.status === "todo").every((s) => s.prio === 1 && s.min >= CORE_MIN));

  // الثبات بعد التأخر
  for (const [r, m] of [[r60, 420], [r30, 450], [r10, 470]] as const) {
    assert.equal(replan({ steps: r.steps, units, now: at(m), deadlineAt: deadline }).changed, false);
  }
});

test("تجاوز الموعد: الأساسيات على دقيقتين والخطة متأخرة", () => {
  const units = mkUnits(5);
  const p = buildPlan({ totalMin: 240, units });
  const r = run(p, units, 250);
  assert.equal(r.overdue, true);
  assert.equal(r.tight, true);
  const todo = r.steps.filter((s) => s.status === "todo");
  assert.equal(todo.length, 5);
  assert.ok(todo.every((s) => s.prio === 1 && s.min === CORE_MIN));
  assert.equal(run(p, units, 250, r.steps).changed, false);
});

test("التقدّم ١٠ دقائق فأكثر يعيد المحذوف الأهم أولًا دون تجاوز الوقت، والنتيجة ثابتة", () => {
  const units = [U(0, 10, 0.1), U(1, 10, 0.4), U(2, 10, 0.7), U(3, 10, 0.9)];
  const p = buildPlan({ totalMin: 480, units });
  const deadline = at(480);
  const r60 = replan({ steps: p.steps, units, now: at(420), deadlineAt: deadline });
  // أنجزت الوحدة الأولى كل خطواتها بسرعة
  const steps = r60.steps.map((s) => (s.unit === 0 && s.status === "todo" ? { ...s, status: "done" as const } : { ...s }));
  const budget = 60;
  assert.ok(budget - todoMin(steps) >= AHEAD_MARGIN);
  const r = replan({ steps, units, now: at(420), deadlineAt: deadline });
  assert.equal(r.changed, true);
  assert.ok(r.restored >= 1);
  assert.ok(todoMin(r.steps) <= budget - KEEP_SLACK);
  // المُعاد هو الأهم: خطوة الوحدة الأضعف بين المحذوفات
  const restored = r.steps.filter((s, i) => steps[i].status === "dropped" && s.status === "todo");
  const stillDropped = r.steps.filter((s) => s.status === "dropped");
  const m = (s: PrepStep) => units[s.unit!].mastery;
  assert.ok(Math.max(...restored.map(m)) <= Math.min(...stillDropped.map(m)));
  assert.equal(replan({ steps: r.steps, units, now: at(420), deadlineAt: deadline }).changed, false);

  // إعادة المقلَّص نحو دقائقه الأولى حين يتسع الوقت
  const mid = buildPlan({ totalMin: 240, units });
  const late = run(mid, units, mid.reserveMin + 20);
  const fast = late.steps.map((s, i) => (i < 3 ? { ...s, status: "done" as const } : { ...s }));
  const back = run(mid, units, mid.reserveMin + 20, fast);
  assert.ok(back.changed);
  back.steps.forEach((s) => assert.ok(s.min <= s.planned));
  assert.ok(back.steps.some((s, i) => s.min > fast[i].min));
  assert.equal(run(mid, units, mid.reserveMin + 20, back.steps).changed, false);
});

test("محاكاة جلسات عشوائية: لا تُحذف وحدة، والوقت يتسع ما لم يتجاوز الموعد، والنتيجة ثابتة", () => {
  const rnd = seeded(2026);
  for (let k = 0; k < 60; k++) {
    const n = 1 + Math.floor(rnd() * 12);
    const T = minTotal(n) + Math.floor(rnd() * (600 - minTotal(n)));
    const units = Array.from({ length: n }, (_, i) => U(i, rnd() < 0.2 ? null : 3 + Math.floor(rnd() * 25), rnd(), rnd() < 0.7));
    const plan = buildPlan({ totalMin: T, units });
    const deadlineAt = at(T);
    let steps = plan.steps;
    let now = at(0);
    const check = (tag: string): PrepStep[] => {
      const r = replan({ steps, units, now, deadlineAt });
      assert.equal(replan({ steps: r.steps, units, now, deadlineAt }).changed, false, tag);
      for (const u of units) {
        const core = r.steps.find((s) => s.unit === u.unit && s.prio === 1)!;
        assert.notEqual(core.status, "dropped", tag);
      }
      const cur = r.steps.find((s) => s.status === "doing");
      const curNeed = cur ? Math.max(CORE_MIN, cur.min - stepClock(cur, now).elapsed) : 0;
      if (!r.overdue) assert.ok(todoMin(r.steps) <= Math.max(0, minutesLeft(deadlineAt, now) - curNeed), tag);
      assert.ok(r.steps.every((s) => s.status !== "todo" || s.min >= CORE_MIN), tag);
      return r.steps.map((s) => ({ ...s }));
    };
    for (let it = 0; it < 200; it++) {
      const tag = `T=${T} n=${n} it=${it}`;
      steps = check(tag);
      const next = currentStep(steps);
      if (!next) break;
      next.status = "doing";
      next.startedAt = now;
      // الطالب يتأخر أو يسبق: من ثلث وقت الخطوة إلى ضعفيه، وتُعاد الخطة في منتصف الخطوة أيضًا
      const dur = Math.max(1, Math.round(next.min * (0.3 + rnd() * 1.7)));
      const half = Math.floor(dur / 2);
      now += half * MIN;
      steps = check(tag + " (أثناء الخطوة)");
      const cur = steps.find((s) => s.status === "doing")!;
      assert.equal(cur.id, next.id, tag);
      now += (dur - half) * MIN;
      cur.status = "done";
      cur.doneAt = now;
    }
    assert.ok(isPlanFinished(steps), `T=${T} n=${n}`);
  }
});

test("الخطوة الجارية المتجاوزة تُحسب دقيقتين فقط", () => {
  const units = mkUnits(4);
  const p = buildPlan({ totalMin: 240, units });
  const steps = p.steps.map((s) => ({ ...s }));
  steps[0].status = "doing";
  steps[0].startedAt = at(0);
  const r = run(p, units, 100, steps);
  const left = 140;
  assert.equal(r.steps[0].status, "doing");
  assert.equal(r.steps[0].min, steps[0].min);
  assert.equal(todoMin(r.steps), left - CORE_MIN);
  // جارية لم تتجاوز: يُحفظ لها باقي دقائقها
  const s2 = p.steps.map((s) => ({ ...s }));
  s2[0].status = "doing";
  s2[0].startedAt = at(90);
  const r2 = run(p, units, 100, s2);
  assert.ok(todoMin(r2.steps) <= 140 - (s2[0].min - 10));
});

test("عدد الأسئلة من الدقائق", () => {
  assert.equal(countFor("quiz", 4), 5);
  assert.equal(countFor("quiz", 12), 12);
  assert.equal(countFor("quiz", 30), 15);
  assert.equal(countFor("quiz5", 2), 5);
  assert.equal(countFor("exam", 16, 20), 20);
  assert.equal(countFor("exam", 8, 10), 10);
  assert.equal(countFor("exam", 6, 25), 8);
  assert.equal(countFor("exam", 2, 25), 5);
  // مراجعة الأخطاء: ٠٫٧ دقيقة للسؤال بين ٥ و١٥ (المقلَّصة إلى حدها الأدنى لا تُطلب منها ١٥ سؤالًا)
  assert.equal(countFor("mistakes", 4), 6);
  assert.equal(countFor("mistakes", 2), 5);
  assert.equal(countFor("mistakes", 10), 14);
  assert.equal(countFor("mistakes", 15), 15);
  assert.equal(countFor("brief", 12), undefined);
});

// ===== المؤقت والتقدم =====

test("المؤقت والدقائق الباقية", () => {
  const s: PrepStep = { id: "u0:brief", unit: 0, kind: "brief", min: 10, planned: 10, floor: 4, prio: 1, status: "doing", startedAt: at(0) };
  assert.deepEqual(stepClock(s, at(3) + 30_000), { elapsed: 3, left: 7, over: 0 });
  assert.deepEqual(stepClock(s, at(14)), { elapsed: 14, left: 0, over: 4 });
  assert.deepEqual(stepClock({ ...s, startedAt: undefined }, at(50)), { elapsed: 0, left: 10, over: 0 });
  assert.equal(minutesLeft(at(10), at(0) + 30_000), 9);
  assert.equal(minutesLeft(at(0), at(5)), 0);
});

test("الخطوة الحالية وانتهاء الخطة والتقدم", () => {
  const units = mkUnits(3);
  const p = buildPlan({ totalMin: 90, units });
  assert.equal(currentStep(p.steps)!.id, "u0:final");
  const steps = p.steps.map((s) => ({ ...s }));
  steps[0].status = "done";
  steps[1].status = "skipped";
  steps[3].status = "doing";
  assert.equal(currentStep(steps)!.id, steps[3].id);
  const pr = planProgress(steps);
  assert.equal(pr.doneSteps, 2);
  assert.equal(pr.totalSteps, 6);
  assert.equal(pr.unitsDone, 1);
  assert.equal(pr.unitsTotal, 3);
  assert.equal(isPlanFinished(steps), false);
  const fin = steps.map((s) => ({ ...s, status: s.id.endsWith("quiz5") ? ("dropped" as const) : ("done" as const) }));
  assert.equal(isPlanFinished(fin), true);
  assert.equal(currentStep(fin), null);
  assert.equal(planProgress(fin).totalSteps, 3);
  assert.equal(planProgress(fin).unitsDone, 3);
});

test("تقدم الاختبار: منذ فتح الخطوة، وفي وحدتها أو وحداتها", () => {
  const states = [st("أ", 0, true, at(1)), st("ب", 0, false, at(5)), st("ج", 1, true, at(6)), st("د", 2, true, at(7)), st("هـ", 0, true, at(-30)), st("و", null, true, at(8))];
  assert.deepEqual(quizProgress(states, { unit: 0, units: [], since: at(0) }), { answered: 2, correct: 1 });
  assert.deepEqual(quizProgress(states, { unit: null, units: [0, 1], since: at(0) }), { answered: 3, correct: 2 });
  assert.deepEqual(quizProgress(states, { unit: null, units: [0, 1, 2], since: at(6) }), { answered: 2, correct: 2 });
  const w = wrongFor([st("س", 0, false, at(1)), st("ص", 1, false, at(9)), st("ع", 2, false, at(3)), st("ط", 1, true, at(4))], [0, 1]);
  assert.deepEqual(w.map((s) => s.item.q), ["ص", "س"]);
});

test("كشف الإكمال لكل نوع، وبصمة البطاقات", () => {
  const step = (kind: PrepStep["kind"], extra: Partial<PrepStep> = {}): PrepStep => ({
    id: `u0:${kind}`,
    unit: 0,
    kind,
    min: 5,
    planned: 5,
    floor: 2,
    prio: 2,
    status: "doing",
    ...extra,
  });
  assert.equal(isStepComplete(step("quiz5", { count: 5 }), { answered: 4 }), false);
  assert.equal(isStepComplete(step("quiz5", { count: 5 }), { answered: 5 }), true);
  assert.equal(isStepComplete(step("quiz", { count: 8 }), { answered: 8 }), true);
  assert.equal(isStepComplete(step("exam", { count: 20 }), { answered: 19 }), false);
  assert.equal(isStepComplete(step("mistakes"), { answered: 1 }), true);
  assert.equal(isStepComplete(step("mistakes"), {}), false);
  assert.equal(isStepComplete(step("listen", { snap: 3 }), { heard: 6, heardTotal: 6 }), true);
  assert.equal(isStepComplete(step("listen", { snap: 6 }), { heard: 6, heardTotal: 6 }), false); // مسموع قبل الفتح
  assert.equal(isStepComplete(step("listen"), { heard: 5, heardTotal: 6 }), false);
  assert.equal(isStepComplete(step("listen"), { heard: 0, heardTotal: 0 }), false);
  assert.equal(isStepComplete(step("cards"), { cardsChanged: 5, cardsTotal: 20 }), true);
  assert.equal(isStepComplete(step("cards"), { cardsChanged: 4, cardsTotal: 20 }), false);
  assert.equal(isStepComplete(step("cards"), { cardsChanged: 3, cardsTotal: 3 }), true);
  assert.equal(isStepComplete(step("cards"), { cardsChanged: 0, cardsTotal: 0 }), false);
  for (const k of ["final", "brief", "mindmap"] as const) assert.equal(isStepComplete(step(k), { answered: 99, heard: 9, heardTotal: 9 }), false);

  const before = cardSig([
    { id: "a", box: 0, due: "2026-10-25" },
    { id: "b", box: 1, due: "2026-10-26" },
    { id: "c", box: 2, due: "2026-10-27" },
  ]);
  assert.equal(before.a, "0|2026-10-25|0");
  const after = cardSig([
    { id: "a", box: 1, due: "2026-10-26" },
    { id: "b", box: 1, due: "2026-10-26" },
    { id: "d", box: 0, due: "2026-10-25" },
  ]);
  assert.equal(cardsChanged(before, after), 1); // c حُذفت وd جديدة فلا تُعدّان
});

// ===== اختيار الأسئلة =====

const Q = (q: string) => ({ q, options: ["أ", "ب"], answer: 0 });

test("pickSubset: الخاطئ ثم غير المُجاب ثم الصحيح، بالحجم المطلوب وبلا تكرار", () => {
  const qs = ["١", "٢", "٣", "٤", "٥", "٦", "٢"].map(Q);
  const states = [st("١", 0, true), st("٢", 0, false), st("٣", 0, false), st("٤", 0, true)];
  const r = pickSubset(qs, states, 4, seeded(1));
  assert.equal(r.length, 4);
  assert.deepEqual(new Set(r.slice(0, 2).map((x) => x.q)), new Set(["٢", "٣"]));
  assert.deepEqual(new Set(r.slice(2, 4).map((x) => x.q)), new Set(["٥", "٦"]));
  const all = pickSubset(qs, states, 50, seeded(2));
  assert.equal(all.length, 6);
  assert.equal(new Set(all.map((x) => x.q)).size, 6);
  assert.deepEqual(new Set(all.slice(4).map((x) => x.q)), new Set(["١", "٤"]));
  assert.deepEqual(pickSubset(qs, states, 0), []);
  // ثابت مع البذرة نفسها
  assert.deepEqual(pickSubset(qs, [], 6, seeded(9)), pickSubset(qs, [], 6, seeded(9)));
});

test("pickMix: يغطي كل الوحدات حين يكفي العدد، والأضعف حين لا يكفي، بلا تكرار، وكل سؤال بوحدته", () => {
  const pool = (u: number, k: number) => Array.from({ length: k }, (_, i) => Q(`و${u}-س${i}`));
  const pools = [
    { unit: 0, qs: pool(0, 10), mastery: 0.9 },
    { unit: 1, qs: [...pool(1, 10), Q("مشترك")], mastery: 0.1 },
    { unit: 2, qs: [...pool(2, 2), Q("مشترك")], mastery: 0.3 },
    { unit: 3, qs: [], mastery: 0 },
  ];
  const r = pickMix(pools, 12, [], seeded(3));
  assert.equal(r.length, 12);
  assert.equal(new Set(r.map((x) => x.q)).size, 12);
  assert.deepEqual(new Set(r.map((x) => x.unit)), new Set([0, 1, 2]));
  assert.ok(r.every((x) => x.q.startsWith(`و${x.unit}`) || x.q === "مشترك"));
  // الأضعف يأخذ أكثر، والصغيرة لا تتجاوز حجمها
  const cnt = (u: number) => r.filter((x) => x.unit === u).length;
  assert.ok(cnt(1) > cnt(0));
  assert.ok(cnt(2) <= 2); // «مشترك» ذهب للوحدة ١ الأضعف
  // التناوب بدءًا من الأضعف
  assert.deepEqual(r.slice(0, 3).map((x) => x.unit), [1, 2, 0]);
  // عدد أقل من الوحدات: سؤال من كلٍّ من الأضعف
  const two = pickMix(pools, 2, [], seeded(4));
  assert.deepEqual(two.map((x) => x.unit), [1, 2]);
  // أكثر من المتاح: الكل
  assert.equal(pickMix(pools, 100, [], seeded(5)).length, 10 + 11 + 2);
  assert.deepEqual(pickMix([{ unit: 0, qs: [], mastery: 0 }], 5, []), []);
});

// ===== الإتقان الحي والتقرير =====

test("الإتقان الحي من آخر الإجابات", () => {
  const units = [U(0, 10, 0), U(1, 10, 0.8), U(2, 10, 0.3)];
  const states = ["أ", "ب", "ج", "د", "هـ"].map((q) => st(q, 0, true));
  const r = withLiveMastery(units, states, 3);
  assert.equal(r[0].mastery, 1);
  assert.equal(r[1].mastery, 0);
  assert.equal(units[0].mastery, 0); // لا يعدّل الأصل
});

test("التقرير: الأقوى والأضعف وغير المختبرة، وما مُرّ عليه، ولو بقيت دقائق", () => {
  const units = [U(0), U(1), U(2), U(3)];
  const p = buildPlan({ totalMin: 240, units });
  const steps = p.steps.map((s) => ({ ...s, status: s.unit === 0 || s.unit === 1 || s.unit === 2 ? ("done" as const) : s.status }));
  const states: QuestionState[] = [
    ...["١", "٢", "٣", "٤", "٥"].map((q) => st(`أ${q}`, 0, true, at(10))),
    st("ب١", 1, true, at(20)),
    st("ب٢", 1, false, at(21)),
    st("ب٣", 1, false, at(22)),
    st("ب٤", 1, true, at(-500)),
    st("ج١", 2, true, at(30)),
    st("ج٢", 2, true, at(31)),
  ];
  const r = prepReport({ units, steps, states, levels: p.levels, since: at(0), now: at(200), deadlineAt: at(240), unitCount: 4 });
  assert.equal(r.total, 4);
  assert.equal(r.covered, 3);
  assert.deepEqual(r.missed, [3]);
  assert.equal(r.spentMin, 200);
  assert.equal(r.leftMin, 40);
  const u1 = r.perUnit.find((x) => x.unit === 1)!;
  assert.deepEqual([u1.answered, u1.correct], [3, 1]);
  assert.equal(r.perUnit.find((x) => x.unit === 3)!.untested, true);
  assert.deepEqual(r.strong, [0]); // الوحدة ٢ إتقانها أقل من الحد (سؤالان فقط)
  assert.deepEqual(r.weak, [3, 1]); // غير المختبرة أولًا
  assert.deepEqual(
    r.focus.map((f) => [f.unit, f.kind, f.min]),
    [
      [3, "brief", 24],
      [1, "mistakes", 16],
    ]
  );
  // أقل من ٥ دقائق: لا تركيز
  assert.deepEqual(prepReport({ units, steps, states, levels: p.levels, since: at(0), now: at(236), deadlineAt: at(240), unitCount: 4 }).focus, []);
  // في القليل: نوع التركيز «المراجعة الأخيرة»، وكل الدقائق لوحدة واحدة
  const one = [U(0)];
  const q = buildPlan({ totalMin: 30, units: one });
  assert.equal(q.tier, "short");
  const rr = prepReport({ units: one, steps: q.steps, states: [], levels: q.levels, since: at(0), now: at(20), deadlineAt: at(30), unitCount: 1 });
  assert.deepEqual(rr.focus, [{ unit: 0, kind: "final", min: 10 }]);
  assert.deepEqual(rr.missed, [0]);
  assert.equal(rr.covered, 0);
});

// ===== إصلاحات المراجعة =====

test("دقيقة إضافية لا تُنقص الخطة: عدد الوحدات بالمختصر لا ينقص مع زيادة الوقت عبر حد الساعتين", () => {
  for (const n of [1, 2, 3, 4, 5, 8]) {
    const units = mkUnits(n);
    let prev = -1;
    for (let T = minTotal(n); T <= 200; T++) {
      const c = Object.values(buildPlan({ totalMin: T, units }).levels).filter((l) => l === "brief").length;
      assert.ok(c >= prev, `n=${n} T=${T}: ${c} < ${prev}`);
      prev = c;
    }
  }
  // وحدة واحدة: المختصر في ساعة يبقى بعد الساعتين (كان ينزل للمراجعة الأخيرة من ١٢١ إلى ١٤٩)
  const one = [U(0, 30, 0.2)];
  for (const T of [60, 120, 121, 135, 149]) {
    const p = buildPlan({ totalMin: T, units: one });
    assert.equal(p.levels[0], "brief", `T=${T}`);
    assert.deepEqual(p.steps.map((s) => s.kind), ["brief", "cards", "quiz"], `T=${T}`);
  }
  // ثلاث وحدات: ثلاث ترقيات عند ١٢٠ وعند ١٢١ (كانت صفرًا عند ١٢١)
  const three = mkUnits(3);
  const ups = (T: number) => Object.values(buildPlan({ totalMin: T, units: three }).levels).filter((l) => l === "brief").length;
  assert.equal(ups(120), 3);
  assert.equal(ups(121), 3);
});

test("مراجعة الأخطاء المقلَّصة: عدد أسئلتها يتبع دقائقها", () => {
  const units = [U(0, 10, 0.1), U(1, 10, 0.4), U(2, 10, 0.7), U(3, 10, 0.9)];
  const p = buildPlan({ totalMin: 480, units });
  assert.equal(p.steps.find((s) => s.id === "end:mistakes")!.count, 15);
  // ٦٠ دقيقة باقية: الأولوية ٣ كلها على حدها الأدنى، فالأخطاء ٤ دقائق بستة أسئلة
  const r = replan({ steps: p.steps, units, now: at(420), deadlineAt: at(480) });
  const m = r.steps.find((s) => s.id === "end:mistakes")!;
  assert.equal(m.status, "todo");
  assert.equal(m.min, STEP_SPEC.mistakes.floor);
  assert.equal(m.count, 6);
  assert.equal(replan({ steps: r.steps, units, now: at(420), deadlineAt: at(480) }).changed, false);
});

test("هدف الأسئلة لا يزيد على المتاح فعلًا، وعدد الأسئلة بلا تكرار", () => {
  const step = (kind: PrepStep["kind"], count: number): PrepStep => ({ id: `u0:${kind}`, unit: 0, kind, min: 10, planned: 10, floor: 4, prio: 2, count, status: "doing" });
  // ١٣ مطلوبة وعُرض ١١ بعد التحقق: الإجابة عن الأحد عشر تكمل الخطوة
  assert.equal(isStepComplete(step("quiz", 13), { answered: 11, cap: 11 }), true);
  assert.equal(isStepComplete(step("quiz", 13), { answered: 10, cap: 11 }), false);
  assert.equal(isStepComplete(step("quiz", 13), { answered: 11 }), false); // بلا اختبار محفوظ: الهدف العدد كاملًا
  assert.equal(isStepComplete(step("quiz", 8), { answered: 8, cap: 25 }), true);
  assert.equal(isStepComplete(step("quiz", 8), { answered: 7, cap: 25 }), false);
  assert.equal(isStepComplete(step("exam", 20), { answered: 15, cap: 15 }), true);
  assert.equal(isStepComplete(step("quiz5", 5), { answered: 0, cap: 0 }), false); // سقف صفر لا يجعلها منجزة بلا إجابة
  assert.equal(countDistinct([Q("أ"), Q("ب"), Q("أ")], [Q("ب"), Q("ج")], []), 3);
  assert.equal(countDistinct(), 0);
});

test("الاستماع: يُكمَل بانتهاء الاستماع بعد الفتح حتى لمختصر سُمع كاملًا من قبل، ولا يُكمَل بلقطة تعذّرت", () => {
  const listen = (extra: Partial<PrepStep>): PrepStep => ({ id: "u0:listen", unit: 0, kind: "listen", min: 12, planned: 12, floor: 5, prio: 3, status: "doing", startedAt: at(0), ...extra });
  // سُمع كاملًا قبل الخطة (اللقطة = كل المقاطع): المقاطع لا تزيد بإعادة السماع، ووقت الانتهاء بعد الفتح يكمل الخطوة
  assert.equal(isStepComplete(listen({ snap: 6 }), { heard: 6, heardTotal: 6 }), false);
  assert.equal(isStepComplete(listen({ snap: 6 }), { heard: 6, heardTotal: 6, listenDoneAt: at(9) }), true);
  assert.equal(isStepComplete(listen({ snap: 6 }), { heard: 6, heardTotal: 6, listenDoneAt: at(-30) }), false); // انتهى قبل الفتح
  // انتهاء مهلة اللقطة: لا إكمال كاذب بعدّ المقاطع عند أول رجوع، والانتهاء بعد الفتح يكمل
  const lost = listen({ snap: Number.MAX_SAFE_INTEGER });
  assert.equal(isStepComplete(lost, { heard: 6, heardTotal: 6 }), false);
  assert.equal(isStepComplete(lost, { heard: 6, heardTotal: 6, listenDoneAt: at(12) }), true);
  // بلا وقت فتح لا يُقارن الانتهاء
  assert.equal(isStepComplete(listen({ startedAt: undefined }), { heard: 0, heardTotal: 6, listenDoneAt: at(5) }), false);
});

test("البطاقات: «مرة أخرى» على بطاقة جديدة مستحقة اليوم تُحسب مراجعة", () => {
  const day = "2026-10-26";
  const before = cardSig([
    { id: "a", box: 0, due: day },
    { id: "b", box: 0, due: day },
    { id: "c", box: 0, due: day, reviewedAt: at(-60) }, // قُيّمت «مرة أخرى» صباحًا
  ]);
  // الصندوق والموعد لم يتغيرا، ووقت المراجعة تغيّر
  const after = cardSig([
    { id: "a", box: 0, due: day, reviewedAt: at(3) },
    { id: "b", box: 0, due: day },
    { id: "c", box: 0, due: day, reviewedAt: at(4) },
  ]);
  assert.equal(cardsChanged(before, after), 2);
  assert.equal(before.b, `0|${day}|0`);
});

test("انتهاء الخطة تلقائيًا: عند الموعد نفسه، أو حين تحذف إعادة التوزيع آخر الخطوات الباقية", () => {
  // ٣ وحدات في ٩٠ دقيقة، أُنجزت المراجعات الأخيرة وبقيت دقيقة ونصف: كل الأسئلة السريعة تُحذف ولا يبقى شيء
  const units = mkUnits(3);
  const p = buildPlan({ totalMin: 90, units });
  const steps = p.steps.map((s) => (s.prio === 1 ? { ...s, status: "done" as const } : { ...s }));
  const now = at(90) - 90_000;
  const r = replan({ steps, units, now, deadlineAt: at(90) });
  assert.ok(r.steps.filter((s) => s.kind === "quiz5").every((s) => s.status === "dropped"));
  assert.equal(isPlanFinished(r.steps), true);
  assert.equal(autoEndAt({ deadlineAt: at(90), steps: r.steps }, now), now);
  // قبل الحذف: خطوات باقية والوقت لم يحلّ → لا إنهاء
  assert.equal(autoEndAt({ deadlineAt: at(90), steps }, now), null);
  // حلّ الموعد: الإنهاء عند الموعد نفسه لا وقت فتح التطبيق بعده
  assert.equal(autoEndAt({ deadlineAt: at(90), steps }, at(600)), at(90));
  assert.equal(planExpired({ deadlineAt: at(90) }, at(90)), true);
  assert.equal(planExpired({ deadlineAt: at(90) }, at(89)), false);
  // متابعة الباقي بعد الوقت: لا إنهاء بالموعد ولا «منتهية»
  assert.equal(planExpired({ deadlineAt: at(90), overtime: true }, at(600)), false);
  assert.equal(autoEndAt({ deadlineAt: at(90), overtime: true, steps }, at(600)), null);
  // منتهية أصلًا
  assert.equal(autoEndAt({ deadlineAt: at(90), endedAt: at(50), steps: r.steps }, now), null);
});

test("«انتهى الوقت» في التقرير بحسب وقت الإنهاء: لا لخطة أُنهيت يدويًا قبل الموعد ولا بعد متابعة الباقي", () => {
  const p = buildPlan({ totalMin: 90, units: mkUnits(3) });
  const left = p.steps.map((s, i) => (i < 2 ? { ...s, status: "done" as const } : { ...s }));
  // أُنهيت يدويًا في الدقيقة ٣٠ وفُتح التقرير بعد الموعد
  assert.equal(isTimeUp({ deadlineAt: at(90), endedAt: at(30), steps: left }, at(200)), false);
  // انتهت بالوقت وبقيت خطوات
  assert.equal(isTimeUp({ deadlineAt: at(90), endedAt: at(90), steps: left }, at(200)), true);
  // بعد متابعة الباقي ثم إنهاء يدوي
  assert.equal(isTimeUp({ deadlineAt: at(90), endedAt: at(120), overtime: true, steps: left }, at(200)), false);
  // لا خطوات باقية
  const all = p.steps.map((s) => ({ ...s, status: "done" as const }));
  assert.equal(isTimeUp({ deadlineAt: at(90), endedAt: at(90), steps: all }, at(200)), false);
});

test("تجهيز الملخصات: المتعذّرة تعود بعد ٣ دقائق بحد جولات، والحصة تُجرَّب كل ١٠ دقائق", () => {
  const open = () => true;
  const p: PrepareState = { pending: [4], failed: [1, 2, 3], quota: false, failedAt: at(0) };
  assert.deepEqual(unitsToRetry(p, open, at(0) + RETRY_MS - 1), []);
  assert.deepEqual(unitsToRetry(p, open, at(0) + RETRY_MS), [1, 2, 3]);
  // وحدة أُنجزت خطوتها لا تعود، ولا التي بلغت حد الجولات
  assert.deepEqual(unitsToRetry({ ...p, retries: { 3: MAX_RETRY } }, (u) => u !== 1, at(10)), [2]);
  // أثناء انتظار الحصة لا تُعاد (ولا تُستهلك جولاتها بلا محاولة)
  const q: PrepareState = { ...p, quota: true, quotaAt: at(5) };
  assert.equal(quotaWaiting(q, at(5) + QUOTA_RETRY_MS - 1), true);
  assert.deepEqual(unitsToRetry(q, open, at(10)), []);
  assert.equal(quotaWaiting(q, at(5) + QUOTA_RETRY_MS), false);
  assert.deepEqual(unitsToRetry(q, open, at(5) + QUOTA_RETRY_MS), [1, 2, 3]);
  assert.equal(quotaWaiting({ ...p, quota: false }, at(0)), false);
  // الإعادة: بترتيب الخطة، وتبقى في failed (تُقرأ صفحاتها حتى تنجح)، وتُعدّ جولاتها
  const r = requeue({ ...p, retries: { 2: 1 } }, [3, 1, 2], at(20));
  assert.deepEqual(r.pending, [1, 2, 3, 4]);
  assert.deepEqual(r.failed, [1, 2, 3]);
  assert.deepEqual(r.retries, { 1: 1, 2: 2, 3: 1 });
  assert.equal(r.failedAt, at(20));
  assert.deepEqual(unitsToRetry(r, open, at(20) + RETRY_MS), []); // كلها في الطابور
});
