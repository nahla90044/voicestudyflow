// supabase/functions/_shared/guardCore.ts
// فحص المحتوى قبل إرساله لأنظمة الذكاء (خالص بلا اعتماديات — مُختبَر في tests/guardCore.test.ts).
// أنماط الكشف هنا فقط ولا تُعرض للمستخدم.
type Signal = { id: string; high?: boolean };

// hidden: نص خفي لا يُرى (لا يرد في كتاب حقيقي أبدًا) — الوحيد الذي يُفحص في نص الكتاب عند الطلبات
const RULES: { id: string; re: RegExp; high?: boolean; min?: number; hidden?: boolean }[] = [
  { id: "tag_chars", re: /[\u{E0000}-\u{E007F}]/gu, high: true, min: 1, hidden: true },
  { id: "bidi_override", re: /[‪-‮⁦-⁩]/g, min: 12, hidden: true },
  { id: "zero_width", re: /[​⁠﻿]/g, min: 40, hidden: true },
  { id: "override_en", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier|system)\b[^.\n]{0,24}\b(instructions?|prompts?|rules?|directions?)\b/gi },
  { id: "override_ar", re: /(تجاهل|تجاهلي|انس|انسَ|تخط|تخطَّ)[^.\n]{0,30}(التعليمات|الأوامر|التوجيهات|القواعد)/g },
  {
    id: "exfiltrate",
    re: /\b(reveal|print|show|output|repeat|send|leak)\b[^.\n]{0,40}\b(system prompt|instructions|api[ _-]?keys?|secret|credentials?)\b|(اكشف|اعرض|اطبع|كرر|أرسل|ارسل)[^.\n]{0,30}(تعليمات النظام|تعليماتك|مفتاح|المفاتيح|كلمة المرور|الأسرار)/gi,
    high: true,
  },
  { id: "role_override", re: /\b(you are now|act as an?|pretend (to be|you are)|developer mode|jailbreak|DAN mode)\b|(?<![\u0600-\u06FF])(أنت الآن (?:مساعد|نموذج|ذكاء|بلا قيود|حر)|تصرّف كأنك|تصرف كأنك|تصرّف بوصفك|تصرف بوصفك|تقمّص دور|تقمص دور|وضع المطوّر|وضع المطور)(?![\u0600-\u06FF])/gi },
  { id: "addressed_ai", re: /\b(to the (ai|assistant|model|llm)|as an ai language model|attention (ai|assistant|model))\b|(إلى الذكاء الاصطناعي|أيها الذكاء|أيها المساعد|أيها النموذج|إلى النموذج)/gi },
];

export type GuardResult = { ok: true } | { ok: false; severity: "medium" | "high"; signals: string[]; excerpt: string };

/** يفحص النص: سليم، أو مشبوه بدرجة (متوسطة/عالية) مع الإشارات ومقتطف الدليل */
export function scanText(text: string, opts: { hiddenOnly?: boolean } = {}): GuardResult {
  const hits: Signal[] = [];
  let firstAt = -1;
  for (const r of RULES) {
    // نص الكتاب: أنماط الكلمات تُخطئ في الروايات والكتب القانونية («pretend to be»، «والتصرف كصاحب الحق»)،
    // والكتاب فُحص بسياقه عند الرفع؛ فنفحص فيه النص الخفي فقط
    if (opts.hiddenOnly && !r.hidden) continue;
    const m = text.match(r.re);
    const n = m?.length ?? 0;
    if (n >= (r.min ?? 1)) {
      hits.push({ id: r.id, high: r.high });
      if (firstAt < 0 && m?.[0]) firstAt = text.indexOf(m[0]);
    }
  }
  if (!hits.length) return { ok: true };
  const high = hits.some((h) => h.high) || hits.length >= 2;
  const at = Math.max(0, firstAt);
  const excerpt = text.slice(Math.max(0, at - 150), at + 350).replace(/[\u{E0000}-\u{E007F}]/gu, "[TAG]");
  return { ok: false, severity: high ? "high" : "medium", signals: hits.map((h) => h.id), excerpt };
}

