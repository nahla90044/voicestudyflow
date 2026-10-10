// lib/perks.ts
// مكافأة إنهاء الكتاب: أول كتاب يُنهيه المستخدم يرفع حدّه المجاني من ٣ إلى ١٠ كتب.
//
// لماذا على السيرفر؟ لأن المكافأة تخصّ المستخدم لا الجهاز — لو غيّر جواله أو
// أعاد تثبيت التطبيق يجب أن تبقى معه. مصدر الحقيقة هو عمود books.completed_at
// (يحميه RLS)، ونحتفظ بنسخة محلية للقراءة الفورية بلا انتظار الشبكة.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getUserId, isOwner } from "./auth";
import { getPlan } from "./plan";
import { supabase } from "./supabase";

/** الحد المجاني قبل إنهاء أي كتاب. */
export const FREE_BOOKS_BASE = 3;
/** الحد المجاني بعد إنهاء أول كتاب. */
export const FREE_BOOKS_UNLOCKED = 10;

// مفتاح محلي لكل مستخدم — حتى لا يرث حسابٌ مكافأةَ حساب آخر على نفس الجهاز
const unlockKey = (uid: string) => `vsf:perk:booksUnlocked:${uid}`;

/**
 * هل فُتح الحد الموسّع لهذا المستخدم؟
 * تقرأ الكاش المحلي أولًا (فوري)، ثم تتحقّق من السيرفر وتحدّث الكاش.
 */
export async function hasUnlockedMoreBooks(): Promise<boolean> {
  let uid = "";
  try {
    uid = await getUserId();
  } catch {
    return false;
  }

  const cached = await AsyncStorage.getItem(unlockKey(uid)).catch(() => null);
  if (cached === "1") return true; // المكافأة لا تُسحب أبدًا → الكاش الموجب نهائي

  try {
    const { count, error } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .not("completed_at", "is", null);
    if (error) return false;
    const unlocked = (count ?? 0) > 0;
    if (unlocked) await AsyncStorage.setItem(unlockKey(uid), "1").catch(() => {});
    return unlocked;
  } catch {
    return false; // انقطاع شبكة → نبقى على الحد الأساسي بدل منح مكافأة وهمية
  }
}

/** حدّ الكتب الحالي للمستخدم (Infinity للمالك). */
export async function getBookLimit(): Promise<number> {
  if (await isOwner()) return Infinity;
  const plan = await getPlan();
  if (plan === "plus" || plan === "pro" || plan === "premium") return Infinity;
  return (await hasUnlockedMoreBooks()) ? FREE_BOOKS_UNLOCKED : FREE_BOOKS_BASE;
}

export type CompletionResult = {
  /** أول مرة يُسجَّل فيها إنهاء هذا الكتاب (لا نكرّر الاحتفال). */
  firstTime: boolean;
  /** هذا الكتاب هو الذي فتح الحد الموسّع → اعرض نافذة المكافأة. */
  justUnlocked: boolean;
};

/**
 * يسجّل أن المستخدم أنهى كتابًا. آمن للاستدعاء المتكرّر (idempotent).
 * يرجع ما إذا كان هذا أول إنهاء على الإطلاق حتى تعرض الواجهة نافذة المكافأة.
 */
export async function markBookCompleted(bookId?: string): Promise<CompletionResult> {
  const none: CompletionResult = { firstTime: false, justUnlocked: false };
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

    // هل هذا أول كتاب يُنهيه أصلًا؟ (نسأل قبل التسجيل)
    const { count: before } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .not("completed_at", "is", null);

    const { error: upErr } = await supabase
      .from("books")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", bookId)
      .eq("user_id", uid);
    if (upErr) return none;

    const justUnlocked = (before ?? 0) === 0;
    if (justUnlocked) await AsyncStorage.setItem(unlockKey(uid), "1").catch(() => {});
    return { firstTime: true, justUnlocked };
  } catch {
    return none; // فشل الشبكة لا يجوز أن يكسر القراءة
  }
}
