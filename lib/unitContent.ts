// lib/unitContent.ts
// تخزين محلي لمحتوى وحدات المنهج المولّد بالذكاء (ملخّص/اختبار/خريطة ذهنية) لكل
// طالب على جهازه. الهدف: يُولَّد المحتوى **مرة واحدة** لكل وحدة ثم يُسترجع فورًا،
// فلا نستهلك الذكاء الاصطناعي مرارًا لنفس الموضوع لنفس الطالب.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCurrentLang } from "./i18n";

// summary/quiz/mindmap: لوحدات المنهج · pagesummary/pagequiz: لصفحة القارئ الحالية
// studysummary/pagestudysummary = المستوى «الشامل» (وما حُفظ قبل المستويات بأسلوب الكتاب)؛
// expand*/brief* = المستويان «الموسّع» و«المختصر» (٢١ أكتوبر)
export type UnitContentKind = "summary" | "quiz" | "mindmap" | "pagesummary" | "pagequiz" | "glossary" | "studysummary" | "pagestudysummary" | "expandsummary" | "pageexpandsummary" | "briefsummary" | "pagebriefsummary" | "finalsummary" | "pagefinalsummary" | "studysummarypart" | "video" | "videopart";

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

/** يحذف كل محتوى نوعٍ لهذا الكتاب يحقق شرطًا على رقمه (مثل أجزاء ملخّص وحدة عند إعادة التلخيص) */
export async function removeUnitContentWhere(pdfPath: string, kind: UnitContentKind, match: (unit: number) => boolean): Promise<void> {
  try {
    const prefix = `unitc:${kind}:${getCurrentLang()}:${hashKey(pdfPath)}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix) && match(Number(k.slice(prefix.length))));
    if (keys.length) await AsyncStorage.multiRemove(keys);
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

/**
 * يعيد ترقيم/يحذف محتوى نوعٍ لهذا الكتاب دفعة واحدة: map(رقم) → رقم جديد للنقل، أو null للحذف،
 * أو undefined للإبقاء. يقرأ المتأثر كله أولًا ثم يحذفه ثم يكتبه بمفاتيحه الجديدة (لا تصادم بين القديم والجديد).
 */
export async function remapUnitContent(pdfPath: string, kind: UnitContentKind, map: (code: number) => number | null | undefined): Promise<void> {
  try {
    const prefix = `unitc:${kind}:${getCurrentLang()}:${hashKey(pdfPath)}:`;
    const moves = (await AsyncStorage.getAllKeys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ k, to: map(Number(k.slice(prefix.length))) }))
      .filter((m) => m.to !== undefined);
    if (!moves.length) return;
    const values = new Map(await AsyncStorage.multiGet(moves.map((m) => m.k)));
    await AsyncStorage.multiRemove(moves.map((m) => m.k));
    const sets = moves
      .filter((m) => m.to !== null && values.get(m.k) != null)
      .map((m) => [prefix + m.to, values.get(m.k)!] as [string, string]);
    if (sets.length) await AsyncStorage.multiSet(sets);
  } catch {
    // التخزين المحلي اختياري
  }
}

/** أرقام كل ما حُفظ من نوعٍ لهذا الكتاب (بلغة الواجهة الحالية) */
export async function listUnitContentCodes(pdfPath: string, kind: UnitContentKind): Promise<number[]> {
  try {
    const prefix = `unitc:${kind}:${getCurrentLang()}:${hashKey(pdfPath)}:`;
    return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length))).filter(Number.isFinite);
  } catch {
    return [];
  }
}
