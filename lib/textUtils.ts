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

  // 1) أزل سطور الضجيج (لكل سطر على حدة)
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isNoiseLine(l));

  // 2) ادمج كسر السطر داخل الفقرة: نصل الأسطر في نصّ متّصل ثم نقسّم عند نهايات
  //    الجمل فقط — فلا يُقطع مقطعٌ في منتصف جملة/فقرة (هذا سبب عدم الانسيابية).
  const joined = lines.join(" ").replace(/\s{2,}/g, " ").trim();
  const sentences = joined
    .replace(/([.!?؟…۔؛])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // 3) اجمع الجُمل في مقاطع أطول — وحدود المقاطع تقع **عند نهايات الجمل فقط**
  //    (نبرة طبيعية متواصلة بلا قطع داخل الجملة).
  const TARGET = 240; // نطمح لهذا الطول قبل بدء مقطع جديد
  const MAX = 450; // لا نتجاوزه (لئلا يبطؤ توليد الصوت)
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
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

const UNIT_RE = /(الوحدة|الفصل|الباب|المبحث|المحاضرة|تمهيد|مقدمة)/;
const headerNorm = (s: string) => s.replace(/[ً-ْـ\s\d٠-٩.،,:|()]/g, "");

/**
 * تقسيم للقراءة مع معالجة الترويسة المتكرّرة:
 *  - يحذف أسطر الترويسة (عنوان الكتاب/الوحدة في الرأس) التي رُئيت من قبل (seenHeaders).
 *  - أول مرة يظهر عنوان وحدة جديد → يُقرأ، ويُضاف «صفحة N» قبله (إعلان الصفحة مرة واحدة).
 * يُرجع المقاطع + أسطر الترويسة الجديدة (ليضيفها المستدعي إلى seenHeaders).
 */
export function splitForReading(
  text: string,
  opts: { seenHeaders?: Set<string>; page?: number } = {}
): { chunks: string[]; headerLines: string[] } {
  const clean = (text || "").replace(/[ \t]+/g, " ").trim();
  if (!clean) return { chunks: [], headerLines: [] };

  let lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isNoiseLine(l));

  const seen = opts.seenHeaders ?? new Set<string>();
  const headerLines: string[] = [];
  let announce = false;
  // سطر «ترويسة محتملة»: قصير وفيه حروف كافية (عنوان الكتاب/الوحدة في رأس الصفحة أو ذيلها)
  const headerish = (l: string) => l.length <= 80 && headerNorm(l).length >= 4;
  const drop = new Set<number>();
  const scan = (idxs: number[], isTop: boolean) => {
    for (const i of idxs) {
      const line = lines[i];
      if (!headerish(line)) break; // وصلنا للمحتوى
      const n = headerNorm(line);
      if (seen.has(n)) {
        drop.add(i); // ترويسة/تذييل رُئي من قبل → لا يُعاد قراءته
      } else {
        // جديد → يُقرأ هذه المرة فقط، ويُسجَّل (كل أسطر الترويسة لا أولها فقط)
        headerLines.push(n);
        if (isTop && UNIT_RE.test(line)) announce = true; // عنوان وحدة جديد → أعلن رقم الصفحة
      }
    }
  };
  // أعلى الصفحة (حتى ٣ أسطر) وأسفلها (حتى سطرين) — كانت الأسفل لا تُفحص إطلاقًا
  const topIdx = [0, 1, 2].filter((i) => i < lines.length);
  scan(topIdx, true);
  if (lines.length >= 3) scan([lines.length - 1, lines.length - 2].filter((i) => i > 0 && !topIdx.includes(i)), false);

  lines = lines.filter((_, i) => !drop.has(i));
  if (announce && opts.page && lines.length) lines = [`صفحة ${opts.page}.`, ...lines];

  return { chunks: splitSentences(lines.join("\n")), headerLines };
}
