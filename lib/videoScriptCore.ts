// lib/videoScriptCore.ts
// منطق «ملخّص الفيديو» الخالص (بلا اعتماد على الجهاز): قراءة المشاهد من ردّ الذكاء
// (كاملًا أو أولًا بأول أثناء البثّ)، والدمج بالترتيب، وتقسيم الملخّص إلى أجزاء. مُختبَر في tests/.
import { parseJsonLenient } from "./jsonRepair.ts";
import type { Slide, SlideColumn, SlideLayout } from "./ai";
import { isClosingTitle, isGenericTitle, jaccard, keyWords, neutralize, normKey } from "./qualityCore.ts";
import { summaryToSpeech, type StudySummary } from "./studySummary.ts";
import type { VideoPlan } from "./videoPlanCore.ts";
export { neutralize };

const SLIDE_LAYOUTS: SlideLayout[] = ["cover", "list", "cards", "steps", "compare", "stat", "quote", "summary"];

export type VideoScene = Slide & {
  kind: "slide" | "check";
  narration: string;
  question?: string;
  answer?: string;
  /** علامة الموضوع في خطة الوحدة (T3، أو E1 للتمارين) — لفحص الشمول فقط */
  topic?: string;
  /** سؤال ختامي (q) أو تمرين من الكتاب (ex): يُنقل إلى «أسئلة الوحدة» في آخر الفيديو */
  final?: "q" | "ex";
};
/**
 * truncated: الرد قُطع قبل نهايته (بلغ سقف الطول) — مشاهد آخر الجزء ناقصة، فيُعاد توليده.
 * v: 2 = «ملخّص الفيديو ٢» (خطة أولًا). done: الجزء اكتمل (لا ما زال يُكتب) — يحدد متى تُلحق الخلاصة والأسئلة.
 */
export type VideoScript = {
  title: string;
  scenes: VideoScene[];
  truncated?: boolean;
  v?: 2;
  done?: boolean;
  /** بصمة الجزء المحفوظ (videoPlanCore.partStamp) — لا يُستعمل إلا لنفس نص الجزء ونصيبه من الخطة */
  ps?: string;
};

const str = (v: unknown) => String(v ?? "").trim();
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** علامة الموضوع والسؤال الختامي (ملخّص الفيديو ٢)؛ القيم غير الصالحة تُتجاهل */
function tags(o: any): Pick<VideoScene, "topic" | "final"> {
  const out: Pick<VideoScene, "topic" | "final"> = {};
  const topic = str(o?.topic);
  if (/^[TE]\d{1,3}$/.test(topic)) out.topic = topic;
  const f = o?.final;
  if (f === "ex") out.final = "ex";
  else if (f === "q" || f === true || f === "true") out.final = "q";
  return out;
}

function scene(o: any): VideoScene | null {
  const narration = str(o?.narration);
  if (!narration) return null;
  const layoutRaw = str(o?.layout);
  if (layoutRaw === "check") {
    const question = str(o?.question);
    if (!question) return null;
    return { kind: "check", emoji: str(o?.emoji) || "🤔", title: str(o?.title), bullets: [], narration, question, answer: str(o?.answer), ...tags(o) };
  }
  const out: VideoScene = { kind: "slide", emoji: str(o?.emoji) || "📌", title: str(o?.title), bullets: strs(o?.bullets), narration, ...tags(o) };
  const highlight = str(o?.highlight);
  if (highlight) out.highlight = highlight;
  const columns: SlideColumn[] = Array.isArray(o?.columns)
    ? o.columns.map((c: any) => ({ title: str(c?.title), bullets: strs(c?.bullets) })).filter((c: SlideColumn) => c.title || c.bullets.length)
    : [];
  let layout = (SLIDE_LAYOUTS as string[]).includes(layoutRaw) ? (layoutRaw as SlideLayout) : undefined;
  if (layout === "compare") {
    if (columns.length >= 2) out.columns = columns.slice(0, 2);
    else {
      layout = "list";
      if (!out.bullets.length) out.bullets = columns.flatMap((c) => c.bullets);
    }
  }
  if ((layout === "stat" || layout === "quote") && !highlight) layout = "list";
  if (layout) out.layout = layout;
  // لا مشهد بعنوان فقط والراوي يتكلم: النقاط تؤخذ من كلام الراوي نفسه
  if (layout !== "cover" && !out.bullets.length && !out.columns?.length && !out.highlight) {
    out.bullets = bulletsFromNarration(narration);
    if (out.layout === "stat" || out.layout === "quote") out.layout = "list";
  }
  return out.title || out.bullets.length || out.columns?.length || out.highlight ? out : null;
}

