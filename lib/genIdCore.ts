// lib/genIdCore.ts
// معرّف «جلسة التوليد» لمحتوى الوحدة (خالص — مُختبَر في tests/genIdCore.test.ts).
// السيرفر يحسب بصمة كل جزء من نصه وخياراته ومعرّف الجلسة: داخل الجلسة كل إعادة آلية للجزء مجانية
// (رصيد الجزء، ٢٦ أكتوبر)، والمعرّف يتغيّر فقط حين يحذف الطالب المحتوى ليعيد توليده بنفسه — فتُخصم
// إعادة التوليد اليدوية كما قررت نهلة (١٩ أكتوبر). معرّف عشوائي أو مُتلاعب به لا يعطي مجانية: بصمة جديدة = خصم.

/** معرّف جديد (وقت + عشوائي) — يكفي ألا يتكرر لنفس المستخدم */
export function newGenId(now: number = Date.now(), rand: () => number = Math.random): string {
  return `${now.toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0")}`.slice(0, 24);
}

/** بصمة قصيرة ثابتة لنص (FNV-1a ٣٢ بت) — للمنهج: معرّف الجلسة = بصمة المنهج المحفوظ قبل إعادة إنشائه */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * معرّف جلسة المنهج: بلا منهج محفوظ = "" (أول إنشاء، وإعادته بعد فشل مجانية). مع منهج محفوظ = بصمته:
 * إعادة الإنشاء اليدوية طلب جديد يُخصم، وإن فشلت (بقي المحفوظ كما هو) فإعادتها مجانية.
 */
export function syllabusGenId(saved: unknown): string {
  if (!saved || typeof saved !== "object") return "";
  try {
    return `s${fingerprint(JSON.stringify(saved))}`;
  } catch {
    return "";
  }
}
