// lib/savedStudy.ts
// سجلّ المحفوظات (ملخّصات/اختبارات) ليتصفّحها المستخدم من تبويب «البطاقات» مثل
// البطاقات تمامًا. المحتوى نفسه مخزَّن في unitContent؛ هنا نحفظ فهرسًا خفيفًا
// (كتاب + عنوان + مرجع الصفحة/الوحدة) لعرضه وإعادة فتحه. محلّي — يُمسح عند تسجيل
// الخروج مثل باقي بيانات المستخدم، فلا تسريب بين الحسابات.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SavedKind = "summary" | "quiz" | "video";

export type SavedItem = {
  key: string; // فريد: kind|pdf|page/unit
  kind: SavedKind;
  pdfPath: string;
  bookTitle: string; // لتجميعها حسب الكتاب
  label: string; // عنوان العنصر (عنوان الوحدة أو «الصفحة N») — قابل لإعادة التسمية
  page?: number; // وضع القارئ (صفحة)
  unit?: number; // وضع المنهج (وحدة)
  from?: number; // نطاق صفحات (وحدة من القارئ بلا منهج)
  to?: number;
  /** مستوى الملخّص (مختصر/شامل/موسّع) — بلا قيمة = شامل */
  level?: "brief" | "strict" | "expand" | "final" | "simple";
  /** لغة شرح الفيديو (ar/en/fr) — فيديو كل لغة ونوع عنصر مستقل */
  lang?: string;
  /** فيديو قيد التجهيز (لم تكتمل أجزاؤه بعد؛ ما اكتمل محفوظ ويكمل من حيث توقف) */
  partial?: boolean;
  savedAt: number;
  studied?: boolean; // أُشِّر كمدروس من القائمة
  archived?: boolean; // منقول إلى الأرشيف
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

/** يعدّل حقول عنصر محفوظ (تسمية/تأشير كمدروس/أرشفة). */
export async function updateSavedItem(key: string, patch: Partial<SavedItem>): Promise<void> {
  try {
    const all = await getSavedItems();
    const next = all.map((i) => (i.key === key ? { ...i, ...patch } : i));
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // نتجاهل
  }
}

/** يحذف عنصرًا محفوظًا واحدًا من الفهرس. */
export async function removeSavedItem(key: string): Promise<void> {
  try {
    const all = await getSavedItems();
    await AsyncStorage.setItem(KEY, JSON.stringify(all.filter((i) => i.key !== key)));
  } catch {
    // نتجاهل
  }
}

/** يحذف كل محفوظات كتاب من نوع معيّن (كل ملخّصاته أو كل اختباراته). */
export async function removeSavedForBook(pdfPath: string, kind: SavedKind): Promise<void> {
  try {
    const all = await getSavedItems();
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify(all.filter((i) => !(i.pdfPath === pdfPath && i.kind === kind)))
    );
  } catch {
    // نتجاهل
  }
}

/**
 * بعد حذف وحدات من المنهج: محفوظات الوحدات تتبع أرقامها الجديدة (map → رقم جديد)،
 * ومحفوظات الوحدات المحذوفة تُزال (map → null). محفوظات الصفحات والنطاقات لا تتأثر.
 */
export async function remapSavedUnits(pdfPath: string, map: (unit: number) => number | null): Promise<void> {
  try {
    const all = await getSavedItems();
    const next: SavedItem[] = [];
    for (const it of all) {
      const ofUnit = it.pdfPath === pdfPath && it.unit != null && it.key.endsWith(`|u${it.unit}`);
      if (!ofUnit) {
        next.push(it);
        continue;
      }
      const to = map(it.unit!);
      if (to === null) continue;
      next.push({ ...it, unit: to, key: `${it.kind}|${pdfPath}|u${to}` });
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // الفهرس اختياري
  }
}
