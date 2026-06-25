// lib/arabicNumbers.ts
// تحويل الأرقام (عربية أو إنجليزية) إلى كلمات عربية، لينطقها القارئ بشكل صحيح.

const ONES = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
  "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 20) parts.push(ONES[r]);
    else {
      const t = Math.floor(r / 10);
      const o = r % 10;
      parts.push(o ? `${ONES[o]} و${TENS[t]}` : TENS[t]);
    }
  }
  return parts.join(" و");
}

function intToArabicWords(n: number): string {
  if (n === 0) return "صفر";
  if (n < 0) return `سالب ${intToArabicWords(-n)}`;
  const parts: string[] = [];

  const millions = Math.floor(n / 1_000_000);
  n %= 1_000_000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;

  if (millions) {
    parts.push(
      millions === 1 ? "مليون" : millions === 2 ? "مليونان" : `${below1000(millions)} مليون`
    );
  }
  if (thousands) {
    parts.push(
      thousands === 1
        ? "ألف"
        : thousands === 2
        ? "ألفان"
        : thousands <= 10
        ? `${below1000(thousands)} آلاف`
        : `${below1000(thousands)} ألف`
    );
  }
  if (rest) parts.push(below1000(rest));

  return parts.join(" و");
}

/** يحوّل كل تسلسل أرقام في النص إلى كلمات عربية (للنطق الصحيح). */
export function numbersToArabicWords(text: string): string {
  // وحّد الأرقام العربية الهندية إلى لاتينية أولاً
  const normalized = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  // حوّل التسلسلات الرقمية الصحيحة (نتجاهل الطويلة جدًا)
  return normalized.replace(/\d+/g, (m) => {
    if (m.length > 7) return m; // أرقام طويلة (هواتف/معرّفات) نتركها
    const n = parseInt(m, 10);
    return Number.isFinite(n) ? intToArabicWords(n) : m;
  });
}
