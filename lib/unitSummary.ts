// lib/unitSummary.ts
// نص مصدر الملخّص الشامل (صفحة، أو وحدة من المنهج، أو نطاق صفحات) وتوليده/تخزينه —
// مشترك بين شاشة الملخّص (unit-summary) و«ملف المذاكرة» (study-file) الذي يجمع الوحدات كلها.
import { aiAssist, aiAssistStream } from "./ai";
import { bookPages, getCachedUnitRanges, getUnitRanges } from "./glossary";
import { extractPdfPageText } from "./pdfText";
import { parsePartialSummary, parseStudySummary, type StudySummary, type SummarySection } from "./studySummary";
import { getSyllabus } from "./syllabus";
import { getUnitContent, setUnitContent } from "./unitContent";
import { unitTextParts } from "./unitScope";

export type SummarySource = { kind: "page"; page: number } | { kind: "unit"; unit: number } | { kind: "range"; from: number; to: number };

/** مفتاح التخزين لكل مصدر (لا يتداخل: الصفحات والنطاقات بأرقام بعيدة عن أرقام الوحدات) */
export function summaryCacheKey(src: SummarySource): { id: number; kind: "studysummary" | "pagestudysummary" } {
  if (src.kind === "page") return { id: src.page, kind: "pagestudysummary" };
  if (src.kind === "unit") return { id: src.unit, kind: "studysummary" };
  return { id: 1_000_000 + src.from * 10_000 + src.to, kind: "studysummary" };
}

export async function getCachedSummary(pdfPath: string, src: SummarySource): Promise<StudySummary | null> {
  const k = summaryCacheKey(src);
  const c = await getUnitContent<StudySummary>(pdfPath, k.id, k.kind).catch(() => null);
  return c?.sections?.length ? c : null;
}

export function cacheSummary(pdfPath: string, src: SummarySource, s: StudySummary): void {
  const k = summaryCacheKey(src);
  setUnitContent(pdfPath, k.id, k.kind, s);
}

/**
 * نص المصدر **كاملًا** مقسّمًا لأجزاء بالترتيب (جزء واحد للصفحة أو الوحدة القصيرة).
 * كل جزء يحمل سياقه («الجزء ٢ من ٤ من وحدة …») فيُلخَّص بشمول ثم تُدمج الأجزاء.
 */
export async function summaryParts(pdfPath: string, src: SummarySource): Promise<string[]> {
  if (src.kind === "page") {
    let ctx = (await unitTextParts(pdfPath, src.page, src.page))[0] ?? "";
    if (!ctx.trim()) ctx = ((await extractPdfPageText(pdfPath, src.page)).text || "").slice(0, 6000);
    return ctx.trim() ? [ctx] : [];
  }
  let title = "";
  let range: { from: number; to: number } | null = null;
  let fallback = "";
  if (src.kind === "range") range = { from: src.from, to: src.to };
  else {
    const r = await getSyllabus(pdfPath);
    const units = r?.data.units ?? [];
    const u = units[src.unit];
    if (!u) return [];
    title = u.title;
    fallback = `وحدة بعنوان «${u.title}». النقاط الرئيسية: ${u.topics.join("، ")}.${u.outcome ? ` الهدف: ${u.outcome}.` : ""}`;
    const pages = await bookPages(pdfPath).catch(() => []);
    const last = pages.reduce((m, p) => Math.max(m, p.page), 0);
    const ranges = (await getCachedUnitRanges(pdfPath)) ?? (last ? await getUnitRanges(pdfPath, units.map((x) => x.title), last, pages) : []);
    const rg = ranges[src.unit];
    if (rg) range = { from: rg.from, to: rg.to };
  }
  const parts = range ? await unitTextParts(pdfPath, range.from, range.to) : [];
  // بلا نص للصفحات بعد → من نقاط المنهج (أفضل من لا شيء)
  if (!parts.length) return fallback ? [fallback] : [];
  const head = title ? `عنوان الوحدة: ${title}\n` : "";
  if (parts.length === 1) return [`${head}\n${parts[0]}`];
  return parts.map(
    (p, i) =>
      `${head}هذا الجزء ${i + 1} من ${parts.length} من الوحدة، ستُدمج ملخّصات الأجزاء بالترتيب في ملخّص واحد. لخّص هذا الجزء بشمول كامل لكل ما فيه.${
        i > 0 ? " لا تكتب تمهيدًا عامًا للوحدة." : ""
      }${i < parts.length - 1 ? " لا تكتب خلاصة ختامية للوحدة." : ""}\n\n${p}`
  );
}

