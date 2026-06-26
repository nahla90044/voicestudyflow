// lib/pdfText.ts
// استخراج نص صفحة من PDF — مع تخزين دائم في قاعدة البيانات (page_cache):
//  1) إن كان نص الصفحة مخزّنًا → نُرجعه فورًا (سريع، بدون تكلفة).
//  2) وإلا: نستخرج من الطبقة النصية (pdf-extract-text)، وإن كانت الصفحة
//     بلا نص حقيقي (كتاب مصوّر) → OCR عبر ocr-page، ثم نخزّن النتيجة.
import { filterReadingNoise } from "./ai";
import { supabase } from "./supabase";

// إصدار الاستخراج. أي تغيير هنا يُبطل الكاش القديم ويعيد المعالجة.
// v2: إزالة «تنظيف» الذكاء (أمانة النص).  v3: تنقية الضجيج فقط بتحقّق صارم
// (لا يغيّر أي كلمة — انظر filterReadingNoise).
const EXTRACT_VER = "-v3";

// يوحّد أحرف العرض العربية المعزولة (ﻣ ﻘ) إلى صورتها القياسية (م ق) ليعيد المحرّك ربطها
function normalizeArabic(s: string): string {
  try {
    return s.normalize("NFKC");
  } catch {
    return s;
  }
}

export type PageText = {
  page: number;
  totalPages: number;
  text: string;
  ocr?: boolean;
};

// صندوق إحداثيات كلمة (مُطبَّع 0..1 نسبةً لأبعاد الصفحة)
export type WordBox = { t: string; x: number; y: number; w: number; h: number };

/** يجلب صناديق إحداثيات كلمات صفحة (للهايلايتر الدقيق والعدسة). */
export async function getPageWords(pdfPath: string, page: number): Promise<WordBox[]> {
  if (!pdfPath) return [];
  try {
    const { data, error } = await supabase.functions.invoke("pdf-extract-text", {
      body: { pdfPath, page },
    });
    if (error || data?.error) return [];
    const ws = (data as { words?: WordBox[] })?.words;
    return Array.isArray(ws) ? ws : [];
  } catch {
    return [];
  }
}

// أقل من هذا الطول يعني أن الصفحة بلا نص حقيقي (غالبًا صورة ممسوحة أو علامة مائية)
const MIN_REAL_TEXT = 40;

/** يجلب نص صفحة محددة (تبدأ من 1) من ملف PDF مخزّن في bucket: pdfs */
export async function extractPdfPageText(
  pdfPath: string,
  page = 1
): Promise<PageText> {
  if (!pdfPath) return { page: 1, totalPages: 0, text: "" };

  // 1) مخزّن مسبقًا (بالإصدار الحالي فقط)؟ أرجعه فورًا
  //    الإصدارات القديمة (التي مرّت على «تنظيف» بالذكاء) نتجاهلها ونعيد الاستخراج
  //    حرفيًا حفاظًا على أمانة النص.
  try {
    const { data } = await supabase
      .from("page_cache")
      .select("text,total_pages,source")
      .eq("pdf_path", pdfPath)
      .eq("page", page)
      .maybeSingle();
    if (data && typeof data.source === "string" && data.source.endsWith(EXTRACT_VER)) {
      const cachedText = String(data.text ?? "");
      const real = cachedText.trim().length >= MIN_REAL_TEXT && !data.source.startsWith("empty");
      return {
        page,
        totalPages: Number(data.total_pages ?? 0),
        text: real ? cachedText : "",
        ocr: data.source.startsWith("ocr"),
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

  // أمانة النص: نُطبّع أحرف العرض المعزولة (NFKC). لا تغيير لأي كلمة.
  if (text) text = normalizeArabic(text);
  const hasRealText = text.trim().length >= MIN_REAL_TEXT;

  // إن فشل الاستخراج تمامًا (خطأ شبكة) ولا نص → لا نخزّن علامة دائمة، نرمي الخطأ
  if (error && !hasRealText) throw error;

  // تنقية الضجيج فقط (أرقام صفحات/ترويسات/إحالات) بتحقّق صارم: لا يُغيّر أي كلمة،
  // وإن لم يجتز التحقّق يرجع النص الأصلي حرفيًا. (يُعالَج مرّة ويُخزَّن.)
  if (hasRealText) {
    text = normalizeArabic(await filterReadingNoise(text));
  } else {
    text = ""; // صفحة فارغة/غلاف/علامة مائية فقط
  }

  // خزّن النتيجة (بعلامة الإصدار الحالي) حتى لا نعيد المعالجة
  try {
    await supabase.from("page_cache").upsert({
      pdf_path: pdfPath,
      page: resolvedPage,
      text,
      total_pages: totalPages,
      source: (hasRealText ? (usedOcr ? "ocr" : "text") : "empty") + EXTRACT_VER,
    });
  } catch {
    // التخزين اختياري — لا نفشل القراءة بسببه
  }

  return { page: resolvedPage, totalPages, text, ocr: usedOcr };
}
