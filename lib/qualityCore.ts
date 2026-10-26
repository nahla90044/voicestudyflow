// lib/qualityCore.ts
// وكلاء الجودة (منطق خالص، مُختبَر على نتائج حقيقية قبل اعتماده):
// - مدقق الملخّص: يرفض الجزء الفارغ أو المقطوع أو القصير جدًا قياسًا بنصّه («يكتب كلمتين ويسكت»).
// - مدقق الفيديو: يرفض الجزء بلا مشاهد كافية، أو الذي يسكت راويه عن معظم مادته، أو مشاهد يتكلم فيها
//   الراوي طويلًا والشاشة بلا نقاط.
// - مدقق الاختبار: لا يبقى سؤال لا يوجد دليل جوابه (اقتباسه) في نص الوحدة نفسه.
// العتبات محافظة عمدًا: الرفض للخلل الواضح فقط، فلا يُعاد توليد عمل سليم.
import type { StudySummary, SummaryBlock } from "./studySummary.ts";
import type { VPart } from "./videoPlanCore.ts";
import type { VideoScene, VideoScript } from "./videoScriptCore.ts";

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
export function checkSummaryPart(s: StudySummary, ctx: string, minRatio = 0.08): string | null {
  if (!s.sections.length) return "empty";
  if (s.sections.some((x) => !x.blocks.length || x.blocks.every((b) => !blockText(b).trim()))) return "truncated";
  const src = sourceBody(ctx).replace(/\s+/g, " ").trim().length;
  const out = summaryChars(s);
  // الملخّص الشامل لا يقل عن ٨٪ من نص مادته (الفعلي عادة ٤٠٪ فأكثر)، ولا عن ٢٥٠ حرفًا لمادة معتبرة
  if (src >= 1500 && (out < src * minRatio || out < 250)) return "short";
  return null;
}

/**
 * سبب رفض جزء الفيديو، أو null.
 * meta (ملخّص الفيديو ٢): نصيب الجزء من خطة الوحدة — يُفحص معه أن الجزء شرح مواضيعه كلها، وكتب الأسئلة
 * الختامية والتمارين وأسئلة الفهم المطلوبة، ولم يُعِد مواضيع الأجزاء الأخرى، ولم يُكثر الصيغ المذكّرة.
 * بلا meta: الفحص القديم كما هو (النسخ السابقة والمحفوظ).
 */
export function checkVideoPart(v: VideoScript, ctx: string, meta?: VPart | null): string | null {
  if (v.truncated) return "truncated"; // قُطع قبل نهايته: آخر مادة الجزء لم تُشرح
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
  if (!meta) return null;
  const finals = (k: "q" | "ex") => scenes.filter((s) => s.kind === "check" && s.final === k).length;
  if (meta.role === "solo") {
    const ex = meta.exCount ?? 0;
    if (ex > 0 && finals("ex") < Math.ceil(0.7 * ex)) return "nofinal";
    return mascCount(scenes) >= MASC_LIMIT ? "masc" : null;
  }
  const mine = meta.mine ?? [];
  // موضوع له مادة معتبرة لم يُشرح أصلًا (يُحكم به فقط إن التزم النموذج بعلامات المواضيع في نصف المشاهد فأكثر)
  const tagged = scenes.filter((s) => s.topic).length;
  if (tagged * 2 >= scenes.length) {
    const has = new Set(scenes.map((s) => s.topic).filter(Boolean));
    if (mine.some((t) => t.id.startsWith("T") && (t.chars ?? 0) >= 800 && !has.has(t.id))) return "skipped";
  }
  // الأسئلة الختامية والتمارين: تُنقل لآخر الفيديو، فإن غابت انتهى الفيديو بلا أسئلة
  if (mine.some((t) => t.final) && finals("q") === 0) return "nofinal";
  const ex = mine.reduce((a, t) => a + (t.ex ?? 0), 0);
  if (ex > 0 && finals("ex") < Math.ceil(0.7 * ex)) return "nofinal";
  // التأكد من الفهم أثناء الشرح
  if (mine.filter((t) => t.check).length >= 2 && !scenes.some((s) => s.kind === "check" && !s.final)) return "nocheck";
  // تكرار مواضيع أجزاء أخرى: مشهدان فأكثر (وخُمس الشرائح على الأقل) عنوانه عنوان موضوع شُرح قبله أو يأتي بعده
  const others = new Set([...(meta.before ?? []), ...(meta.after ?? [])].map((t) => normKey(t.replace(/\s*\((?:أوله|بقيته)\)\s*$/, ""))).filter(Boolean));
  const own = new Set(mine.map((t) => normKey(t.t)));
  const overlap = slides.filter((s) => !s.final && !isGenericTitle(s.title) && others.has(normKey(s.title)) && !own.has(normKey(s.title))).length;
  if (overlap >= 2 && overlap * 5 >= slides.length) return "overlap";
  return mascCount(scenes) >= MASC_LIMIT ? "masc" : null;
}

