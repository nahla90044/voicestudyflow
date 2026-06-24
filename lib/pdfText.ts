// lib/pdfText.ts
// استخراج نص صفحة من PDF عبر Supabase Edge Function: pdf-extract-text
// إن كانت الصفحة بلا نص حقيقي (كتاب مصوّر/Scan) نرجع تلقائيًا إلى OCR
// عبر دالة ocr-page (تحويل الصفحة لصورة ثم Google Vision).
import { supabase } from "./supabase";

export type PageText = {
  page: number;
  totalPages: number;
  text: string;
  ocr?: boolean; // هل النص ناتج عن OCR؟
};

// أقل من هذا الطول يعني أن الصفحة بلا نص حقيقي (غالبًا صورة ممسوحة أو علامة مائية)
const MIN_REAL_TEXT = 40;

/** يجلب نص صفحة محددة (تبدأ من 1) من ملف PDF مخزّن في bucket: pdfs */
export async function extractPdfPageText(
  pdfPath: string,
  page = 1
): Promise<PageText> {
  if (!pdfPath) return { page: 1, totalPages: 0, text: "" };

  let resolvedPage = page;
  let totalPages = 0;
  let text = "";

  const { data, error } = await supabase.functions.invoke("pdf-extract-text", {
    body: { pdfPath, page },
  });

  if (!error && !data?.error) {
    resolvedPage = Number(data?.page ?? page);
    totalPages = Number(data?.totalPages ?? 0);
    text = String(data?.text ?? "");
  } else if (error) {
    // قد تفشل الدالة لكن نُكمل لمحاولة OCR قبل أن نرمي الخطأ
    text = "";
  }

  // لا يوجد نص حقيقي → جرّب OCR (كتاب مصوّر)
  if (text.trim().length < MIN_REAL_TEXT) {
    try {
      const ocr = await supabase.functions.invoke("ocr-page", {
        body: { pdfPath, page: resolvedPage },
      });
      const ocrText = String(ocr.data?.text ?? "").trim();
      if (!ocr.error && ocrText.length >= MIN_REAL_TEXT) {
        return {
          page: Number(ocr.data?.page ?? resolvedPage),
          totalPages: Number(ocr.data?.totalPages ?? totalPages),
          text: ocrText,
          ocr: true,
        };
      }
    } catch {
      // تجاهل وأرجع نتيجة الاستخراج العادي
    }
  }

  // إن فشل الاستخراج العادي ولم ينجح OCR، ارمِ الخطأ الأصلي
  if (error && text.trim().length === 0) throw error;

  return { page: resolvedPage, totalPages, text };
}
