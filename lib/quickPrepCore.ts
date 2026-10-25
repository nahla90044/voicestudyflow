// lib/quickPrepCore.ts
// «الاستعداد السريع ⏰» (قرار نهلة ٢٥ أكتوبر) — منطق خالص مُختبَر بلا تخزين ولا شبكة:
// مستوى الخطة من الوقت الباقي وعدد الوحدات، توزيع الدقائق حسب حجم الوحدة وإتقانها، إعادة التوزيع
// عند التأخر أو التقدّم (تُختصر الخطوات الأقل أولوية أو تُحذف، ولا تُحذف وحدة أبدًا)، كشف إكمال
// الخطوة، اختيار أسئلة الاختبار السريع والشامل، وتقرير النهاية بالأقوى والأضعف.
//
// المستويات: ساعتان فأقل «قليل»، و٢–٣ ساعات «انتقال» تُرقّى فيه الوحدات الأضعف تدريجيًا للمختصر،
// و٣–٦ ساعات «متوسط»، وما فوقها «أطول». وينزل المستوى إن قلّ الوقت لكل وحدة، ويصعد «القليل» إن اتسع.
import { computeReadiness, questionId, WEAK_BELOW } from "./readinessCore.ts";
import type { QuestionState } from "./readinessCore.ts";

export type Tier = "short" | "bridge" | "mid" | "long";
export type UnitLevel = "light" | "std" | "full";
export type SumLevel = "final" | "brief";
export type StepKind = "final" | "brief" | "quiz5" | "quiz" | "cards" | "mindmap" | "listen" | "mistakes" | "exam";
export type StepStatus = "todo" | "doing" | "done" | "skipped" | "dropped"; // skipped = بيد الطالب، dropped = لضيق الوقت (قابلة للإعادة)
export type PrepUnit = { unit: number; title: string; pages: number | null; from: number | null; to: number | null; mastery: number; hasCards: boolean };
export type PrepStep = {
  id: string; // `u${unit}:${kind}` أو `end:${kind}`
  unit: number | null; // null للخطوات الختامية (mistakes/exam)
  kind: StepKind;
  min: number; // الدقائق الحالية (عدد صحيح)
  planned: number; // دقائق البناء الأولى (حد الإعادة عند التقدم)
  floor: number;
  prio: 1 | 2 | 3;
  count?: number; // عدد الأسئلة لخطوات الاختبار
  maxCount?: number; // للاختبار الشامل: الحد الأعلى حسب المستوى
  status: StepStatus;
  startedAt?: number;
  doneAt?: number;
  snap?: number; // الاستماع: عدد المقاطع المسموعة قبل الفتح
  cardSnap?: Record<string, string>; // البطاقات: بصمة قبل الفتح
  result?: { answered: number; correct: number };
  auto?: boolean; // أُنجزت أو تُخطّيت تلقائيًا
};
export type PrepPlan = {
  tier: Tier;
  baseTier: Tier;
  adjusted: "up" | "down" | null;
  totalMin: number;
  reserveMin: number;
  tight: boolean;
  levels: Record<number, SumLevel>;
  steps: PrepStep[];
};
export type ReplanResult = { steps: PrepStep[]; changed: boolean; shrunk: number; dropped: number; restored: number; tight: boolean; overdue: boolean };
export type StepSignal = {
  answered?: number;
  cap?: number; // عدد الأسئلة المتاحة فعلًا (المحفوظة بلا تكرار): الهدف لا يزيد على ما عُرض
  heard?: number;
  heardTotal?: number;
  listenDoneAt?: number; // آخر مرة انتهى فيها الاستماع للمختصر حتى آخره
  cardsChanged?: number;
  cardsTotal?: number;
};
export type PrepReport = {
  covered: number;
  total: number;
  spentMin: number;
  leftMin: number;
  perUnit: { unit: number; answered: number; correct: number; score: number; untested: boolean }[];
  strong: number[];
  weak: number[];
  missed: number[];
  focus: { unit: number; kind: "mistakes" | SumLevel; min: number }[];
};

/** دقائق كل خطوة: الأساس (قبل الوزن)، والحد الأدنى، والأولوية (١ أساسية لا تُحذف، ٣ أول ما يُحذف) */
export const STEP_SPEC: Record<StepKind, { base: number; floor: number; prio: 1 | 2 | 3 }> = {
  final: { base: 6, floor: 2, prio: 1 },
  brief: { base: 12, floor: 4, prio: 1 },
  quiz5: { base: 5, floor: 2, prio: 2 },
  quiz: { base: 10, floor: 4, prio: 2 },
  cards: { base: 8, floor: 3, prio: 3 },
  mindmap: { base: 6, floor: 3, prio: 3 },
  listen: { base: 12, floor: 5, prio: 3 },
  mistakes: { base: 10, floor: 4, prio: 3 },
  exam: { base: 16, floor: 6, prio: 2 },
};
/** خطوات الوحدة حسب مستواها (بترتيب التنفيذ) */
export const TEMPLATE: Record<UnitLevel, StepKind[]> = {
  light: ["final", "quiz5"],
  std: ["brief", "cards", "quiz"],
  full: ["brief", "mindmap", "cards", "quiz", "listen"],
};
/** أعلى عدد أسئلة للاختبار الشامل حسب المستوى (٠ = لا اختبار شامل) */
export const EXAM_Q: Record<Tier, number> = { short: 0, bridge: 10, mid: 20, long: 25 };
export const CAP_MULT = 3,
  CORE_MIN = 2,
  AHEAD_MARGIN = 10,
  KEEP_SLACK = 5,
  UP_SHORT_AT = 40,
  BRIDGE_SCALE = 0.6;
