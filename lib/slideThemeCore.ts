// lib/slideThemeCore.ts
// العقد المشترك لأشكال شرائح «ملخّص الفيديو» (مجلة / بصري / سينمائي / منوّع) — منطق خالص بلا React
// ليُختبر في node (tests/slideThemeCore.test.ts):
// - دور المشهد في الفيديو (افتتاح، شرح، سؤال فهم، خلاصة، تمهيد الأسئلة، سؤال ختامي، تمرين).
// - نموذج المشهد الجاهز للرسم: القالب المستنتج من البيانات الحالية (بلا أي تغيير في الخادم)،
//   والنقاط بعتبات ظهورها، والسؤال بخياراته والخيار الصحيح، وكثافة النص.
// - الترجمة كلمةً كلمة، وتقدير حجم الخط وعدد الأعمدة حتى لا يُقص نص أبدًا، واختيار الشكل في «منوّع».
// لا شيء هنا يرمي خطأً: أي بيانات ناقصة ترجع لقالب آمن.
import type { SlideLayout } from "./ai";
import { resolveLayout, splitHead } from "./slideCore.ts";
import type { VideoScene } from "./videoScriptCore.ts";

export type SlideTheme = "editorial" | "visual" | "cinematic";
export type SlideThemePref = SlideTheme | "mixed" | "classic";
/** ترتيب الاختيارات في الواجهة: منوّع ثم مجلة ثم بصري ثم سينمائي */
export const THEME_PREFS: SlideThemePref[] = ["mixed", "editorial", "visual", "cinematic", "classic"];
export const SLIDE_THEMES: SlideTheme[] = ["editorial", "visual", "cinematic"];

export type SceneRole = "cover" | "body" | "check" | "summary" | "qIntro" | "finalQ" | "finalEx";
export type Template =
  | "cover"
  | "list"
  | "steps"
  | "cards"
  | "compare"
  | "stat"
  | "quote"
  | "summary"
  | "define"
  | "range"
  | "seal"
  | "groups"
  | "tree"
  | "check"
  | "qIntro";
export const TEMPLATES: Template[] = ["cover", "list", "steps", "cards", "compare", "stat", "quote", "summary", "define", "range", "seal", "groups", "tree", "check", "qIntro"];

/** نقطة واحدة: النص كاملًا، ورأسه وشرحه («رأس: شرح»)، وعتبة ظهورها من تقدّم الراوي (٠..١) */
export type Item = { text: string; head: string; body: string; at: number };
export type QOption = { marker: string; text: string };

export type SceneModel = {
  template: Template;
  /** التخطيط الأصلي بعد التحقق من بياناته (القالب يرجع إليه عند أي نقص) */
  base: SlideLayout | "check";
  role: SceneRole;
  title: string;
  highlight?: string;
  /** كلمة/عبارة قصيرة موجودة حرفيًا في العنوان أو highlight أو نقطة — تُبرَز (التكبير السينمائي) */
  keyword?: string;
  /** compare: نقاط العمودين متتالية (الأول ثم الثاني) بعتبات موزعة عليها كلها؛ tree: نقطة لكل عقدة؛ define/check: فارغة */
  items: Item[];
  /** compare و define(من compare): العمودان، ونقاطهما هي نفس كائنات items */
  columns?: { title: string; items: Item[] }[];
  /** lugha اختيارية؛ عند تعدد النقاط في العمود تُجمع بسطر جديد "\n" */
  define?: { term: string; lugha?: string; istilah: string };
  /** from < to دائمًا؛ ruler = مسطرة أيام (يوم/أيام/day و to ≤ ٦٠) */
  range?: { from: number; to: number; unit: string; ruler: boolean };
  /** year بأرقام لاتينية بلا «هـ» (مثل "1433")؛ تُعرض بـ toLocalDigits */
  seal?: { year: string };
  /** groups: العدد البارز (١..١٢) */
  count?: number;
  /** tree: الجذر = العنوان، والعقد ٢..٤ (items[i] تقابل nodes[i]) */
  tree?: { root: string; nodes: { title: string; leaves: string[] }[] };
  /** correct = -1: غير مؤكد → لا يُميَّز أي خيار، ويظهر صندوق الجواب وحده */
  check?: { stem: string; options: QOption[]; answer: string; correct: number; long: boolean; final?: "q" | "ex" };
  density: "s" | "m" | "l";
  /** اسم أيقونة Ionicons (من رمز المشهد إن عُرف، وإلا حسب القالب/الدور) */
  icon: string;
  emoji: string;
};

export const THINK_SECONDS = 5;
/** قرار ١٨ أكتوبر سارٍ (DECISIONS.md:30): أيقونات خطية بدل الإيموجي — إن وافقت نهلة على الإيموجي فهذا المفتاح وحده */
export const SHOW_EMOJI: boolean = false;