/** جمل كلام الراوي مختصرة إلى نقاط تُعرض (حتى ٥) */
export function bulletsFromNarration(narration: string): string[] {
  return (narration.match(/[^.!؟?؛]+[.!؟?؛]?/g) ?? [])
    .map((x) => x.replace(/[.؛]+$/, "").trim())
    .filter((x) => x.length >= 8)
    .slice(0, 5)
    .map((x) => (x.length > 110 ? x.slice(0, x.lastIndexOf(" ", 108)) + "…" : x));
}

function partialTitle(raw: string): string {
  const m = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  try {
    return m ? str(JSON.parse(`"${m[1]}"`)) : "";
  } catch {
    return "";
  }
}

/** قراءة جزئية أثناء البثّ: كل مشهد اكتمل قوسه يُضاف فورًا */
export function parsePartialVideo(raw: string): VideoScript | null {
  const out: VideoScript = { title: partialTitle(raw), scenes: [] };
  const k = raw.search(/"scenes"\s*:\s*\[/);
  if (k >= 0) {
    let depth = 0;
    let begin = -1;
    let inStr = false;
    for (let i = raw.indexOf("[", k) + 1; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") {
        if (depth === 0) begin = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && begin >= 0) {
          try {
            const sc = scene(parseJsonLenient(raw.slice(begin, i + 1)));
            if (sc) out.scenes.push(sc);
          } catch {}
          begin = -1;
        }
      } else if (ch === "]" && depth === 0) break;
    }
  }
  return out.scenes.length ? out : null;
}

export function parseVideo(raw: string): VideoScript | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = parseJsonLenient(m[0]) as any;
      const scenes = (Array.isArray(o?.scenes) ? o.scenes : []).map(scene).filter(Boolean) as VideoScene[];
      if (scenes.length) return { title: str(o?.title), scenes };
    } catch {}
  }
  // ردّ مقطوع → ما اكتمل من المشاهد، مع علامة القطع (لا يُقبل جزءًا نهائيًا: يُعاد توليده)
  const part = parsePartialVideo(raw);
  return part ? { ...part, truncated: true } : null;
}

/** الدمج القديم (لصق بالترتيب): للمسار القديم وللفيديوهات المحفوظة قبل «ملخّص الفيديو ٢» */
export function mergeVideo(list: VideoScript[]): VideoScript | null {
  const ok = list.filter((x) => x?.scenes.length);
  if (!ok.length) return null;
  return { title: ok[0].title, scenes: ok.flatMap((x) => x.scenes) };
}

// ===== ملخّص الفيديو ٢: التركيب النهائي =====

/** نصوص المشاهد التي يبنيها التطبيق نفسه (بلغة الواجهة) */
export type VideoLabels = { summaryTitle: string; qTitle: string; qBody: string; qBullets: string[]; coverAuto: (title: string, topics: string[]) => string };

/** المشهد بالصيغة المحايدة (أفعال الأمر المذكّرة في أول الجمل → «من المهم…»، «لنفكّر…») */
export function neutralScene(sc: VideoScene): VideoScene {
  const out: VideoScene = { ...sc, title: neutralize(sc.title), narration: neutralize(sc.narration), bullets: (sc.bullets ?? []).map(neutralize) };
  if (sc.highlight) out.highlight = neutralize(sc.highlight);
  if (sc.question) out.question = neutralize(sc.question);
  if (sc.answer) out.answer = neutralize(sc.answer);
  if (sc.columns) out.columns = sc.columns.map((c) => ({ title: neutralize(c.title), bullets: c.bullets.map(neutralize) }));
  return out;
}

const screenWords = (s: VideoScene) =>
  [...new Set(keyWords([s.highlight ?? "", ...(s.bullets ?? []), ...(s.columns ?? []).flatMap((c) => [c.title, ...c.bullets])].join(" ")).filter((w) => w.length >= 2))];

/** نسبة كلمات a التي لا مقابل لها في b (الكلمة نفسها، أو تبدأ إحداهما بالأخرى بثلاثة أحرف فأكثر) */
function novelty(a: string[], b: string[]): number {
  if (!a.length) return 1;
  const miss = a.filter((w) => !b.some((x) => x === w || (Math.min(x.length, w.length) >= 3 && (x.startsWith(w) || w.startsWith(x))))).length;
  return miss / a.length;
}

/**
 * مشهد يعيد مشهدًا سبقه (يُحذف عند التركيب): شرح بالعنوان نفسه (بعد التطبيع: «م169» = «المادة ١٦٩»)
 * ونقاطه لا تزيد جديدًا على ٣٥٪؛ أو سؤال شبه مطابق لسؤال سبق. العناوين العامة («مثال»، «تطبيق») لا يُحكم عليها.
 */
