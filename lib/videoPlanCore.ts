// lib/videoPlanCore.ts
// «ملخّص الفيديو ٢» (٢٦ أكتوبر) — خطة أولًا: منطق خالص مُختبَر في tests/videoPlanCore.test.ts.
// سبب التكرار والرجوع للموضوع كان أن كل جزء يُكتب وحده ولا يعرف ما في غيره، والملخّص نفسه يذكر الفكرة
// موجزة ثم يفصّلها في قسم آخر (م169 في قسمين). الآن: فهرس الوحدة (planInput) → خطة واحدة تجمع الأقسام
// المتشابهة في موضوع واحد (normalizePlan، أو fallbackPlan آليًا) → أجزاء بحدود المواضيع، ولكل جزء
// نصيبه من الخطة (ما شُرح قبله، وما يأتي بعده) فلا يعيد ولا يقفز (planParts).
import { parseJsonLenient } from "./jsonRepair.ts";
import { keyWords, latinDigits, normKey } from "./qualityCore.ts";
import { summaryToSpeech, type StudySummary, type SummaryBlock, type SummarySection } from "./studySummary.ts";
import { coreForVideo, videoParts } from "./videoScriptCore.ts";

export type PlanTopic = { id: string; title: string; sections: number[]; check: boolean; major: boolean; final: boolean; example: string; chars: number };
export type PlanEx = { id: string; title: string; section: number; count: number; chars: number };
export type VideoPlan = {
  v: 2;
  /** بصمة الملخّص: خطة لملخّص تغيّر لا تُستعمل */
  sig: string;
  /** خطة آلية (تعذّر طلب الخطة): بلا افتتاح ولا خلاصة من النموذج */
  auto: boolean;
  title: string;
  topics: PlanTopic[];
  exercises: PlanEx[];
  keypoints: string[];
  cover: { highlight: string; narration: string } | null;
  summary: { bullets: string[]; narration: string } | null;
};
/** موضوع في نصيب الجزء (يُرسل للسيرفر في body.vpart؛ تقرؤه readVpart في supabase/functions/_shared/videoPrompt.ts) */
export type VPartTopic = { id: string; t: string; check?: boolean; final?: boolean; example?: string; cont?: boolean; ex?: number; chars?: number };
export type VPart = {
  v: 1;
  role: "part" | "solo";
  i: number;
  n: number;
  mine: VPartTopic[];
  before: string[];
  after: string[];
  map: string[];
  scenes: number;
  exCount?: number;
  keys?: string[];
};
export type PlannedPart = { text: string; meta: VPart };

const SOFT = 5000; // حجم الجزء المعتاد (قرار ١٩ أكتوبر: حجم الأجزاء كما هو)
const HARD = 6500; // الموضوع لا يُقسم تحت هذا
const MAX_PARTS = 30;

const secSpeech = (sec: SummarySection) => summaryToSpeech({ title: "", intro: "", sections: [sec], keypoints: [] });
const oneLine = (v: unknown) =>
  String(v ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(s.lastIndexOf(" ", n - 1), Math.floor(n * 0.6))).trim() + "…");
const cleanTitle = (v: unknown) => clip(oneLine(v), 80);

const isExBlock = (b: SummaryBlock) => b.type === "exercise" || b.type === "case";
const exCountOf = (blocks: SummaryBlock[]) => blocks.reduce((a, b) => a + (b.type === "exercise" ? 1 : b.type === "case" ? Math.max(1, b.qa.length) : 0), 0);
const EX_HEAD = /تمارين|تمرين|تدريبات|أسئلة|اسئلة|مسائل|دراسة ال?حالة|حالة دراسية|exercises?|case stud|questions/i;

/** أقسام التمارين ودراسات الحالة (مرقّمة من ١ على coreForVideo) ← عدد التمارين في كل منها */
export function exerciseSections(s: StudySummary): Map<number, number> {
  const out = new Map<number, number>();
  coreForVideo(s).sections.forEach((sec, k) => {
    if (!sec.blocks.some(isExBlock)) return;
    if (sec.blocks.every(isExBlock) || EX_HEAD.test(sec.heading)) out.set(k + 1, exCountOf(sec.blocks));
  });
  return out;
}

