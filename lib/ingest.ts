// lib/ingest.ts
// تجهيز الكتاب كامل: يمرّ على كل الصفحات ويستخرج/يحوّل نصها ويخزّنها
// (عبر extractPdfPageText الذي يخزّن في page_cache). المخزّن يبقى محفوظًا في
// قاعدة البيانات، فالتحميل قابل للاستئناف. عند انقطاع النت يعيد المحاولة تلقائيًا
// (backoff) حتى يرجع النت ويكمل. يتخطّى المخزّن بسرعة.
import { extractPdfPageText } from "./pdfText";

let runToken = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** يوقف أي تجهيز جارٍ. */
export function stopIngest() {
  runToken++;
}

/**
 * يجهّز كل صفحات الكتاب. onProgress(done,total) بعد كل صفحة.
 * تزامن أعلى للسرعة، وإعادة محاولة للصفحات الفاشلة (انقطاع نت) حتى تنجح.
 */
export type IngestResult = { succeeded: number; failed: number; total: number; stopped: boolean };

export async function ingestBook(
  pdfPath: string,
  totalPages: number,
  onProgress: (done: number, total: number) => void
): Promise<IngestResult> {
  if (!pdfPath || totalPages <= 0) return { succeeded: 0, failed: 0, total: 0, stopped: false };
  const myToken = ++runToken;
  const CONCURRENCY = 6; // أسرع
  const MAX_RETRIES = 12; // يصبر على انقطاع النت

  const pending: number[] = [];
  for (let p = 1; p <= totalPages; p++) pending.push(p);
  const retries: Record<number, number> = {};
  let done = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (true) {
      if (myToken !== runToken) return; // أُوقف
      const p = pending.shift();
      if (p === undefined) return;
      try {
        await extractPdfPageText(pdfPath, p);
        succeeded++;
        done++;
        onProgress(done, totalPages);
      } catch {
        // فشل (غالبًا انقطاع نت) → أعد الصفحة للطابور وانتظر قليلاً ثم أكمل
        retries[p] = (retries[p] || 0) + 1;
        if (retries[p] <= MAX_RETRIES && myToken === runToken) {
          pending.push(p);
          await sleep(Math.min(15000, 1500 * retries[p])); // backoff تصاعدي
        } else {
          failed++;
          done++; // تجاوزنا حد المحاولات → نكمل
          onProgress(done, totalPages);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { succeeded, failed, total: totalPages, stopped: myToken !== runToken };
}

/** كم صفحة مخزّنة فعلاً لهذا الكتاب (للتحقق من اكتمال التحميل). */
export async function cachedPageCount(pdfPath: string): Promise<number> {
  const { supabase } = await import("./supabase");
  const { count } = await supabase
    .from("page_cache")
    .select("page", { count: "exact", head: true })
    .eq("pdf_path", pdfPath);
  return count ?? 0;
}
