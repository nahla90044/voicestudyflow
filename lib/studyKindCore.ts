// lib/studyKindCore.ts
// «نوع الدراسة» لكل كتاب (قرار نهلة ٢٧ أكتوبر): دراسة عادية · لغة · شهادة مهنية.
// يُخمَّن من نص الكتاب ووحداته بلا ذكاء (بلا طلب ولا تكلفة)، ثم يؤكده الطالب بضغطة أو يغيّره.
// الافتراضي «عادية»: لا يتغير شيء على كتاب لم يُعرف نوعه.

export type StudyKind = "general" | "language" | "cert";
export const STUDY_KINDS: StudyKind[] = ["general", "language", "cert"];
export const isStudyKind = (v: unknown): v is StudyKind => v === "general" || v === "language" || v === "cert";

/** الشهادات المهنية المعروفة (الاسم كما يظهر للطالب) — اختبارات اللغة (IELTS/TOEFL…) من نوع «لغة» */
const CERTS: [RegExp, string][] = [
  [/\bCMA\b|certified management accountant|المحاسب الإداري المعتمد/i, "CMA"],
  [/\bCPA\b|certified public accountant|المحاسب القانوني المعتمد/i, "CPA"],
  [/\bCFA\b|chartered financial analyst/i, "CFA"],
  [/\bACCA\b/i, "ACCA"],
  [/\bCIA\b|certified internal auditor|المراجع الداخلي المعتمد/i, "CIA"],
  [/\bSOCPA\b|الهيئة السعودية للمراجعين والمحاسبين|زمالة الهيئة السعودية/i, "SOCPA"],
  [/\bIFRS\b|\bDipIFR\b/i, "IFRS"],
  [/\bPMP\b|project management professional|PMBOK/i, "PMP"],
  [/\bCAPM\b/i, "CAPM"],
  [/\bCISA\b/i, "CISA"],
  [/\bCISSP\b/i, "CISSP"],
  [/\bCMA\s*\(?(?:part|الجزء)/i, "CMA"],
  [/\bSHRM-?(?:CP|SCP)\b|\bCIPD\b/i, "SHRM"],
  [/\bFRM\b|financial risk manager/i, "FRM"],
];

/** إشارات كتب تعليم اللغة (إنجليزي/فرنسي/عربي لغير الناطقين) */
const LANG_SIGNS: RegExp[] = [
  /\bgrammar\b/i,
  /\bvocabulary\b/i,
  /\blistening\b/i,
  /\bspeaking\b/i,
  /\bpronunciation\b/i,
  /\b(?:present|past|future) (?:simple|continuous|perfect)\b/i,
  /\bphrasal verbs?\b/i,
  /\bfill in the blanks?\b|\bcomplete the sentences?\b/i,
  /\bworkbook\b|\bstudent'?s book\b/i,
  /\bIELTS\b|\bTOEFL\b|\bTOEIC\b|\bSTEP\b test|\bDELF\b|\bDALF\b|\bTCF\b/i,
  /\bgrammaire\b/i,
  /\bvocabulaire\b/i,
  /\bconjugaison\b/i,
  /compréhension (?:orale|écrite)/i,
  /قواعد اللغة (?:الإنجليزية|الانجليزية|الفرنسية)|تعليم اللغة|لغير الناطقين/,
  /\bCEFR\b|\b[ABC][12] level\b/i,
];

/** يخمّن نوع الدراسة من نصوص الكتاب (عنوانه ووحداته وأول صفحاته) */
export function guessStudyKind(texts: string[]): { kind: StudyKind; exam?: string } {
  const all = texts.filter(Boolean).join("\n");
  if (!all.trim()) return { kind: "general" };
  // الشهادة: اسم معروف يتكرر مرتين على الأقل (مرة واحدة قد تكون ذكرًا عابرًا في كتاب جامعي)
  let best: { name: string; n: number } | null = null;
  for (const [re, name] of CERTS) {
    const n = (all.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length;
    if (n >= 2 && (!best || n > best.n)) best = { name, n };
  }
  const langHits = LANG_SIGNS.filter((re) => re.test(all)).length;
  if (best && langHits < 3) {
    const part = all.match(new RegExp(`${best.name}[^\\n]{0,24}?(?:part|الجزء)\\s*(\\d|one|two|الأول|الثاني)`, "i"));
    const p = part ? ({ one: "1", two: "2", "الأول": "1", "الثاني": "2" } as Record<string, string>)[part[1].toLowerCase()] ?? part[1] : "";
    return { kind: "cert", exam: p ? `${best.name} — ${p === "1" ? "الجزء الأول" : p === "2" ? "الجزء الثاني" : `الجزء ${p}`}` : best.name };
  }
  if (langHits >= 3) return { kind: "language" };
  return { kind: "general" };
}

/** نوع الكتاب الفعلي من بيانات منهجه: المؤكَّد أو المخمَّن، والافتراضي «عادية» */
export function studyKindOf(syl: { kind?: unknown; kindOk?: unknown; exam?: unknown } | null | undefined): {
  kind: StudyKind;
  confirmed: boolean;
  exam?: string;
} {
  const kind = isStudyKind(syl?.kind) ? syl!.kind : "general";
  const exam = typeof syl?.exam === "string" && syl.exam.trim() ? syl.exam.trim() : undefined;
  return { kind, confirmed: syl?.kindOk === true, exam };
}

/** يُسأل الطالب بسطر تأكيد: نوع مخمَّن غير «عادية» لم يؤكَّد بعد (العادية لا تغيّر شيئًا فلا تُسأل) */
export const needsKindConfirm = (syl: Parameters<typeof studyKindOf>[0]) => {
  const k = studyKindOf(syl);
  return !k.confirmed && k.kind !== "general";
};