// أرقام المواد: «المادة (169)»، «للمادة ١٠»، «م١٦٩»، «(م34/أ)» — لا «عام 1435» ولا «رقم 60»
const ART_RE = /(?<![\p{L}\p{M}])(?:(?:[وفبك]|لل)?(?:ال)?ماد\p{M}*[ةه]|م)\s*[(\[]?\s*([0-9٠-٩]{1,4})/gu;
export function articlesOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(ART_RE)) out.add("م" + String(Number(latinDigits(m[1]))));
  return [...out];
}

function firstLine(sec: SummarySection): string {
  for (const b of sec.blocks) {
    const t =
      b.type === "text" || b.type === "important" || b.type === "example" || b.type === "explain"
        ? b.text
        : b.type === "definition"
        ? `${b.term}: ${b.text}`
        : "";
    const x = oneLine(t);
    if (x) return (x.match(/^[^.!؟?؛]+/)?.[0] ?? x).trim();
  }
  return "";
}

/**
 * فهرس الوحدة لطلب الخطة: سطر لكل قسم برقمه وعنوانه وأول جملة منه وتعداداته وجداوله وأرقام المواد فيه،
 * وأقسام التمارين معلَّمة، ثم «أهم النقاط». لا يتجاوز ١٨٠٠٠ حرف (تُقصَّر الجمل ثم تُحذف).
 */
export function planInput(s: StudySummary, unitTitle: string): string {
  const core = coreForVideo(s);
  const ex = exerciseSections(s);
  const build = (level: number) => {
    const lines = [`عنوان الوحدة: ${oneLine(unitTitle || core.title)}`];
    core.sections.forEach((sec, i) => {
      const k = i + 1;
      const head = `[ق${k}] ${clip(oneLine(sec.heading), 100) || "—"}`;
      if (ex.has(k)) {
        lines.push(`${head} (تمارين: ${ex.get(k)})`);
        return;
      }
      const first = level < 2 ? clip(firstLine(sec), level === 0 ? 140 : 70) : "";
      let line = first ? `${head} — ${first}` : head;
      if (level < 3) {
        const lists = sec.blocks.flatMap((b) => (b.type === "list" ? [`${clip(oneLine(b.title || b.items[0] || ""), 60)} (${b.items.length})`] : []));
        if (lists.length) line += ` | تعدادات: ${lists.join("، ")}`;
        const tables = sec.blocks.flatMap((b) => (b.type === "table" ? [clip(oneLine(b.title || b.headers.join("/")), 60)] : []));
        if (tables.length) line += ` | جداول: ${tables.join("، ")}`;
      }
      const arts = articlesOf(secSpeech(sec));
      if (arts.length) line += ` | مواد: ${arts.slice(0, 12).join("، ")}`;
      lines.push(line);
    });
    const kp = core.keypoints.slice(0, 8);
    if (kp.length) lines.push("أهم النقاط:", ...kp.map((x) => `- ${clip(oneLine(x), level < 2 ? 200 : 100)}`));
    return lines.join("\n");
  };
  for (let level = 0; level < 4; level++) {
    const t = build(level);
    if (t.length <= 18000) return t;
  }
  return build(3).slice(0, 18000);
}

/** بصمة الملخّص (عنوانه وعناوين أقسامه وأحجامها): تتغير إن تغيّر الملخّص فلا تُستعمل خطة قديمة */
export function summarySig(s: StudySummary): string {
  const core = coreForVideo(s);
  return textSig([core.title, ...core.sections.map((x) => `${x.heading}#${secSpeech(x).length}`), String(core.keypoints.length)].join("|"));
}

