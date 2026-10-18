// lib/unitSummary.ts
// نص مصدر الملخّص الشامل (صفحة، أو وحدة من المنهج، أو نطاق صفحات) وتوليده/تخزينه —
// مشترك بين شاشة الملخّص (unit-summary) و«ملف المذاكرة» (study-file) الذي يجمع الوحدات كلها.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

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

export async function cacheSummary(pdfPath: string, src: SummarySource, s: StudySummary): Promise<void> {
  const k = summaryCacheKey(src);
  await setUnitContent(pdfPath, k.id, k.kind, s);
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
const MAX_TRIES = 3;

// تقدير الوقت من سرعة الكتابة الفعلية المقيسة على هذا الجهاز (تتحدّث بعد كل ملخّص)
const SPEED_KEY = "vsf:summary:speed";
let speed = { chars: 5000, rate: 40 }; // متوسط حروف الجزء، وحروف/ثانية لكل طلب
let speedLoaded = false;
async function loadSpeed() {
  if (speedLoaded) return;
  speedLoaded = true;
  try {
    const v = JSON.parse((await AsyncStorage.getItem(SPEED_KEY)) || "null");
    if (v?.chars > 500 && v?.rate > 5) speed = v;
  } catch {}
}
function learnSpeed(chars: number, secs: number) {
  if (chars < 500 || secs < 3) return;
  speed = { chars: Math.round(speed.chars * 0.6 + chars * 0.4), rate: speed.rate * 0.6 + (chars / secs) * 0.4 };
  AsyncStorage.setItem(SPEED_KEY, JSON.stringify(speed)).catch(() => {});
}

/** ينتظر حتى يعود التطبيق للواجهة (القفل/الخلفية يوقفان الاتصال في iOS) */
function whenActive(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((res) => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        sub.remove();
        res();
      }
    });
  });
}

/** جزء واحد ببثّ مباشر (يظهر أولًا بأول)، وطلب عادي احتياطًا إن تعذّر البثّ والتطبيق في الواجهة */
async function summarizePart(ctx: string, onPartial: (s: StudySummary, chars: number) => void): Promise<StudySummary | null> {
  let raw = "";
  let wentAway = false; // خرج التطبيق من الواجهة أثناء الطلب → الاتصال انقطع غالبًا
  const sub = AppState.addEventListener("change", (st) => {
    if (st !== "active") wentAway = true;
  });
  try {
    raw = await aiAssistStream("studysummary", ctx, (soFar) => {
      raw = soFar;
      const part = parsePartialSummary(soFar);
      if (part && (part.sections.length || part.title)) onPartial(part, soFar.length);
    });
  } catch (e) {
    if ((e as Error).message === "USER_QUOTA") throw e;
    if (wentAway || AppState.currentState !== "active") throw new Error("WENT_AWAY"); // يُعاد ببثّ جديد عند الرجوع
    raw = await aiAssist("studysummary", ctx, undefined, undefined, undefined, 150000);
  } finally {
    sub.remove();
  }
  const s = parseStudySummary(raw);
  if (!s?.sections.length) throw new Error("BAD_PART");
  return s;
}

export type SummaryProgress = { done: number; total: number; soFar: StudySummary | null; etaSec: number | null; waiting: boolean };

/**
 * ملخّص كامل: من المخزن، أو يُولَّد (الأجزاء معًا، كل جزء ببثّ) ويُدمج بالترتيب ويُخزَّن.
 * - كل جزء يُحفظ على الجهاز فور اكتماله: انقطاع الاتصال (قفل الشاشة) لا يضيّع ما اكتمل.
 * - الجزء الذي انقطع يُعاد تلقائيًا عند رجوع التطبيق للواجهة.
 * onProgress.soFar = الأجزاء بالترتيب حتى أول جزء لم يظهر منه شيء بعد.
 */
export async function getOrMakeSummary(
  pdfPath: string,
  src: SummarySource,
  onProgress?: (p: SummaryProgress) => void
): Promise<StudySummary | null> {
  const cached = await getCachedSummary(pdfPath, src);
  if (cached) return cached;
  await loadSpeed();
  const parts = await summaryParts(pdfPath, src);
  if (!parts.length) return null;
  const n = parts.length;
  const base = summaryCacheKey(src);
  const partId = (i: number) => ((base.kind === "pagestudysummary" ? 1 : 2) * 1e12 + base.id * 1e4 + n * 100 + i);
  const final: (StudySummary | null | undefined)[] = await Promise.all(
    parts.map((_, i) => getUnitContent<StudySummary>(pdfPath, partId(i), "studysummarypart").then((x) => (x?.sections?.length ? x : undefined)).catch(() => undefined))
  );
  const partial: (StudySummary | null)[] = parts.map(() => null);
  const chars: number[] = parts.map(() => 0);
  const started: number[] = parts.map(() => 0);
  let done = final.filter(Boolean).length;
  let waiting = false;
  let lastPaint = 0;
  const eta = (): number | null => {
    const left = parts.map((_, i) => i).filter((i) => final[i] === undefined);
    if (!left.length) return 0;
    let work = 0;
    for (const i of left) work += Math.max(speed.chars - chars[i], speed.chars * 0.08) + (started[i] ? 0 : speed.rate * 6); // ~٦ ث لبدء الطلب
    return Math.round(work / (speed.rate * Math.min(PARALLEL, left.length)));
  };
  const report = (force = false) => {
    const now = Date.now();
    if (!onProgress || (!force && now - lastPaint < 300)) return;
    lastPaint = now;
    const shown: StudySummary[] = [];
    for (let i = 0; i < n; i++) {
      const s = final[i] !== undefined ? final[i] : partial[i];
      if (!s) {
        if (final[i] === undefined) break;
        continue;
      }
      shown.push(s);
    }
    onProgress({ done, total: n, soFar: mergeSummaries(shown), etaSec: eta(), waiting });
  };
  report(true);
  const queue = parts.map((_, i) => i).filter((i) => final[i] === undefined);
  let quota: Error | null = null;
  const worker = async () => {
    while (queue.length && !quota) {
      const i = queue.shift()!;
      for (let tries = 0; final[i] === undefined && !quota; ) {
        if (AppState.currentState !== "active") {
          waiting = true;
          report(true);
          await whenActive();
          waiting = false;
        }
        started[i] = Date.now();
        try {
          const s = await summarizePart(parts[i], (p, c) => {
            partial[i] = p;
            chars[i] = c;
            report();
          });
          final[i] = s;
          if (s) await setUnitContent(pdfPath, partId(i), "studysummarypart", s);
          learnSpeed(chars[i], (Date.now() - started[i]) / 1000);
        } catch (e) {
          if ((e as Error).message === "USER_QUOTA") quota = e as Error;
          else if ((e as Error).message !== "WENT_AWAY" && ++tries >= MAX_TRIES) final[i] = null; // فشل حقيقي متكرر
          // انقطع بسبب القفل/الخلفية → لا يُحسب محاولة، يُعاد عند الرجوع
          chars[i] = 0;
        }
      }
      done++;
      report(true);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  if (quota) throw quota;
  const ok = final.filter((x): x is StudySummary => !!x);
  const merged = mergeSummaries(ok);
  // لا يُخزَّن الملخّص الكامل إلا إذا اكتملت كل الأجزاء (الناقص يُكمَل لاحقًا من أجزائه المحفوظة)
  if (merged && ok.length === n) await cacheSummary(pdfPath, src, merged);
  return merged;
}
