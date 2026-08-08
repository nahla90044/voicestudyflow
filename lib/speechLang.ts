// lib/speechLang.ts
// تحديد لغة النص المنطوق، وتطبيع الأرقام والتواريخ في النصوص اللاتينية.
//
// المشكلة التي يعالجها هذا الملف: كانت طريقة تنظيف النص تُختار من لغة **الصوت**
// المحدَّد لا من لغة **النص**. والصوت الافتراضي عربي، فكان الكتاب الإنجليزي يمرّ
// على تحويل الأرقام إلى كلمات عربية: «In 1995» تُقرأ «In ألف وتسعمئة وخمسة وتسعون».
//
// الحل: نكتشف اللغة من النص المنطوق فعلًا. وهذا يحلّ الترجمة تلقائيًا أيضًا —
// لأن المنطوق عند الترجمة هو النص المترجَم، فيُكتشف بلغته الصحيحة بلا إعداد إضافي.

export type SpeechLang = "ar" | "en" | "fr";

const AR_LETTER = /[ء-يٮ-ۓ]/g;
const LATIN_LETTER = /[A-Za-zÀ-ÿ]/g;

/**
 * لغة النص المنطوق حسب الحروف الغالبة فيه.
 * `fallback` تُستخدم حين لا يحوي النص حروفًا أصلًا (سطر أرقام فقط مثلًا)،
 * وعندها لغة الصوت المختار هي المرجع الصحيح.
 */
export function detectSpeechLang(text: string, fallback: SpeechLang = "ar"): SpeechLang {
  const ar = (text.match(AR_LETTER) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;
  if (ar === 0 && latin === 0) return fallback;
  if (ar >= latin) return "ar";
  // نصّ لاتيني: نُبقي الفرنسية إن كان الصوت فرنسيًا، وإلا فالإنجليزية
  return fallback === "fr" ? "fr" : "en";
}

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const ONES_EN = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS_EN = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** عدد من ٠ إلى ٩٩ بالإنجليزية. */
function under100En(n: number): string {
  if (n < 20) return ONES_EN[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS_EN[t] : `${TENS_EN[t]}-${ONES_EN[o]}`;
}

/**
 * سنة بالنطق الإنجليزي المعتاد: 1995 → «nineteen ninety-five»، لا
 * «one thousand nine hundred ninety-five». هذا سبب شكوى «التواريخ تُقرأ غلط».
 */
function yearToWordsEn(y: number): string {
  if (y >= 2000 && y <= 2009) return `two thousand${y % 10 ? " " + ONES_EN[y % 10] : ""}`;
  if (y % 100 === 0) return `${under100En(Math.floor(y / 100))} hundred`;
  const hi = Math.floor(y / 100);
  const lo = y % 100;
  // ٢٠٠٥ عولجت أعلاه؛ هنا مثل ١٩٩٥ → nineteen ninety-five، ٢٠٢٤ → twenty twenty-four
  return lo < 10
    ? `${under100En(hi)} oh ${ONES_EN[lo]}`
    : `${under100En(hi)} ${under100En(lo)}`;
}

// نطاق ضيّق عمدًا: ١٢٣٤ رقم صفحة لا سنة. حصْره في ١٥٠٠–٢٠٩٩ يغطّي تواريخ
// الكتب عمليًا ويستبعد أرقام الصفحات والفقرات الشائعة.
function isYear(n: number): boolean {
  return n >= 1500 && n <= 2099;
}

// كلمات ترقيم: ما جاء بعدها رقمٌ فهو ترتيب لا تاريخ («page 1850»).
// الحدّ `(^|[^A-Za-z])` ضروري — بدونه تنتهي «March» بـ«ch» فتُطابق اختصار
// chapter، فتُمنع سنةٌ صحيحة في «March 2020» من التحوّل.
const COUNTER_WORD =
  /(^|[^A-Za-z])(page|pages|p|pp|chapter|ch|section|sec|line|no|num|number|fig|figure|table|vol|volume|isbn|issn)\.?\s*$/i;

/**
 * تطبيع الأرقام والتواريخ في النصوص اللاتينية قبل النطق:
 *  • تواريخ ISO (2020-03-12) → «12 March 2020»
 *  • تواريخ بالشرطة المائلة حين يكون الترتيب قاطعًا (أحد الجزأين > 12)
 *  • السنوات المفردة → نطق السنوات لا نطق الأعداد
 * ما كان ملتبسًا (مثل 03/04/2020) يُترك كما هو — التخمين أسوأ من الترك.
 */
export function normalizeLatinDates(text: string, lang: SpeechLang): string {
  const months = lang === "fr" ? MONTHS_FR : MONTHS_EN;
  const dm = (d: number, m: number, y: number) =>
    lang === "fr" ? `${d} ${months[m - 1]} ${y}` : `${d} ${months[m - 1]} ${y}`;

  let out = text;

  // 2020-03-12 → 12 March 2020
  out = out.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m, y, mo, d) => {
    const Y = +y, M = +mo, D = +d;
    return M >= 1 && M <= 12 && D >= 1 && D <= 31 ? dm(D, M, Y) : m;
  });

  // 12/03/2020 أو 03/12/2020 — نوسّعها فقط حين يكون الترتيب قاطعًا
  out = out.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m, a, b, y) => {
    const A = +a, B = +b, Y = +y;
    if (A > 12 && B >= 1 && B <= 12) return dm(A, B, Y); // الأول يوم قطعًا
    if (B > 12 && A >= 1 && A <= 12) return dm(B, A, Y); // الثاني يوم قطعًا
    return m; // ملتبس → اتركه
  });

  // سنة مفردة. الشرط المحيط ضروري: بدونه كانت السنة داخل تاريخ لم يُوسَّع
  // (لالتباس ترتيبه) تُستبدل وحدها فينتج «03/04/twenty twenty» — أسوأ من الأصل.
  // نستعمل مجموعة ملتقطة للسابق بدل lookbehind لأن Hermes قد لا يدعمه.
  if (lang !== "fr") {
    out = out.replace(
      /(^|[^\d/\-])(\d{4})(?![\d/\-])/g,
      (m, pre: string, y: string, offset: number) => {
        if (!isYear(+y)) return m;
        // ما سبقته كلمة ترقيم فهو رقم ترتيبي («page 1850») لا سنة
        const before = out.slice(0, offset) + pre;
        if (COUNTER_WORD.test(before)) return m;
        return `${pre}${yearToWordsEn(+y)}`;
      },
    );
  }

  return out;
}
