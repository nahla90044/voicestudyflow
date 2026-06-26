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
  // ترويسة مزخرفة بنقطتين متكررة «:::::»
  if (/:{3,}/.test(t)) return true;
  // علامة تصنيف على الصفحات (ووترمارك): Restricted / Confidential / مقيّد / سرّي
  if (/(restricted|confidential)/i.test(t) && t.length < 60) return true;
  if (/^(مقيّ?د|سرّي|مقيد)\s*[|\-–:.]?\s*[\d٠-٩]*$/.test(t)) return true;
  return false;
}

/** يقسّم النص إلى جُمل، ويستبعد سطور المصادر/الترويسة/التذييل. */
export function splitSentences(text: string): string[] {
  const clean = (text || "").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];

  // نضيف فاصل سطر بعد علامات نهاية الجملة، ونحترم الأسطر الأصلية
  const withBreaks = clean.replace(/([.!?؟…۔؛])\s+/g, "$1\n");

  const parts = withBreaks
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !isNoiseLine(s));

  // نجمع الجُمل القصيرة في مقاطع أطول لقراءة انسيابية: نبرة طبيعية متواصلة
  // ووقفات أقل بين المقاطع (يقلّ الإحساس «الآلي»). نحترم حدود الجمل.
  const TARGET = 220; // نطمح لهذا الطول قبل بدء مقطع جديد
  const MAX = 400; // لا نتجاوزه (لئلا يبطؤ توليد الصوت)
  const chunks: string[] = [];
  let cur = "";
  for (const s of parts) {
    if (!cur) cur = s;
    else if (cur.length < TARGET && (cur + " " + s).length <= MAX) cur += " " + s;
    else {
      chunks.push(cur);
      cur = s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
