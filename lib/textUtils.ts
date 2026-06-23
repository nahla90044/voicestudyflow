// lib/textUtils.ts
// تقسيم النص إلى جُمل لإبراز الجملة المقروءة.

/** يقسّم النص إلى جُمل بناءً على علامات نهاية الجملة (عربي/لاتيني). */
export function splitSentences(text: string): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // نضيف فاصل سطر بعد علامات نهاية الجملة المتبوعة بمسافة
  const withBreaks = clean.replace(/([.!?؟…۔؛])\s+/g, "$1\n");

  return withBreaks
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
