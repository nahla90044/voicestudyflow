// lib/ai.ts
// مساعد الذكاء الاصطناعي عبر Supabase Edge Function: ai-assist
import { getCurrentLang } from "./i18n";
import { refreshUsage, requestPaywall } from "./plan";
import { fetch as streamFetch } from "expo/fetch";

import { APP_VERSION, SUPABASE_FUNCTIONS_URL, SUPABASE_PUBLIC_KEY, supabase } from "./supabase";
import { checkSecurity } from "./security";
import { recordPerf } from "./perf";

export type AiAction =
  | "videoscript"
  | "studysummary"
  | "summarize"
  | "ask"
  | "quiz"
  | "flashcards"
  | "cleanup"
  | "syllabus"
  | "unitquiz"
  | "translate"
  | "mindmap"
  | "mindtree"
  | "tashkeel"
  | "ocrtashkeel"
  | "slides"
  | "unitslides"
  | "filternoise"
  | "fixspacing"
  | "moderate";

/** تخطيطات الشرائح (بأسلوب Gamma): يختار الذكاء الأنسب لمحتوى كل شريحة */
export type SlideLayout = "cover" | "list" | "cards" | "steps" | "compare" | "stat" | "quote" | "summary";
export const SLIDE_LAYOUTS: SlideLayout[] = ["cover", "list", "cards", "steps", "compare", "stat", "quote", "summary"];
export type SlideColumn = { title: string; bullets: string[] };
export type Slide = {
  emoji: string;
  title: string;
  bullets: string[];
  /** غائب في العروض القديمة → يُستنتج عند العرض */
  layout?: SlideLayout;
  /** رقم/مصطلح بارز (stat)، أو جملة مقتبسة (quote)، أو سطر تعريفي (cover) */
  highlight?: string;
  /** عمودا المقارنة (compare) */
  columns?: SlideColumn[];
};

/** التخطيط الفعلي: المحدد من الذكاء، أو مستنتج للعروض القديمة */
export function resolveLayout(s: Slide, index: number, total: number): SlideLayout {
  if (s.layout) return s.layout;
  if (index === 0 && total > 1) return "cover";
  if (index === total - 1 && total > 2) return "summary";
  if (s.bullets.filter((b) => splitHead(b).head).length >= 2) return "cards";
  return "list";
}

/** «عنوان: شرح» → جزآن (النقطتان في أول ٤٠ حرفًا فقط) */
export function splitHead(b: string): { head: string; body: string } {
  const i = b.search(/[:：]/);
  if (i > 0 && i <= 40) return { head: b.slice(0, i).trim(), body: b.slice(i + 1).trim() };
  return { head: "", body: b };
}

export type BookCheck = { status: "allow" | "reject" | "error"; category?: string; advice?: string };

/** فحص الكتاب الإلزامي على السيرفر بعد رفعه وقبل أي معالجة (أوامر خفية، صور مخلة، سياسة المحتوى) */
export async function checkBook(pdfPath: string): Promise<BookCheck> {
  try {
    const { data, error } = await withTimeout(supabase.functions.invoke("book-check", { body: { pdfPath } }), 150000, "book-check");
    if (error) return { status: "error" };
    checkSecurity(data);
    const d = data as { status?: string; category?: string; advice?: string };
    if (d?.status === "allow") return { status: "allow" };
    if (d?.status === "reject") return { status: "reject", category: d.category, advice: d.advice };
    return { status: "error" };
  } catch (e) {
    if ((e as Error).message === "ACCOUNT_LOCKED") return { status: "reject" };
    return { status: "error" };
  }
}

/** يولّد شرائح عرض تقديمي من نص (عنوان + نقاط + إيموجي) بلغة الواجهة. */
/** عرض تقديمي لوحدة كاملة (نص عدة صفحات) — شرائح أكثر تغطي الوحدة بترتيبها */
export async function generateUnitSlides(text: string, lang: "ar" | "en" | "fr" = "ar"): Promise<Slide[]> {
  return parseSlides(await aiAssist("unitslides", text, undefined, lang));
}

export async function generateSlides(text: string, lang: "ar" | "en" | "fr" = "ar"): Promise<Slide[]> {
  return parseSlides(await aiAssist("slides", text, undefined, lang));
}