// ===== أدوات النص =====

const str = (v: unknown) => String(v ?? "").trim();
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** الأرقام الهندية والفارسية → لاتينية (قبل أي فحص بالتعابير) */
export function toLatinDigits(s: string): string {
  return String(s ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/(\d)٫(\d)/g, "$1.$2");
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** رقم بأرقام لغة الواجهة: العربية ← «١٤٣٣» و«١٫٥»، وغيرها ← لاتينية */
export function toLocalDigits(n: number | string, lang: string): string {
  const s = toLatinDigits(String(n ?? ""));
  if (lang !== "ar") return s;
  return s.replace(/(\d)\.(\d)/g, "$1٫$2").replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/** تطبيع للمقارنة: بلا تشكيل ولا تطويل ولا ترقيم، والهمزات والتاء المربوطة موحّدة */
export function normText(s: string): string {
  return toLatinDigits(s)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^0-9A-Za-zء-ي]+/g, " ")
    .trim()
    .toLowerCase();
}

// ===== الدور =====

export function isThemePref(v: unknown): v is SlideThemePref {
  return v === "mixed" || v === "editorial" || v === "visual" || v === "cinematic" || v === "classic";
}

/** دور مشهد منفرد (بلا النظر لما بعده): السؤال، والختامي، والافتتاح والخلاصة من التخطيط أو الموضع */
export function soloRole(s: VideoScene | undefined, i: number, total: number): SceneRole {
  if (!s) return "body";
  if (s.kind === "check") return s.final === "ex" ? "finalEx" : s.final === "q" ? "finalQ" : "check";
  if (s.final === "ex") return "finalEx";
  if (s.final === "q") return "finalQ";
  let L: SlideLayout;
  try {
    L = resolveLayout({ ...s, bullets: strs(s.bullets) }, i, total);
  } catch {
    L = "list";
  }
  return L === "cover" ? "cover" : L === "summary" ? "summary" : "body";
}

/**
 * دور المشهد i في الفيديو. qTitles: عنوان «أسئلة الوحدة» باللغتين (يُطبَّع قبل المقارنة).
 * total: عدد المشاهد كما يُمرَّر لـ VideoStage (أثناء الكتابة أكبر من الموجود) — افتراضيًا scenes.length.
 * qIntro: مشهد slide بلا final وليس الأول، وعنوانه «أسئلة الوحدة»، أو التالي له final (ولم يكن افتتاحًا/خلاصة).
 */
export function sceneRole(scenes: VideoScene[], i: number, qTitles: string[] = [], total?: number): SceneRole {
  const list = Array.isArray(scenes) ? scenes : [];
  const s = list[i];
  const base = soloRole(s, i, Math.max(total ?? 0, list.length));
  if (!s || s.kind !== "slide" || s.final || i <= 0) return base;
  const own = normText(s.title ?? "");
  if (own && qTitles.some((q) => normText(q) === own)) return "qIntro";
  if (list[i + 1]?.final && base === "body") return "qIntro";
  return base;
}

// ===== النموذج =====

export function revealAt(i: number, n: number): number {
  return n <= 1 ? 0.05 : 0.05 + (i / n) * 0.8;
}

function mkItems(arr: string[]): Item[] {
  return arr.map((text, i) => {
    const { head, body } = splitHead(text);
    return { text, head, body, at: revealAt(i, arr.length) };
  });
}

const LAYOUTS: SlideLayout[] = ["cover", "list", "cards", "steps", "compare", "stat", "quote", "summary"];
const TYPES_RE = /أنواع|انواع|أقسام|اقسام|تقسيم|types|kinds/i;
const LUGHA_RE = /^(في )?اللغة|لغة/;
const ISTILAH_RE = /اصطلاح/;
/** كلمة «قاعدة/مادة/نص…» في المشهد → اقتباس حرفي يبقى quote (وغيره من quote تعريف: المصطلح = العنوان).
 * بالكلمات كاملةً بعد التطبيع: «انتقال» لا تُعد «قال»، و«الحكم القضائي» يبقى تعريفًا. */
const RULE_WORDS = new Set(["قاعده", "القاعده", "مبدا", "المبدا", "ماده", "الماده", "نص", "النص", "حديث", "الحديث", "ايه", "الايه", "قال", "rule", "principle", "article", "says"]);
const isRuleCue = (s: string) => normText(s).split(" ").some((w) => RULE_WORDS.has(w));
const UNIT_WORD = /(يوم|أيام|ايام|يومًا|يوما|شهر|أشهر|شهور|سنة|سنوات|سنين|ساعة|ساعات|أسبوع|أسابيع|دقيقة|دقائق|%|day|days|month|months|year|years|hour|hours|week|weeks)/i;

