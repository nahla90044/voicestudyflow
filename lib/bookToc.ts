// lib/bookToc.ts
// فهرس الكتاب في القارئ (مثل تطبيق «حاكي»): للانتقال السريع بين الفصول والوحدات.
// المصادر بالترتيب: فهرس ملف الـPDF المدمج (book-toc على السيرفر)، ثم وحدات المنهج بحدود صفحاتها،
// ثم عناوين الفصول أعلى الصفحات («الفصل/الباب/الوحدة…»). يُخزَّن لكل كتاب فيفتح فورًا بعد أول مرة.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { bookPages, getCachedUnitRanges, getUnitRanges } from "./glossary";
import { supabase } from "./supabase";
import { getSyllabus } from "./syllabus";

export type TocItem = { title: string; page: number; to: number; level: number };
export type BookToc = { book: TocItem[]; units: TocItem[] };

const KEY = (p: string) => `vsf:toc:v1:${p}`;
const CHAPTER_WORDS = /^(الفصل|الباب|الجزء|القسم|الوحدة|المبحث|المقدمة|مقدمة|تمهيد|الخاتمة|خاتمة|الملحق|ملحق|chapter|part|unit|introduction|preface)(?=[\s:،.\-–]|$)/i;

/** نهاية كل عنصر = قبل بداية التالي من نفس المستوى أو أعلى */
function withEnds(list: { title: string; page: number; level: number }[], total: number): TocItem[] {
  return list.map((c, i) => {
    const next = list.slice(i + 1).find((x) => x.level <= c.level);
    return { ...c, to: Math.max(c.page, (next ? next.page : total + 1) - 1) };
  });
}

async function outline(pdfPath: string): Promise<{ title: string; page: number; level: number }[]> {
  try {
    const call = supabase.functions.invoke("book-toc", { body: { pdfPath } });
    const timeout = new Promise<{ data: null }>((r) => setTimeout(() => r({ data: null }), 45000));
    const { data } = (await Promise.race([call, timeout])) as { data: { chapters?: { title: string; page: number; level: number }[] } | null };
    return Array.isArray(data?.chapters) ? data!.chapters : [];
  } catch {
    return [];
  }
}

async function headings(pdfPath: string): Promise<{ title: string; page: number; level: number }[]> {
  const pages = await bookPages(pdfPath).catch(() => []);
  const out: { title: string; page: number; level: number }[] = [];
  const seen = new Set<string>();
  for (const p of [...pages].sort((a, b) => a.page - b.page)) {
    const top = String(p.text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
    const hit = top.find((l) => CHAPTER_WORDS.test(l) && l.split(/\s+/).length <= 12);
    if (!hit) continue;
    const title = hit.replace(/[.:،]+$/, "");
    const k = title.replace(/\s+/g, " ");
    if (seen.has(k)) continue; // رأس صفحة متكرر
    seen.add(k);
    out.push({ title, page: p.page, level: 0 });
  }
  return out.length >= 2 ? out : [];
}

export async function cachedToc(pdfPath: string): Promise<BookToc | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY(pdfPath))) || "null");
  } catch {
    return null;
  }
}

export async function getBookToc(pdfPath: string, total: number, force = false): Promise<BookToc> {
  if (!force) {
    const c = await cachedToc(pdfPath);
    if (c && (c.book.length || c.units.length)) return c;
  }
  const [ol, syl] = await Promise.all([outline(pdfPath), getSyllabus(pdfPath).catch(() => null)]);
  const book = withEnds(ol.length ? ol : await headings(pdfPath), total);
  let units: TocItem[] = [];
  const titles = (syl?.data.units ?? []).map((u) => u.title);
  if (titles.length) {
    const ranges = (await getCachedUnitRanges(pdfPath)) ?? (await getUnitRanges(pdfPath, titles, total).catch(() => []));
    units = titles
      .map((title, i) => (ranges[i] ? { title, page: ranges[i].from, to: ranges[i].to, level: 0 } : null))
      .filter((x): x is TocItem => !!x);
  }
  const toc = { book, units };
  if (book.length || units.length) AsyncStorage.setItem(KEY(pdfPath), JSON.stringify(toc)).catch(() => {});
  return toc;
}