// ===== النصوص: تطبيع، ومفتاح العنوان، والصيغة المحايدة =====

export const norm = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();

/** الأرقام الهندية والفارسية → لاتينية */
export const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

// حروف الجر والعطف والأسماء الموصولة الشائعة (بعد التطبيع: إلى → الي، على → علي)
const STOP = new Set(["في", "من", "علي", "عن", "الي", "مع", "حول", "او", "ثم", "حتي", "عند", "و", "ب", "ل", "ك", "ف", "ما", "التي", "الذي", "الذين", "هذا", "هذه", "ذلك", "تلك", "كل", "ان", "قد"]);

/** كلمة بلا سوابقها (وال/فال/بال/كال/لل/ال/و/ف) لمقارنة الصيغ المختلفة للكلمة نفسها */
export function normWord(w: string): string {
  if (w.length > 5 && /^[وفبك]ال/.test(w)) return w.slice(3);
  if (w.length > 4 && w.startsWith("لل")) return w.slice(2);
  if (w.length > 4 && w.startsWith("ال")) return w.slice(2);
  if (w.length > 4 && /^[وف]/.test(w)) return w.slice(1);
  return w;
}

/** كلمات النص بعد التطبيع: الأرقام لاتينية، و«المادة ١٦٩/م١٦٩/مادة (169)» → م169، بلا حروف الجر وبلا السوابق */
export function keyWords(s: string): string[] {
  const t = ` ${norm(latinDigits(s))} `
    .replace(/(?<=\s)(?:[وفبك]?ال|لل|[وفبك])?ماده\s+(\d{1,4})(?=\s)/g, "م$1")
    .replace(/(?<=\s)م\s+(\d{1,4})(?=\s)/g, "م$1");
  return t.split(" ").filter((w) => w && !STOP.has(w)).map(normWord);
}

/** مفتاح العنوان: «حالات التنفيذ المعجّل (م169)» = «حالات التنفيذ المعجل في المادة ١٦٩» */
export function normKey(title: string): string {
  return [...new Set(keyWords(title))].sort().join(" ");
}

/** تشابه جاكارد بين مجموعتي كلمات */
export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 0;
  let both = 0;
  A.forEach((x) => B.has(x) && both++);
  return both / (A.size + B.size - both);
}

/** عنوان عام لا يُحكم عليه بالتكرار («مثال»، «تطبيق ٢»، «سؤال سريع»…) أو كلمة واحدة */
export function isGenericTitle(title: string): boolean {
  const t = norm(title);
  return t.split(" ").filter(Boolean).length < 2 || /^(مثال|امثله|تطبيق|تطبيقات|تنبيه|ملاحظه|خلاصه|الخلاصه|سؤال|سؤال سريع|تابع)( \S+)?$/.test(t);
}

// عنوان خاتمة: الكلمة نفسها، ومعها على الأكثر وصف عام («خلاصة الجزء»، «في الختام»، «مراجعة سريعة لما سبق»)
const CLOSING_HEAD = "(?:ال)?(?:خلاصه|خاتمه|ختام|ملخص|مراجعه سريعه|مراجعه ختاميه|اهم النقاط|نقاط للمراجعه|لنجمع ما سبق|نجمع ما سبق|في الختام|ختاما|اخيرا)";
const CLOSING_TAIL = "(?: (?:ل|ب)?(?:ال)?(?:جزء|وحده|قسم|درس|فصل|محور|موضوع|شرح|افكار|نقاط|عامه|سريعه|نهائيه|ختاميه|ما سبق|ما تقدم|ما مر|ما شرح|كل ما سبق|اول|ثاني|ثالث|رابع|خامس|سادس|اخير|\\d+))*";
const CLOSING_RE = new RegExp(`^(?:و|ف)?${CLOSING_HEAD}${CLOSING_TAIL}$`);
const CLOSING_EN = /^(?:in )?(?:summary|recap|conclusion|key points|wrap(?:ping)? up|to sum up)(?: of (?:this|the) (?:part|unit|section))?$/;