function rangeOf(raw: string): SceneModel["range"] | undefined {
  const s = toLatinDigits(raw);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:[–\-—]|إلى|الى|to)\s*(\d+(?:\.\d+)?)/);
  if (!m || m.index === undefined) return undefined;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!(Number.isFinite(from) && Number.isFinite(to) && from < to)) return undefined;
  const after = s.slice(m.index + m[0].length).trim();
  const unit = (after.match(/^[^\s.,،؛:()]+/)?.[0] ?? "").trim() || (s.match(UNIT_WORD)?.[0] ?? "");
  return { from, to, unit, ruler: false };
}

function yearOf(raw: string): string | undefined {
  const s = toLatinDigits(raw);
  const m = s.match(/(\d{3,4})\s*(?:هـ|ه(?![ء-ي])|هجري)/);
  return m ? m[1] : undefined;
}

function countOf(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = toLatinDigits(raw).trim();
  const m = s.match(/^(\d{1,2})(?![\d.,%/:])\s*(.*)$/);
  if (!m || m[2].length > 16) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : undefined;
}

/** «لغةً: …» في أول نقطة من نقاط التعريف → معناه اللغوي */
function lughaFromItems(items: Item[]): { lugha?: string; rest: Item[] } {
  const k = items.findIndex((it) => /^(في\s+)?(ال)?لغ[ةه]ً?\s*[:：\-–]/.test(it.text));
  if (k < 0) return { rest: items };
  const t = items[k].text.replace(/^(في\s+)?(ال)?لغ[ةه]ً?\s*[:：\-–]\s*/, "").trim();
  const rest = items.filter((_, i) => i !== k);
  return { lugha: t || undefined, rest: mkItems(rest.map((x) => x.text)) };
}

const STOP = new Set(["في", "من", "على", "الى", "عن", "مع", "او", "ثم", "هذا", "هذه", "ذلك", "التي", "الذي", "بين", "عند", "كل", "ما", "هو", "هي", "the", "and", "of", "for", "with", "from", "into", "what", "how"]);

const NUMERIC_TEMPLATES = new Set<Template>(["stat", "range", "seal", "groups"]);

/** الكلمة المفتاحية: highlight القصير (إلا في قوالب الأرقام)، وإلا أطول كلمة ذات معنى في العنوان، وإلا رأس أول نقطة */
function keywordOf(template: Template, title: string, highlight: string | undefined, items: Item[]): string | undefined {
  if (highlight && highlight.length <= 30 && /[A-Za-zء-ي]/.test(highlight) && !NUMERIC_TEMPLATES.has(template)) return highlight;
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/^[^0-9A-Za-zء-ي٠-٩]+|[^0-9A-Za-zء-ي٠-٩]+$/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(normText(w)));
  if (words.length) return words.reduce((a, b) => (normText(b).length > normText(a).length ? b : a));
  const h = items.find((it) => it.head && it.head.length <= 24)?.head;
  return h || undefined;
}

const ICON_BY_TEMPLATE: Record<Template, string> = {
  cover: "sparkles-outline",
  list: "list-outline",
  steps: "footsteps-outline",
  cards: "grid-outline",
  compare: "git-compare-outline",
  stat: "stats-chart-outline",
  quote: "chatbox-ellipses-outline",
  summary: "checkmark-done-outline",
  define: "book-outline",
  range: "calendar-outline",
  seal: "ribbon-outline",
  groups: "albums-outline",
  tree: "git-network-outline",
  check: "help-circle-outline",
  qIntro: "megaphone-outline",
};

