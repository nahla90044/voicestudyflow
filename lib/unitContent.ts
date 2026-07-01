// lib/unitContent.ts
// تخزين محلي لمحتوى وحدات المنهج المولّد بالذكاء (ملخّص/اختبار/خريطة ذهنية) لكل
// طالب على جهازه. الهدف: يُولَّد المحتوى **مرة واحدة** لكل وحدة ثم يُسترجع فورًا،
// فلا نستهلك الذكاء الاصطناعي مرارًا لنفس الموضوع لنفس الطالب.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCurrentLang } from "./i18n";

// summary/quiz/mindmap: لوحدات المنهج · pagesummary/pagequiz: لصفحة القارئ الحالية
export type UnitContentKind = "summary" | "quiz" | "mindmap" | "pagesummary" | "pagequiz";

// تجزئة FNV-1a لاسم مفتاح ثابت قصير من مسار الـPDF
function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function keyFor(pdfPath: string, unit: number, kind: UnitContentKind): string {
  // نضمّن لغة الواجهة في المفتاح: تبديل اللغة يعيد التوليد بلغة المستخدم بدل عرض
  // محتوى مخزَّن بلغة قديمة (كتاب إنجليزي بواجهة إنجليزية → محتوى إنجليزي).
  return `unitc:${kind}:${getCurrentLang()}:${hashKey(pdfPath)}:${unit}`;
}

/** يُرجع المحتوى المخزَّن لهذه الوحدة إن وُجد، أو null. */
export async function getUnitContent<T>(
  pdfPath: string,
  unit: number,
  kind: UnitContentKind
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(pdfPath, unit, kind));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** يحذف المحتوى المخزَّن لهذه الوحدة/الصفحة (عند حذف الملخّص/الاختبار). */
export async function removeUnitContent(
  pdfPath: string,
  unit: number,
  kind: UnitContentKind
): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(pdfPath, unit, kind));
  } catch {
    // نتجاهل
  }
}

/** يخزّن المحتوى المولّد لهذه الوحدة محليًا لإعادة استخدامه بلا تكلفة ذكاء. */
export async function setUnitContent<T>(
  pdfPath: string,
  unit: number,
  kind: UnitContentKind,
  data: T
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(pdfPath, unit, kind), JSON.stringify(data));
  } catch {
    // التخزين اختياري — لا نُفشل العملية إن تعذّر
  }
}
