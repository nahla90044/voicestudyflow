// lib/ai.ts
// مساعد الذكاء الاصطناعي عبر Supabase Edge Function: ai-assist
import { supabase } from "./supabase";

export type AiAction = "summarize" | "ask" | "quiz" | "flashcards" | "cleanup";

/** ينظّف نصًا مستخرجًا آليًا (يصلح المسافات وأخطاء OCR) دون تغيير المعنى. */
export async function cleanupText(text: string): Promise<string> {
  if (!text.trim()) return text;
  try {
    const out = await aiAssist("cleanup", text);
    return out.trim() || text;
  } catch {
    return text; // عند الفشل نُرجع النص كما هو
  }
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
