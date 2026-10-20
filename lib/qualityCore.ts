// lib/qualityCore.ts
// وكلاء الجودة (منطق خالص، مُختبَر على نتائج حقيقية قبل اعتماده):
// - مدقق الملخّص: يرفض الجزء الفارغ أو المقطوع أو القصير جدًا قياسًا بنصّه («يكتب كلمتين ويسكت»).
// - مدقق الفيديو: يرفض الجزء بلا مشاهد كافية، أو الذي يسكت راويه عن معظم مادته، أو مشاهد يتكلم فيها
//   الراوي طويلًا والشاشة بلا نقاط.
// - مدقق الاختبار: لا يبقى سؤال لا يوجد دليل جوابه (اقتباسه) في نص الوحدة نفسه.
// العتبات محافظة عمدًا: الرفض للخلل الواضح فقط، فلا يُعاد توليد عمل سليم.
import type { StudySummary, SummaryBlock } from "./studySummary.ts";
import type { VideoScript } from "./videoScriptCore.ts";

/** نص المادة بلا تعليمات التقسيم التي يضيفها التطبيق في أول الجزء */
function sourceBody(ctx: string): string {
  const i = ctx.indexOf("\n\n");
  const head = i >= 0 ? ctx.slice(0, i) : "";
  return /هذا الجزء|عنوان الوحدة/.test(head) ? ctx.slice(i + 2) : ctx;
}

function blockText(b: SummaryBlock): string {
  switch (b.type) {
    case "text":
    case "example":
    case "important":
      return b.text;
    case "definition":
      return `${b.term} ${b.text}`;
    case "explain":
      return `${b.title ?? ""} ${b.text}`;
    case "list":
      return `${b.title ?? ""} ${b.items.join(" ")}`;
    case "table":
      return `${b.headers.join(" ")} ${b.rows.map((r) => r.join(" ")).join(" ")}`;
    case "exercise":
      return `${b.q} ${b.steps.join(" ")} ${b.answer}`;
    case "case":
      return `${b.text} ${b.analysis} ${b.qa.map((x) => `${x.q} ${x.a}`).join(" ")}`;
  }
}

export function summaryChars(s: StudySummary): number {
  return (s.intro + s.sections.map((x) => x.heading + x.blocks.map(blockText).join(" ")).join(" ") + s.keypoints.join(" ")).replace(/\s+/g, " ").trim().length;
}

/** سبب رفض جزء الملخّص، أو null إن كان سليمًا */
export function checkSummaryPart(s: StudySummary, ctx: string): string | null {
  if (!s.sections.length) return "empty";
  if (s.sections.some((x) => !x.blocks.length || x.blocks.every((b) => !blockText(b).trim()))) return "truncated";
  const src = sourceBody(ctx).replace(/\s+/g, " ").trim().length;
  const out = summaryChars(s);
  // الملخّص الشامل لا يقل عن ٨٪ من نص مادته (الفعلي عادة ٤٠٪ فأكثر)، ولا عن ٢٥٠ حرفًا لمادة معتبرة
  if (src >= 1500 && (out < src * 0.08 || out < 250)) return "short";
  return null;
}

/** سبب رفض جزء الفيديو، أو null */
export function checkVideoPart(v: VideoScript, ctx: string): string | null {
  const scenes = v.scenes ?? [];
  const src = sourceBody(ctx).replace(/\s+/g, " ").trim().length;
  if (!scenes.length || (src >= 2500 && scenes.length < 2)) return "few";
  const narr = scenes.reduce((a, s) => a + s.narration.replace(/\s+/g, " ").trim().length, 0);
  // الراوي يشرح المادة: لا يقل كلامه عن ربعها
  if (src >= 1500 && narr < src * 0.25) return "silent";
  // شاشة بلا نقاط والراوي يتكلم طويلًا (يظهر عنوان فقط): مقبول نادرًا، مرفوض إن كثر
  const slides = scenes.filter((s) => s.kind === "slide");
  const bare = slides.filter((s) => s.narration.length > 160 && !(s.bullets?.length) && !s.columns?.length && !s.highlight).length;
  if (slides.length >= 4 && bare / slides.length > 0.4) return "bare";
  return null;
}

// ===== مدقق الاختبار =====

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

/**
 * هل اقتباس السؤال موجود في نص الوحدة؟ مطابقة متسامحة مع اختلاف الهمزات والتشكيل وعلامات الترقيم:
 * الاقتباس القصير يُطلب كاملًا، والطويل يكفي أن تُوجد ٧٠٪ من مقاطعه (٥ كلمات متتالية) في النص.
 */
export function quoteInText(quote: string, text: string): boolean {
  const q = norm(quote);
  const t = norm(text);
  if (!q || !t) return false;
  if (t.includes(q)) return true;
  const w = q.split(" ");
  if (w.length < 6) return false;
  const grams: string[] = [];
  for (let i = 0; i + 5 <= w.length; i += 2) grams.push(w.slice(i, i + 5).join(" "));
  const hit = grams.filter((g) => t.includes(g)).length;
  return hit / grams.length >= 0.7;
}

/** الأسئلة التي يوجد دليلها في النص؛ السؤال بلا اقتباس يبقى (لا يُحكم عليه بلا دليل) */
export function verifiedQuestions<Q extends { quote?: string }>(qs: Q[], text: string): { kept: Q[]; dropped: number } {
  const kept = qs.filter((q) => !q.quote?.trim() || quoteInText(q.quote, text));
  return { kept, dropped: qs.length - kept.length };
}
