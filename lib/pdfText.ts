// lib/pdfText.ts
// استخراج نص صفحة من PDF — مع تخزين دائم في قاعدة البيانات (page_cache):
//  1) إن كان نص الصفحة مخزّنًا → نُرجعه فورًا (سريع، بدون تكلفة).
//  2) وإلا: نستخرج من الطبقة النصية (pdf-extract-text)، وإن كانت الصفحة
//     بلا نص حقيقي (كتاب مصوّر) → OCR عبر ocr-page، ثم نخزّن النتيجة.
import { fixArabicSpacing } from "./ai";
import { supabase } from "./supabase";

// تنقية ضجيج فورية (بلا إنترنت/ذكاء) — أسرع بكثير. تحذف الأسطر غير المحتوى فقط
// (أرقام صفحات، سلاسل نقاط، علامات مائية، مراجع الصور) دون تغيير أي كلمة.
function stripNoise(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    // إزالة الإيميلات والروابط المحقونة (علامات ناشر/دعاية تُحشر في كل صفحة)
    .map((l) =>
      l
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ")
        .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    )
    .filter((l) => {
      if (!l) return false;
      if (/^[:\s\-_.|]+$/.test(l)) return false; // رموز فقط
      if (/restricted|confidential|property and money/i.test(l)) return false;
      if (/^صورة\s*[\(（]/.test(l)) return false; // مراجع الصور: «صورة (10-1)»
      if (/^[٠-٩\d\s.\-/]+$/.test(l)) return false; // أرقام فقط (صفحات/تواريخ مفردة)
      return true;
    })
    .map((l) => l.replace(/:{2,}/g, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// إصدار الاستخراج. أي تغيير هنا يُبطل الكاش القديم ويعيد المعالجة.
// v2: إزالة «تنظيف» الذكاء.  v3: تنقية الضجيج.  v4: إصلاح المسافات.
// v5: استخدام OCR تلقائيًا للكتب ذات طبقة النص المكسورة (أنظف نص).
// v10: تصحيح آيات القرآن بمرجعها مع نص المصحف الموثّق.
// v11: إزالة الإيميلات والروابط الدعائية المحقونة في الصفحات.
// v12: كشف تشويش الترميز (mojibake) في الطبقة النصية → لجوء تلقائي لـOCR.
const EXTRACT_VER = "-v12";

// مرجع آية: «[السورة : رقم]» أو «(السورة: رقم)» — بوّابة رخيصة قبل استدعاء التصحيح
const QURAN_REF_RE = /[[(]\s*[ء-ي][ء-ي\s]{2,}\s*[:：]\s*[٠-٩\d]{1,3}\s*[\])]/;

/** يصحّح آيات القرآن في الصفحة بمطابقتها بنص المصحف (سيرفر) — فقط لو فيها مرجع آية. */
async function correctQuranIfNeeded(text: string): Promise<string> {
  if (!text || !QURAN_REF_RE.test(text)) return text;
  try {
    const { data, error } = await supabase.functions.invoke("quran-correct", { body: { text } });
    const fixed = (data as { text?: string })?.text;
    return !error && typeof fixed === "string" && fixed.trim().length > 0 ? fixed : text;
  } catch {
    return text; // فشل التصحيح غير حرج — نُبقي النص كما هو
  }
}

// طبقة نص «مكسورة»: نسبة كبيرة من أحرف العرض العربية (presentation forms:
// FB50–FDFF و FE70–FEFF). هذه الكتب تُستخرج بمسافات خاطئة وتشكيل مبعثر،
// فنفضّل OCR على صورة الصفحة (نص أنظف وأدقّ).
function hasBrokenTextLayer(raw: string): boolean {
  if (!raw) return false;
  // \u0646\u0648\u0639 \u0661: \u0623\u0634\u0643\u0627\u0644 \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0645\u0639\u0632\u0648\u0644\u0629 (\u0637\u0628\u0642\u0629 \u0646\u0635 \u0639\u0631\u0628\u064A\u0629 \u0645\u0643\u0633\u0648\u0631\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644)
  const pf = (raw.match(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const ar = (raw.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  if (ar > 40 && pf / ar > 0.2) return true;
  // \u0646\u0648\u0639 \u0662: \u062A\u0634\u0648\u064A\u0634 \u0627\u0644\u062A\u0631\u0645\u064A\u0632 (mojibake) \u2014 \u0639\u0631\u0628\u064A \u0645\u064F\u0631\u0645\u064E\u0651\u0632 \u0643\u0623\u062D\u0631\u0641 \u0644\u0627\u062A\u064A\u0646\u064A\u0629-\u0639\u0644\u064A\u0627 \u063A\u0631\u064A\u0628\u0629
  //         \u0645\u062B\u0644 \u00AB\u00FF\u00DF\u0178\u00D1\u2026\u00BB \u0641\u064A \u0628\u0639\u0636 \u0643\u062A\u0628 PDF \u0627\u0644\u0639\u0631\u0628\u064A\u0629 (\u062E\u0637\u0648\u0637 \u0628\u062A\u0631\u0645\u064A\u0632 \u0645\u062E\u0635\u0651\u0635).
  const moji = (raw.match(/[\u0080-\u00FF\u0152-\u0192\u02C6-\u02DC]/g) || []).length;
  const letters = (raw.match(/\p{L}/gu) || []).length;
  if (letters > 40 && moji / letters > 0.12) return true;
  return false;
}

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

/** يجلب صناديق إحداثيات كلمات صفحة (للهايلايتر الدقيق والعدسة).
 *  نفضّل مربّعات Google Vision دائمًا لأنها الأدقّ (تتعامل مع RTL والكتب المصوّرة).
 *  طبقة نص الـPDF غير موثوقة: كثير من الكتب المصوّرة فيها طبقة «خربانة» بمواقع غلط
 *  لكنها غنية بالعدد، فلا نقدر نميّزها بالعدد — لذلك Vision أولًا. */
export async function getPageWords(pdfPath: string, page: number): Promise<WordBox[]> {
  if (!pdfPath) return [];

  // 1) Google Vision أولًا — مواقع دقيقة بترتيب القراءة الصحيح
  try {
    const { data, error } = await supabase.functions.invoke("ocr-page", {
      body: { pdfPath, page },
    });
    if (!error) {
      const vw = (data as { words?: WordBox[] })?.words;
      if (Array.isArray(vw) && vw.length >= 8) return vw;
    }
  } catch {
    // نرجع لطبقة الـPDF
  }

  // 2) احتياط: طبقة نص الـPDF (للكتب النصية الأصلية أو إن تعذّر Vision)
  try {
    const { data, error } = await supabase.functions.invoke("pdf-extract-text", {
      body: { pdfPath, page },
    });
    if (!error && !data?.error) {
      const ws = (data as { words?: WordBox[] })?.words;
      if (Array.isArray(ws)) return ws;
    }
  } catch {
    // لا شيء
  }

  return [];
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

  // 3) متى نلجأ للـOCR؟
  //   (أ) لا نص حقيقي (كتاب مصوّر)، أو
  //   (ب) طبقة النص «مكسورة»: تستخدم أشكال العرض العربية (presentation forms)
  //       التي تأتي بمسافات خاطئة وتشكيل مبعثر — صورة الصفحة تُقرأ بـOCR أنظف بكثير.
  const brokenLayer = hasBrokenTextLayer(text);
  if (text.trim().length < MIN_REAL_TEXT || brokenLayer) {
    // OCR على صورة الصفحة — مع إعادة محاولة (الخدمة قد تفشل لحظيًا تحت الضغط)
    for (let attempt = 0; attempt < 3 && !usedOcr; attempt++) {
      try {
        const ocr = await supabase.functions.invoke("ocr-page", {
          body: { pdfPath, page: resolvedPage },
        });
        const ocrText = String(ocr.data?.text ?? "").trim();
        if (!ocr.error && ocrText.length >= MIN_REAL_TEXT) {
          text = ocrText; // نص الصورة الفعلي — نظيف ومطابق للمطبوع
          usedOcr = true;
          if (ocr.data?.totalPages) totalPages = Number(ocr.data.totalPages);
        }
      } catch {
        // فشل لحظي — نعيد المحاولة
      }
      if (!usedOcr && attempt < 2) await new Promise((r) => setTimeout(r, 1300));
    }
    // طبقة مكسورة وتعذّر OCR نهائيًا → لا نقبل النص الفاسد ولا نخزّنه؛ نرمي ليُعاد
    // لاحقًا (التحميل يعيد المحاولة تلقائيًا حتى ينجح).
    if (brokenLayer && !usedOcr) {
      throw new Error("تعذّر تجهيز هذه الصفحة الآن — أعيدي المحاولة، أو اضغطي «تحميل» ليُجهّز الكتاب كاملًا.");
    }
  }

  // أمانة النص: نُطبّع أحرف العرض المعزولة (NFKC). لا تغيير لأي كلمة.
  if (text) text = normalizeArabic(text);
  const hasRealText = text.trim().length >= MIN_REAL_TEXT;

  // إن فشل الاستخراج تمامًا (خطأ شبكة) ولا نص → لا نخزّن علامة دائمة، نرمي الخطأ
  if (error && !hasRealText) throw error;

  // معالجة بتحقّق صارم (لا تغيّر أي كلمة) وتُخزَّن مرّة:
  //   1) إصلاح المسافات إن كان النص ملتصقًا (يحافظ على الهيكل الساكن).
  //   2) تنقية الضجيج (أرقام صفحات/ترويسات/إحالات) — حذف فقط.
  // كلتاهما تُرجعان النص الأصلي إن لم يجتز التحقّق.
  // صفحة معظمها «صورة» (غلاف/مخطط): لها تعليق «صورة (X-Y)» ونصّها قليل ومبعثر
  // (مقروء من الزخرفة) → لا نقرأها، نتخطّاها للصفحة التي فيها نص حقيقي.
  const isFigurePage =
    /صورة\s*[\(（]\s*[\d٠-٩]/.test(text) && text.replace(/\s+/g, " ").trim().length < 500;

  if (hasRealText && !isFigurePage) {
    // إصلاح خفيف للمسافات إن لزم (للنص الملتصق فقط، بتحقّق صارم) + تنقية فورية
    text = stripNoise(normalizeArabic(await fixArabicSpacing(text)));
    // تصحيح آيات القرآن الكريم بمرجعها (لا يخطئ في كلام الله)
    text = await correctQuranIfNeeded(text);
  } else {
    text = ""; // صفحة فارغة/غلاف/صورة فقط → تُتخطّى عند القراءة
  }

  // خزّن النتيجة (بعلامة الإصدار الحالي) حتى لا نعيد المعالجة
  try {
    await supabase.from("page_cache").upsert({
      pdf_path: pdfPath,
      page: resolvedPage,
      text,
      total_pages: totalPages,
      source: (text.trim().length >= MIN_REAL_TEXT ? (usedOcr ? "ocr" : "text") : "empty") + EXTRACT_VER,
    });
  } catch {
    // التخزين اختياري — لا نفشل القراءة بسببه
  }

  return { page: resolvedPage, totalPages, text, ocr: usedOcr };
}
