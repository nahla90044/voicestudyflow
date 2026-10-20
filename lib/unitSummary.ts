// lib/unitSummary.ts
// نص مصدر الملخّص الشامل (صفحة، أو وحدة من المنهج، أو نطاق صفحات) وتوليده/تخزينه —
// مشترك بين شاشة الملخّص (unit-summary) و«ملف المذاكرة» (study-file) الذي يجمع الوحدات كلها.
import { qaPart } from "./qualityAgent";
import { checkSummaryPart } from "./qualityCore";
import { jobPart } from "./aiJobs";
import { getSummaryMode } from "./summaryPrefs";
import { runParts, type PartsProgress } from "./partsRunner";
import { bookPages, getCachedUnitRanges, getUnitRanges } from "./glossary";
import { extractPdfPageText } from "./pdfText";
import { parsePartialSummary, parseStudySummary, type StudySummary, type SummarySection } from "./studySummary";
import { getSyllabus } from "./syllabus";
import { getUnitContent, removeUnitContent, removeUnitContentWhere, setUnitContent } from "./unitContent";
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

export async function cacheSummary(pdfPath: string, src: SummarySource, s: StudySummary): Promise<void> {
  const k = summaryCacheKey(src);
  await setUnitContent(pdfPath, k.id, k.kind, s);
}

/**
 * نص المصدر **كاملًا** مقسّمًا لأجزاء بالترتيب (جزء واحد للصفحة أو الوحدة القصيرة).
 * كل جزء يحمل سياقه («الجزء ٢ من ٤ من وحدة …») فيُلخَّص بشمول ثم تُدمج الأجزاء.
 */
/** صفحات الكتاب التي يغطيها الملخّص (لعرضها للطالب: هل غطّى الدرس كله؟) */
export async function summaryRange(pdfPath: string, src: SummarySource): Promise<{ from: number; to: number } | null> {
  if (src.kind === "page") return { from: src.page, to: src.page };
  if (src.kind === "range") return { from: src.from, to: src.to };
  const units = (await getSyllabus(pdfPath).catch(() => null))?.data.units ?? [];
  if (!units[src.unit]) return null;
  const pages = await bookPages(pdfPath).catch(() => []);
  const last = pages.reduce((m, p) => Math.max(m, p.page), 0);
  const ranges = (await getCachedUnitRanges(pdfPath, units.length)) ?? (last ? await getUnitRanges(pdfPath, units.map((x) => x.title), last, pages) : []);
  const rg = ranges[src.unit];
  return rg ? { from: rg.from, to: rg.to } : null;
}

/** إعادة التلخيص: يحذف الملخّص المخزَّن وكل أجزائه ومهامه، فيُكتب من جديد */
export async function clearSummary(pdfPath: string, src: SummarySource): Promise<void> {
  const k = summaryCacheKey(src);
  await removeUnitContent(pdfPath, k.id, k.kind);
  const base = (k.kind === "pagestudysummary" ? 1 : 2) * 1e12 + k.id * 1e4;
  await removeUnitContentWhere(pdfPath, "studysummarypart", (u) => u >= base && u < base + 1e4);
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const jobKeys = (await AsyncStorage.getAllKeys()).filter((x) => {
      const m = x.match(/^vsf:aijob:sum:(.*):(\d+)$/);
      return !!m && m[1] === pdfPath && Number(m[2]) >= base && Number(m[2]) < base + 1e4;
    });
    if (jobKeys.length) await AsyncStorage.multiRemove(jobKeys);
  } catch {}
}

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
    const ranges = (await getCachedUnitRanges(pdfPath, units.length)) ?? (last ? await getUnitRanges(pdfPath, units.map((x) => x.title), last, pages) : []);
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

/** علامات التمارين والأسئلة ودراسة الحالة في نص الوحدة */
const EXERCISE_RE = /(تمارين|تمرين|التدريبات|تدريب|أسئلة|اسئلة|أنشطة|نشاط|مسائل|مسألة|دراسة حالة|حالة دراسية|ناقش|أجب عن|اختر الإجابة|exercises?|review questions|case study|problems?)/i;

export type SummaryProgress = PartsProgress<StudySummary>;

const parsePartialPart = (raw: string) => {
  const p = parsePartialSummary(raw);
  return p && (p.sections.length || p.title) ? p : null;
};
const parseFullPart = (raw: string) => {
  const s = parseStudySummary(raw);
  return s?.sections.length ? s : null;
};

/**
 * ملخّص كامل: من المخزن، أو يُولَّد بمحرك الأجزاء (lib/partsRunner: معًا، ببثّ، حفظ كل جزء فورًا،
 * إكمال تلقائي بعد القفل) ويُدمج بالترتيب ويُخزَّن.
 */
export async function getOrMakeSummary(
  pdfPath: string,
  src: SummarySource,
  onProgress?: (p: SummaryProgress) => void
): Promise<StudySummary | null> {
  const cached = await getCachedSummary(pdfPath, src);
  if (cached) return cached;
  const parts = await summaryParts(pdfPath, src);
  if (!parts.length) return null;
  const n = parts.length;
  const base = summaryCacheKey(src);
  const mode = (await getSummaryMode(pdfPath)) ?? "strict";
  const partId = (i: number) => (base.kind === "pagestudysummary" ? 1 : 2) * 1e12 + base.id * 1e4 + n * 100 + i;
  const results = await runParts<StudySummary, StudySummary>({
    parts,
    speedKey: "vsf:summary:speed",
    defaultSpeed: { chars: 5000, rate: 40 },
    load: (i) => getUnitContent<StudySummary>(pdfPath, partId(i), "studysummarypart").then((x) => (x?.sections?.length ? x : undefined)),
    save: (i, p) => setUnitContent(pdfPath, partId(i), "studysummarypart", p),
    // مهمة سيرفر لكل جزء: تكمل وتُحفظ حتى لو قُفلت الشاشة أو أُغلق التطبيق
    // جزء فيه تمارين/مسائل/دراسة حالة → تفكير موسّع على السيرفر (يحلّ ويتحقق قبل الكتابة)
    // وكيل الجودة: الجزء الفارغ/المقطوع/القصير جدًا قياسًا بنصه يُعاد توليده مرة واحدة مجانًا
    run: (ctx, i, onPartial) =>
      qaPart(`sum:${pdfPath}:${partId(i)}`, "studysummary", ctx, (key, qaRetryOf) =>
        jobPart("studysummary", ctx, key, parsePartialPart, parseFullPart, onPartial, { deep: EXERCISE_RE.test(ctx), mode, qaRetryOf }), checkSummaryPart),
    merge: mergeSummaries,
    onProgress,
    parallel: Math.min(6, n),
  });
  const ok = results.filter((x): x is StudySummary => !!x);
  const merged = mergeSummaries(ok);
  // لا يُخزَّن الملخّص الكامل إلا إذا اكتملت كل الأجزاء (الناقص يُكمَل لاحقًا من أجزائه المحفوظة)
  if (merged && ok.length === n) await cacheSummary(pdfPath, src, merged);
  return merged;
}
