// lib/unitStructure.ts
// فحص بنية وحدات الكتاب قبل اعتمادها في المنهج (مصدرها فهرس القارئ نفسه): لا يُحفظ منهج فيه
// وحدة مكررة، أو ترتيب مختل، أو «وحدة» بصفحة أو صفحتين وسط وحدات كبيرة، أو صفحات غير متصلة.
// كل مصدر (فهرس مدمج/مطبوع، رأس الصفحة المتكرر) يُفحص، ويُعتمد أول مصدر سليم.
import { ordinalOf, parseHeading, tocTitles, unitsFromDividers, unitsFromRunningHeads, unitsFromStartLines } from "./unitHeadings.ts";

export type StructUnit = { title: string; page: number; to: number };
export type StructCheck = { units: StructUnit[]; sound: boolean; problems: string[] };

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();

/** مفتاح الوحدة: «الوحدة + ترتيبها» إن بدأ العنوان بها، وإلا العنوان الموحّد كاملًا */
export function unitKey(title: string): string {
  return parseHeading(title.split(/[:：]/)[0] + ": x")?.key ?? norm(title);
}

/**
 * ينظّف قائمة وحدات ويحكم بسلامتها:
 * - المكرر (نفس المفتاح) يبقى أوله فقط، والترتيب بالصفحات، وصفحات متصلة حتى بداية التالية.
 * - الوحدة القصيرة جدًا (أقل من ٣ صفحات بينما الوسيط ٨ فأكثر) تُدمج في التي قبلها.
 * sound = لم يُحتج لحذف مكرر ولا دمج قصير، والعدد معقول، والبداية في أول الكتاب.
 */
export function checkStructure(raw: { title: string; page: number }[], total: number): StructCheck {
  const problems: string[] = [];
  const seen = new Set<string>();
  const list: { title: string; page: number }[] = [];
  for (const u of [...raw].filter((x) => x.title?.trim() && Number.isFinite(x.page) && x.page >= 1).sort((a, b) => a.page - b.page)) {
    const k = unitKey(u.title);
    if (seen.has(k)) {
      problems.push(`مكرر: ${u.title}`);
      continue;
    }
    seen.add(k);
    if (list.length && u.page <= list[list.length - 1].page) {
      problems.push(`نفس الصفحة: ${u.title}`);
      continue;
    }
    list.push({ title: u.title.replace(/\s+/g, " ").replace(/\s+([:：])/g, "$1").trim(), page: u.page });
  }
  const last = total > 0 ? total : (list[list.length - 1]?.page ?? 0);
  const withTo = (l: { title: string; page: number }[]) =>
    l.map((u, i) => ({ ...u, to: Math.max(u.page, (i + 1 < l.length ? l[i + 1].page : last + 1) - 1) }));

  let units = withTo(list);
  const spans = units.map((u) => u.to - u.page + 1).sort((a, b) => a - b);
  const median = spans.length ? spans[Math.floor(spans.length / 2)] : 0;
  if (median >= 8) {
    const merged: typeof list = [];
    for (const u of units) {
      if (u.to - u.page + 1 < 3 && merged.length) {
        problems.push(`قصيرة: ${u.title} (${u.page}–${u.to})`);
        continue; // تُدمج صفحاتها في السابقة (نهاية السابقة تمتد تلقائيًا)
      }
      merged.push({ title: u.title, page: u.page });
    }
    units = withTo(merged);
  }
  if (units.length < 2) problems.push("أقل من وحدتين");
  if (units.length > 80) problems.push("عدد كبير جدًا");
  if (total > 0 && units.length && units[0].page > Math.max(20, total * 0.2)) problems.push("البداية متأخرة");
  return { units, sound: problems.length === 0, problems };
}

// ===== وكيل الوحدات: يقارن المصادر بفهرس الكتاب ويعتمد المتفق معه =====

export type Candidate = { name: string; units: { title: string; page: number }[] };
export type Verdict = { units: StructUnit[]; source: string; verified: boolean; problems: string[] };
type TocEntry = { key: string; label: string; title: string };

