// lib/mockExamCore.ts
// «الاختبار التجريبي» لكتب الشهادات المهنية (قرار نهلة ٢٧ أكتوبر): عدد أسئلة ووقت كالاختبار الحقيقي،
// والأسئلة موزّعة على الوحدات بنسبة حجم كل وحدة في الكتاب، ثم تقرير لكل وحدة. منطق خالص مُختبَر.

/** وزن كل وحدة = عدد صفحاتها (الوحدة بلا صفحات معروفة تأخذ متوسط الباقي) */
export function unitWeights(ranges: ({ from: number; to: number } | null | undefined)[], count: number): number[] {
  const sizes = Array.from({ length: count }, (_, i) => {
    const r = ranges[i];
    return r && r.to >= r.from ? r.to - r.from + 1 : 0;
  });
  const known = sizes.filter((x) => x > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const filled = sizes.map((x) => (x > 0 ? x : avg));
  const sum = filled.reduce((a, b) => a + b, 0) || 1;
  return filled.map((x) => x / sum);
}

/** توزيع n سؤالًا على الوحدات بنسبة الأوزان (أكبر الباقي)، وسؤال واحد على الأقل لكل وحدة متى كفى العدد */
export function allocate(n: number, weights: number[]): number[] {
  const k = Math.max(0, Math.floor(n));
  const m = weights.length;
  if (!m || !k) return weights.map(() => 0);
  const base = k >= m ? 1 : 0;
  const rest = k - base * m;
  const raw = weights.map((w) => w * rest);
  const out = raw.map((r) => base + Math.floor(r));
  let left = k - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let j = 0; left > 0; j = (j + 1) % m, left--) out[order[j].i]++;
  return out;
}

/** أسئلة الاختبار: من كل وحدة عدد نصيبها (أو ما توفّر)، مخلوطة؛ النقص في وحدة يُكمَّل من الوحدات الأخرى */
export function pickMock<T extends { q: string }>(pools: { unit: number; qs: T[] }[], alloc: number[], rnd: () => number = Math.random): (T & { unit: number })[] {
  const shuffle = <X,>(a: X[]) => a.map((x) => ({ x, r: rnd() })).sort((p, q) => p.r - q.r).map((p) => p.x);
  const seen = new Set<string>();
  const left = pools.map((p) => shuffle(p.qs.filter((q) => !seen.has(q.q) && !!seen.add(q.q))));
  const out: (T & { unit: number })[] = [];
  let short = 0;
  pools.forEach((p, i) => {
    const take = Math.min(alloc[i] ?? 0, left[i].length);
    out.push(...left[i].splice(0, take).map((q) => ({ ...q, unit: p.unit })));
    short += (alloc[i] ?? 0) - take;
  });
  // النقص يُكمَّل من الوحدات التي بقي فيها أسئلة (الأكبر وزنًا أولًا)
  const order = alloc.map((a, i) => ({ i, a })).sort((x, y) => y.a - x.a);
  while (short > 0) {
    const src = order.find((o) => left[o.i].length > 0);
    if (!src) break;
    out.push({ ...left[src.i].shift()!, unit: pools[src.i].unit });
    short--;
  }
  return shuffle(out);
}

/** كم سؤالًا ينقص كل وحدة لتبلغ نصيبها (لتوليد الناقص فقط) */
export const missingPerUnit = (alloc: number[], have: number[]) => alloc.map((a, i) => Math.max(0, a - (have[i] ?? 0)));

/** الوقت التلقائي: دقيقة ونصف للسؤال (قريب من إيقاع اختبارات الاختيار من متعدد المهنية) */
export const autoMinutes = (n: number) => Math.max(5, Math.ceil(n * 1.5));

export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export type UnitScore = { unit: number; right: number; total: number; pct: number };

/** تقرير الاختبار لكل وحدة، والأضعف (أدنى نسبة بين الوحدات التي سُئل عنها) */
export function unitReport(answers: { unit: number | null; correct: boolean }[]): { units: UnitScore[]; weakest: number | null } {
  const m = new Map<number, { right: number; total: number }>();
  for (const a of answers) {
    if (a.unit === null || a.unit < 0) continue;
    const s = m.get(a.unit) ?? { right: 0, total: 0 };
    s.total++;
    if (a.correct) s.right++;
    m.set(a.unit, s);
  }
  const units = [...m.entries()].map(([unit, s]) => ({ unit, ...s, pct: Math.round((s.right / s.total) * 100) })).sort((a, b) => a.unit - b.unit);
  const weak = [...units].sort((a, b) => a.pct - b.pct || b.total - a.total)[0];
  return { units, weakest: weak && weak.pct < 100 ? weak.unit : null };
}