export const DOWN_AT = { long: 40, mid: 20 }; // أقل دقائق لكل وحدة (T/n) للبقاء في المستوى

const TIER_RANK: Record<Tier, number> = { short: 0, bridge: 1, mid: 2, long: 3 };
const MIN_MS = 60_000;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(Number.isFinite(x) ? x : 0, 0, 1);
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const knownPages = (p: number | null): p is number => typeof p === "number" && Number.isFinite(p) && p > 0;

/** أقل وقت مقبول لعدد الوحدات (الشاشة ترفض البدء تحته) */
export function minTotal(n: number): number {
  return Math.max(10, 3 * Math.max(0, n));
}

/** المستوى من الوقت وحده */
export function baseTier(T: number): Tier {
  if (T <= 120) return "short";
  if (T < 180) return "bridge";
  if (T <= 360) return "mid";
  return "long";
}

/**
 * المستوى بعد مراعاة الوقت لكل وحدة: ينزل «الأطول» تحت ٤٠ دقيقة للوحدة، و«المتوسط» تحت ٢٠
 * (متتاليًا، فقد ينزل الأطول إلى الانتقال)، ويصعد «القليل» للانتقال من ٤٠ دقيقة للوحدة فأكثر.
 */
export function tierOf(T: number, n: number): { tier: Tier; base: Tier; adjusted: "up" | "down" | null } {
  const base = baseTier(T);
  const p = n > 0 ? T / n : T;
  let tier = base;
  if (tier === "long" && p < DOWN_AT.long) tier = "mid";
  if (tier === "mid" && p < DOWN_AT.mid) tier = "bridge";
  if (tier === "short" && p >= UP_SHORT_AT) tier = "bridge";
  const d = TIER_RANK[tier] - TIER_RANK[base];
  return { tier, base, adjusted: d > 0 ? "up" : d < 0 ? "down" : null };
}

/**
 * وزن كل وحدة (متوسطها ١): الحجم (صفحاتها إلى الوسيط، بين ٠٫٥ و٢) × الحاجة (٠٫٦ للمتقنة إلى ١٫٤ لغير المختبرة).
 * الصفحات المجهولة تأخذ الوسيط.
 */
export function unitWeights(units: PrepUnit[]): number[] {
  if (!units.length) return [];
  const known = units.map((u) => u.pages).filter(knownPages).sort((a, b) => a - b);
  const k = known.length;
  const med = k ? (k % 2 ? known[(k - 1) / 2] : (known[k / 2 - 1] + known[k / 2]) / 2) : 1;
  const raw = units.map((u) => {
    const pages = knownPages(u.pages) ? u.pages : med;
    const size = clamp(pages / med, 0.5, 2);
    const need = 0.6 + 0.8 * (1 - clamp01(u.mastery));
    return size * need;
  });
  const mean = total(raw) / raw.length;
  return raw.map((w) => w / mean);
}

/**
 * يوزّع `total` دقيقة (أعدادًا صحيحة) على الخطوات بنسبة `want` مع احترام الحد الأدنى والسقف لكل خطوة.
 * المجموع = total بالضبط، إلا إن كانت الحدود الدنيا أكبر منه (تُعاد هي) أو السقوف أصغر (تُعاد هي).
 */
export function fillMinutes(total_: number, items: { want: number; floor: number; cap: number }[]): number[] {
  if (!items.length) return [];
  const fl = items.map((it) => Math.round(it.floor));
  const cp = items.map((it, i) => Math.max(fl[i], Math.round(it.cap)));
  const wt = items.map((it) => (Number.isFinite(it.want) && it.want > 0 ? it.want : 0));
  const tot = Math.round(total_);
  if (total(fl) >= tot) return fl;
  if (total(cp) <= tot) return cp;
  const at = (s: number) => wt.map((w, i) => clamp(w * s, fl[i], cp[i]));
  // معامل يبلغ عنده كل ما له وزن سقفه، ثم بحث ثنائي عن المعامل الذي يجعل المجموع = الهدف
  let hi = 1;
  wt.forEach((w, i) => {
    if (w > 0) hi = Math.max(hi, cp[i] / w);
  });
  let lo = 0;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (total(at(mid)) < tot) lo = mid;
    else hi = mid;
  }
  const x = at(hi);
  // تقريب «أكبر باقٍ»: الجزء الصحيح، ثم +١ للأكبر كسرًا (عند التساوي الأسبق ترتيبًا)
  const out = x.map((v, i) => clamp(Math.floor(v), fl[i], cp[i]));
  const frac = x.map((v, i) => v - out[i]);
  const idx = items.map((_, i) => i);
  let diff = tot - total(out);
  while (diff > 0) {
    const order = idx.filter((i) => out[i] < cp[i]).sort((a, b) => frac[b] - frac[a] || a - b);
    if (!order.length) break;
    for (const i of order) {
      if (diff <= 0) break;
      out[i]++;
      frac[i] -= 1;
      diff--;
    }
  }
  while (diff < 0) {
    const order = idx.filter((i) => out[i] > fl[i]).sort((a, b) => frac[a] - frac[b] || a - b);
    if (!order.length) break;
    for (const i of order) {
      if (diff >= 0) break;
      out[i]--;
      frac[i] += 1;
      diff++;
    }
  }
  return out;
}