/** رمز المشهد (يولّده الذكاء) ← أيقونة خطية بالمعنى نفسه (كل الأسماء موجودة في Ionicons) */
const ICON_BY_EMOJI: Record<string, string> = {
  "🎬": "film-outline",
  "✨": "sparkles-outline",
  "📝": "create-outline",
  "📢": "megaphone-outline",
  "📣": "megaphone-outline",
  "📌": "pin-outline",
  "📍": "pin-outline",
  "🤔": "help-circle-outline",
  "❓": "help-circle-outline",
  "💡": "bulb-outline",
  "⚖": "scale-outline",
  "📅": "calendar-outline",
  "📆": "calendar-outline",
  "🗓": "calendar-outline",
  "⏳": "hourglass-outline",
  "⌛": "hourglass-outline",
  "⏰": "alarm-outline",
  "⏱": "stopwatch-outline",
  "📜": "document-text-outline",
  "📄": "document-outline",
  "📃": "document-text-outline",
  "📘": "book-outline",
  "📗": "book-outline",
  "📕": "book-outline",
  "📖": "book-outline",
  "📚": "library-outline",
  "🏛": "business-outline",
  "🏦": "business-outline",
  "🏢": "business-outline",
  "💰": "cash-outline",
  "💵": "cash-outline",
  "💳": "card-outline",
  "📈": "trending-up-outline",
  "📉": "trending-down-outline",
  "📊": "bar-chart-outline",
  "🔑": "key-outline",
  "🗝": "key-outline",
  "🔍": "search-outline",
  "🔎": "search-outline",
  "🧠": "bulb-outline",
  "🧩": "extension-puzzle-outline",
  "✅": "checkmark-circle-outline",
  "✔": "checkmark-circle-outline",
  "⚠": "warning-outline",
  "🚫": "ban-outline",
  "⛔": "ban-outline",
  "🔗": "link-outline",
  "⛓": "link-outline",
  "🌍": "earth-outline",
  "🌎": "earth-outline",
  "🌐": "globe-outline",
  "👥": "people-outline",
  "👤": "person-outline",
  "🧑": "person-outline",
  "🏠": "home-outline",
  "⚙": "settings-outline",
  "🛠": "construct-outline",
  "🔧": "construct-outline",
  "🔨": "hammer-outline",
  "🔄": "sync-outline",
  "🔁": "repeat-outline",
  "📋": "clipboard-outline",
  "🏆": "trophy-outline",
  "🥇": "medal-outline",
  "⭐": "star-outline",
  "🌟": "star-outline",
  "🔢": "calculator-outline",
  "🧮": "calculator-outline",
  "🔒": "lock-closed-outline",
  "🛡": "shield-checkmark-outline",
  "💼": "briefcase-outline",
  "📞": "call-outline",
  "✉": "mail-outline",
  "📧": "mail-outline",
  "🗂": "folder-open-outline",
  "📁": "folder-open-outline",
  "🧪": "flask-outline",
  "🔬": "flask-outline",
  "🔭": "telescope-outline",
  "🌱": "leaf-outline",
  "🌿": "leaf-outline",
  "❤": "heart-outline",
  "⚡": "flash-outline",
  "🔥": "flame-outline",
  "💬": "chatbubbles-outline",
  "🗣": "chatbubbles-outline",
  "🎯": "locate-outline",
  "🚀": "rocket-outline",
  "🧭": "compass-outline",
  "🗺": "map-outline",
  "🏁": "flag-outline",
  "🚩": "flag-outline",
  "📰": "newspaper-outline",
  "📑": "reader-outline",
  "🔖": "bookmark-outline",
  "🌡": "thermometer-outline",
  "💧": "water-outline",
  "☀": "sunny-outline",
  "🌙": "moon-outline",
  "🎁": "gift-outline",
  "🛒": "cart-outline",
  "🏷": "pricetag-outline",
  "🧾": "receipt-outline",
  "💻": "desktop-outline",
  "📱": "phone-portrait-outline",
  "🎓": "school-outline",
  "🏫": "school-outline",
};

function iconOf(emoji: string, template: Template, role: SceneRole): string {
  if (role === "qIntro") return "megaphone-outline";
  if (role === "finalEx") return "document-text-outline";
  if (role === "finalQ") return "school-outline";
  const e = emoji.replace(/[️‍]/g, "").trim();
  return ICON_BY_EMOJI[e] ?? ICON_BY_EMOJI[[...e][0] ?? ""] ?? ICON_BY_TEMPLATE[template];
}

/** نموذج المشهد للرسم. لا يرمي أبدًا: أي خطأ غير متوقع يعطي قائمة بنقاط المشهد. */
export function buildModel(scene: VideoScene, index: number, total: number, role: SceneRole): SceneModel {
  try {
    return build(scene, index, total, role);
  } catch {
    const items = mkItems(strs(scene?.bullets));
    const emoji = str(scene?.emoji);
    return { template: "list", base: "list", role: role ?? "body", title: str(scene?.title), items, density: "m", icon: iconOf(emoji, "list", role ?? "body"), emoji };
  }
}

