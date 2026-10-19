// lib/perks.ts
// حد الكتب المجاني، وتسجيل إنهاء الكتاب (books.completed_at) للتهنئة والإحصاء فقط.
// لا مكافآت: كل زيادة بالاشتراك (قرار نهلة ١٩ أكتوبر ٢٠٢٦).
import { getUserId, isOwner } from "./auth";
import { getPlan } from "./plan";
import { supabase } from "./supabase";

/** حد الكتب المجاني (ثابت: لا مكافآت ولا وعود — كل زيادة بالاشتراك). */
export const FREE_BOOKS_BASE = 3;

/** حدّ الكتب الحالي للمستخدم (Infinity للمالك والمشتركين). */
export async function getBookLimit(): Promise<number> {
  if (await isOwner()) return Infinity;
  const plan = await getPlan();
  if (plan === "plus" || plan === "pro" || plan === "premium") return Infinity;
  return FREE_BOOKS_BASE;
}

export type CompletionResult = {
  /** أول مرة يُسجَّل فيها إنهاء هذا الكتاب (لا نكرّر الاحتفال). */
  firstTime: boolean;
};

/**
 * يسجّل أن المستخدم أنهى كتابًا. آمن للاستدعاء المتكرّر (idempotent).
 * يرجع firstTime إن سُجّل إنهاء هذا الكتاب الآن (لا نكرّر التهنئة).
 */
export async function markBookCompleted(bookId?: string): Promise<CompletionResult> {
  const none: CompletionResult = { firstTime: false };
  if (!bookId) return none;

  try {
    const uid = await getUserId();

    // هل الكتاب مُسجَّل كمنتهٍ من قبل؟ (نتجنّب تكرار الاحتفال)
    const { data: book, error: readErr } = await supabase
      .from("books")
      .select("id, completed_at")
      .eq("id", bookId)
      .eq("user_id", uid)
      .maybeSingle();
    if (readErr || !book) return none;
    if (book.completed_at) return none;


    const { error: upErr } = await supabase
      .from("books")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", bookId)
      .eq("user_id", uid);
    if (upErr) return none;

    return { firstTime: true };
  } catch {
    return none; // فشل الشبكة لا يجوز أن يكسر القراءة
  }
}