/**
 * مشهد خاتمة في غير موضعه («الخلاصة»، «خلاصة الجزء»، «في الختام»، «أهم النقاط») — كان يُختم به الجزء الأوسط
 * فيبدو الفيديو منتهيًا ثم يرجع للشرح. العنوان كله خاتمة فقط: «ملخص الحكم» و«خلاصة نظرية الالتزام» لا.
 */
export function isClosingTitle(title: string): boolean {
  const t = norm(title);
  return !!t && (CLOSING_RE.test(t) || CLOSING_EN.test(t));
}

// —— الصيغة المحايدة: أفعال أمر مذكّرة شائعة في كلام الراوي ——
// كل فعل بتشكيله الاختياري بين حروفه؛ والمحتمِل لمعنى آخر («تذكر المادة»: تذكُر، «ركّز المشرّع»: ماضٍ)
// لا يُعدّ أمرًا إلا بالشدّة أو بما يليه عادة في الأمر («فكّر قليلًا»، «لاحظ أن»، «انتبه لهذا»).
const DIA = "[\\u064B-\\u065F\\u0670]*";
const SHADDA = "[\\u064B-\\u0650\\u0652-\\u065F]*\\u0651[\\u064B-\\u065F]*";
const L = (letters: string) => [...letters].map((c) => c + DIA).join("");
const PUNCT = `[.,!؟?؛:،»"”]`;
// ما يلي الفعل: علامة ترقيم أو نهاية، أو إحدى الكلمات (بأي تشكيل)؛ prefix: يكفي أن تبدأ الكلمة التالية بها («لهذا»، «جيدًا»)
const NEXT = (words: string[], prefix = false) =>
  `(?=\\s*(?:${PUNCT}|$|(?:${words.map(L).join("|")})${prefix ? "" : `(?=[\\s.,!؟?؛:،»"”]|$)`}))`;
type Imp = { re: string; to: string };
const IMPERATIVES: Imp[] = [
  { re: `${L("انتبهوا")}|${L("انتبه")}${NEXT(["إلى", "الى", "ل", "جيد", "هنا", "معي", "معنا", "أن", "ان", "أيض", "ايض", "كذلك"], true)}`, to: "من المهم الانتباه" },
  { re: `ف${DIA}ك${SHADDA}ر${DIA}|${L("فكر")}${NEXT(["قليلا", "جيدا", "في", "معي", "معنا", "بهدوء", "كيف", "لماذا", "ماذا", "هل"])}`, to: "لنفكّر" },
  { re: `ت${DIA}ذ${DIA}ك${SHADDA}ر${DIA}|${L("تذكر")}${NEXT(["أن", "ان", "دائما", "جيدا"])}`, to: "لنتذكّر" },
  { re: `${L("لاحظ")}${NEXT(["أن", "ان", "هنا", "كيف", "جيدا"])}`, to: "نلاحظ" },
  { re: L("احفظ"), to: "من المفيد حفظ" },
  { re: `${L("ركز")}${NEXT(["على", "علي", "جيدا", "هنا", "معي", "معنا"])}`, to: "لنركّز" },
  { re: `ت${DIA}خ${DIA}ي${SHADDA}ل${DIA}|${L("تخيل")}${NEXT(["أن", "ان", "لو", "معي", "معنا", "شخصا", "حالة", "موقفا"])}`, to: "لنتخيّل" },
  { re: `${L("تأمل")}${NEXT(["هذا", "هذه", "كيف", "معي", "معنا", "قليلا", "في", "الفرق"])}`, to: "لنتأمّل" },
  { re: `${L("اعلم")}(?=\\s+${L("أن")})`, to: "من المهم معرفة" },
];
const END = `(?=$|[\\s.,!؟?؛:،»"”)])`;
// أول الجملة: بداية النص، أو بعد علامة ترقيم أو سطر جديد أو علامة تنصيص
const START = `(^\\s*|[.!؟?؛:،\\n«"“(]\\s*)`;
const NEUTRAL = IMPERATIVES.map((r) => ({ re: new RegExp(`${START}([وف]?)(?:${r.re})${END}`, "g"), to: r.to }));
// العدّ: أول الجملة (ما لم يُحيَّد)، أو بعد أداة ربط يأتي بعدها الأمر عادة («ولذلك انتبه»، «ثم فكّر»، «وهنا لاحظ»).
// لا يُعدّ ما بعد اسم: «المشرّع ركّز على»، «القاضي لاحظ أن»، «المادة تذكر أن» أفعال ماضية أو مضارعة لا أوامر
// (كان العدّ بعد أي مسافة يرفض شرحًا سليمًا فيُعاد بلا داعٍ)
const LINKERS = ["ثم", "هنا", "وهنا", "فهنا", "لذا", "ولذا", "لذلك", "ولذلك", "فلذلك", "إذن", "اذن", "الآن", "والآن", "الان", "والان", "لكن", "ولكن", "فقط", "أيضا", "ايضا", "بالذات", "دائما"];
const AFTER_LINK = `(?:^|[\\s.!؟?؛:،\\n«"“(])(?:${LINKERS.map(L).join("|")})\\s+`;
const ANYWHERE = IMPERATIVES.map((r) => new RegExp(`(?:(?:^|[.!؟?؛:،\\n«"“(])\\s*|${AFTER_LINK})[وف]?(?:${r.re})${END}`, "g"));

/** يحوّل أفعال الأمر المذكّرة في أول الجملة إلى صيغة محايدة («انتبه لهذا» → «من المهم الانتباه لهذا») */
export function neutralize(s: string): string {
  if (!s) return s;
  let out = s;
  for (const r of NEUTRAL) out = out.replace(r.re, (_m, pre: string, conj: string) => pre + conj + r.to);
  return out;
}

/** عدد أفعال الأمر المذكّرة الباقية في نصوص المشاهد (بعد التحييد) */
export function mascCount(scenes: VideoScene[]): number {
  let n = 0;
  for (const sc of scenes) {
    for (const t of [sc.narration, sc.title, sc.question ?? "", sc.answer ?? "", sc.highlight ?? "", ...(sc.bullets ?? [])]) {
      const x = neutralize(t);
      for (const re of ANYWHERE) n += x.match(re)?.length ?? 0;
    }
  }
  return n;
}
// حد محافظ: أربع صيغ مذكّرة باقية في الجزء (بعد التحييد الآلي لأول الجمل) → يُعاد مرة مجانًا
const MASC_LIMIT = 4;

const EXAMPLE_RE = /مثلًا|مثلا|على سبيل المثال|مثال ذلك|لنفترض|كأن|for example|for instance|suppose|imagine/i;

/** مقاييس جودة الشرح (للرصد فقط، لا يُرفض بها جزء) */
export function videoMetrics(v: VideoScript): { examples: number; read: number; masc: number; words: number; scenes: number } {
  const expl = v.scenes.filter((s) => s.kind === "slide" && s.layout !== "cover" && s.layout !== "summary" && !s.final);
  const withEx = expl.filter((s) => (s.bullets ?? []).some((b) => /^\s*(مثال|example)/i.test(b)) || EXAMPLE_RE.test(s.narration)).length;
  let said = 0;
  let onScreen = 0;
  let words = 0;
  for (const s of expl) {
    const screen = new Set(keyWords([s.title, s.highlight ?? "", ...(s.bullets ?? []), ...(s.columns ?? []).flatMap((c) => [c.title, ...c.bullets])].join(" ")).filter((w) => w.length >= 3));
    const nw = keyWords(s.narration).filter((w) => w.length >= 3);
    said += nw.length;
    onScreen += nw.filter((w) => screen.has(w)).length;
    words += s.narration.split(/\s+/).filter(Boolean).length;
  }
  return {
    examples: expl.length ? withEx / expl.length : 0,
    read: said ? onScreen / said : 0,
    masc: mascCount(v.scenes),
    words: expl.length ? words / expl.length : 0,
    scenes: v.scenes.length,
  };
}

// ===== مدقق الاختبار =====

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