function build(s: VideoScene, index: number, total: number, role: SceneRole): SceneModel {
  const title = str(s?.title);
  const highlight = str(s?.highlight) || undefined;
  const emoji = str(s?.emoji);
  let bullets = strs(s?.bullets);
  const cols = (Array.isArray(s?.columns) ? s.columns : [])
    .map((c) => ({ title: str(c?.title), bullets: strs(c?.bullets) }))
    .filter((c) => c.title || c.bullets.length);

  // التخطيط الأصلي بعد التحقق من بياناته (كما يصحّحه videoScriptCore، للفيديوهات المحفوظة قبل التصحيح)
  let base: SlideLayout | "check";
  if (s?.kind === "check") base = "check";
  else if (s?.layout && LAYOUTS.includes(s.layout)) base = s.layout;
  else if (role === "cover" || role === "summary") base = role;
  else base = resolveLayout({ ...s, bullets }, index, total);
  if (base === "compare" && cols.length < 2) {
    base = "list";
    if (!bullets.length) bullets = cols.flatMap((c) => c.bullets);
  }
  if ((base === "stat" || base === "quote") && !highlight) base = "list";

  let items = mkItems(bullets);
  const out: SceneModel = { template: base, base, role, title, items, density: "m", icon: "", emoji };
  if (highlight) out.highlight = highlight;

  const year = yearOf(highlight ?? "") ?? yearOf(title);

  if (role === "qIntro") out.template = "qIntro";
  else if (base === "check") {
    const q = parseQuestion(s?.question ?? "");
    const answer = str(s?.answer);
    const stem = q.stem || title;
    const correct = matchAnswer(q.options, answer);
    const long = stem.length > 160 || q.options.length > 4 || q.options.some((o) => o.text.length > 60) || answer.length > 220;
    out.check = { stem, options: q.options, answer, correct, long };
    if (s?.final) out.check.final = s.final;
    out.template = "check";
    items = [];
  } else if (base === "compare") {
    const two = cols.slice(0, 2);
    const flat = mkItems(two.flatMap((c) => c.bullets));
    let k = 0;
    const columns = two.map((c) => ({ title: c.title, items: c.bullets.map(() => flat[k++]) }));
    const li = two.findIndex((c) => LUGHA_RE.test(c.title));
    const ii = two.findIndex((c) => ISTILAH_RE.test(c.title));
    if (li >= 0 && ii >= 0 && li !== ii && two[ii].bullets.length) {
      out.template = "define";
      out.define = { term: title, istilah: two[ii].bullets.join("\n") };
      if (two[li].bullets.length) out.define.lugha = two[li].bullets.join("\n");
      out.columns = columns;
      items = [];
    } else if (TYPES_RE.test(title) && cols.length >= 2 && cols.length <= 4) {
      out.template = "tree";
      out.tree = { root: title, nodes: cols.map((c) => ({ title: c.title, leaves: c.bullets })) };
      items = mkItems(cols.map((c) => c.title)).map((it, i) => ({ ...it, head: cols[i].title, body: cols[i].bullets.join("، ") }));
    } else {
      out.columns = columns;
      items = flat;
    }
  } else if (base === "quote") {
    if (year) {
      out.template = "seal";
      out.seal = { year };
    } else if (title && !isRuleCue(`${title} ${highlight ?? ""}`)) {
      const { lugha, rest } = lughaFromItems(items);
      out.template = "define";
      out.define = { term: title, istilah: highlight ?? "" };
      if (lugha) out.define.lugha = lugha;
      items = rest;
    }
  } else if (base === "stat") {
    const rg = rangeOf(highlight ?? "") ?? rangeOf(title);
    if (rg) {
      rg.ruler = /يوم|أيام|ايام|day/i.test(`${highlight ?? ""} ${title} ${rg.unit}`) && rg.to <= 60;
      out.template = "range";
      out.range = rg;
    } else if (year) {
      out.template = "seal";
      out.seal = { year };
    }
  } else if (base === "cards" || base === "list") {
    const count = countOf(highlight);
    if (base === "cards" && TYPES_RE.test(title) && items.length >= 2 && items.length <= 4) {
      out.template = "tree";
      out.tree = { root: title, nodes: items.map((it) => ({ title: it.head || it.text, leaves: it.head && it.body ? [it.body] : [] })) };
    } else if (count !== undefined && items.length >= 2 && items.length <= 6) {
      out.template = "groups";
      out.count = count;
    } else if (year && items.length <= 3) {
      out.template = "seal";
      out.seal = { year };
    }
  } else if (base === "steps" && year && items.length <= 3) {
    out.template = "seal";
    out.seal = { year };
  }

  out.items = items;
  const kw = out.template === "check" ? undefined : keywordOf(out.template, title, highlight, items);
  if (kw) out.keyword = kw;
  const chars =
    title.length +
    (highlight?.length ?? 0) +
    items.reduce((n, it) => n + it.text.length, 0) +
    (out.columns ?? []).reduce((n, c) => n + c.title.length + (out.template === "define" ? c.items.reduce((x, it) => x + it.text.length, 0) : 0), 0) +
    (out.check ? out.check.stem.length + out.check.answer.length + out.check.options.reduce((n, o) => n + o.text.length, 0) : 0);
  const pieces = Math.max(items.length, (out.check?.options.length ?? 0) + 1);
  out.density = chars > 520 || pieces >= 6 ? "l" : chars > 260 || pieces >= 4 ? "m" : "s";
  out.icon = iconOf(emoji, out.template, role);
  return out;
}

