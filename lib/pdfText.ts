// lib/pdfText.ts
// استخراج نص صفحة من PDF — مع تخزين دائم في قاعدة البيانات (page_cache):
//  1) إن كان نص الصفحة مخزّنًا → نُرجعه فورًا (سريع، بدون تكلفة).
//  2) وإلا: نستخرج من الطبقة النصية (pdf-extract-text)، وإن كانت الصفحة
//     بلا نص حقيقي (كتاب مصوّر) → OCR عبر ocr-page، ثم نخزّن النتيجة.
import { cleanupText } from "./ai";
import { supabase } from "./supabase";

export type PageText = {
  page: number;
  totalPages: number;
  text: string;
  ocr?: boolean;
};

// أقل من هذا الطول يعني أن الصفحة بلا نص حقيقي (غالبًا صورة ممسوحة أو علامة مائية)
const MIN_REAL_TEXT = 40;

/** يجلب نص صفحة محددة (تبدأ من 1) من ملف PDF مخزّن في bucket: pdfs */
export async function extractPdfPageText(
  pdfPath: string,
  page = 1
): Promise<PageText> {
  if (!pdfPath) return { page: 1, totalPages: 0, text: "" };

  // 1) مخزّن مسبقًا؟ أرجعه فورًا
  try {
    const { data } = await supabase
      .from("page_cache")
      .select("text,total_pages,source")
      .eq("pdf_path", pdfPath)
      .eq("page", page)
      .maybeSingle();
    if (data?.text && String(data.text).trim().length >= MIN_REAL_TEXT) {
      return {
        page,
        totalPages: Number(data.total_pages ?? 0),
        text: String(data.text),
        ocr: data.source === "ocr",
      };
    }
  } catch {
    // لا يوجد تخزين أو خطأ شبكة → نُكمل بالاستخراج
  }

  // 2) استخراج من الطبقة النصية
  let resolvedPage = page;
  let totalPages = 0;
  let text = "";
  let usedOcr = false;

  const { data, error } = await supabase.functions.invoke("pdf-extract-text", {
    body: { pdfPath, page },
  });
  if (!error && !data?.error) {
    resolvedPage = Number(data?.page ?? page);
    totalPages = Number(data?.totalPages ?? 0);
    text = String(data?.text ?? "");
  }

  // 3) لا يوجد نص حقيقي → OCR (كتاب مصوّر)
  if (text.trim().length < MIN_REAL_TEXT) {
    try {
      const ocr = await supabase.functions.invoke("ocr-page", {
        body: { pdfPath, page: resolvedPage },
      });
      const ocrText = String(ocr.data?.text ?? "").trim();
      if (!ocr.error && ocrText.length >= MIN_REAL_TEXT) {
        text = ocrText;
        usedOcr = true;
        if (ocr.data?.totalPages) totalPages = Number(ocr.data.totalPages);
      }
    } catch {
      // تجاهل
    }
  }

  // 4) نظّف النص بالذكاء (يصلح المسافات وأخطاء المسح) قبل التخزين
  if (text.trim().length >= MIN_REAL_TEXT) {
    text = await cleanupText(text);
  }

  // 5) خزّن النتيجة الجيدة للمرات القادمة (نص نظيف)
  if (text.trim().length >= MIN_REAL_TEXT) {
    try {
      await supabase.from("page_cache").upsert({
        pdf_path: pdfPath,
        page: resolvedPage,
        text,
        total_pages: totalPages,
        source: usedOcr ? "ocr" : "text",
      });
    } catch {
      // التخزين اختياري — لا نفشل القراءة بسببه
    }
  }

  if (error && text.trim().length === 0) throw error;

  return { page: resolvedPage, totalPages, text, ocr: usedOcr };
}
