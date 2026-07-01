// lib/savedStudy.ts
// سجلّ المحفوظات (ملخّصات/اختبارات) ليتصفّحها المستخدم من تبويب «البطاقات» مثل
// البطاقات تمامًا. المحتوى نفسه مخزَّن في unitContent؛ هنا نحفظ فهرسًا خفيفًا
// (كتاب + عنوان + مرجع الصفحة/الوحدة) لعرضه وإعادة فتحه. محلّي — يُمسح عند تسجيل
// الخروج مثل باقي بيانات المستخدم، فلا تسريب بين الحسابات.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SavedKind = "summary" | "quiz";

export type SavedItem = {
  key: string; // فريد: kind|pdf|page/unit
  kind: SavedKind;
  pdfPath: string;
  bookTitle: string; // لتجميعها حسب الكتاب
  label: string; // عنوان العنصر (عنوان الوحدة أو «الصفحة N»)
  page?: number; // وضع القارئ (صفحة)
  unit?: number; // وضع المنهج (وحدة)
  savedAt: number;
};

const KEY = "vsf:savedstudy:v1";

export async function getSavedItems(kind?: SavedKind): Promise<SavedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: SavedItem[] = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    return kind ? arr.filter((i) => i.kind === kind) : arr;
  } catch {
    return [];
  }
}

/** يسجّل عنصرًا محفوظًا (يزيل المكرّر بنفس المفتاح ويضعه في المقدّمة). */
export async function addSavedItem(item: SavedItem): Promise<void> {
  try {
    const all = await getSavedItems();
    const next = [item, ...all.filter((i) => i.key !== item.key)].slice(0, 500);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // الفهرس اختياري — لا نُفشل العملية إن تعذّر
  }
}
