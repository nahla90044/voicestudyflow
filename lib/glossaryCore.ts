// lib/glossaryCore.ts
// قاموس الوحدة (صافٍ، قابل للاختبار):
//  • تحديد صفحات كل وحدة: أين تبدأ عناوين وحدات المنهج داخل نص الكتاب (مع تجاهل صفحات
//    الفهرس التي تذكر عناوين كثيرة)، وما لم يُعثر عليه يُقدَّر بالتناسب بين جيرانه.
//  • نوع الكتاب: منهجي / تعليم لغة / رواية / عام — يحدّد نوع عناصر القاموس.
//  • قراءة رد الذكاء (JSON) مع إنقاذ العناصر الكاملة إن انقطع الرد.
import { normalizeArabic, tokenize } from "./bookQACore.ts";

export type BookKind = "textbook" | "language" | "novel" | "general";
export type PageText = { page: number; text: string };
export type UnitRange = { from: number; to: number; found: boolean };

// كلمات عامة في عناوين الوحدات لا تميّز وحدة عن غيرها
const GENERIC = new Set(
  [
    "وحده", "الوحده", "فصل", "الفصل", "باب", "الباب", "محاضره", "المحاضره", "درس", "الدرس", "جزء", "الجزء", "كتاب", "الكتاب",
    "اول", "الاول", "الاولي", "ثاني", "الثاني", "الثانيه", "ثالث", "الثالث", "الثالثه", "رابع", "الرابع", "الرابعه",
    "خامس", "الخامس", "الخامسه", "سادس", "السادس", "سابع", "السابع", "ثامن", "الثامن", "تاسع", "التاسع", "عاشر", "العاشر",
    "unit", "chapter", "part", "lesson", "lecture", "book", "section", "module", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
  ].flatMap((w) => [normalizeArabic(w), ...tokenize(w)]) // نفس تطبيع وتجذيع كلمات العناوين
);

/** الكلمات المميِّزة في عنوان وحدة (بلا الكلمات العامة والأرقام) */
export function titleKeys(title: string): string[] {
  const raw = tokenize(title).filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w) && w.length >= 3);
  return [...new Set(raw)].slice(0, 5);
}

function pageTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** نسبة كلمات العنوان الموجودة في نص (٠..١) */
function matchRatio(keys: string[], tokens: Set<string>): number {
  if (!keys.length) return 0;
  return keys.filter((k) => tokens.has(k)).length / keys.length;
}

/**
 * صفحات كل وحدة. العنوان يُعدّ موجودًا في صفحة إن وُجد ٧٥٪ من كلماته المميِّزة،
 * ويُفضَّل ظهوره في أعلى الصفحة (أول ٤٠٠ حرف). صفحة تذكر ٣ عناوين أو أكثر = فهرس فتُتجاهل.
 */
export function unitRanges(titles: string[], pages: PageText[], pageCount: number): UnitRange[] {
  const n = titles.length;
  if (n === 0) return [];
  const total = Math.max(pageCount, ...pages.map((p) => p.page), 1);
  const keys = titles.map(titleKeys);
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const full = sorted.map((p) => pageTokens(p.text));
  const top = sorted.map((p) => pageTokens(p.text.slice(0, 400)));

  // صفحات الفهرس: تطابق عناوين كثيرة في صفحة واحدة
  const isToc = full.map((tok) => keys.filter((k) => k.length && matchRatio(k, tok) >= 0.75).length >= 3);

  const starts: (number | null)[] = new Array(n).fill(null);
  let after = 0; // الوحدة التالية تبدأ بعد بداية السابقة
  for (let i = 0; i < n; i++) {
    if (!keys[i].length) continue;
    let best: number | null = null;
    let fallback: number | null = null;
    for (let j = 0; j < sorted.length; j++) {
      const pg = sorted[j].page;
      if (pg <= after || isToc[j]) continue;
      if (matchRatio(keys[i], top[j]) >= 0.75) {
        best = pg;
        break;
      }
      if (fallback === null && matchRatio(keys[i], full[j]) >= 0.75) fallback = pg;
    }
    const s = best ?? fallback;
    if (s !== null) {
      starts[i] = s;
      after = s;
    }
  }

  // ما لم يُعثر عليه: تقدير بالتناسب بين أقرب بدايتين معروفتين
  const filled = starts.map((s, i) => {
    if (s !== null) return s;
    let lo = i - 1;
    while (lo >= 0 && starts[lo] === null) lo--;
    let hi = i + 1;
    while (hi < n && starts[hi] === null) hi++;
    const loPage = lo >= 0 ? (starts[lo] as number) : 1;
    const hiPage = hi < n ? (starts[hi] as number) : total + 1;
    const loIdx = lo >= 0 ? lo : -1;
    const hiIdx = hi < n ? hi : n;
    return Math.round(loPage + ((hiPage - loPage) * (i - loIdx)) / (hiIdx - loIdx));
  });

  // تصاعدي دائمًا
  for (let i = 1; i < n; i++) if (filled[i] <= filled[i - 1]) filled[i] = Math.min(total, filled[i - 1] + 1);

  return filled.map((from, i) => ({
    from: Math.max(1, Math.min(total, from)),
    to: Math.max(Math.max(1, Math.min(total, from)), i + 1 < n ? filled[i + 1] - 1 : total),
    found: starts[i] !== null,
  }));
}

