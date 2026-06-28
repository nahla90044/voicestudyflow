// lib/account.ts
// عمليات الحساب الحسّاسة: إعادة ضبط بيانات المستخدم، والحذف النهائي للحساب.
// كل العمليات مقصورة على بيانات المستخدم نفسه (RLS + user_id/pdf_path).
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getUserId, signOut } from "./auth";
import { supabase } from "./supabase";

// مفاتيح التخزين المحلي التي تُمحى عند إعادة الضبط/الحذف (نُبقي اللغة ومعرّف الجهاز).
const LOCAL_KEYS_TO_CLEAR = [
  "vsf:stats:v1",
  "vsf:flashcards:v1",
  "vsf:reminder:enabled",
  "vsf:reminder:hour",
  "vsf_books_usage",
  "vsf_plan",
  "vsf_minutes_per_page",
  "settings:user_name",
  "settings:focus_mode",
  "settings:min_per_page",
  "settings:theme_id",
];

/** يحذف كل بيانات المستخدم السحابية (كتب، خطط، أحداث، كاش، مناهج، ملفات). */
async function deleteCloudData(uid: string): Promise<void> {
  // 1) ملفات PDF داخل مجلّد المستخدم
  try {
    const { data: files } = await supabase.storage.from("pdfs").list(uid);
    if (files?.length) {
      await supabase.storage.from("pdfs").remove(files.map((f) => `${uid}/${f.name}`));
    }
  } catch {
    // نتجاهل — قد لا تكون هناك ملفات
  }
  // 2) صفوف قاعدة البيانات (الكتب تتسلسل تلقائيًا للخطط والجلسات)
  await supabase.from("books").delete().eq("user_id", uid);
  await supabase.from("study_plans").delete().eq("user_id", uid); // أي خطة بلا كتاب
  await supabase.from("student_events").delete().eq("user_id", uid);
  // page_cache و book_syllabus مفتاحهما pdf_path يبدأ بمعرّف المستخدم
  await supabase.from("page_cache").delete().like("pdf_path", `${uid}/%`);
  await supabase.from("book_syllabus").delete().like("pdf_path", `${uid}/%`);
}

/** يمسح التخزين المحلي (الإحصاءات، البطاقات، الإعدادات) — يُبقي اللغة. */
async function clearLocalData(): Promise<void> {
  await AsyncStorage.multiRemove(LOCAL_KEYS_TO_CLEAR).catch(() => {});
}

/**
 * إعادة ضبط الحساب: حذف كل الكتب والخطط والتقدّم (سحابيًا ومحليًا) مع الإبقاء
 * على الحساب وتسجيل الدخول. يعود التطبيق كأنه جديد.
 */
export async function resetAccountData(): Promise<void> {
  const uid = await getUserId();
  await deleteCloudData(uid);
  await clearLocalData();
}

/**
 * حذف الحساب نهائيًا: تُنفَّذ على السيرفر (دالة delete-account) لحذف بيانات
 * المستخدم وحساب المصادقة نفسه عبر مفتاح الخدمة، ثم نُسجّل الخروج ونمسح المحلي.
 */
export async function deleteAccountPermanently(): Promise<void> {
  // الخادم يحذف صفوف المستخدم وملفاته وحساب auth بالكامل (verify_jwt يضمن الهوية)
  const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
  await clearLocalData();
  await signOut();
}
