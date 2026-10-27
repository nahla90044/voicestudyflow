// lib/studyKind.ts
// نوع دراسة الكتاب (عادية/لغة/شهادة) لطلبات الذكاء: يُقرأ من منهج الكتاب مرة ويُحفظ في الذاكرة،
// ويُرسل مع طلبات الملخّص والفيديو والاختبار فيضيف السيرفر لكتب اللغة شرح القواعد والاقتران،
// ولكتب الشهادات المصطلحات بمقابلها الإنجليزي والأسئلة الحسابية بحل مفصّل (قرار ٢٧ أكتوبر).
import { studyKindOf, type StudyKind } from "./studyKindCore";
import { supabase } from "./supabase";

type Info = { kind: StudyKind; exam?: string };
const memo = new Map<string, Info>();

export async function getStudyInfo(pdfPath: string): Promise<Info> {
  const hit = memo.get(pdfPath);
  if (hit) return hit;
  try {
    const { data } = await supabase.from("book_syllabus").select("data").eq("pdf_path", pdfPath).maybeSingle();
    const k = studyKindOf(data?.data as { kind?: unknown; exam?: unknown } | null);
    const info = { kind: k.kind, exam: k.exam };
    memo.set(pdfPath, info);
    return info;
  } catch {
    return { kind: "general" };
  }
}

export async function getStudyKind(pdfPath: string): Promise<StudyKind> {
  return (await getStudyInfo(pdfPath)).kind;
}

/** بعد أن يغيّر الطالب النوع أو يؤكده */
export function rememberStudyKind(pdfPath: string, kind: StudyKind, exam?: string): void {
  memo.set(pdfPath, { kind, exam });
}

/** حقل study لطلب الذكاء: لكتب اللغة والشهادات فقط (العادية بلا حقل، فلا تتغير بصمة أجزائها ولا رصيدها) */
export async function studyExtra(pdfPath: string): Promise<{ study?: string; exam?: string }> {
  const i = await getStudyInfo(pdfPath);
  if (i.kind === "language") return { study: "language" };
  if (i.kind === "cert") return { study: "cert", ...(i.exam ? { exam: i.exam } : {}) };
  return {};
}
