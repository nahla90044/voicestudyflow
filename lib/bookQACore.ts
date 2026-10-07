// lib/bookQACore.ts
// منطق «كتابك يجيب» الصافي (بلا React Native) — يُختبر بـ `npm test`:
//  ١) تطبيع النص العربي (حذف التشكيل، توحيد الألف والياء والتاء المربوطة، الأرقام)
//  ٢) اختيار الصفحات الأقرب للسؤال (تكرار الكلمة × ندرتها في الكتاب)
//  ٣) بناء النص المرسَل للذكاء مع علامة لكل صفحة [ك١ ص١٢]
//  ٤) استخراج أرقام الصفحات التي استشهد بها الذكاء من إجابته

export type BookPage = { book: number; page: number; text: string };
export type Citation = { book: number; page: number };

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export function normalizeArabic(s: string): string {
  return toWesternDigits(s)
    .replace(/[ً-ْٰـ]/g, "") // التشكيل والتطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}

const STOP = new Set(
  (
    "من في على الى عن ما ماذا لماذا كيف هل هو هي هم هذا هذه ذلك تلك التي الذي الذين ان او ثم قد كل بين عند " +
    "مع اي لا لم لن ليس كان كانت يكون تكون انه انها اذا متي اين كم شرح اشرح وضح لخص ملخص الكتاب الفصل " +
    "the a an is are was were of to in on for and or what why how which who does do this that with from by about"
  )
    .split(" ")
    .map(normalizeArabic) // نفس تطبيع النص، وإلا «على» لا تطابق «علي» بعد التطبيع
);

/** كلمة → جذع خفيف: نحذف «و/ف/ب/ل/ك» الملتصقة بـ«ال» ثم «ال» نفسها (والطلب ← طلب). */
export function lightStem(w: string): string {
  let t = w;
  if (t.length > 4 && /^[وفبلك]ال/.test(t)) t = t.slice(1);
  if (t.length > 4 && t.startsWith("ال")) t = t.slice(2);
  if (t.length > 4 && t.startsWith("لل")) t = t.slice(2);
  return t;
}

export function tokenize(s: string): string[] {
  return normalizeArabic(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(lightStem)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** درجة كل صفحة للسؤال: مجموع log(1+تكرار) × ندرة الكلمة في كل الصفحات. */
export function scorePages(question: string, pages: BookPage[]): number[] {
  const q = Array.from(new Set(tokenize(question)));
  if (q.length === 0) return pages.map(() => 0);
  const toks = pages.map((p) => tokenize(p.text));
  const N = pages.length;
  const df = q.map((term) => toks.filter((ts) => ts.some((w) => w === term || (term.length >= 4 && w.startsWith(term)))).length);
  return toks.map((ts) => {
    let s = 0;
    q.forEach((term, i) => {
      if (!df[i]) return;
      const tf = ts.filter((w) => w === term || (term.length >= 4 && w.startsWith(term))).length;
      if (tf) s += Math.log(1 + tf) * Math.log(1 + N / df[i]);
    });
    return s;
  });
}

/**
 * يختار صفحات ضمن ميزانية أحرف. إن لم تطابق أي صفحة السؤال (سؤال عام مثل «لخّص الكتاب»)
 * نأخذ صفحات موزّعة بالتساوي على الكتاب كله بدل أوّله فقط.
 */
export function selectPages(question: string, pages: BookPage[], budget = 11000, perPage = 2500): BookPage[] {
  if (pages.length === 0) return [];
  const scores = scorePages(question, pages);
  const anyHit = scores.some((s) => s > 0);
  let order: number[];
  if (anyHit) {
    order = scores
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i);
  } else {
    const want = Math.max(1, Math.min(pages.length, Math.floor(budget / 1200)));
    const step = pages.length / want;
    order = Array.from({ length: want }, (_, k) => Math.floor(k * step));
  }
  const out: BookPage[] = [];
  let used = 0;
  for (const i of order) {
    const p = pages[i];
    const text = p.text.slice(0, perPage);
    if (used + text.length > budget && out.length > 0) break;
    out.push({ ...p, text });
    used += text.length;
  }
  return out.sort((a, b) => a.book - b.book || a.page - b.page);
}

export function pageMarker(book: number, page: number): string {
  return `[ك${book} ص${page}]`;
}

export function buildContext(pages: BookPage[]): string {
  return pages.map((p) => `${pageMarker(p.book, p.page)}\n${p.text.trim()}`).join("\n\n");
}

/** تعليمة تُلحق بالسؤال: الاستشهاد بالصفحات بنفس صيغة العلامات. */
export function citationInstruction(): string {
  return (
    "\n\n(كل صفحة في النص تبدأ بعلامة مثل [ك1 ص12]. بعد الإجابة اذكر العلامات التي استندت إليها " +
    "بنفس الصيغة تمامًا، مثل: [ك1 ص12] [ك1 ص14]. لا تذكر صفحة لم تستند إليها.)"
  );
}

const CITE_RE = /\[\s*ك\s*([0-9٠-٩]+)\s*ص\s*([0-9٠-٩]+)\s*\]/g;

export function parseCitations(answer: string): { text: string; cites: Citation[] } {
  const seen = new Set<string>();
  const cites: Citation[] = [];
  for (const m of answer.matchAll(CITE_RE)) {
    const book = Number(toWesternDigits(m[1]));
    const page = Number(toWesternDigits(m[2]));
    const k = `${book}:${page}`;
    if (!seen.has(k) && book > 0 && page > 0) {
      seen.add(k);
      cites.push({ book, page });
    }
  }
  const text = answer
    .replace(CITE_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text, cites };
}
