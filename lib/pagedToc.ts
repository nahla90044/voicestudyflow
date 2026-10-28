// lib/pagedToc.ts
// الفهرس ذو أرقام الصفحات (بلاغ نهلة ٢٨ أكتوبر: كتاب CMA بـ٤٦٨ صفحة قُسّم وحدتين فقط فخرج ملخّص وفيديو ضخمان):
// كتب الشهادات المهنية الإنجليزية فهرسها «A.1 Financial Statements 3» أو «Study Unit 1: D.1. Classification of Costs ..... 2»،
// والكاشف كان لا يعرف إلا «الوحدة/الفصل/Chapter/Unit» في أول السطر. هنا يُقرأ الفهرس، ويُحسب فرق ترقيم الكتاب عن صفحات
// الملف بمطابقة بدايات الوحدات فعلًا في صفحاتها، والوحدة الأطول من MAX_SPAN تُقسَّم إلى فروعها في الفهرس.

export type TocLine = { code: string | null; level: number; named: boolean; title: string; page: number; own?: number };
export type PagedUnit = { title: string; page: number; to: number };

/** أقصى صفحات للوحدة قبل تقسيمها إلى فروعها (ملخّص وفيديو بحجم معقول) */
export const MAX_SPAN = 35;

const NAMED = /^(?:study\s+unit|chapter|unit|lesson|module)\s+(\d{1,3}|[ivxlc]{1,6})\b\s*[:.\-–—]?\s*(.*)$/i;
const SECTION = /^(?:section|part)\s+([a-z0-9]{1,3})\b\s*[:.\-–—±]?\s*(.*)$/i;
const LETTER = /^([A-Z])((?:\.\d{1,2}){0,3})\.?\s+(\S.*)$/;
const NUMERIC = /^(\d{1,2})((?:\.\d{1,2}){1,3})\.?\s+(\D.*)$/;
const ENTRY = /^(.*?\S)(?:\s*[.…·]{2,}\s*|\s+)(\d{1,4})\s*$/;

const upperShare = (s: string) => {
  const letters = s.replace(/[^A-Za-z]/g, "");
  return letters ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
};

/** سطر فهرس واحد → مدخل (أو null إن لم يكن عنوانًا برقم صفحة) */
export function parseTocLine(raw: string): TocLine | null {
  const line = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  const m = ENTRY.exec(line);
  if (!m) return null;
  const title = m[1].replace(/[.…·\s]+$/, "").trim();
  const page = Number(m[2]);
  if (!page || title.replace(/[^\p{L}]/gu, "").length < 3) return null;
  let r: RegExpExecArray | null;
  if ((r = NAMED.exec(title))) return { code: null, level: 1, named: true, title, page };
  if ((r = SECTION.exec(title))) return { code: r[1].toUpperCase(), level: 0, named: false, title, page };
  if ((r = LETTER.exec(title))) {
    const depth = r[2] ? r[2].split(".").length - 1 : 0;
    // «A EXTERNAL FINANCIAL REPORTING» (رأس قسم بحرف): يُشترط أن يكون بقية السطر بحروف كبيرة، فلا يُعدّ «A Guide…» رمزًا
    if (!depth && upperShare(r[3]) < 0.7) return { code: null, level: 9, named: false, title, page };
    return { code: r[1] + r[2], level: depth + 1, named: false, title, page };
  }
  if ((r = NUMERIC.exec(title))) return { code: r[1] + r[2], level: r[2].split(".").length, named: false, title, page };
  return { code: null, level: 9, named: false, title, page };
}

const flatLines = (t: string) =>
  String(t || "")
    .normalize("NFKC")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** صفحات الفهرس: أول صفحة في أول الكتاب فيها ٥ مدخلات بأرقام صفحات فأكثر، وما يليها متصلًا */
export function tocLines(pages: { page: number; text: string }[]): TocLine[] {
  return tocScan(pages).lines;
}

function tocScan(pages: { page: number; text: string }[]): { lines: TocLine[]; pages: Set<number> } {
  const head = [...pages].sort((a, b) => a.page - b.page).slice(0, 40);
  const parsed = head.map((p) => flatLines(p.text).map(parseTocLine).filter((x): x is TocLine => !!x));
  const isToc = (ls: TocLine[]) => ls.filter((l) => l.level < 9 || l.named).length >= 3 && ls.length >= 5;
  const start = parsed.findIndex(isToc);
  if (start < 0) return { lines: [], pages: new Set() };
  const out: TocLine[] = [];
  const at = new Set<number>();
  for (let i = start; i < parsed.length; i++) {
    if (i > start && parsed[i].length < 2) {
      // صفحة فارغة («تُركت فارغة عمدًا») بين صفحات الفهرس تُتجاوز مرة واحدة
      if (i + 1 < parsed.length && isToc(parsed[i + 1]) && i - start < 12) continue;
      break;
    }
    at.add(head[i].page);
    out.push(...parsed[i]);
  }
  // الأرقام في الفهرس تتزايد؛ ما ينقص بشدة (رقم سطر أو سنة) يُستبعد
  const clean: TocLine[] = [];
  for (const l of out) {
    const prev = clean.length ? clean[clean.length - 1].page : 0;
    if (l.page + 3 < prev) continue;
    clean.push(l);
  }
  return { lines: clean, pages: at };
}

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** هل تبدأ صفحة الملف بهذا المدخل؟ (أول ٦ أسطر: الرمز في أول السطر، أو اسم الوحدة وعنوانها) */
function startsAt(text: string, e: TocLine): boolean {
  const lines = flatLines(text).slice(0, 6).map(key);
  if (e.named) {
    const want = key(e.title).split(" ").slice(0, 6).join(" ");
    return lines.some((l) => l.startsWith(want));
  }
  if (e.code) {
    const c = key(e.code);
    // الرمز وحده في سطره («A.1» ثم العنوان في التالي)، أو الرمز ثم العنوان
    const t = key(e.title.replace(/^\S+\s*/, "")).split(" ").slice(0, 3).join(" ");
    return lines.some((l, i) => l === c || (l.startsWith(c + " ") && (l.slice(c.length + 1).startsWith(t) || (lines[i + 1] ?? "").startsWith(t))));
  }
  return false;
}

