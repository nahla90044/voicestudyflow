// lib/supportCore.ts — قراءة إجابة وكيل الدعم (JSON، أو نص يُعدّ غير مؤكَّد)
export type SupportAnswer = { answer: string; unsure: boolean };

export function parseSupport(raw: string): SupportAnswer {
  const i = raw.indexOf("{");
  const j = raw.lastIndexOf("}");
  try {
    const o = JSON.parse(i >= 0 && j > i ? raw.slice(i, j + 1) : raw) as { answer?: unknown; unsure?: unknown };
    const answer = String(o.answer ?? "").trim();
    if (answer) return { answer, unsure: o.unsure === true };
  } catch {
    // نص بلا JSON: يُعرض كما هو، ويُعدّ غير مؤكَّد
  }
  return { answer: raw.trim(), unsure: true };
}