/** مجموع دقائق الأساس لخطوات مستوى وحدة (بلا بطاقات إن لم تكن لها بطاقات) */
function levelBase(level: UnitLevel, hasCards: boolean): number {
  return total(TEMPLATE[level].filter((k) => hasCards || k !== "cards").map((k) => STEP_SPEC[k].base));
}

/**
 * منطقة الانتقال: أيّ الوحدات تُرقّى من «المراجعة الأخيرة + ٥ أسئلة» إلى «المختصر + بطاقات + أسئلة».
 * الأضعف أولًا (ثم الأكبر)، بحد أقصى kMax، وما دام مجموع الأساس × ٠٫٦ يتسع في `pool`.
 */
export function pickUpgrades(units: PrepUnit[], pool: number, kMax: number): number[] {
  const light = levelBase("light", false);
  const order = [...units].sort(
    (a, b) => clamp01(a.mastery) - clamp01(b.mastery) || (b.pages ?? 0) - (a.pages ?? 0) || a.unit - b.unit
  );
  let sum = light * units.length;
  const out: number[] = [];
  for (const u of order) {
    if (out.length >= kMax) break;
    const extra = levelBase("std", u.hasCards) - light;
    if ((sum + extra) * BRIDGE_SCALE > pool) continue;
    out.push(u.unit);
    sum += extra;
  }
  return out;
}

/**
 * عدد أسئلة خطوة الاختبار من دقائقها (quiz: سؤال للدقيقة، exam: ٠٫٨ دقيقة للسؤال، mistakes: ٠٫٧ دقيقة للسؤال)،
 * فالخطوة المقلَّصة تُطلب منها أسئلة أقل ولا تتجاوز وقتها. عدد الأخطاء يُقيَّد عند الفتح بالمتاح منها.
 */
export function countFor(kind: StepKind, min: number, maxCount?: number): number | undefined {
  if (kind === "quiz5") return 5;
  if (kind === "quiz") return clamp(Math.round(min), 5, 15);
  if (kind === "exam") return clamp(Math.round(min / 0.8), 5, maxCount ?? EXAM_Q.long);
  if (kind === "mistakes") return clamp(Math.round(min / 0.7), 5, 15);
  return undefined;
}

/**
 * ترتيب الحذف لضيق الوقت: خطوات الأولوية ٣ في الوحدات، ثم مراجعة الأخطاء، ثم الاختبار الشامل،
 * ثم خطوات الأولوية ٢ في الوحدات. الأساسية (أولوية ١) لا تُحذف أبدًا.
 * داخل كل مجموعة: الأقوى إتقانًا أولًا، ثم الأبعد موضعًا.
 */
export function dropOrder(cands: PrepStep[], units: PrepUnit[]): PrepStep[] {
  const m = new Map(units.map((u) => [u.unit, clamp01(u.mastery)]));
  const group = (s: PrepStep): number => {
    if (s.prio === 1) return -1;
    if (s.unit === null) return s.kind === "mistakes" ? 1 : 2;
    return s.prio === 3 ? 0 : 3;
  };
  const mOf = (s: PrepStep) => (s.unit === null ? 0 : m.get(s.unit) ?? 0);
  return cands
    .map((s, i) => ({ s, i, g: group(s) }))
    .filter((x) => x.g >= 0)
    .sort((a, b) => a.g - b.g || mOf(b.s) - mOf(a.s) || b.i - a.i)
    .map((x) => x.s);
}

