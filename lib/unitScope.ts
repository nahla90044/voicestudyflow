// lib/unitScope.ts
// «الوحدة كاملة» للعرض التقديمي: أي وحدة من المنهج تقع فيها الصفحة الحالية، ونصّها كله.
// الوحدات ونطاق صفحاتها من المنهج المولّد (getUnitRanges). بلا منهج → نطاق ١٠ صفحات
// من الصفحة الحالية، فالميزة تعمل لكل كتاب.
import { bookPages, getCachedUnitRanges, getUnitRanges } from "./glossary";
import { extractPdfPageText } from "./pdfText";
import { getSyllabus } from "./syllabus";

export type UnitScope = { title: string | null; from: number; to: number; unitIndex: number | null };

const FALLBACK_PAGES = 10;
const MAX_CHARS = 11_500; // حد السيرفر ١٢٠٠٠ حرف

export async function unitForPage(pdfPath: string, page: number, totalPages: number): Promise<UnitScope> {
  const total = Math.max(totalPages || 0, page);
  try {
    const syl = await getSyllabus(pdfPath);
    const titles = (syl?.data.units ?? []).map((u) => u.title);
    if (titles.length) {
      const ranges = (await getCachedUnitRanges(pdfPath)) ?? (await getUnitRanges(pdfPath, titles, total));
      const idx = ranges.findIndex((r) => page >= r.from && page <= r.to);
      if (idx >= 0) return { title: titles[idx] ?? null, from: ranges[idx].from, to: ranges[idx].to, unitIndex: idx };
    }
  } catch {
    // نكمل بالنطاق الاحتياطي
  }
  return { title: null, from: page, to: Math.min(total || page + FALLBACK_PAGES - 1, page + FALLBACK_PAGES - 1), unitIndex: null };
}

/** نص الوحدة كلها (صفحاتها بالترتيب)، مقصوصًا لحد السيرفر */
export async function unitText(pdfPath: string, from: number, to: number): Promise<string> {
  const cached = await bookPages(pdfPath).catch(() => []);
  const byPage = new Map(cached.map((p) => [p.page, p.text]));
  const parts: string[] = [];
  let len = 0;
  for (let p = from; p <= to && len < MAX_CHARS; p++) {
    let t = byPage.get(p) ?? "";
    if (!t.trim()) t = (await extractPdfPageText(pdfPath, p).catch(() => ({ text: "" }))).text ?? "";
    if (!t.trim()) continue;
    parts.push(t.trim());
    len += t.length;
  }
  return parts.join("\n\n").slice(0, MAX_CHARS);
}

/**
 * نص الوحدة **كاملًا** مقسّمًا لأجزاء (كل جزء ضمن حد السيرفر) بترتيب الصفحات — للملخّص الشامل.
 * unitText يقصّ عند ~١١٥٠٠ حرف (٥–٨ صفحات) فكان آخر الوحدة الطويلة لا يُلخَّص.
 * الجزء ينتهي عند حد صفحة؛ الصفحة الأطول من الحد تُقسم على الفقرات.
 */
export async function unitTextParts(pdfPath: string, from: number, to: number, max = 11_000): Promise<string[]> {
  const cached = await bookPages(pdfPath).catch(() => []);
  const byPage = new Map(cached.map((p) => [p.page, p.text]));
  const parts: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) parts.push(cur.trim());
    cur = "";
  };
  for (let p = from; p <= to; p++) {
    let t = byPage.get(p) ?? "";
    if (!t.trim()) t = (await extractPdfPageText(pdfPath, p).catch(() => ({ text: "" }))).text ?? "";
    t = t.trim();
    if (!t) continue;
    if (cur.length + t.length + 2 > max) push();
    if (t.length > max) {
      // صفحة أطول من الحد: على الأسطر، والسطر الأطول من الحد يُقطع قطعًا متتالية (لا يضيع شيء)
      for (const line of t.split(/\n+/)) {
        for (let k = 0; k < line.length; k += max) {
          const piece = line.slice(k, k + max);
          if (cur.length + piece.length + 1 > max) push();
          cur += (cur ? "\n" : "") + piece;
        }
      }
      continue;
    }
    cur += (cur ? "\n\n" : "") + t;
  }
  push();
  return parts;
}

