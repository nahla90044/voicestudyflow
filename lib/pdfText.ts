// lib/pdfText.ts
// استخراج نص صفحة من PDF عبر Supabase Edge Function: pdf-extract-text
import { supabase } from "./supabase";

export type PageText = {
  page: number;
  totalPages: number;
  text: string;
};

/** يجلب نص صفحة محددة (تبدأ من 1) من ملف PDF مخزّن في bucket: pdfs */
export async function extractPdfPageText(
  pdfPath: string,
  page = 1
): Promise<PageText> {
  if (!pdfPath) return { page: 1, totalPages: 0, text: "" };

  const { data, error } = await supabase.functions.invoke("pdf-extract-text", {
    body: { pdfPath, page },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return {
    page: Number(data?.page ?? page),
    totalPages: Number(data?.totalPages ?? 0),
    text: String(data?.text ?? ""),
  };
}