export function isDuplicate(sc: VideoScene, kept: VideoScene[]): boolean {
  if (sc.kind === "check") {
    const q = keyWords(sc.question ?? "");
    return q.length > 0 && kept.some((k) => k.kind === "check" && jaccard(q, keyWords(k.question ?? "")) >= 0.8);
  }
  if (sc.layout === "cover" || sc.layout === "summary" || isGenericTitle(sc.title)) return false;
  const key = normKey(sc.title);
  const tw = [...new Set(keyWords(sc.title))];
  const words = screenWords(sc);
  return kept.some((k) => {
    if (k.kind !== "slide" || k.layout === "cover" || k.layout === "summary" || isGenericTitle(k.title)) return false;
    const kw = [...new Set(keyWords(k.title))];
    const same = (!!key && normKey(k.title) === key) || (tw.length >= 3 && kw.length >= 3 && jaccard(tw, kw) >= 0.8);
    return same && novelty(words, screenWords(k)) <= 0.35;
  });
}

function planCover(plan: VideoPlan, labels: VideoLabels, title: string): VideoScene {
  const majors = plan.topics.filter((t) => t.major).map((t) => t.title);
  const bullets = (majors.length >= 3 ? majors : plan.topics.map((t) => t.title)).slice(0, 5);
  const out: VideoScene = { kind: "slide", layout: "cover", emoji: "🎬", title, bullets, narration: plan.cover?.narration || labels.coverAuto(title, bullets) };
  if (plan.cover?.highlight) out.highlight = plan.cover.highlight;
  return out;
}

/**
 * الفيديو من أجزائه (ملخّص الفيديو ٢): افتتاح واحد من الخطة، ثم الشرح بترتيب الخطة بلا مكرر،
 * ثم — بعد اكتمال كل الأجزاء — الخلاصة، فمشهد «أسئلة الوحدة»، فالأسئلة الختامية، فتمارين الكتاب.
 * list: أجزاء مكتملة ثم جزء يُكتب على الأكثر (العرض بالترتيب). كل قرار يعتمد على ما سبقه فقط،
 * فنتيجة القائمة الأقصر بداية لنتيجة الأطول: أرقام المشاهد المعروضة لا تتغير أثناء الكتابة.
 * بلا خطة (الجزء الوحيد): افتتاح النموذج يبقى أولًا، وخلاصته تُؤجَّل لما بعد الشرح.
 */
export function assembleVideo(
  list: VideoScript[],
  o: { plan: VideoPlan | null; n: number; labels: VideoLabels; unitTitle: string; stats?: { dropped: number } }
): VideoScript {
  const { plan, labels } = o;
  const title = plan?.title || o.unitTitle || list.find((p) => p?.title)?.title || "";
  const out: VideoScene[] = [];
  if (plan) out.push(planCover(plan, labels, title));
  const finalsQ: VideoScene[] = [];
  const finalsEx: VideoScene[] = [];
  const sums: VideoScene[] = [];
  let dropped = 0;
  for (const part of list) {
    for (const raw of part?.scenes ?? []) {
      const sc = neutralScene(raw);
      if (sc.final === "q") finalsQ.push(sc);
      else if (sc.final === "ex") finalsEx.push(sc);
      else if (sc.layout === "summary" || (sc.kind === "slide" && isClosingTitle(sc.title))) {
        // خاتمة جزء («الخلاصة»، «في الختام»…) في وسط الفيديو: لا تبقى في موضعها (كان يبدو منتهيًا ثم يرجع للشرح)
        if (!plan) sums.push(sc);
      } else if (sc.layout === "cover") {
        if (!plan && !out.length) out.push(sc);
      } else if (sc.kind === "check" && (!out.length || out[out.length - 1].kind === "check" || out[out.length - 1].layout === "cover")) {
        // سؤالا فهم متتاليان، أو سؤال قبل أي شرح: لا يقيس فهم ما شُرح → إلى أسئلة النهاية
        finalsQ.push({ ...sc, final: "q" });
      } else if (isDuplicate(sc, out)) dropped++;
      else out.push(sc);
    }
  }
  const allDone = list.length === o.n && list.every((p) => p?.done);
  if (allDone) {
    let sum: VideoScene | null = null;
    if (plan?.summary) sum = { kind: "slide", layout: "summary", emoji: "✨", title: labels.summaryTitle, bullets: plan.summary.bullets.slice(0, 5), narration: plan.summary.narration };
    // الجزء الوحيد: خلاصته الحقيقية (آخر مشهد summary)، وإلا آخر مشهد خاتمة
    else if (sums.length) sum = [...sums].reverse().find((x) => x.layout === "summary") ?? sums[sums.length - 1];
    else if (plan?.keypoints.length) {
      const k = plan.keypoints.slice(0, 5);
      sum = { kind: "slide", layout: "summary", emoji: "✨", title: labels.summaryTitle, bullets: k, narration: k.join(". ") };
    }
    if (sum) out.push(neutralScene(sum));
    const qs: VideoScene[] = [];
    for (const q of finalsQ) {
      if (isDuplicate(q, [...out, ...qs])) dropped++;
      else qs.push(q);
    }
    if (qs.length || finalsEx.length) out.push({ kind: "slide", layout: "list", emoji: "📝", title: labels.qTitle, bullets: labels.qBullets, narration: labels.qBody });
    out.push(...qs, ...finalsEx);
  }
  if (o.stats) o.stats.dropped = dropped;
  return { title, scenes: out, v: 2 };
}