/**
 * وحدات الكتاب من فهرس بأرقام صفحات:
 * - المستوى: «Study Unit / Chapter …» إن وُجدت ٣ فأكثر، وإلا الرموز (A.1 / 1.2) بدءًا بأعلى مستوى فيه ٣ مدخلات،
 *   ورأس القسم الذي ليس تحته إلا رموز يُستبدل بفروعه.
 * - فرق الترقيم: الأكثر اتفاقًا بين المدخلات (صفحة الكتاب + الفرق = صفحة في الملف تبدأ بالمدخل فعلًا)،
 *   مع تصحيح محلي ±٣ صفحات لكل وحدة.
 * - verified: نصف الوحدات فأكثر وُجدت بدايتها فعلًا في صفحتها.
 */
export function unitsFromPagedToc(pages: { page: number; text: string }[], total: number): { units: PagedUnit[]; verified: boolean } {
  const none = { units: [] as PagedUnit[], verified: false };
  const scan = tocScan(pages);
  const toc = scan.lines;
  if (toc.length < 3) return none;
  // صفحات الفهرس نفسها لا تُطابَق (سطر «A.1.1 Financial Statements…4» ليس بداية الوحدة)
  const byPage = new Map(pages.filter((p) => !scan.pages.has(p.page)).map((p) => [p.page, String(p.text || "")]));
  const usable = toc.filter((l) => l.named || (l.code && l.level >= 1));
  if (usable.length < 3) return none;

  // فرق الترقيم
  const votes = new Map<number, number>();
  for (const e of usable)
    for (let off = -10; off <= 60; off++) {
      const t = byPage.get(e.page + off);
      if (t && startsAt(t, e)) votes.set(off, (votes.get(off) ?? 0) + 1);
    }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0];
  if (!best || best[1] < 3) return none;
  const off = best[0];

  // المستوى المعتمد، ثم تقسيم الطويل إلى فروعه
  const named = toc.filter((l) => l.named);
  let list: TocLine[];
  if (named.length >= 3) list = named;
  else {
    const coded = toc.filter((l) => l.code && l.level >= 1);
    const levels = [...new Set(coded.map((l) => l.level))].sort((a, b) => a - b);
    const top = levels.find((lv) => coded.filter((l) => l.level === lv).length >= 3) ?? levels[0];
    list = coded.filter((l) => l.level === top);
    for (let round = 0; round < 3; round++) {
      const next: TocLine[] = [];
      list.forEach((u, i) => {
        const end = i + 1 < list.length ? list[i + 1].page : total - off + 1;
        const kids = coded.filter((l) => l.level === u.level + 1 && l.code!.startsWith(u.code! + ".") && l.page >= u.page && l.page < end);
        if (end - u.page > MAX_SPAN && kids.length >= 2) next.push(...kids.map((k, j) => (j === 0 ? { ...k, page: Math.min(k.page, u.page), own: k.own ?? k.page } : k)));
        else next.push(u);
      });
      if (next.length === list.length) break;
      list = next;
    }
  }

  // صفحات الملف (مع تصحيح محلي)
  let found = 0;
  const units: PagedUnit[] = [];
  for (const u of list) {
    // الفرع الأول يرث بداية أمه (غلاف القسم ومقدمته منه)، ويُتحقق منه بصفحته هو
    let p = (u.own ?? u.page) + off;
    let hit = !!byPage.get(p) && startsAt(byPage.get(p)!, u);
    for (let d = 1; !hit && d <= 3; d++)
      for (const q of [p + d, p - d])
        if (!hit && byPage.get(q) && startsAt(byPage.get(q)!, u)) {
          p = q;
          hit = true;
        }
    if (hit) found++;
    if (u.own != null) p = Math.min(p, u.page + off);
    if (p < 1 || (total > 0 && p > total)) continue;
    if (units.length && p <= units[units.length - 1].page) continue;
    units.push({ title: u.title.replace(/\s+/g, " ").trim(), page: p, to: p });
  }
  if (units.length < 3) return none;
  // الوحدة الأولى تبدأ من أول المحتوى (غلاف القسم/المقدمة بعد الفهرس) لا من منتصفه
  units.forEach((u, i) => (u.to = Math.max(u.page, (i + 1 < units.length ? units[i + 1].page : (total || u.page) + 1) - 1)));
  return { units, verified: found >= Math.max(3, Math.ceil(list.length / 2)) };
}
