// lib/ingest.ts
// تجهيز الكتاب كامل: يمرّ على كل الصفحات ويستخرج/يحوّل نصها ويخزّنها
// (عبر extractPdfPageText الذي يخزّن في page_cache). يتخطّى المخزّن بسرعة،
// فيُكمل من حيث توقف. يدعم التقدّم والإيقاف.
import { extractPdfPageText } from "./pdfText";

let runToken = 0;

/** يوقف أي تجهيز جارٍ. */
export function stopIngest() {
  runToken++;
}

/**
 * يجهّز كل صفحات الكتاب. onProgress(done,total) يُستدعى بعد كل صفحة.
 * يعمل بتزامن محدود حتى لا يُجهد الخدمات.
 */
export async function ingestBook(
  pdfPath: string,
  totalPages: number,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  if (!pdfPath || totalPages <= 0) return;
  const myToken = ++runToken;
  const CONCURRENCY = 3;
  let nextPage = 1;
  let done = 0;

  async function worker() {
    while (true) {
      if (myToken !== runToken) return; // أُوقف
      const p = nextPage++;
      if (p > totalPages) return;
      try {
        await extractPdfPageText(pdfPath, p);
      } catch {
        // نتجاهل صفحة فشلت ونكمل
      }
      done++;
      onProgress(done, totalPages);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}
