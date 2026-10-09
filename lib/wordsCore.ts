// lib/wordsCore.ts
// «كلماتي» (صافٍ، قابل للاختبار): تنظيف الكلمة، وقراءة رد الذكاء بمعلوماتها.

export type WordInfo = {
  meaning: string; // المعنى في سياقه
  usage: string; // متى وكيف تُستخدم
  synonyms: string[];
  antonyms: string[];
  examples: string[]; // جمل تستخدم الكلمة
  pos?: string; // نوع الكلمة (اسم/فعل…)
};

/** الكلمة كما تُحفظ: بلا ترقيم أو أرقام أو علامات اقتباس حولها */
export function cleanWord(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}'’-]+$/gu, "")
    .replace(/[«»"“”()[\]{}]/g, "")
    .trim();
}

/** مفتاح المقارنة (لمنع التكرار): بلا تشكيل وبحروف صغيرة */
export function wordKey(w: string): string {
  return cleanWord(w)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,،;؛]/) : [])
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 6);

/** معلومات الكلمة من رد الذكاء (JSON)، أو null إن تعذّرت قراءته */
export function parseWordInfo(raw: string): WordInfo | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const meaning = String(o.meaning ?? o.m ?? "").trim();
    if (!meaning) return null;
    const pos = String(o.pos ?? "").trim();
    return {
      meaning,
      usage: String(o.usage ?? "").trim(),
      synonyms: list(o.synonyms),
      antonyms: list(o.antonyms),
      examples: list(o.examples).slice(0, 4),
      ...(pos ? { pos } : {}),
    };
  } catch {
    return null;
  }
}