/** يبني الخطة: المستوى، والخطوات بترتيب المنهج، ودقائق كل خطوة، والاحتياط */
export function buildPlan({ totalMin, units }: { totalMin: number; units: PrepUnit[] }): PrepPlan {
  const T = Math.max(0, Math.floor(Number.isFinite(totalMin) ? totalMin : 0));
  const us = [...units].sort((a, b) => a.unit - b.unit);
  const n = us.length;
  const { tier, base, adjusted } = tierOf(T, n);
  let reserve = clamp(Math.round(T * 0.05), 2, 15);

  // الخطوات الختامية (سقف كل منها = دقائقها)
  const ends: { kind: StepKind; min: number; maxCount?: number }[] = [];
  if (tier === "long") ends.push({ kind: "mistakes", min: clamp(Math.round(T * 0.04), 6, 15) });
  if (tier !== "short" && n >= 2) ends.push({ kind: "exam", min: Math.round(EXAM_Q[tier] * 0.8), maxCount: EXAM_Q[tier] });

  // مستوى كل وحدة
  const lvl: Record<number, UnitLevel> = {};
  if (tier === "bridge") {
    const pool = T - reserve - total(ends.map((e) => e.min));
    // عدد المرقّاة يزيد تدريجيًا من ١٢١ إلى ١٨٠ دقيقة، لكن لا يقل عمّا يعطيه الصعود من «القليل» (٤٠ دقيقة
    // فأكثر للوحدة = كل الوحدات مرشّحة)، وإلا أعطت دقيقة إضافية بعد الساعتين خطة أخف مما قبلها
    const kMax = base === "bridge" ? Math.max(Math.round(n * clamp((T - 120) / 60, 0, 1)), n > 0 && T / n >= UP_SHORT_AT ? n : 0) : n;
    const up = new Set(pickUpgrades(us, pool, kMax));
    for (const u of us) lvl[u.unit] = up.has(u.unit) ? "std" : "light";
  } else {
    const l: UnitLevel = tier === "short" ? "light" : tier === "mid" ? "std" : "full";
    for (const u of us) lvl[u.unit] = l;
  }
  const levels: Record<number, SumLevel> = {};
  for (const u of us) levels[u.unit] = lvl[u.unit] === "light" ? "final" : "brief";

  // الخطوات وطلب كل منها من الدقائق
  const w = unitWeights(us);
  const steps: PrepStep[] = [];
  const want: number[] = [];
  const cap: number[] = [];
  us.forEach((u, i) => {
    for (const kind of TEMPLATE[lvl[u.unit]]) {
      if (kind === "cards" && !u.hasCards) continue;
      const sp = STEP_SPEC[kind];
      steps.push({ id: `u${u.unit}:${kind}`, unit: u.unit, kind, min: 0, planned: 0, floor: sp.floor, prio: sp.prio, status: "todo" });
      want.push(sp.base * w[i]);
      cap.push(Math.round(sp.base * CAP_MULT));
    }
  });
  for (const e of ends) {
    const sp = STEP_SPEC[e.kind];
    const st: PrepStep = { id: `end:${e.kind}`, unit: null, kind: e.kind, min: 0, planned: 0, floor: sp.floor, prio: sp.prio, status: "todo" };
    if (e.maxCount !== undefined) st.maxCount = e.maxCount;
    steps.push(st);
    want.push(e.min);
    cap.push(e.min);
  }

  // الضيق: الحدود الدنيا لا تتسع → يُقلَّص الاحتياط تحت هامش التقدم (حتى لا يُعاد المحذوف فور البدء)،
  // ثم تُحذف الخطوات بترتيب الحذف، فإن لم تتسع الأساسيات وحدها: بلا احتياط وبحد أدنى دقيقتين لكلٍّ.
  let budget = T - reserve;
  let tight = false;
  if (total(steps.map((s) => s.floor)) > budget) {
    tight = true;
    reserve = Math.min(reserve, AHEAD_MARGIN - 1);
    budget = T - reserve;
    let need = total(steps.map((s) => s.floor));
    for (const s of dropOrder(steps, us)) {
      if (need <= budget) break;
      s.status = "dropped";
      s.min = s.planned = s.floor;
      need -= s.floor;
    }
    if (need > budget) {
      reserve = 0;
      budget = T;
      for (const s of steps) if (s.prio === 1) s.floor = CORE_MIN;
    }
  }

  const live = steps.map((s, i) => ({ s, i })).filter((x) => x.s.status !== "dropped");
  const mins = fillMinutes(
    budget,
    live.map(({ s, i }) => ({ want: want[i], floor: s.floor, cap: cap[i] }))
  );
  live.forEach(({ s }, k) => {
    s.min = s.planned = mins[k];
  });
  for (const s of steps) {
    const c = countFor(s.kind, s.min, s.maxCount);
    if (c !== undefined) s.count = c;
  }
  const used = total(live.map(({ s }) => s.min));
  return { tier, baseTier: base, adjusted, totalMin: T, reserveMin: Math.max(0, T - used), tight, levels, steps };
}

/** الدقائق الكاملة الباقية حتى الموعد (لا تقل عن صفر) */
export function minutesLeft(deadlineAt: number, now: number): number {
  return Math.max(0, Math.floor((deadlineAt - now) / MIN_MS));
}

/** مؤقت الخطوة بالدقائق الصحيحة: المنقضي منذ فتحها، والباقي، والتجاوز */
export function stepClock(step: PrepStep, now: number): { elapsed: number; left: number; over: number } {
  const elapsed = step.startedAt ? Math.max(0, Math.floor((now - step.startedAt) / MIN_MS)) : 0;
  return { elapsed, left: Math.max(0, step.min - elapsed), over: Math.max(0, elapsed - step.min) };
}

function cloneStep(s: PrepStep): PrepStep {
  const c: PrepStep = { ...s };
  if (s.result) c.result = { ...s.result };
  if (s.cardSnap) c.cardSnap = { ...s.cardSnap };
  return c;
}

/**
 * إعادة توزيع الوقت الباقي على الخطوات التي لم تبدأ (لا تمسّ المنجزة ولا المتخطاة ولا الجارية).
 * متأخر: تقليص الأقل أولوية أولًا حتى الحد الأدنى، ثم الحذف بترتيب الحذف، ثم ضغط الأساسيات حتى دقيقتين.
 * متقدّم ١٠ دقائق فأكثر: إعادة المحذوف (الأهم أولًا) ثم المقلَّص نحو دقائقه الأولى، مع إبقاء ٥ دقائق.
 * النتيجة ثابتة: إعادة الحساب في نفس اللحظة لا تغيّر شيئًا.
 */