/** نوع الكتاب من رد الذكاء (بالعربية أو الإنجليزية) */
export function parseKind(raw: string): BookKind {
  const t = normalizeArabic(raw);
  if (/language|لغه|تعليم اللغ|vocabular/.test(t)) return "language";
  if (/novel|رواي|قصص|قصه|ادب|story|stories|fiction/.test(t)) return "novel";
  if (/textbook|منهج|جامع|مدرس|دراسي|علمي|academic|course/.test(t)) return "textbook";
  return "general";
}

export type GlossaryKindTag = "term" | "def" | "word" | "idiom" | "char" | "place";
export type GlossaryItem = { t: string; m: string; k: GlossaryKindTag; ex?: string; p?: number };

const TAGS = new Set<GlossaryKindTag>(["term", "def", "word", "idiom", "char", "place"]);

function clean(o: unknown): GlossaryItem | null {
  const r = o as Record<string, unknown>;
  const t = String(r?.t ?? r?.term ?? "").trim();
  const m = String(r?.m ?? r?.meaning ?? "").trim();
  if (!t || !m) return null;
  const k0 = String(r?.k ?? r?.kind ?? "term").trim() as GlossaryKindTag;
  const p = Number(r?.p ?? r?.page);
  const ex = String(r?.ex ?? r?.example ?? "").trim();
  return { t, m, k: TAGS.has(k0) ? k0 : "term", ...(ex ? { ex } : {}), ...(Number.isFinite(p) && p > 0 ? { p } : {}) };
}

/** عناصر القاموس من رد الذكاء. إن انقطع الرد نُنقذ كل عنصر {…} مكتمل. */
export function parseGlossary(raw: string): GlossaryItem[] {
  const arr = raw.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      const v = JSON.parse(arr[0]);
      if (Array.isArray(v)) return dedupe(v.map(clean).filter((x): x is GlossaryItem => !!x));
    } catch {
      // نكمل للإنقاذ
    }
  }
  const out: GlossaryItem[] = [];
  for (const m of raw.matchAll(/\{[^{}]*\}/g)) {
    try {
      const it = clean(JSON.parse(m[0]));
      if (it) out.push(it);
    } catch {
      // عنصر ناقص
    }
  }
  return dedupe(out);
}

function dedupe(items: GlossaryItem[]): GlossaryItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = normalizeArabic(i.t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** نص الوحدة للذكاء: عينات موزّعة على صفحاتها بعلامة رقم الصفحة، ضمن ميزانية أحرف */
export function unitContext(pages: PageText[], range: UnitRange, budget = 10000): string {
  const inRange = pages.filter((p) => p.page >= range.from && p.page <= range.to && p.text.trim().length > 20);
  if (!inRange.length) return "";
  const per = Math.max(400, Math.floor(budget / inRange.length));
  let out = "";
  for (const p of inRange) {
    if (out.length >= budget) break;
    out += `[ص${p.page}]\n${p.text.slice(0, per)}\n\n`;
  }
  return out.slice(0, budget);
}
