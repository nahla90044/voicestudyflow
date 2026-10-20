// lib/unitStructure.ts
// فحص بنية وحدات الكتاب قبل اعتمادها في المنهج (مصدرها فهرس القارئ نفسه): لا يُحفظ منهج فيه
// وحدة مكررة، أو ترتيب مختل، أو «وحدة» بصفحة أو صفحتين وسط وحدات كبيرة، أو صفحات غير متصلة.
// كل مصدر (فهرس مدمج/مطبوع، رأس الصفحة المتكرر) يُفحص، ويُعتمد أول مصدر سليم.
import { parseHeading } from "./unitHeadings.ts";

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