export function replan({ steps, units, now, deadlineAt }: { steps: PrepStep[]; units: PrepUnit[]; now: number; deadlineAt: number }): ReplanResult {
  const out = steps.map(cloneStep);
  const left = minutesLeft(deadlineAt, now);
  const cur = out.find((s) => s.status === "doing");
  const curNeed = cur ? Math.max(CORE_MIN, cur.min - stepClock(cur, now).elapsed) : 0;
  const budget = Math.max(0, left - curNeed);
  const todo = () => out.filter((s) => s.status === "todo");
  const needNow = () => total(todo().map((s) => s.min));
  let need = needNow();
  let tight = false;
  let overdue = false;

  if (need > budget) {
    // (١) تقليص بالأولوية: ٣ ثم ٢ ثم ١
    for (const p of [3, 2, 1] as const) {
      if (need <= budget) break;
      const g = todo().filter((s) => s.prio === p);
      const fl = g.map((s) => Math.min(s.floor, s.min));
      const room = total(g.map((s, i) => s.min - fl[i]));
      if (room <= 0) continue;
      const excess = need - budget;
      if (room >= excess) {
        const mins = fillMinutes(
          total(g.map((s) => s.min)) - excess,
          g.map((s, i) => ({ want: s.min, floor: fl[i], cap: s.min }))
        );
        g.forEach((s, i) => (s.min = mins[i]));
      } else {
        g.forEach((s, i) => (s.min = fl[i]));
      }
      need = needNow();
    }
    // (٢) حذف بترتيب الحذف حتى يتسع الوقت
    if (need > budget) {
      for (const s of dropOrder(todo(), units)) {
        if (need <= budget) break;
        s.status = "dropped";
        need -= s.min;
      }
    }
    // (٣) الأساسيات وحدها أكبر من الوقت: تُضغط حتى دقيقتين لكلٍّ
    if (need > budget) {
      const g = todo();
      const mins = fillMinutes(
        budget,
        g.map((s) => ({ want: s.min, floor: Math.min(CORE_MIN, s.min), cap: s.min }))
      );
      g.forEach((s, i) => (s.min = mins[i]));
      need = needNow();
      tight = true;
      overdue = need > budget;
    }
  } else if (budget - need >= AHEAD_MARGIN) {
    let margin = budget - need - KEEP_SLACK;
    // (١) إعادة المحذوف بعكس ترتيب الحذف (الأهم أولًا)
    const dropped = out.filter((s) => s.status === "dropped");
    for (const s of dropOrder(dropped, units).reverse()) {
      if (s.floor > margin) continue;
      s.status = "todo";
      s.min = Math.min(s.planned, margin);
      margin -= s.min;
    }
    // (٢) إعادة المقلَّص نحو دقائقه الأولى
    const g = todo().filter((s) => s.planned > s.min);
    const add = Math.min(margin, total(g.map((s) => s.planned - s.min)));
    if (add > 0) {
      const mins = fillMinutes(
        total(g.map((s) => s.min)) + add,
        g.map((s) => ({ want: s.planned, floor: s.min, cap: s.planned }))
      );
      g.forEach((s, i) => (s.min = mins[i]));
    }
  }

  for (const s of out) {
    if (s.status !== "todo") continue;
    const c = countFor(s.kind, s.min, s.maxCount);
    if (c !== undefined) s.count = c;
  }

  let changed = false;
  let shrunk = 0;
  let droppedN = 0;
  let restored = 0;
  out.forEach((s, i) => {
    const o = steps[i];
    if (s.status !== o.status || s.min !== o.min || s.count !== o.count) changed = true;
    if (s.status === "dropped" && o.status !== "dropped") droppedN++;
    else if (o.status === "dropped" && s.status !== "dropped") restored++;
    else if (s.status === "todo" && s.min < o.min) shrunk++;
  });
  return { steps: out, changed, shrunk, dropped: droppedN, restored, tight, overdue };
}

/** الخطوة الحالية: الجارية، وإلا أول خطوة لم تبدأ */
export function currentStep(steps: PrepStep[]): PrepStep | null {
  return steps.find((s) => s.status === "doing") ?? steps.find((s) => s.status === "todo") ?? null;
}

/** انتهت الخطة: لا خطوة باقية ولا جارية */
export function isPlanFinished(steps: PrepStep[]): boolean {
  return !steps.some((s) => s.status === "todo" || s.status === "doing");
}

/** التقدم: الخطوات المنتهية (منجزة أو متخطاة) من غير المحذوفة، والوحدات التي أُنجزت خطوتها الأساسية */
export function planProgress(steps: PrepStep[]): { doneSteps: number; totalSteps: number; unitsDone: number; unitsTotal: number } {
  const live = steps.filter((s) => s.status !== "dropped");
  const unitIds = new Set(steps.filter((s) => s.unit !== null).map((s) => s.unit as number));
  const unitsDone = steps.filter((s) => s.unit !== null && s.prio === 1 && s.status === "done").length;
  return {
    doneSteps: live.filter((s) => s.status === "done" || s.status === "skipped").length,
    totalSteps: live.length,
    unitsDone,
    unitsTotal: unitIds.size,
  };
}