function parseSlides(raw: string): Slide[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  const strs = (v: any): string[] => (Array.isArray(v) ? v.map((x: any) => String(x).trim()).filter(Boolean) : []);
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s: any): Slide => {
        const out: Slide = {
          emoji: String(s?.emoji ?? "📌").trim() || "📌",
          title: String(s?.title ?? "").trim(),
          bullets: strs(s?.bullets),
        };
        const highlight = String(s?.highlight ?? "").trim();
        if (highlight) out.highlight = highlight;
        const columns: SlideColumn[] = Array.isArray(s?.columns)
          ? s.columns.map((c: any) => ({ title: String(c?.title ?? "").trim(), bullets: strs(c?.bullets) })).filter((c: SlideColumn) => c.title || c.bullets.length)
          : [];
        let layout = SLIDE_LAYOUTS.includes(s?.layout) ? (s.layout as SlideLayout) : undefined;
        // تخطيط بلا بياناته اللازمة → قائمة عادية (لا شريحة فارغة)
        if (layout === "compare") {
          if (columns.length >= 2) out.columns = columns.slice(0, 2);
          else layout = "list";
          if (layout === "list" && !out.bullets.length) out.bullets = columns.flatMap((c) => c.bullets);
        }
        if ((layout === "stat" || layout === "quote") && !highlight) layout = "list";
        if (layout) out.layout = layout;
        return out;
      })
      .filter((s: Slide) => s.title || s.bullets.length || s.columns?.length);
  } catch {
    return [];
  }
}

/** ينظّف نصًا مستخرجًا آليًا (يصلح المسافات وأخطاء OCR) دون تغيير المعنى. */
// يزيل مقدمات يضيفها الموديل أحيانًا مثل «النص المصحّح:» من بداية النص
function stripPreamble(s: string): string {
  return s.replace(/^\s*[^\n]*النص[^\n]*مصح[^\n]*\n+/u, "").trim();
}

export async function cleanupText(text: string): Promise<string> {
  if (!text.trim()) return text;
  try {
    const out = stripPreamble(await aiAssist("cleanup", text));
    return out || text;
  } catch {
    return text; // عند الفشل نُرجع النص كما هو
  }
}

/** ينظّف النص ويرمي خطأً إن تعذّر الذكاء (ليعرف المستدعي أنه غير منظَّف فلا يخزّنه). */
export async function cleanupTextStrict(text: string): Promise<string> {
  if (!text.trim()) return text;
  const out = stripPreamble(await aiAssist("cleanup", text));
  if (!out.trim()) throw new Error("empty cleanup");
  return out;
}

/* -------- تنقية نص القراءة من الضجيج (بتحقّق صارم يمنع تغيير أي كلمة) -------- */
// يوحّد للمقارنة: يزيل التشكيل والمسافات وكل ما ليس حرفًا/رقمًا
function normForCheck(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
// هل b تتابع جزئي من a؟ (يعني b نتجت من a بحذف فقط — لا إضافة ولا تغيير)
function isSubsequence(sub: string, full: string): boolean {
  let i = 0;
  for (let j = 0; j < full.length && i < sub.length; j++) {
    if (full[j] === sub[i]) i++;
  }
  return i === sub.length;
}
// آمن فقط إذا: المخرجات حذفت ضجيجًا (تتابع جزئي من الأصل) ولم تحذف أكثر من اللازم
function isSafeFilter(original: string, filtered: string): boolean {
  const a = normForCheck(original);
  const b = normForCheck(filtered);
  if (!b) return false;
  if (b.length < a.length * 0.6) return false; // حُذف محتوى كثير → مرفوض
  return isSubsequence(b, a);
}

/**
 * ينقّي نص الصفحة من الضجيج (أرقام صفحات/ترويسات/إحالات/علامات مائية) عبر الذكاء،
 * **مع تحقّق صارم مرتين**: لا يَقبل المخرجات إلا إذا كانت حذفًا للضجيج فقط دون
 * تغيير أو إضافة أي كلمة. وإلا يُرجع النص الأصلي حرفيًا (أمان تام).
 */
export async function filterReadingNoise(text: string): Promise<string> {
  if (!text.trim()) return text;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = stripPreamble(await aiAssist("filternoise", text));
      if (out.trim() && isSafeFilter(text, out)) return out.trim();
    } catch {
      break; // الذكاء غير متاح → النص الأصلي
    }
  }
  return text; // لم يجتز التحقّق → النص الأصلي حرفيًا
}

