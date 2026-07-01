// lib/ai.ts
// مساعد الذكاء الاصطناعي عبر Supabase Edge Function: ai-assist
import { getCurrentLang } from "./i18n";
import { supabase } from "./supabase";

export type AiAction =
  | "summarize"
  | "ask"
  | "quiz"
  | "flashcards"
  | "cleanup"
  | "syllabus"
  | "unitquiz"
  | "translate"
  | "mindmap"
  | "tashkeel"
  | "slides"
  | "filternoise"
  | "fixspacing"
  | "moderate";

export type Slide = { emoji: string; title: string; bullets: string[] };

export type Moderation = { allowed: boolean; category: string; advice: string };

/** يفحص نص الكتاب ضد سياسة المحتوى. عند فشل الذكاء يسمح (طبقة أفضل-جهد، لا تعطّل الرفع). */
export async function moderateContent(text: string): Promise<Moderation> {
  const ok = { allowed: true, category: "", advice: "" };
  if (!text.trim()) return ok;
  try {
    const raw = await aiAssist("moderate", text);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return ok;
    const obj = JSON.parse(m[0]);
    return {
      allowed: obj?.allowed !== false, // مسموح افتراضيًا إلا إذا صرّح بالرفض
      category: String(obj?.category ?? "").trim(),
      advice: String(obj?.advice ?? "").trim(),
    };
  } catch {
    return ok; // فشل تقني → لا نمنع المستخدم
  }
}

/** يولّد شرائح عرض تقديمي من نص (عنوان + نقاط + إيموجي) بلغة الواجهة. */
export async function generateSlides(text: string, lang: "ar" | "en" | "fr" = "ar"): Promise<Slide[]> {
  const raw = await aiAssist("slides", text, undefined, lang);
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s: any) => ({
        emoji: String(s?.emoji ?? "📌").trim() || "📌",
        title: String(s?.title ?? "").trim(),
        bullets: Array.isArray(s?.bullets) ? s.bullets.map((b: any) => String(b).trim()).filter(Boolean) : [],
      }))
      .filter((s: Slide) => s.title || s.bullets.length);
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
export async function aiAssist(
  action: AiAction,
  text: string,
  question?: string,
  targetLang?: string, // رمز اللغة الهدف (للترجمة يختاره المستخدم؛ وإلا لغة الواجهة)
  count?: number // عدد مطلوب من البطاقات/الأسئلة (للتوليد المخصّص)
): Promise<string> {
  if (!text.trim()) return "";

  // بلا لغة صريحة → نتبع لغة الواجهة، فتخرج كل مولّدات الذكاء بلغة المستخدم.
  const lang = targetLang ?? getCurrentLang();

  // مهلة قصوى 60ث: إن لم يردّ السيرفر نرمي خطأً بدل ترك الواجهة معلّقة للأبد.
  const { data, error } = await withTimeout(
    supabase.functions.invoke("ai-assist", {
      body: { action, text, question, targetLang: lang, count },
    }),
    60000,
    action
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return String(data?.result ?? "");
}

/** يولّد بطاقات مراجعة (سؤال/إجابة) من نص عبر الذكاء (بعدد اختياري). */
export async function generateFlashcards(
  text: string,
  count?: number
): Promise<{ front: string; back: string }[]> {
  const raw = await aiAssist("flashcards", text, undefined, undefined, count);
  // استخرج مصفوفة JSON حتى لو لفّها الموديل بنص أو ```json
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c: any) => ({ front: String(c?.front ?? "").trim(), back: String(c?.back ?? "").trim() }))
      .filter((c) => c.front && c.back);
  } catch {
    return [];
  }
}