// أصغر من قبل (كان ٩٠٠٠): كل جزء يُكتب كاملًا تحت سقف الرد فلا تضيع مشاهد آخره (٢٤ أكتوبر)
const PART_MAX = 5000;

// ما ليس من صلب الوحدة فلا يضيع عليه وقت الفيديو (ملخصات قديمة محفوظة قد تحتويه). التمارين ودراسة الحالة تبقى.
const OFF_VIDEO = /مراجع|مصادر|المصادر|أهداف|مخرجات|نواتج التعلم|نواتج التعلّم|أنشطة|نشاط|references|sources|objectives|outcomes|activit/i;

/** الملخّص بلا أقسام المراجع والأهداف والمخرجات والأنشطة (وأهم النقاط التي تذكرها) */
export function coreForVideo(s: StudySummary): StudySummary {
  return {
    ...s,
    // «مصطلحات الوحدة» تُشرح داخل مشاهدها حيث ترد، فلا تُعاد في مشاهد مستقلة (كانت تتكرر مع كل جزء)
    sections: s.sections.filter((sec) => !OFF_VIDEO.test(sec.heading) && !GLOSSARY_RE.test(sec.heading)),
    keypoints: s.keypoints.filter((k) => !OFF_VIDEO.test(k)),
  };
}
const GLOSSARY_RE = /مصطلحات الوحدة|مسرد|glossary/i;

/**
 * أجزاء السيناريو من الملخّص (المسار القديم): أقسام كاملة متتالية (≤ ٥٠٠٠ حرف) مع سياق موضعها من الوحدة.
 * باقٍ للتوليد القديم المنقطع، وعدد أجزائه هو الحد الأعلى لطلبات «ملخّص الفيديو ٢» (لا خصم زيادة).
 */
export function videoParts(full: StudySummary, unitTitle: string): string[] {
  const s = coreForVideo(full);
  const secText = s.sections.map((sec) => summaryToSpeech({ title: "", intro: "", sections: [sec], keypoints: [] }));
  const groups: string[] = [];
  let cur = "";
  for (const t of secText) {
    if (cur && cur.length + t.length > PART_MAX) {
      groups.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${t}` : t;
  }
  if (cur) groups.push(cur);
  const head = `عنوان الوحدة: ${unitTitle || s.title}\n${s.intro ? `تمهيد: ${s.intro}\n` : ""}`;
  const n = groups.length;
  return groups.map((g, i) => {
    const last = i === n - 1;
    const keys = last && s.keypoints.length ? `\n\nأهم النقاط للمراجعة:\n${s.keypoints.map((k) => "- " + k).join("\n")}` : "";
    if (n === 1) return `${head}\n${g}${keys}`;
    const pos =
      `هذا الجزء ${i + 1} من ${n} من الوحدة؛ ستُعرض مشاهد الأجزاء متتالية في فيديو واحد. ` +
      `اشرح كل فكرة وكل تعداد وكل نقطة في هذا الجزء بترتيبها دون أي قفز، ودون تكرار ما شُرح أو إعادة ربط مطوّل بما سبق (جملة ربط واحدة تكفي). ` +
      `عدد المشاهد بحسب مادة هذا الجزء وحده: نحو ${Math.max(4, Math.round(g.length / 550))} مشاهد (لا تتقيد بالعدد العام)، ومشهد check واحد فقط في هذا الجزء، أو بلا check إن كان الجزء قصيرًا.` +
      (i === 0 ? " ابدأ بمشهد cover للوحدة كلها." : " لا تضع مشهد cover، وابدأ مباشرة بمشهد يربط بما سبق.") +
      (last ? " اختم بمشهد summary للوحدة كلها." : " لا تضع مشهد summary ختاميًا.");
    return `${head}${pos}\n\n${g}${keys}`;
  });
}