/* -------- إصلاح المسافات (للنص الملتصق) بضمان عدم تغيير أي كلمة -------- */
// الهيكل الساكن: حروف عربية فقط (بلا تشكيل/تطويل/مسافات/ترقيم) — يُعرّف الكلمات.
// نوحّد الفروقات الناتجة عن الاستخراج (ياء/كاف فارسية، صور الألف، الألف المقصورة)
// حتى لا يُرفض تصحيح المسافات بسببها — مع بقاء ضمان عدم تغيير الكلمات الفعلية.
function consonantSkeleton(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ْٰ]/g, "") // الحركات والتنوين والسكون والألف الخنجرية
    .replace(/ـ/g, "") // التطويل
    .replace(/[يىئیۍېﯼ]/g, "ي") // كل صور الياء/الألف المقصورة → ي
    .replace(/[كکڪ]/g, "ك") // الكاف الفارسية → ك
    .replace(/[أإآٱ]/g, "ا") // صور الألف بالهمزة → ا
    .replace(/ؤ/g, "و")
    .replace(/[ةه]/g, "ه") // التاء المربوطة والهاء (شكلهما يلتبس في الاستخراج)
    .replace(/[^ابتثجحخدذرزسشصضطظعغفقكلمنهوي0-9٠-٩]/g, ""); // الحروف الأساسية والأرقام
}
// هل النص ملتصق (كلمات بلا مسافات كافية)؟
function looksRunTogether(text: string): boolean {
  const letters = (text.match(/[ء-ي]/g) || []).length;
  const spaces = (text.match(/\s/g) || []).length;
  if (letters < 60) return false; // قصير → لا داعي
  return spaces / letters < 0.08; // أقل من مسافة لكل ~12 حرفًا = ملتصق
}

/**
 * يصلح مسافات النص العربي الملتصق (ومواضع التشكيل) عبر الذكاء، **بضمان صارم**:
 * يقبل المخرجات فقط إذا كان الهيكل الساكن (الحروف الأصلية وترتيبها) مطابقًا تمامًا
 * للأصل — أي لم تتغيّر أي كلمة، فقط المسافات/التشكيل. وإلا يُرجع النص كما هو.
 * يُطبَّق فقط عند اكتشاف نص ملتصق.
 */
export async function fixArabicSpacing(text: string, force = false): Promise<string> {
  if (!text.trim()) return text;
  if (!force && !looksRunTogether(text)) return text;
  const skeleton = consonantSkeleton(text);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = stripPreamble(await aiAssist("fixspacing", text));
      if (out.trim() && consonantSkeleton(out) === skeleton) return out.trim();
    } catch {
      break;
    }
  }
  return text; // لم يجتز التحقّق → النص الأصلي حرفيًا
}

