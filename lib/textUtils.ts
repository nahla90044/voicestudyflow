// lib/textUtils.ts
// تقسيم النص إلى جُمل لإبراز الجملة المقروءة.

// سطور لا قيمة لها للقراءة: ختم المكتبة، روابط تيليجرام، ترويسة/تذييل الصفحة.
function isNoiseLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/@\s*ktabpdf|tele\s*@|ktabpdf|مكتبة\s+الرمحي|t\.me\//i.test(t)) return true;
  // تذييل رقم الصفحة: «صفحة | 3» أو «صفحة ٣» أو «- 3 -»
  if (/^(صفحة|ص)\s*[|\-–:]?\s*[\d٠-٩]+$/.test(t)) return true;
  if (/^[-–|]*\s*[\d٠-٩]+\s*[-–|]*$/.test(t)) return true; // رقم صفحة معزول
  // علامة تصنيف على الصفحات (ووترمارك) مثل: Restricted / مقيّد — وحدها أو مع رقم
  if (/^(restricted|confidential|مقيّ?د|سرّي|مقيد)\s*[|\-–:.]?\s*[\d٠-٩]*$/i.test(t)) return true;
  return false;
}

/** يقسّم النص إلى جُمل، ويستبعد سطور المصادر/الترويسة/التذييل. */
export function splitSentences(text: string): string[] {
  const clean = (text || "").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];

  // نضيف فاصل سطر بعد علامات نهاية الجملة، ونحترم الأسطر الأصلية
  const withBreaks = clean.replace(/([.!?؟…۔؛])\s+/g, "$1\n");

  return withBreaks
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !isNoiseLine(s));
}
