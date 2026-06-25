// lib/ai.ts
// مساعد الذكاء الاصطناعي عبر Supabase Edge Function: ai-assist
import { supabase } from "./supabase";

export type AiAction = "summarize" | "ask" | "quiz" | "flashcards" | "cleanup";

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
