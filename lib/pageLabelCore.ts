// lib/pageLabelCore.ts
// رقم الصفحة **المطبوع في الكتاب** يختلف غالبًا عن رقمها في الملف (غلاف ومقدمة بلا
// ترقيم). نستنتج الفرق من الرقم المنفرد أعلى/أسفل الصفحة، فيصير «انتقال للصفحة ٢١»
// يفتح الصفحة المطبوع عليها ٢١ فعلًا.

export type Box = { t: string; x: number; y: number; w: number; h: number };

const toNum = (s: string): number | null => {
  const w = s.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (!/^\d{1,4}$/.test(w)) return null;
  const n = parseInt(w, 10);
  return n > 0 ? n : null;
};

/** الرقم المطبوع على الصفحة: رقم منفرد في الشريط العلوي أو السفلي (أقرب للحافة). */
export function printedNumber(words: Box[]): number | null {
  let best: { n: number; edge: number } | null = null;
  for (const b of words) {
    const n = toNum(b.t);
    if (n == null) continue;
    const top = b.y;
    const bottom = 1 - (b.y + b.h);
    const edge = Math.min(top, bottom);
    if (edge > 0.09) continue; // ليس في الهامش العلوي/السفلي
    if (!best || edge < best.edge) best = { n, edge };
  }
  return best?.n ?? null;
}

/**
 * الفرق (رقم الملف − الرقم المطبوع) من عدة صفحات: نأخذ الأكثر تكرارًا،
 * ونشترط اتفاق عيّنتين على الأقل إن توفّرت أكثر من عيّنة (حماية من أرقام عابرة كالجداول).
 */
export function inferOffset(samples: { pdf: number; printed: number | null }[]): number | null {
  const counts = new Map<number, number>();
  let valid = 0;
  for (const s of samples) {
    if (s.printed == null) continue;
    const d = s.pdf - s.printed;
    if (d < 0 || d > 60) continue;
    valid++;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestC = 0;
  for (const [d, c] of counts) if (c > bestC) [best, bestC] = [d, c];
  if (best == null) return null;
  if (valid >= 2 && bestC < 2) return null;
  return best;
}
