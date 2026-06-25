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
  | "slides";

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