/** نوع المعلومة (لوسم القالب ولونه): مفاتيح video.s.kind.* */
export type KindKey = "define" | "types" | "cond" | "time" | "compare" | "steps" | "points" | "question" | "number" | "text";
export function kindOf(m: Pick<SceneModel, "template" | "title">): KindKey {
  const t = m.title ?? "";
  switch (m.template) {
    case "define":
      return "define";
    case "tree":
      return "types";
    case "range":
      return "time";
    case "compare":
      return "compare";
    case "steps":
      return "steps";
    case "check":
    case "qIntro":
      return "question";
    case "quote":
    case "seal":
      return "text";
    case "stat":
      return /مدة|مدّة|مهلة|أيام|يوم|duration|days/i.test(t) ? "time" : "number";
    default:
      return /شروط|شرط|conditions/i.test(t) ? "cond" : TYPES_RE.test(t) ? "types" : "points";
  }
}

// ===== السؤال =====

const MARK_RE = /^\s*[(\[]?\s*(هـ|[أابجدهوزحطيكلمنسعفصقرشتثخذضظغ]|[a-hA-H]|\d{1,2})\s*[)\]\-–—.:،]\s*/;
const INLINE_MARK_RE = /(?:^|\s)\(\s*(هـ|[أابجدهوزح]|[a-hA-H]|\d{1,2})\s*\)\s*/g;

const normMarker = (m: string) => toLatinDigits(m).replace(/^ا$/, "أ").replace(/^ه$/, "هـ").toLowerCase();

/**
 * السؤال ← { stem, options }. السطر الأول سؤال دائمًا؛ ما بعده خيار إن بدأ برمز (أ) / ب) / ج- / 1. / a)
 * والرمز يُلتقط في marker والنص كاملًا بعده (لا يُحذف منه شيء). سطر بلا رمز بعد خيار = تكملة له،
 * وقبل أول خيار = تكملة للسؤال. بلا أي رمز: ٢–٦ أسطر قصيرة (≤ ٨٠) = خيارات بلا رموز، وإلا تكملة للسؤال.
 * والخيارات في سطر السؤال نفسه «… (أ) … (ب) …» تُفصل أيضًا.
 */
