// lib/ai.ts
// مساعد الذكاء الاصطناعي عبر Supabase Edge Function: ai-assist
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
  | "fixspacing";

export type Slide = { emoji: string; title: string; bullets: string[] };

/** يولّد شرائح عرض تقديمي من نص (عنوان + نقاط + إيموجي). */
export async function generateSlides(text: string): Promise<Slide[]> {
  const raw = await aiAssist("slides", text);
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
// الهيكل الساكن: حروف عربية فقط (بلا تشكيل/تطويل/مسافات/ترقيم) — يُعرّف الكلمات
function consonantSkeleton(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ْٰ]/g, "") // إزالة الحركات والتنوين والسكون والألف الخنجرية
    .replace(/ـ/g, "") // التطويل
    .replace(/[^ء-ي0-9٠-٩]/g, ""); // أبقِ الحروف العربية والأرقام فقط
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
export async function fixArabicSpacing(text: string): Promise<string> {
  if (!text.trim() || !looksRunTogether(text)) return text;
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
    body: { action: "define", question: w, text: context.slice(0, 600) },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return String(data?.result ?? "").trim();
}

/** يطلب من Claude (عبر السيرفر) تلخيص النص أو الإجابة عن سؤال أو توليد اختبار. */
export async function aiAssist(
  action: AiAction,
  text: string,
  question?: string
): Promise<string> {
  if (!text.trim()) return "";

  const { data, error } = await supabase.functions.invoke("ai-assist", {
    body: { action, text, question },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return String(data?.result ?? "");
}

/** يولّد بطاقات مراجعة (سؤال/إجابة) من نص عبر الذكاء. */
export async function generateFlashcards(
  text: string
): Promise<{ front: string; back: string }[]> {
  const raw = await aiAssist("flashcards", text);
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