/** يُرجع معنى كلمة حسب سياقها في الجملة (قاموس ذكي). */
export async function defineWord(word: string, context: string): Promise<string> {
  const w = word.trim();
  if (!w) return "";
  const { data, error } = await supabase.functions.invoke("ai-assist", {
    // targetLang = لغة الواجهة → معنى الكلمة يتبع لغة التطبيق (إنجليزي لواجهة إنجليزية)
    body: { action: "define", question: w, text: context.slice(0, 240), targetLang: getCurrentLang() },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  // نريد معنى بسيط فقط — ننظّف أي ماركداون/تنسيق قد يضيفه النموذج
  return String(data?.result ?? "")
    .replace(/[#*_`>]+/g, "") // رموز الماركداون
    .replace(/^\s*[-•]\s*/gm, "") // نقاط القوائم
    .replace(/\n{2,}/g, "\n") // أسطر فارغة زائدة
    .trim();
}

/** سباق بين وعد وبين مهلة زمنية — يمنع بقاء الواجهة معلّقة إن تأخّر السيرفر/الشبكة. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms)
    ),
  ]);
}

/** يطلب من Claude (عبر السيرفر) تلخيص النص أو الإجابة عن سؤال أو توليد اختبار. */
/**
 * طلب ذكاء ببثّ مباشر (الملخّص الشامل): onText يُستدعى بالنص المتراكم كلما وصل جزء،
 * فتعرض الواجهة الأقسام المكتملة فورًا. يعيد النص الكامل. مهلة: لا جديد خلال ٤٥ث → خطأ.
 */
export async function aiAssistStream(action: AiAction, text: string, onText: (soFar: string) => void, targetLang?: string): Promise<string> {
  const lang = targetLang ?? getCurrentLang();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_PUBLIC_KEY;
  const ctrl = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => ctrl.abort(), 45000);
  };
  arm();
  try {
    const res = await streamFetch(`${SUPABASE_FUNCTIONS_URL}/ai-assist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLIC_KEY,
        "x-vsf-version": APP_VERSION,
      },
      body: JSON.stringify({ action, text, targetLang: lang, stream: true }),
      signal: ctrl.signal,
    });
    const type = res.headers.get("content-type") ?? "";
    // ردّ JSON بدل البثّ = خطأ أو انتهاء الحصة
    if (!res.ok || type.includes("application/json")) {
      const j = (await res.json().catch(() => ({}))) as { userQuota?: boolean; error?: string };
      checkSecurity(j);
      if (j?.userQuota) {
        requestPaywall("ai");
        throw new Error("USER_QUOTA");
      }
      throw new Error(j?.error || `HTTP_${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("NO_STREAM");
    const dec = new TextDecoder();
    let all = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      all += dec.decode(value, { stream: true });
      onText(all);
    }
    all += dec.decode();
    const err = all.match(/\[\[STREAM_ERROR:([^\]]*)\]\]/);
    if (err) throw new Error(err[1] || "STREAM_ERROR");
    setTimeout(refreshUsage, 800);
    return all;
  } finally {
    if (idle) clearTimeout(idle);
  }
}

export async function aiAssist(
  action: AiAction,
  text: string,
  question?: string,
  targetLang?: string, // رمز اللغة الهدف (للترجمة يختاره المستخدم؛ وإلا لغة الواجهة)
  count?: number, // عدد مطلوب من البطاقات/الأسئلة (للتوليد المخصّص)
  timeoutMs = 60000, // الملخّص الشامل لوحدة كاملة يحتاج أطول
  cardType?: string, // نوع البطاقات (flashcards فقط)
  userQuestion?: string, // سؤال المستخدم كما كتبه (لوكيل حماية «كتابك يجيب»)
  askContext?: { bookId?: string; bookTitle?: string; recent?: string[] } // سياق يُحفظ مع المخالفة للتوثيق
): Promise<string> {
  if (!text.trim()) return "";

  // بلا لغة صريحة → نتبع لغة الواجهة، فتخرج كل مولّدات الذكاء بلغة المستخدم.
  const lang = targetLang ?? getCurrentLang();

  // مهلة قصوى 60ث: إن لم يردّ السيرفر نرمي خطأً بدل ترك الواجهة معلّقة للأبد.
  const aiT0 = Date.now();
  const { data, error } = await withTimeout(
    supabase.functions.invoke("ai-assist", {
      body: { action, text, question, targetLang: lang, count, cardType, userQuestion, askContext },
    }),
    timeoutMs,
    action
  );

  recordPerf(`ai.${action}`, Date.now() - aiT0, !error && !data?.error, text.length);
  if (error) throw error;
  checkSecurity(data);
  if (data?.userQuota) {
    // انتهت طلبات الشهر لهذا المستخدم → عرض الاشتراك (إن كان الشراء متاحًا)
    requestPaywall("ai");
    throw new Error("USER_QUOTA");
  }
  if (data?.error) throw new Error(data.error);

  setTimeout(refreshUsage, 800); // العدّادات الظاهرة تتحدّث
  return String(data?.result ?? "");
}

/** يخلط خيارات بطاقة الاختيار من متعدد (النموذج يميل لوضع الصحيح أولًا) */
function shuffleCard(c: GenCard): GenCard {
  const right = c.opts![c.ans!];
  const opts = [...c.opts!];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { ...c, opts, ans: opts.indexOf(right) };
}

/** يولّد بطاقات مراجعة (سؤال/إجابة) من نص عبر الذكاء (بعدد اختياري). */
/** نوع البطاقات المولّدة (يختاره الطالب). الصور التوضيحية لمعاني الكلمات فقط */
export type CardType = "words" | "definitions" | "qa" | "compare" | "tf" | "fill" | "mcq";
/** «منوّعة»: من كل الأنواع بطلب واحد (كل بطاقة تحمل نوعها) */
export type CardChoice = CardType | "mixed";
export const CARD_TYPES: CardChoice[] = ["mixed", "words", "definitions", "qa", "compare", "tf", "fill", "mcq"];
const BASE_TYPES: CardType[] = ["words", "definitions", "qa", "compare", "tf", "fill", "mcq"];

export type GenCard = { front: string; back: string; opts?: string[]; ans?: number; kind: CardType };

export async function generateFlashcards(
  text: string,
  count?: number,
  cardType: CardChoice = "qa"
): Promise<GenCard[]> {
  const raw = await aiAssist("flashcards", text, undefined, undefined, count, undefined, cardType);
  // استخرج مصفوفة JSON حتى لو لفّها الموديل بنص أو ```json
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c: any): GenCard => {
        const kind: CardType = cardType === "mixed" ? (BASE_TYPES.includes(c?.kind) ? c.kind : "qa") : cardType;
        const card: GenCard = { front: String(c?.front ?? "").trim(), back: String(c?.back ?? "").trim(), kind };
        const opts = Array.isArray(c?.opts) ? c.opts.map((o: unknown) => String(o).trim()).filter(Boolean) : [];
        const ans = Number(c?.ans);
        if (kind === "tf") return { ...card, opts: ["صح", "خطأ"], ans: ans === 1 ? 1 : 0 };
        if (kind === "mcq" && opts.length >= 2 && Number.isInteger(ans) && ans >= 0 && ans < opts.length) return shuffleCard({ ...card, opts, ans });
        return card;
      })
      // اختيار من متعدد بلا خيارات صالحة لا يُحفظ (بطاقة ناقصة)
      .filter((c) => c.front && c.back && (c.kind !== "mcq" || !!c.opts));
  } catch {
    return [];
  }
}