/** دمج ملخّصات الأجزاء بالترتيب: عنوان وتمهيد الأول، كل الأقسام متتالية، وأهم النقاط بلا تكرار */
export function mergeSummaries(list: StudySummary[]): StudySummary | null {
  const ok = list.filter((x) => x?.sections?.length);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0];
  const sections: SummarySection[] = ok.flatMap((x) => x.sections);
  const seen = new Set<string>();
  const keypoints = ok
    .flatMap((x) => x.keypoints)
    .filter((k) => {
      const n = k.replace(/\s+/g, " ").trim();
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .slice(0, 14);
  return { title: ok[0].title, intro: ok[0].intro, sections, keypoints };
}

/** أجزاء تُولَّد في الوقت نفسه: كان كل جزء ينتظر سابقه (~دقيقتان للجزء) فتطول الوحدة دقائق بلا شيء يظهر */
const PARALLEL = 3;

/** جزء واحد ببثّ مباشر (يظهر أولًا بأول ولا ينقطع الطلب الطويل)، وطلب عادي احتياطًا إن تعذّر البثّ */
async function summarizePart(ctx: string, onPartial: (s: StudySummary) => void): Promise<StudySummary | null> {
  let raw = "";
  try {
    raw = await aiAssistStream("studysummary", ctx, (soFar) => {
      raw = soFar;
      const part = parsePartialSummary(soFar);
      if (part && (part.sections.length || part.title)) onPartial(part);
    });
  } catch (e) {
    if ((e as Error).message === "USER_QUOTA") throw e;
    const ok = parseStudySummary(raw);
    if (ok?.sections.length) return ok;
    raw = await aiAssist("studysummary", ctx, undefined, undefined, undefined, 150000);
  }
  return parseStudySummary(raw);
}

/**
 * ملخّص كامل: من المخزن، أو يُولَّد (الأجزاء معًا، كل جزء ببثّ) ويُدمج بالترتيب ويُخزَّن.
 * onPart(المكتمل، الكل، المعروض حتى الآن): المعروض = الأجزاء بالترتيب حتى أول جزء لم يبدأ بعد،
 * فيقرأ الطالب بداية الوحدة خلال ثوانٍ بينما يُكتب الباقي.
 */
export async function getOrMakeSummary(
  pdfPath: string,
  src: SummarySource,
  onPart?: (done: number, total: number, soFar: StudySummary | null) => void
): Promise<StudySummary | null> {
  const cached = await getCachedSummary(pdfPath, src);
  if (cached) return cached;
  const parts = await summaryParts(pdfPath, src);
  if (!parts.length) return null;
  const final: (StudySummary | null | undefined)[] = parts.map(() => undefined);
  const partial: (StudySummary | null)[] = parts.map(() => null);
  let done = 0;
  let lastPaint = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!onPart || (!force && now - lastPaint < 300)) return;
    lastPaint = now;
    const shown: StudySummary[] = [];
    for (let i = 0; i < parts.length; i++) {
      const s = final[i] !== undefined ? final[i] : partial[i];
      if (!s) {
        if (final[i] === undefined) break; // جزء لم يظهر منه شيء بعد → نحافظ على الترتيب
        continue; // جزء فشل → نتخطاه
      }
      shown.push(s);
    }
    onPart(done, parts.length, mergeSummaries(shown));
  };
  let next = 0;
  let quota: Error | null = null;
  const worker = async () => {
    while (next < parts.length && !quota) {
      const i = next++;
      try {
        final[i] = await summarizePart(parts[i], (p) => {
          partial[i] = p;
          report();
        });
      } catch (e) {
        if ((e as Error).message === "USER_QUOTA") quota = e as Error;
        final[i] = null;
      }
      done++;
      report(true);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, parts.length) }, worker));
  if (quota) throw quota;
  const merged = mergeSummaries(final.filter((x): x is StudySummary => !!x));
  if (merged) cacheSummary(pdfPath, src, merged);
  return merged;
}
