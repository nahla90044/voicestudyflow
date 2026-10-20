// lib/videoScriptCore.ts
// منطق «ملخّص الفيديو» الخالص (بلا اعتماد على الجهاز): قراءة المشاهد من ردّ الذكاء
// (كاملًا أو أولًا بأول أثناء البثّ)، والدمج بالترتيب، وتقسيم الملخّص إلى أجزاء. مُختبَر في tests/.
import type { Slide, SlideColumn, SlideLayout } from "./ai";
import { summaryToSpeech, type StudySummary } from "./studySummary.ts";

const SLIDE_LAYOUTS: SlideLayout[] = ["cover", "list", "cards", "steps", "compare", "stat", "quote", "summary"];

export type VideoScene = Slide & {
  kind: "slide" | "check";
  narration: string;
  question?: string;
  answer?: string;
};
export type VideoScript = { title: string; scenes: VideoScene[] };

const str = (v: unknown) => String(v ?? "").trim();
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function scene(o: any): VideoScene | null {
  const narration = str(o?.narration);
  if (!narration) return null;
  const layoutRaw = str(o?.layout);
  if (layoutRaw === "check") {
    const question = str(o?.question);
    if (!question) return null;
    return { kind: "check", emoji: str(o?.emoji) || "🤔", title: str(o?.title), bullets: [], narration, question, answer: str(o?.answer) };
  }
  const out: VideoScene = { kind: "slide", emoji: str(o?.emoji) || "📌", title: str(o?.title), bullets: strs(o?.bullets), narration };
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
            const sc = scene(JSON.parse(raw.slice(begin, i + 1)));
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
      const o = JSON.parse(m[0]);
      const scenes = (Array.isArray(o?.scenes) ? o.scenes : []).map(scene).filter(Boolean) as VideoScene[];
      if (scenes.length) return { title: str(o?.title), scenes };
    } catch {}
  }
  return parsePartialVideo(raw); // ردّ مقطوع → ما اكتمل من المشاهد
}

export function mergeVideo(list: VideoScript[]): VideoScript | null {
  const ok = list.filter((x) => x?.scenes.length);
  if (!ok.length) return null;
  return { title: ok[0].title, scenes: ok.flatMap((x) => x.scenes) };
}

const PART_MAX = 9000;

// ما ليس من صلب الوحدة فلا يضيع عليه وقت الفيديو (ملخصات قديمة محفوظة قد تحتويه). التمارين ودراسة الحالة تبقى.
const OFF_VIDEO = /مراجع|مصادر|المصادر|أهداف|مخرجات|نواتج التعلم|نواتج التعلّم|أنشطة|نشاط|references|sources|objectives|outcomes|activit/i;

/** الملخّص بلا أقسام المراجع والأهداف والمخرجات والأنشطة (وأهم النقاط التي تذكرها) */
export function coreForVideo(s: StudySummary): StudySummary {
  return {
    ...s,
    sections: s.sections.filter((sec) => !OFF_VIDEO.test(sec.heading)),
    keypoints: s.keypoints.filter((k) => !OFF_VIDEO.test(k)),
  };
}

/** أجزاء السيناريو من الملخّص: أقسام كاملة متتالية (≤ ٩٠٠٠ حرف) مع سياق موضعها من الوحدة */
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
      `هذا الجزء ${i + 1} من ${n} من الوحدة؛ ستُعرض مشاهد الأجزاء متتالية في فيديو واحد.` +
      (i === 0 ? " ابدأ بمشهد cover للوحدة كلها." : " لا تضع مشهد cover، وابدأ مباشرة بمشهد يربط بما سبق.") +
      (last ? " اختم بمشهد summary للوحدة كلها." : " لا تضع مشهد summary ختاميًا.");
    return `${head}${pos}\n\n${g}${keys}`;
  });
}