/** تجزئة FNV-1a قصيرة (ست عشرية) */
export function textSig(src: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * بصمة الجزء (نصه ونصيبه من الخطة): الجزء المحفوظ ومهمته على السيرفر لا يُستعملان إلا لنفس الجزء تمامًا.
 * بدونها كان جزء محفوظ لملخّص قديم (أُعيد توليده) أو لوحدة أخرى (حُذفت وحدة فتغيّر الترقيم) يُدمج في فيديو آخر.
 * تبدأ بحرف فلا تُخلط بأرقام الأجزاء في مفاتيح المهام.
 */
export const partStamp = (p: PlannedPart) => "s" + textSig(`${p.text}\u0001${JSON.stringify(p.meta)}`);

type Draft = { title: string; sections: number[]; check: boolean; major: boolean; final: boolean; example: string; key?: string; arts?: string };

/** قواعد الخطة الثابتة: ٤–٦ أسئلة ختامية، ٣–٦ محاور، ولا فجوة طويلة بلا سؤال فهم */
function applyRules(topics: PlanTopic[]): void {
  const bySize = (a: PlanTopic, b: PlanTopic) => b.chars - a.chars;
  // (٦) final
  topics.filter((t) => t.final).slice(6).forEach((t) => (t.final = false));
  if (topics.length >= 4) {
    const need = 4 - topics.filter((t) => t.final).length;
    if (need > 0) [...topics.filter((t) => !t.final && t.major), ...topics.filter((t) => !t.final && !t.major).sort(bySize)].slice(0, need).forEach((t) => (t.final = true));
  } else {
    topics.forEach((t) => t.chars >= 1200 && (t.final = true));
    if (topics.length && !topics.some((t) => t.final)) [...topics].sort(bySize)[0].final = true;
  }
  // (٧) major
  topics.filter((t) => t.major).slice(6).forEach((t) => (t.major = false));
  const needM = Math.min(3, topics.length) - topics.filter((t) => t.major).length;
  if (needM > 0) [...topics.filter((t) => !t.major && t.final), ...topics.filter((t) => !t.major && !t.final).sort(bySize)].slice(0, needM).forEach((t) => (t.major = true));
  // (٨) الفجوة: سؤال فهم كل ٤٥٠٠ حرف من المادة على الأكثر
  let acc = 0;
  for (const t of topics) {
    acc += t.chars;
    if (t.check) acc = 0;
    else if (acc >= 4500) {
      t.check = true;
      acc = 0;
    }
  }
}

function finish(
  s: StudySummary,
  drafts: Draft[],
  exSecs: number[],
  o: { title: string; auto: boolean; cover: VideoPlan["cover"]; summary: VideoPlan["summary"] }
): VideoPlan {
  const core = coreForVideo(s);
  const exMap = exerciseSections(s);
  const len = (k: number) => secSpeech(core.sections[k - 1]).length;
  const topics: PlanTopic[] = drafts
    .filter((d) => d.sections.length)
    .map((d, i) => ({
      id: `T${i + 1}`,
      title: d.title || cleanTitle(core.sections[d.sections[0] - 1].heading) || `${i + 1}`,
      sections: [...d.sections].sort((a, b) => a - b),
      check: d.check,
      major: d.major,
      final: d.final,
      example: d.example,
      chars: d.sections.reduce((a, k) => a + len(k), 0),
    }));
  applyRules(topics);
  const exercises: PlanEx[] = [...new Set(exSecs)]
    .sort((a, b) => a - b)
    .map((k, i) => ({ id: `E${i + 1}`, title: cleanTitle(core.sections[k - 1].heading), section: k, count: exMap.get(k) ?? exCountOf(core.sections[k - 1].blocks), chars: len(k) }));
  return { v: 2, sig: summarySig(s), auto: o.auto, title: cleanTitle(o.title || core.title), topics, exercises, keypoints: core.keypoints.slice(0, 8), cover: o.cover, summary: o.summary };
}

/**
 * يقرأ ردّ طلب الخطة ويصلحه: يحذف الأرقام المجهولة والمكررة، ينقل أقسام التمارين إلى exercises،
 * ويُلحق القسم المُغفل بموضوع القسم الذي قبله. null إن تعذّرت قراءته أو غطّى أقل من ٧٠٪ من الأقسام.
 */
export function normalizePlan(raw: string, s: StudySummary): VideoPlan | null {
  const core = coreForVideo(s);
  const N = core.sections.length;
  if (!N) return null;
  const exMap = exerciseSections(s);
  let o: any = null;
  try {
    const m = String(raw ?? "").match(/\{[\s\S]*\}/);
    o = m ? parseJsonLenient(m[0]) : null;
  } catch {
    o = null;
  }
  if (!o || !Array.isArray(o.topics)) return null;
  const num = (x: unknown) => {
    const k = Number(typeof x === "object" && x ? (x as any).section : x);
    return Number.isInteger(k) && k >= 1 && k <= N ? k : 0;
  };
  const seen = new Set<number>();
  const exSecs: number[] = [];
  const drafts: Draft[] = [];
  for (const t of o.topics) {
    const secs: number[] = [];
    for (const x of Array.isArray(t?.sections) ? t.sections : []) {
      const k = num(x);
      if (!k || seen.has(k)) continue; // مجهول أو مكرر (يبقى في أول موضوع)
      seen.add(k);
      if (exMap.has(k)) exSecs.push(k);
      else secs.push(k);
    }
    drafts.push({ title: cleanTitle(t?.title), sections: secs, check: t?.check === true, major: t?.major === true, final: t?.final === true, example: clip(oneLine(t?.example), 160) });
  }
  const notEx: number[] = []; // ما وضعه النموذج في التمارين وليس فيه تمرين → موضوع
  for (const x of Array.isArray(o.exercises) ? o.exercises : []) {
    const k = num(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (exMap.has(k)) exSecs.push(k);
    else notEx.push(k);
  }
  const content = Array.from({ length: N }, (_, i) => i + 1).filter((k) => !exMap.has(k));
  const covered = content.filter((k) => seen.has(k)).length;
  if (content.length && covered / content.length < 0.7) return null;
  const hostOf = (k: number, dir: -1 | 1) => {
    for (let j = k + dir; j >= 1 && j <= N; j += dir) {
      const h = drafts.findIndex((d) => d.sections.includes(j));
      if (h >= 0) return h;
    }
    return -1;
  };
  for (const k of notEx) {
    const h = hostOf(k, -1);
    drafts.splice(h + 1, 0, { title: cleanTitle(core.sections[k - 1].heading), sections: [k], check: false, major: false, final: false, example: "" });
  }
  for (const k of content) {
    if (drafts.some((d) => d.sections.includes(k))) continue;
    let h = hostOf(k, -1);
    if (h < 0) h = hostOf(k, 1);
    if (h < 0) drafts.push({ title: cleanTitle(core.sections[k - 1].heading), sections: [k], check: false, major: false, final: false, example: "" });
    else drafts[h].sections.push(k);
  }
  for (const k of exMap.keys()) if (!exSecs.includes(k)) exSecs.push(k);
  const text = (v: unknown, n: number) => clip(oneLine(v), n);
  const cover = o.cover && text(o.cover.narration, 900) ? { highlight: text(o.cover.highlight, 200), narration: text(o.cover.narration, 900) } : null;
  const bullets = Array.isArray(o.summary?.bullets) ? o.summary.bullets.map((b: unknown) => text(b, 120)).filter(Boolean).slice(0, 5) : [];
  const summary = o.summary && text(o.summary.narration, 1200) && bullets.length ? { bullets, narration: text(o.summary.narration, 1200) } : null;
  return finish(s, drafts, exSecs, { title: text(o.title, 80), auto: false, cover, summary });
}

/**
 * خطة آلية (تعذّر طلب الخطة): موضوع لكل قسم، والأقسام ذات العنوان نفسه (بعد التطبيع) موضوع واحد،
 * وكذلك الأقسام التي يذكر عنوانها المواد نفسها («حالات التنفيذ المعجّل (م169)» و«شروطه في المادة ١٦٩»):
 * كان قسما م169 يُشرحان في جزأين متباعدين فيتكرر الشرح.
 */
export function fallbackPlan(s: StudySummary): VideoPlan {
  const core = coreForVideo(s);
  const exMap = exerciseSections(s);
  const drafts: Draft[] = [];
  core.sections.forEach((sec, i) => {
    const k = i + 1;
    if (exMap.has(k)) return;
    const key = normKey(sec.heading);
    const arts = articlesOf(sec.heading).sort().join(",");
    const host = drafts.find((d) => (!!key && d.key === key) || (!!arts && d.arts === arts));
    if (host) host.sections.push(k);
    else drafts.push({ title: cleanTitle(sec.heading), sections: [k], check: false, major: false, final: false, example: "", key, arts });
  });
  return finish(s, drafts, [...exMap.keys()], { title: core.title, auto: true, cover: null, summary: null });
}

// ===== دمج المكرر في الملخّص قبل التقسيم =====

/** كلمات الكتلة للمقارنة؛ [] للتمارين ودراسات الحالة والجداول (لا تُحذف أبدًا) */
function blockWords(b: SummaryBlock): string[] {
  switch (b.type) {
    case "text":
    case "important":
    case "example":
      return keyWords(b.text);
    case "explain":
      return keyWords(`${b.title ?? ""} ${b.text}`);
    case "definition":
      return keyWords(`${b.term} ${b.text}`);
    case "list":
      return keyWords(`${b.title ?? ""} ${b.items.join(" ")}`);
    default:
      return [];
  }
}
const DUP_MIN_WORDS = 8;

/**
 * يحذف من الأقسام (بترتيب العرض order) كل كتلة تعيد كتلة سبقتها من نوعها: كل كلماتها (بعد التطبيع:
 * «المادة ١٦٩» = «م169»، بلا تشكيل ولا حروف جر) موجودة في كتلة سابقة واحدة. محافظ عمدًا: كلمة جديدة
 * واحدة («لا»، رقم مادة أو مدة أخرى) تُبقيها، والقصيرة (أقل من ثماني كلمات) والتنبيه المكرر لشرح عادي
 * يبقيان. التمارين ودراسات الحالة والجداول لا تُمس.
 */
export function dedupeSections(core: StudySummary, order: number[]): { secs: Map<number, SummarySection>; dropped: number } {
  const seen: { type: string; words: Set<string> }[] = [];
  const secs = new Map<number, SummarySection>();
  let dropped = 0;
  for (const k of order) {
    const sec = core.sections[k - 1];
    if (!sec || secs.has(k)) continue;
    const blocks = sec.blocks.filter((b) => {
      const ws = [...new Set(blockWords(b))];
      if (!ws.length) return true;
      const dup = ws.length >= DUP_MIN_WORDS && seen.some((x) => x.type === b.type && ws.length <= x.words.size && ws.every((w) => x.words.has(w)));
      if (dup) {
        dropped++;
        return false;
      }
      seen.push({ type: b.type, words: new Set(ws) });
      return true;
    });
    secs.set(k, blocks.length === sec.blocks.length ? sec : { ...sec, blocks });
  }
  // أقسام لم ترد في الترتيب تبقى كما هي
  core.sections.forEach((sec, i) => secs.has(i + 1) || secs.set(i + 1, sec));
  return { secs, dropped };
}

type Item = { id: string; title: string; text: string; first: boolean; last: boolean; isEx: boolean; ex: number; topic?: PlanTopic };

/** مادة أقسام موضوع مقسومة قطعًا (≤ الحد اللين)؛ القسم الأكبر من الحد الصارم يُقسم عند حدود كتله */
function chunks(sections: SummarySection[]): { text: string; ex: number }[] {
  const units: { text: string; ex: number }[] = [];
  for (const sec of sections) {
    const t = secSpeech(sec);
    if (t.length <= HARD) {
      units.push({ text: t, ex: exCountOf(sec.blocks) });
      continue;
    }
    let cur: SummaryBlock[] = [];
    let curLen = 0;
    let cont = false;
    const flush = () => {
      units.push({ text: secSpeech({ ...sec, heading: cont ? `${sec.heading} (تابع)` : sec.heading, blocks: cur }), ex: exCountOf(cur) });
      cur = [];
      curLen = 0;
      cont = true;
    };
    for (const b of sec.blocks) {
      const bl = secSpeech({ ...sec, heading: "", blocks: [b] }).length;
      if (cur.length && curLen + bl > SOFT) flush();
      cur.push(b);
      curLen += bl;
    }
    if (cur.length) flush();
  }
  const out: { text: string; ex: number }[] = [];
  let cur: { text: string; ex: number } | null = null;
  for (const u of units) {
    if (cur && cur.text.length + u.text.length + 2 > SOFT) {
      out.push(cur);
      cur = null;
    }
    cur = cur ? { text: `${cur.text}\n\n${u.text}`, ex: cur.ex + u.ex } : { ...u };
  }
  if (cur) out.push(cur);
  return out;
}

function itemsOf(secs: Map<number, SummarySection>, id: string, title: string, nums: number[], isEx: boolean, topic?: PlanTopic): Item[] {
  // أقسام صارت بلا كتل بعد دمج المكرر لا تُرسل (عنوان بلا مادة يدفع النموذج لاختلاق شرح)
  const sections = nums.map((k) => secs.get(k)).filter((x): x is SummarySection => !!x && x.blocks.length > 0);
  if (!sections.length) return [];
  const whole = sections.map(secSpeech).join("\n\n");
  const parts = whole.length + title.length + 8 <= HARD ? [{ text: whole, ex: sections.reduce((a, sec) => a + exCountOf(sec.blocks), 0) }] : chunks(sections);
  return parts.map((p, j) => ({
    id,
    title,
    text: `【${id}】 ${isEx ? "تمارين: " : ""}${title}${j ? " (تابع)" : ""}\n${p.text}`,
    first: j === 0,
    last: j === parts.length - 1,
    isEx,
    ex: p.ex,
    topic,
  }));
}

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * أجزاء الفيديو من الخطة: المواضيع بترتيبها بحدودها (لا يُقسم موضوع تحت ٦٥٠٠ حرف)، ثم التمارين،
 * وعددها لا يزيد على oldCount (عدد أجزاء التقسيم القديم = ما يُعرض على الطالب قبل البدء).
 * كل جزء: نصه (عنوان الوحدة، والتمهيد في الأول وحده، ثم مادة مواضيعه بعلاماتها 【T3】) ونصيبه من الخطة (meta).
 */
export function planParts(s: StudySummary, plan: VideoPlan, unitTitle: string, oldCount: number): PlannedPart[] {
  const core = coreForVideo(s);
  const N = core.sections.length;
  const ok = (k: number) => Number.isInteger(k) && k >= 1 && k <= N;
  // دمج المكرر قبل التقسيم، بترتيب العرض: ما أعاده الملخّص حرفيًا في قسم لاحق لا يُرسل مرة ثانية
  const order = [...plan.topics.flatMap((t) => t.sections.filter(ok)), ...plan.exercises.map((e) => e.section).filter(ok)];
  const { secs } = dedupeSections(core, order);
  const items: Item[] = [
    ...plan.topics.flatMap((t) => itemsOf(secs, t.id, t.title, t.sections.filter(ok), false, t)),
    ...plan.exercises.filter((e) => ok(e.section)).flatMap((e) => itemsOf(secs, e.id, e.title, [e.section], true)),
  ].filter((it) => it.text.trim());
  if (!items.length) return [];
  let groups: Item[][] = [];
  let cur: Item[] = [];
  let len = 0;
  for (const it of items) {
    if (cur.length && len + it.text.length + 2 > SOFT) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += it.text.length + 2;
  }
  if (cur.length) groups.push(cur);
  // ضمان العدد (لا خصم زيادة): يُدمج أصغر جزأين متجاورين حتى لا يزيد العدد على القديم
  const size = (g: Item[]) => g.reduce((a, it) => a + it.text.length + 2, 0);
  const cap = Math.max(1, Math.min(oldCount || 1, MAX_PARTS));
  while (groups.length > cap) {
    let best = 0;
    for (let i = 1; i + 1 < groups.length; i++) if (size(groups[i]) + size(groups[i + 1]) < size(groups[best]) + size(groups[best + 1])) best = i;
    groups = [...groups.slice(0, best), [...groups[best], ...groups[best + 1]], ...groups.slice(best + 2)];
  }
  const n = groups.length;
  const map = plan.topics.filter((t) => t.major).map((t) => t.title);
  const head = `عنوان الوحدة: ${oneLine(unitTitle || core.title)}`;
  return groups.map((g, gi) => {
    const ids = new Set(g.map((it) => it.id));
    const before = uniq(groups.slice(0, gi).flatMap((pg) => pg.filter((it) => !it.isEx).map((it) => (ids.has(it.id) ? `${it.title} (أوله)` : it.title))));
    const after = uniq(groups.slice(gi + 1).flatMap((ng) => ng.filter((it) => !it.isEx).map((it) => (ids.has(it.id) ? `${it.title} (بقيته)` : it.title))));
    const mine = g.map((it) => {
      const m: VPartTopic = { id: it.id, t: it.title, chars: it.text.length };
      if (it.isEx) m.ex = it.ex;
      else {
        if (it.last && it.topic?.check) m.check = true;
        if (it.last && it.topic?.final) m.final = true;
        if (it.first && it.topic?.example) m.example = it.topic.example;
        if (!it.first) m.cont = true;
      }
      return m;
    });
    const expl = g.filter((it) => !it.isEx).reduce((a, it) => a + it.text.length, 0);
    const scenes = Math.min(40, Math.max(1, Math.round(expl / 600) + mine.filter((m) => m.check).length));
    const intro = gi === 0 && core.intro ? `\nتمهيد: ${core.intro}` : "";
    return {
      text: `${head}${intro}\n\n${g.map((it) => it.text).join("\n\n")}`,
      meta: { v: 1, role: "part", i: gi, n, mine: mine.slice(0, 30), before: before.slice(-80), after: after.slice(0, 80), map: map.slice(0, 80), scenes },
    };
  });
}

/** وحدة قصيرة (جزء واحد): الفيديو كله بطلب واحد كاليوم، بلا خطة ولا «أهم النقاط» داخل المادة */
export function soloPart(s: StudySummary, unitTitle: string): PlannedPart {
  const core = coreForVideo(s);
  const ex = exerciseSections(s);
  const { secs } = dedupeSections(core, core.sections.map((_, i) => i + 1));
  const kept = core.sections.map((_, i) => ({ k: i + 1, sec: secs.get(i + 1)! })).filter((x) => x.sec.blocks.length);
  const body = kept.map((x) => secSpeech(x.sec)).join("\n\n");
  const expl = kept.filter((x) => !ex.has(x.k)).reduce((a, x) => a + secSpeech(x.sec).length, 0);
  const exCount = [...ex.values()].reduce((a, b) => a + b, 0);
  const scenes = Math.min(40, Math.max(1, Math.round(expl / 600) + Math.max(1, Math.round(expl / 4500))));
  return {
    text: `عنوان الوحدة: ${oneLine(unitTitle || core.title)}\n${core.intro ? `تمهيد: ${core.intro}\n` : ""}\n${body}`,
    meta: { v: 1, role: "solo", i: 0, n: 1, mine: [], before: [], after: [], map: [], scenes, exCount: Math.min(100, exCount), keys: core.keypoints.slice(0, 8).map((k) => clip(oneLine(k), 120)) },
  };
}

/**
 * مفتاح مهمة فيديو محفوظ على الجهاز ← الكتاب ورقم الفيديو (cacheIds.id)، أو null إن لم يكن مفتاح فيديو.
 * المسار القديم: vid:<كتاب>:<رقم الجزء = الرقم×١٠٠٠٠+…>[:qa]
 * ملخّص الفيديو ٢: vid2:<كتاب>:<رقم الجزء = الرقم×١٠٢٤+…>:<بصمة s…>[:qa]، والخطة vid2:<كتاب>:<الرقم>:plan[:<بصمة الملخّص>]
 */
export function videoJobKeyOf(key: string): { pdfPath: string; id: number } | null {
  const m1 = key.match(/^vsf:aijob:vid:(.*):(\d+)(:qa)?$/);
  if (m1) return { pdfPath: m1[1], id: Math.floor(Number(m1[2]) / 1e4) };
  const m3 = key.match(/^vsf:aijob:vid2:(.*):(\d+):plan(?::[0-9a-f]+)?$/);
  if (m3) return { pdfPath: m3[1], id: Number(m3[2]) };
  const m2 = key.match(/^vsf:aijob:vid2:(.*):(\d+)(?::s[0-9a-f]+)?(:qa)?$/);
  if (m2) return { pdfPath: m2[1], id: Math.floor(Number(m2[2]) / 1024) };
  return null;
}

/** عدد أجزاء التقسيم القديم: الحد الأعلى لطلبات الفيديو (يُعرض قبل البدء) */
export const oldPartCount = (s: StudySummary, unitTitle: string) => videoParts(s, unitTitle).length;