/**
 * يختار بنية الوحدات من عدة مصادر مستقلة (صفحات عناوين الوحدات، فهرس القارئ، رأس الصفحة المتكرر):
 * ١) المطابقة لفهرس الكتاب (نفس الوحدات بنفس الترتيب) والسليمة — «مُتحقَّق منها»،
 * ٢) وإلا المتسلسلة الترتيب (الأولى، الثانية، …) والسليمة، ٣) وإلا أول سليمة، ٤) وإلا أفضل ما بقي.
 * عناوين الوحدات تؤخذ كاملة من الفهرس متى وُجد.
 */
export function pickStructure(cands: Candidate[], toc: TocEntry[], total: number): Verdict {
  const tocKeys = toc.map((t) => t.key);
  const rated = cands
    .filter((c) => c.units.length >= 2)
    .map((c) => {
      const chk = checkStructure(c.units, total);
      const keys = chk.units.map((u) => unitKey(u.title));
      const matchesToc = tocKeys.length >= 3 && keys.length === tocKeys.length && keys.every((k, i) => k === tocKeys[i]);
      const ords = keys.map(ordinalOf);
      const sequential = ords.every((n, i) => n === i + 1);
      return { c, chk, matchesToc, sequential };
    });
  const pick =
    rated.find((r) => r.matchesToc && r.chk.sound) ??
    rated.find((r) => r.matchesToc) ??
    rated.find((r) => r.sequential && r.chk.sound) ??
    rated.find((r) => r.chk.sound) ??
    rated.find((r) => r.chk.units.length >= 2);
  if (!pick) return { units: [], source: "", verified: false, problems: ["لا مصدر"] };
  const named = pick.chk.units.map((u) => {
    const t = toc.find((x) => x.key === unitKey(u.title));
    return t?.title ? { ...u, title: `${t.label}: ${t.title}` } : u;
  });
  return { units: named, source: pick.c.name, verified: pick.matchesToc || (pick.sequential && pick.chk.sound && !tocKeys.length), problems: pick.chk.problems };
}

/** الوكيل على نصوص صفحات الكتاب: الفهرس + صفحات العناوين + رأس الصفحة (+ مصادر إضافية كفهرس القارئ) */
export function structureFromPages(pages: { page: number; text: string }[], total: number, extra: Candidate[] = []): Verdict {
  const toc = tocTitles(pages);
  return pickStructure(
    [
      { name: "dividers", units: unitsFromDividers(pages, total, toc) },
      ...extra,
      // عنوان الوحدة في أول سطور صفحتها — قبل الرأس المتكرر (الذي قد يعدّ المحاضرات وحدات)
      { name: "startlines", units: unitsFromStartLines(pages, total) },
      { name: "running", units: unitsFromRunningHeads(pages, total) },
    ],
    toc,
    total
  );
}

/**
 * الفاحص الآلي للمنهج المحفوظ (قرار نهلة ٢٧ أكتوبر): علامات خلل يراها الطالب — ترقيم غير متسلسل
 * («الأولى، الثالثة، الثانية»)، أو وحدة مكررة، أو وحدة تغطي معظم الكتاب بينما غيرها صغير، أو بداية متأخرة.
 * يُرجع أسباب الشك (فارغة = سليم). يُسجَّل في المراقبة، والإصلاح الذاتي يعيد التقسيم متى وجد تقسيمًا متحقَّقًا منه.
 */
export function suspectSyllabus(units: { title: string }[], ranges: ({ from: number; to: number } | null | undefined)[] | undefined, total: number): string[] {
  const out: string[] = [];
  const keys = units.map((u) => unitKey(u.title));
  if (new Set(keys).size < keys.length) out.push("وحدة مكررة");
  const ords = keys.map(ordinalOf);
  const known = ords.filter((n): n is number => n != null);
  if (known.length >= 2 && known.length === ords.length && !known.every((n, i) => i === 0 || n > known[i - 1])) out.push("ترقيم غير متسلسل");
  const rs = (ranges ?? []).filter((r): r is { from: number; to: number } => !!r && r.to >= r.from);
  if (total > 0 && rs.length >= 3) {
    const spans = rs.map((r) => r.to - r.from + 1);
    const max = Math.max(...spans);
    const rest = spans.reduce((a, b) => a + b, 0) - max;
    if (max > total * 0.6 && max > rest * 2) out.push("وحدة تغطي معظم الكتاب");
    if (rs[0].from > Math.max(20, total * 0.2)) out.push("البداية متأخرة");
  }
  return out;
}