// ===== الجلسة: الموعد والإنهاء وإعادة تجهيز الملخصات =====

export const RETRY_MS = 3 * MIN_MS; // المتعذّرة تعود لطابور التجهيز بعد ٣ دقائق (تعثّر الشبكة يفشل في ثوانٍ فيُسقط الوحدات تباعًا)
export const MAX_RETRY = 4; // جولات إعادة لكل وحدة (عطل دائم في وحدة لا يُعاد بلا نهاية)
export const QUOTA_RETRY_MS = 10 * MIN_MS; // بعد نفاد الحصة: تجربة كل ١٠ دقائق (رفع الباقة أو تجددها؛ الرفض بالحصة لا يستهلك طلبًا)
export type PrepClock = { deadlineAt: number; overtime?: boolean; endedAt?: number; steps: PrepStep[] };
export type PrepareState = { pending: number[]; failed: number[]; quota: boolean; failedAt?: number; retries?: Record<number, number>; quotaAt?: number };

/** حلّ موعد الخطة ولم تُتابَع بعده: لا تجهيز في الخلفية ولا شارة «جارية»، وتُنهى عند أول مزامنة */
export function planExpired(s: { deadlineAt: number; overtime?: boolean }, now: number): boolean {
  return !s.overtime && now >= s.deadlineAt;
}

/**
 * وقت إنهاء الخطة تلقائيًا الآن (أو null): عند الموعد نفسه إن حلّ (فالوقت المستغرق في التقرير وقت الخطة لا وقت
 * فتح التطبيق بعده)، أو الآن إن لم تبقَ خطوة — إعادة التوزيع قد تحذف آخر الباقي حين يقلّ الوقت عن حده الأدنى.
 */
export function autoEndAt(s: PrepClock, now: number): number | null {
  if (s.endedAt) return null;
  if (planExpired(s, now)) return s.deadlineAt;
  if (isPlanFinished(s.steps)) return now;
  return null;
}

/** «انتهى الوقت» ومتابعة الباقي في التقرير: انتهت بالوقت وبقيت خطوات — لا إن أُنهيت يدويًا قبل الموعد، ولا بعد متابعة الباقي */
export function isTimeUp(s: PrepClock, now: number): boolean {
  return !s.overtime && (s.endedAt ?? now) >= s.deadlineAt && s.steps.some((x) => x.status === "todo" || x.status === "doing");
}

/** الحصة نفدت ولم يحن وقت تجربتها */
export function quotaWaiting(p: PrepareState, now: number): boolean {
  return p.quota && now - (p.quotaAt ?? 0) < QUOTA_RETRY_MS;
}

/**
 * الوحدات المتعذّرة التي تعود لطابور التجهيز الآن: مضت ٣ دقائق على آخر تعذّر، وخطوتها الأساسية لم تُنجز، ولم تبلغ
 * حد الجولات، ولا انتظار للحصة. تبقى في failed (فتُقرأ صفحاتها) حتى ينجح ملخصها.
 */
export function unitsToRetry(p: PrepareState, isOpen: (u: number) => boolean, now: number): number[] {
  if (quotaWaiting(p, now) || now - (p.failedAt ?? 0) < RETRY_MS) return [];
  return p.failed.filter((u) => !p.pending.includes(u) && isOpen(u) && (p.retries?.[u] ?? 0) < MAX_RETRY);
}

/** إعادة وحدات للطابور بترتيب الخطة مع عدّ جولاتها */
export function requeue<P extends PrepareState>(p: P, units: number[], now: number): P {
  const add = units.filter((u) => !p.pending.includes(u));
  const retries = { ...(p.retries ?? {}) };
  for (const u of add) retries[u] = (retries[u] ?? 0) + 1;
  return { ...p, failedAt: now, retries, pending: [...p.pending, ...add].sort((a, b) => a - b) };
}

/** إجابات الاختبار منذ `since`: في وحدة الخطوة إن كانت لها وحدة، وإلا في أي وحدة من `units` */
export function quizProgress(
  states: QuestionState[],
  { unit, units, since }: { unit: number | null; units: number[]; since: number }
): { answered: number; correct: number } {
  const qs = states.filter(
    (s) => s.at >= since && s.unit !== null && (unit !== null ? s.unit === unit : units.includes(s.unit))
  );
  return { answered: qs.length, correct: qs.filter((s) => s.lastCorrect).length };
}

/** الأسئلة التي كانت آخر إجابة عنها خاطئة في هذه الوحدات (الأحدث أولًا) — بلا انتظار موعد المراجعة */
export function wrongFor(states: QuestionState[], units: number[]): QuestionState[] {
  return states
    .filter((s) => !s.lastCorrect && s.unit !== null && units.includes(s.unit))
    .sort((a, b) => b.at - a.at);
}

/**
 * بصمة البطاقات (الصندوق والموعد ووقت آخر مراجعة) لكشف ما رُوجع بعد فتح الخطوة. وقت المراجعة لازم:
 * «مرة أخرى» على بطاقة جديدة يبقيها في الصندوق ٠ ومستحقة اليوم، فلا يتغير الصندوق ولا الموعد.
 */