export function parseQuestion(q: string): { stem: string; options: QOption[] } {
  const lines = String(q ?? "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return { stem: "", options: [] };
  if (lines.length === 1) return inlineOptions(lines[0]);
  const [first, ...rest] = lines;
  const marked = rest.some((l) => MARK_RE.test(l));
  if (!marked) {
    if (rest.length >= 2 && rest.length <= 6 && rest.every((l) => l.length <= 80)) return { stem: first, options: rest.map((text) => ({ marker: "", text })) };
    return { stem: lines.join("\n"), options: [] };
  }
  let stem = first;
  const options: QOption[] = [];
  for (const l of rest) {
    const m = l.match(MARK_RE);
    if (m) options.push({ marker: m[1], text: l.slice(m[0].length).trim() || l });
    else if (options.length) options[options.length - 1].text += " " + l;
    else stem += "\n" + l;
  }
  return { stem, options };
}

function inlineOptions(line: string): { stem: string; options: QOption[] } {
  const hits = [...line.matchAll(INLINE_MARK_RE)];
  if (hits.length < 2 || !/^(أ|ا|a|A|1)$/.test(toLatinDigits(hits[0][1]))) return { stem: line, options: [] };
  const stem = line.slice(0, hits[0].index).trim();
  if (!stem) return { stem: line, options: [] };
  const options = hits.map((h, i) => {
    const from = (h.index ?? 0) + h[0].length;
    const to = i + 1 < hits.length ? hits[i + 1].index ?? line.length : line.length;
    return { marker: h[1], text: line.slice(from, to).trim() };
  });
  return options.every((o) => o.text) ? { stem, options } : { stem: line, options: [] };
}

const ANSWER_PREFIX = /^\s*(?:(?:ال)?(?:جواب|إجابة|اجابة|حل)(?:\s+(?:ال)?(?:صحيح|صحيحة))?|(?:the\s+)?(?:correct\s+)?answer(?:\s+is)?)(?=[\s:：\-–]|$)\s*[:：\-–]?\s*(?:(?:هو|هي|is)\s+)?/i;

/**
 * الخيار الصحيح من نص الجواب: بالرمز أولًا («ب»، «(ب) …»، «الجواب: ب»)، ثم بأن نص خيار واحد
 * ورد كلماتٍ كاملة في الجواب. أكثر من خيار أو لا شيء → -1 (لا يُميَّز أي خيار).
 */
export function matchAnswer(options: QOption[], answer: string): number {
  if (!options?.length || !str(answer)) return -1;
  const a = toLatinDigits(answer).trim();
  const rest = a.replace(ANSWER_PREFIX, "");
  const mm =
    rest.match(/^[(\[]\s*(هـ|[ء-ي]|[a-zA-Z]|\d{1,2})\s*[)\]]/) ??
    rest.match(/^(هـ|[ء-ي]|[a-zA-Z]|\d{1,2})\s*(?:[)\]\-–—.:،,]|$)/) ??
    rest.match(/^(هـ|[أابجدهزحطي])\s+/);
  if (mm) {
    const k = normMarker(mm[1]);
    const hits = options.map((o, i) => (o.marker && normMarker(o.marker) === k ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return -1;
  }
  // كلمات كاملة (مع حرف عطف/جر ملتصق: «والشيك»)؛ النص المطبَّع حروف وأرقام ومسافات فقط فلا حاجة للهروب
  const na = normText(a);
  const hits = options
    .map((o, i) => {
      const t = normText(o.text);
      return t.length >= 2 && new RegExp(`(?:^| )[وفبلك]?${t}(?: |$)`).test(na) ? i : -1;
    })
    .filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

// ===== الترجمة كلمةً كلمة =====

export type CaptionState = {
  /** الجملة المنطوقة الآن (التقسيم نفسه الذي كانت تستعمله شاشة الفيديو) */
  sentence: string;
  words: string[];
  /** عدد الكلمات المنطوقة كاملةً في النص كله قبل الكلمة الحالية (لا يتراجع مع تقدّم p) */
  spoken: number;
  /** فهرس الكلمة المنطوقة الآن داخل words (-1 لنص فارغ) */
  current: number;
  /** فهرس الجملة — مفتاح ثابت لحركة تبديل الجملة */
  sIndex: number;
};

export function splitSentences(text: string): string[] {
  const t = String(text ?? "").trim();
  if (!t) return [];
  return t.match(/[^.!؟?،]+[.!؟?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];
}

const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);

/** الجملة والكلمة المنطوقتان عند التقدّم p: الجملة بنسبة الأحرف، ثم الكلمة بنسبة أحرفها داخل الجملة */
export function captionAt(text: string | null | undefined, p: number): CaptionState {
  const sents = splitSentences(text ?? "");
  if (!sents.length) return { sentence: "", words: [], spoken: 0, current: -1, sIndex: 0 };
  const q = clamp01(p);
  const total = sents.reduce((n, x) => n + x.length, 0) || 1;
  let acc = 0;
  let si = sents.length - 1;
  let before = 0;
  let wordsBefore = 0;
  for (let i = 0; i < sents.length; i++) {
    const next = acc + sents[i].length;
    if (next / total >= q || i === sents.length - 1) {
      si = i;
      before = acc;
      break;
    }
    acc = next;
    wordsBefore += wordsOf(sents[i]).length;
  }
  const sentence = sents[si];
  const words = wordsOf(sentence);
  const local = Math.min(sentence.length, Math.max(0, q * total - before));
  let end = 0;
  let current = words.length - 1;
  for (let k = 0; k < words.length; k++) {
    end += words[k].length + (k ? 1 : 0);
    if (end >= local) {
      current = k;
      break;
    }
  }
  return { sentence, words, spoken: wordsBefore + Math.max(0, current), current, sIndex: si };
}

/**
 * جملة طويلة على الشاشة: مقطع متوازن من الكلمات (≤ maxWords) يضم الكلمة الحالية، بفهرسها داخله.
 * المقاطع ثابتة الحدود فلا يقفز النص مع كل كلمة، ولا يتراجع المقطع مع تقدّم p.
 */
export function captionChunk(c: Pick<CaptionState, "words" | "current">, maxWords = 18): { words: string[]; current: number; chunk: number } {
  const n = c.words.length;
  if (n <= maxWords || maxWords < 1) return { words: c.words, current: c.current, chunk: 0 };
  const parts = Math.ceil(n / maxWords);
  const size = Math.ceil(n / parts);
  const chunk = Math.min(parts - 1, Math.floor(Math.max(0, c.current) / size));
  const from = chunk * size;
  return { words: c.words.slice(from, from + size), current: c.current - from, chunk };
}

// ===== حجم الخط والأعمدة (تقدير حتمي) =====

/** متوسط عرض الحرف العربي بالنسبة لحجم الخط، وارتفاع السطر */
export const CHAR_EM = 0.52;
export const LINE_H = 1.45;

export type FitBox = {
  /** عرض النص المتاح (بوحدات اللوحة ١٢٨٠) */
  w: number;
  /** الارتفاع المتاح لكل النصوص معًا */
  h: number;
  /** الفراغ بين النصوص (أو بين الصفوف في الشبكة) */
  gap?: number;
  /** حشوة كل عنصر رأسيًا (من كل جهة) — تُضاف لارتفاعه */
  padY?: number;
  /** حشوة كل خلية أفقيًا (من كل جهة) — تُطرح من عرضها (الشبكة) */
  padX?: number;
  /** الفراغ بين الأعمدة (الشبكة) */
  colGap?: number;
  /** حد الأسطر لكل نص (يطابق numberOfLines) */
  maxLines?: number;
};

/** عدد أسطر نص بعرض w وخط size (السطر الجديد "\n" يبدأ سطرًا) */
export function linesFor(text: string, w: number, size: number): number {
  const cpl = Math.max(1, Math.floor(w / (CHAR_EM * size)));
  return String(text ?? "")
    .split("\n")
    .reduce((n, seg) => n + Math.max(1, Math.ceil((seg.trim().length * 1.06) / cpl)), 0);
}

function stackFits(texts: string[], w: number, h: number, size: number, box: FitBox): boolean {
  let used = 0;
  for (const t of texts) {
    const l = linesFor(t, w, size);
    if (box.maxLines && l > box.maxLines) return false;
    used += l * size * LINE_H + 2 * (box.padY ?? 0);
  }
  used += (box.gap ?? 0) * Math.max(0, texts.length - 1);
  return used <= h;
}

/** أكبر خط (بين base و min) تتسع به كل النصوص فوق بعضها في الصندوق؛ لا ينزل عن min */
export function fitFont(texts: string[], box: FitBox, base: number, min: number): number {
  const hi = Math.max(base, min);
  const lo = Math.min(base, min);
  const w = Math.max(1, box.w - 2 * (box.padX ?? 0));
  for (let size = hi; size >= lo; size -= 1) if (stackFits(texts, w, box.h, size, box)) return size;
  return lo;
}

function gridHeight(texts: string[], cols: number, size: number, box: FitBox): { h: number; over: boolean } {
  const cellW = Math.max(1, (box.w - (box.colGap ?? 0) * (cols - 1)) / cols - 2 * (box.padX ?? 0));
  let h = 0;
  let over = false;
  const rows = Math.ceil(texts.length / cols);
  for (let r = 0; r < rows; r++) {
    let rowH = 0;
    for (const t of texts.slice(r * cols, r * cols + cols)) {
      const l = linesFor(t, cellW, size);
      if (box.maxLines && l > box.maxLines) over = true;
      rowH = Math.max(rowH, l * size * LINE_H + 2 * (box.padY ?? 0));
    }
    h += rowH;
  }
  h += (box.gap ?? 0) * Math.max(0, rows - 1);
  return { h, over };
}

/**
 * الشبكة الأنسب: عدد الأعمدة (١..maxCols) الذي يعطي أكبر خط يتسع فيه كل شيء (عند التساوي الأقل أعمدة).
 * إن لم يتسع شيء حتى عند min: min بالأعمدة الأقل ارتفاعًا. الطول الزائد يُحل بالأعمدة لا بالتصغير وحده.
 */
export function fitGrid(texts: string[], box: FitBox, base: number, min: number, maxCols = 2): { size: number; cols: number; rows: number } {
  const n = texts.length;
  if (!n) return { size: Math.max(base, min), cols: 1, rows: 0 };
  const hi = Math.max(base, min);
  const lo = Math.min(base, min);
  const top = Math.max(1, Math.min(maxCols, n));
  let best: { size: number; cols: number } | null = null;
  for (let cols = 1; cols <= top; cols++) {
    for (let size = hi; size >= lo; size -= 1) {
      const g = gridHeight(texts, cols, size, box);
      if (!g.over && g.h <= box.h) {
        if (!best || size > best.size) best = { size, cols };
        break;
      }
    }
  }
  if (!best) {
    let cols = 1;
    let least = Infinity;
    for (let c = 1; c <= top; c++) {
      const h = gridHeight(texts, c, lo, box).h;
      if (h < least) {
        least = h;
        cols = c;
      }
    }
    best = { size: lo, cols };
  }
  return { ...best, rows: Math.ceil(n / best.cols) };
}

// ===== الشكل في «منوّع» =====

const CINE_ROLES = new Set<SceneRole>(["check", "finalQ", "finalEx", "qIntro"]);
const EDIT_TEMPLATES = new Set<Template>(["stat", "range", "seal", "groups", "quote", "define"]);
const VISUAL_TEMPLATES = new Set<Template>(["list", "cards", "steps", "compare", "tree"]);

/**
 * الشكل لكل مشهد: الاختيار نفسه إن لم يكن «منوّع». وفي «منوّع»: السينمائي للأسئلة وتمهيدها،
 * والمجلة للافتتاح والخلاصة والأرقام والتعريفات والنصوص، والبصري للقوائم والتفرّعات والمقارنات.
 */
export function pickTheme(pref: SlideThemePref, m: Pick<SceneModel, "role" | "template">): SlideTheme {
  if (pref !== "mixed") return pref === "editorial" || pref === "visual" || pref === "cinematic" ? pref : "editorial";
  if (CINE_ROLES.has(m.role)) return "cinematic";
  if (m.role === "cover" || m.role === "summary") return "editorial";
  if (EDIT_TEMPLATES.has(m.template)) return "editorial";
  if (VISUAL_TEMPLATES.has(m.template)) return "visual";
  if (m.template === "check" || m.template === "qIntro") return "cinematic";
  return "editorial";
}
