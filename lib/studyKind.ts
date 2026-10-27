// lib/studyKind.ts
// نوع دراسة الكتاب (عادية/لغة/شهادة) لطلبات الذكاء: يُقرأ من منهج الكتاب مرة ويُحفظ في الذاكرة،
// ويُرسل مع طلبات الملخّص والفيديو فيضيف السيرفر لكتب اللغة شرح القواعد والاقتران (قرار ٢٧ أكتوبر).
import { studyKindOf, type StudyKind } from "./studyKindCore";
import { supabase } from "./supabase";

const memo = new Map<string, StudyKind>();

export async function getStudyKind(pdfPath: string): Promise<StudyKind> {
  const hit = memo.get(pdfPath);
  if (hit) return hit;
  try {
    const { data } = await supabase.from("book_syllabus").select("data").eq("pdf_path", pdfPath).maybeSingle();
    const k = studyKindOf(data?.data as { kind?: unknown } | null).kind;
    memo.set(pdfPath, k);
    return k;
  } catch {
    return "general";
  }
}

/** بعد أن يغيّر الطالب النوع أو يؤكده */
export function rememberStudyKind(pdfPath: string, kind: StudyKind): void {
  memo.set(pdfPath, kind);
}

/** حقل study لطلب الذكاء: لكتب اللغة فقط (غيرها بلا حقل، فلا تتغير بصمة أجزائها ولا رصيدها) */
export async function studyExtra(pdfPath: string): Promise<{ study?: string }> {
  return (await getStudyKind(pdfPath)) === "language" ? { study: "language" } : {};
}
