// lib/wordsCore.ts
// «كلماتي» (صافٍ، قابل للاختبار): تنظيف الكلمة، وقراءة رد الذكاء بمعلوماتها.

/** زمن واحد من تصريف الفعل: الاسم، الصيغ مع الضمائر، ومثال */
export type Tense = { name: string; forms: string[]; example?: string };

/** معلومات الفعل لمتعلّم اللغة */
export type VerbInfo = { infinitive: string; noun?: string; participle?: string; tenses: Tense[] };

export type WordInfo = {
  meaning: string; // المعنى في سياقه
  usage: string; // متى وكيف تُستخدم
  synonyms: string[];
  antonyms: string[];
  examples: string[]; // جمل تستخدم الكلمة
  pos?: string; // نوع الكلمة (اسم/فعل…)
  verb?: VerbInfo; // للأفعال فقط
};

function parseVerb(v: unknown): VerbInfo | undefined {
  const o = v as Record<string, unknown> | null;
  const infinitive = String(o?.infinitive ?? "").trim();
  if (!o || !infinitive) return undefined;
  const tenses = (Array.isArray(o.tenses) ? o.tenses : [])
    .map((t) => {
      const r = t as Record<string, unknown>;
      const name = String(r?.name ?? "").trim();
      const forms = (Array.isArray(r?.forms) ? r.forms : []).map((f) => String(f).trim()).filter(Boolean).slice(0, 8);
      const example = String(r?.example ?? "").trim();
      return name && forms.length ? { name, forms, ...(example ? { example } : {}) } : null;
    })
    .filter((t): t is Tense => !!t)
    .slice(0, 8);
  const noun = String(o.noun ?? "").trim();
  const participle = String(o.participle ?? "").trim();
  return { infinitive, tenses, ...(noun ? { noun } : {}), ...(participle ? { participle } : {}) };
}

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
    const verb = parseVerb(o.verb);
    return {
      meaning,
      usage: String(o.usage ?? "").trim(),
      synonyms: list(o.synonyms),
      antonyms: list(o.antonyms),
      examples: list(o.examples).slice(0, 4),
      ...(pos ? { pos } : {}),
      ...(verb ? { verb } : {}),
    };
  } catch {
    return null;
  }
}
