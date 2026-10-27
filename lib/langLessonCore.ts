// lib/langLessonCore.ts
// «مربع الدرس» لكتب تعلّم اللغة (قرار نهلة ٢٧ أكتوبر): القاعدة في مربعات رسومية واضحة، والجملة محلّلة كلمة كلمة
// (فاعل/فعل/مفعول/اسم/صفة…)، والفعل بأصله (المصدر) وزمنه، وجدول الاقتران بكل الضمائر، والخطأ الشائع.
// منطق خالص مُختبَر: قراءة ما يكتبه النموذج (بحدود تمنع الازدحام) وتصنيف دور الكلمة إلى لون ثابت.

export type GramWord = { w: string; role: string; base?: string; tense?: string };
export type GramSentence = { words: GramWord[]; tr?: string };
export type ConjTable = { verb: string; tense: string; rows: [string, string][] };
export type LangBlock = {
  rule?: string;
  formula?: string;
  parse?: GramSentence[];
  conj?: ConjTable;
  mistake?: string;
};

const str = (v: unknown) => String(v ?? "").trim();

/** حدود المربع: جملتان، ٩ كلمات للجملة، ٨ صفوف للاقتران — أكثر من ذلك لا يُقرأ على شريحة واحدة */
export const GRAM_LIMITS = { sentences: 2, words: 9, conjRows: 8 } as const;

function sentence(o: any): GramSentence | null {
  const words = (Array.isArray(o?.words) ? o.words : [])
    .map((x: any): GramWord | null => {
      const w = str(x?.w ?? x?.word);
      if (!w) return null;
      const out: GramWord = { w, role: str(x?.role) };
      const base = str(x?.base);
      const tense = str(x?.tense);
      if (base && base.toLowerCase() !== w.toLowerCase()) out.base = base;
      if (tense) out.tense = tense;
      return out;
    })
    .filter((x: GramWord | null): x is GramWord => !!x)
    .slice(0, GRAM_LIMITS.words);
  if (words.length < 2) return null;
  const tr = str(o?.tr);
  return tr ? { words, tr } : { words };
}

/** صيغة الاقتران بلا تكرار ضميرها («tu as» في صف tu → «as»)؛ المدغم مثل «j'ai» يبقى كما هو */
export function stripPronoun(p: string, f: string): string {
  if (!p || !f) return f;
  const lp = p.toLowerCase();
  const lf = f.toLowerCase();
  if (lf.startsWith(lp + " ")) return f.slice(p.length).trim() || f;
  return f;
}

/** يقرأ حقل gram من مشهد الفيديو (أو من موضوع الملخّص)؛ null إن لم يكن فيه شيء صالح */
export function parseLangBlock(o: any): LangBlock | null {
  if (!o || typeof o !== "object") return null;
  const out: LangBlock = {};
  const rule = str(o.rule);
  const formula = str(o.formula);
  const mistake = str(o.mistake);
  if (rule) out.rule = rule;
  if (formula) out.formula = formula;
  if (mistake) out.mistake = mistake;
  const parse = (Array.isArray(o.parse) ? o.parse : []).map(sentence).filter((x: GramSentence | null): x is GramSentence => !!x).slice(0, GRAM_LIMITS.sentences);
  if (parse.length) out.parse = parse;
  const c = o.conj;
  if (c && typeof c === "object") {
    const rows = (Array.isArray(c.rows) ? c.rows : [])
      .map((r: any): [string, string] | null => {
        const p = str(Array.isArray(r) ? r[0] : r?.p ?? r?.pronoun);
        const f = stripPronoun(p, str(Array.isArray(r) ? r[1] : r?.f ?? r?.form));
        return p && f ? [p, f] : null;
      })
      .filter((r: [string, string] | null): r is [string, string] => !!r)
      .slice(0, GRAM_LIMITS.conjRows);
    const verb = str(c.verb);
    if (verb && rows.length >= 3) out.conj = { verb, tense: str(c.tense), rows };
  }
  return out.rule || out.formula || out.parse || out.conj ? out : null;
}

/** فئة دور الكلمة (للّون): يقرأ الدور بالعربية أو الإنجليزية أو الفرنسية */
export type RoleKind = "subject" | "verb" | "object" | "noun" | "adj" | "adv" | "pronoun" | "prep" | "other";
const ROLE_RULES: [RegExp, RoleKind][] = [
  // اسم المفعول/الفاعل الصرفي جزء من الفعل (participe passé) — قبل «مفعول» و«فاعل»
  [/اسم المفعول|اسم الفاعل|participe|participle|gérondif|infinitif|infinitive|مصدر/i, "verb"],
  [/فاعل|مبتدأ|sujet|subject/i, "subject"],
  [/مفعول|complément|\bcod\b|\bcoi\b|objet|object/i, "object"],
  [/فعل|verbe|verb|auxiliaire|auxiliary/i, "verb"],
  [/صفة|نعت|adjectif|adjective/i, "adj"],
  [/ظرف|حال|adverbe|adverb/i, "adv"],
  [/ضمير|pronom|pronoun/i, "pronoun"],
  [/حرف|أداة|اداة|préposition|preposition|article|déterminant|determiner|conjonction|conjunction/i, "prep"],
  [/اسم|nom|noun/i, "noun"],
];
export function roleKind(role: string): RoleKind {
  for (const [re, k] of ROLE_RULES) if (re.test(role)) return k;
  return "other";
}

/** نص بحروف لاتينية (الفرنسية/الإنجليزية): يُرسم من اليسار لليمين مهما كانت لغة الواجهة */
export const isLatinText = (s: string) => /[A-Za-zÀ-ÿ]/.test(s) && !/[؀-ۿ]/.test(s);

/** لون ثابت لكل دور في كل مكان (الفيديو والملخّص والطباعة): الطالب يربط اللون بالدور */
export const ROLE_COLORS: Record<RoleKind, string> = {
  subject: "#3B82F6",
  verb: "#F43F5E",
  object: "#10B981",
  noun: "#8B5CF6",
  adj: "#F59E0B",
  adv: "#06B6D4",
  pronoun: "#6366F1",
  prep: "#94A3B8",
  other: "#9CA3AF",
};

/** لون فاتح مُصمت (مزج باللون الأبيض) — الطباعة على آيفون تحوّل الشفافية سوادًا، فلا ألفا في الورق */
export function tint(hex: string, amount = 0.14): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#F3F4F6";
  const mix = (h: string) => Math.round(255 - (255 - parseInt(h, 16)) * amount).toString(16).padStart(2, "0");
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}