export function cardSig(cards: { id: string; box: number; due: string; reviewedAt?: number }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cards) out[c.id] = `${c.box}|${c.due}|${c.reviewedAt ?? 0}`;
  return out;
}

/** عدد البطاقات التي تغيّرت بصمتها (من الموجودة قبل الفتح) */
export function cardsChanged(before: Record<string, string>, after: Record<string, string>): number {
  let n = 0;
  for (const id of Object.keys(before)) if (id in after && after[id] !== before[id]) n++;
  return n;
}

/**
 * هل أُكملت الخطوة من إشاراتها؟ الملخص والخريطة يُكملان يدويًا فقط.
 * الأسئلة: الهدف عددها، ولا يزيد على المتاح فعلًا (التحقق من الأسئلة قد يحذف بعضها بعد التوليد).
 * الاستماع: سُمعت كل المقاطع وزادت على ما سُمع قبل الفتح، أو انتهى الاستماع حتى آخره بعد فتح الخطوة
 * (المختصر المسموع كاملًا من قبل لا تزيد مقاطعه بإعادة سماعه).
 */
export function isStepComplete(step: PrepStep, sig: StepSignal): boolean {
  switch (step.kind) {
    case "quiz5":
    case "quiz":
    case "exam":
    case "mistakes": {
      const cap = sig.cap !== undefined && Number.isFinite(sig.cap) && sig.cap >= 0 ? sig.cap : Infinity;
      return (sig.answered ?? 0) >= Math.max(1, Math.min(step.count ?? 1, cap));
    }
    case "listen": {
      const heard = sig.heard ?? 0;
      const all = sig.heardTotal ?? 0;
      if (all > 0 && heard >= all && heard > (step.snap ?? 0)) return true;
      return step.startedAt !== undefined && (sig.listenDoneAt ?? 0) > step.startedAt;
    }
    case "cards": {
      const all = sig.cardsTotal ?? 0;
      return all > 0 && (sig.cardsChanged ?? 0) >= Math.min(5, all);
    }
    default:
      return false;
  }
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** يزيل المكرر بنص السؤال (الأول يبقى) */
function dedupeQs<T extends { q: string }>(qs: T[], seen = new Set<string>()): T[] {
  const out: T[] = [];
  for (const q of qs) {
    const id = questionId(q.q);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(q);
  }
  return out;
}

/** عدد الأسئلة بلا تكرار في قوائم (كما يختار منها pickSubset وpickMix): أقصى ما يمكن أن يُعرض */
export function countDistinct(...lists: { q: string }[][]): number {
  const seen = new Set<string>();
  for (const l of lists) dedupeQs(l, seen);
  return seen.size;
}

/**
 * يختار n سؤالًا من أسئلة محفوظة: ما أُخطئ فيه آخر مرة أولًا، ثم ما لم يُجب، ثم الصحيح (كلٌّ مخلوط).
 * بلا تكرار، وإن زاد n على المتاح يُعاد الكل.
 */
export function pickSubset<T extends { q: string }>(qs: T[], states: QuestionState[], n: number, rnd: () => number = Math.random): T[] {
  const k = Math.floor(n);
  if (!(k > 0)) return [];
  const byId = new Map(states.map((s) => [s.qid, s]));
  const wrong: T[] = [];
  const fresh: T[] = [];
  const right: T[] = [];
  for (const q of dedupeQs(qs)) {
    const st = byId.get(questionId(q.q));
    if (!st) fresh.push(q);
    else if (st.lastCorrect) right.push(q);
    else wrong.push(q);
  }
  return [...shuffle(wrong, rnd), ...shuffle(fresh, rnd), ...shuffle(right, rnd)].slice(0, k);
}

/**
 * الاختبار الشامل: n سؤالًا من حزم الوحدات. سؤال لكل وحدة على الأقل (أو للأضعف إن لم يكفِ n)،
 * والباقي بوزن الضعف (١ − الإتقان + ٠٫٢) بسقف حجم كل حزمة. بلا تكرار بين الحزم، والترتيب بالتناوب
 * بين الوحدات بدءًا من الأضعف، وكل سؤال يحمل رقم وحدته.
 */
export function pickMix<T extends { q: string }>(
  pools: { unit: number; qs: T[]; mastery: number }[],
  n: number,
  states: QuestionState[],
  rnd: () => number = Math.random
): (T & { unit: number })[] {
  const k = Math.floor(n);
  if (!(k > 0)) return [];
  const seen = new Set<string>();
  const ps = [...pools]
    .sort((a, b) => clamp01(a.mastery) - clamp01(b.mastery) || a.unit - b.unit)
    .map((p) => ({ unit: p.unit, mastery: clamp01(p.mastery), qs: dedupeQs(p.qs, seen) }))
    .filter((p) => p.qs.length > 0);
  if (!ps.length) return [];
  const alloc = ps.map(() => 0);
  if (k <= ps.length) {
    for (let i = 0; i < k; i++) alloc[i] = 1;
  } else {
    ps.forEach((_, i) => (alloc[i] = 1));
    let rest = k - ps.length;
    const w = ps.map((p) => 1 - p.mastery + 0.2);
    while (rest > 0) {
      const act = ps.map((_, i) => i).filter((i) => alloc[i] < ps[i].qs.length);
      if (!act.length) break;
      const W = total(act.map((i) => w[i]));
      const raw = act.map((i) => (rest * w[i]) / W);
      let given = 0;
      act.forEach((i, j) => {
        const add = Math.min(ps[i].qs.length - alloc[i], Math.floor(raw[j]));
        alloc[i] += add;
        given += add;
      });
      let left = rest - given;
      const byFrac = act.map((i, j) => ({ i, f: raw[j] - Math.floor(raw[j]) })).sort((a, b) => b.f - a.f || a.i - b.i);
      for (const { i } of byFrac) {
        if (left <= 0) break;
        if (alloc[i] >= ps[i].qs.length) continue;
        alloc[i]++;
        left--;
      }
      rest = left;
    }
  }
  const picked = ps.map((p, i) => pickSubset(p.qs, states, alloc[i], rnd).map((q) => ({ ...q, unit: p.unit })));
  const out: (T & { unit: number })[] = [];
  const longest = Math.max(0, ...picked.map((x) => x.length));
  for (let r = 0; r < longest; r++) for (const x of picked) if (r < x.length) out.push(x[r]);
  return out;
}

/** يحدّث إتقان الوحدات من آخر الإجابات (حتى تعيد إعادة التوزيع ترتيب الحذف حسب أداء الجلسة) */
export function withLiveMastery(units: PrepUnit[], states: QuestionState[], unitCount: number): PrepUnit[] {
  const maxU = Math.max(-1, ...units.map((u) => u.unit));
  const r = computeReadiness({ questions: states, unitCount: Math.max(unitCount, maxU + 1), readFraction: 0 });
  return units.map((u) => {
    const p = r.perUnit.find((x) => x.unit === u.unit);
    return p ? { ...u, mastery: p.mastery } : { ...u };
  });
}

/** تقدير طلبات تجهيز ملخص وحدة من صفحاتها (طلب لكل ١٠ صفحات) حين يتعذّر السؤال عن التكلفة */
export function estimateSummaryRequests(pages: number | null): number {
  return Math.max(1, Math.ceil((pages ?? 10) / 10));
}

/**
 * تقرير النهاية: ما مُرّ عليه، والأقوى والأضعف (درجة الوحدة = ٧٠٪ دقة الجلسة + ٣٠٪ الإتقان إن أُجيب
 * في الجلسة عن ٣ أسئلة فأكثر، وإلا الإتقان)، وأين التركيز لو بقيت ٥ دقائق فأكثر.
 */
export function prepReport({
  units,
  steps,
  states,
  levels,
  since,
  now,
  deadlineAt,
  unitCount,
}: {
  units: PrepUnit[];
  steps: PrepStep[];
  states: QuestionState[];
  levels: Record<number, SumLevel>;
  since: number;
  now: number;
  deadlineAt: number;
  unitCount: number;
}): PrepReport {
  const maxU = Math.max(-1, ...units.map((u) => u.unit));
  const r = computeReadiness({ questions: states, unitCount: Math.max(unitCount, maxU + 1), readFraction: 0 });
  const perUnit = units.map((u) => {
    const sess = states.filter((s) => s.unit === u.unit && s.at >= since);
    const answered = sess.length;
    const correct = sess.filter((s) => s.lastCorrect).length;
    const m = r.perUnit.find((p) => p.unit === u.unit)?.mastery ?? 0;
    const score = answered >= 3 ? 0.7 * (correct / answered) + 0.3 * m : m;
    const untested = !states.some((s) => s.unit === u.unit);
    return { unit: u.unit, answered, correct, score, untested };
  });
  const asc = (a: (typeof perUnit)[number], b: (typeof perUnit)[number]) =>
    Number(b.untested) - Number(a.untested) || a.score - b.score || a.unit - b.unit;
  const strong = perUnit
    .filter((p) => !p.untested && p.score >= WEAK_BELOW)
    .sort((a, b) => b.score - a.score || a.unit - b.unit)
    .slice(0, 2)
    .map((p) => p.unit);
  const weak = perUnit
    .filter((p) => !strong.includes(p.unit))
    .sort(asc)
    .slice(0, 2)
    .map((p) => p.unit);
  const doneCore = new Set(steps.filter((s) => s.unit !== null && s.prio === 1 && s.status === "done").map((s) => s.unit as number));
  const covered = units.filter((u) => doneCore.has(u.unit)).length;
  const missed = units.filter((u) => !doneCore.has(u.unit)).map((u) => u.unit);
  const spentMin = Math.max(0, Math.round((now - since) / MIN_MS));
  const leftMin = minutesLeft(deadlineAt, now);

  const focus: PrepReport["focus"] = [];
  if (leftMin >= 5 && perUnit.length) {
    const pick = (weak.length ? weak : [...perUnit].sort(asc).map((p) => p.unit)).slice(0, 2);
    const a = pick.length === 1 ? leftMin : Math.round(leftMin * 0.6);
    pick.forEach((u, i) => {
      const kind: "mistakes" | SumLevel = wrongFor(states, [u]).length ? "mistakes" : levels[u] ?? "brief";
      focus.push({ unit: u, kind, min: i === 0 ? a : leftMin - a });
    });
  }
  return { covered, total: units.length, spentMin, leftMin, perUnit, strong, weak, missed, focus };
}
