// lib/nextStepCore.ts
// «الخطوة التالية» (قرار نهلة ٢٧ أكتوبر — «الطالب يضيع»): بطاقة واحدة أعلى المنهج تقول للطالب ماذا يفعل الآن
// حسب تقدّمه وموعد اختباره. منطق خالص مُختبَر: يأخذ ما يعرفه التطبيق عن كل وحدة ويُرجع خطوة واحدة واضحة بوقتها.

export type UnitState = {
  done: boolean;
  /** نسبة الصفحات المقروءة أو المسموعة ٠..١ */
  read: number;
  /** للوحدة ملخّص جاهز (أي مستوى) */
  summary: boolean;
  /** دقة اختبار الوحدة ٠..١، أو null إن لم تُختبر */
  accuracy: number | null;
  /** عدد صفحات الوحدة (لتقدير الوقت) */
  pages: number;
};

export type NextStep =
  | { kind: "mistakes"; n: number; minutes: number }
  | { kind: "prep"; days: number; minutes: number }
  | { kind: "summary"; unit: number; minutes: number; then: "quiz" }
  | { kind: "quiz"; unit: number; minutes: number }
  | { kind: "review"; unit: number; minutes: number; accuracy: number }
  | { kind: "final"; minutes: number }
  | { kind: "none" };

/** وقت قراءة الملخّص: دقيقة لكل صفحتين من الوحدة، بين ٨ و٢٥ دقيقة */
const summaryMin = (pages: number) => Math.max(8, Math.min(25, Math.round((pages || 10) / 2)));
const QUIZ_MIN = 10;
const PASS = 0.7;

export function nextStep(o: { units: UnitState[]; dueMistakes: number; daysLeft: number | null; prepActive: boolean }): NextStep {
  const { units } = o;
  if (!units.length) return { kind: "none" };
  // الاختبار قريب جدًا ولا خطة استعداد: خطة الساعات الباقية أولًا
  if (o.daysLeft != null && o.daysLeft >= 0 && o.daysLeft <= 3 && !o.prepActive && units.some((u) => !u.done))
    return { kind: "prep", days: o.daysLeft, minutes: 5 };
  // أخطاء مستحقة كثيرة: تُراجع قبل الجديد (التكرار المتباعد يثبّت ما تعلّمه)
  if (o.dueMistakes >= 5) return { kind: "mistakes", n: o.dueMistakes, minutes: Math.min(15, 5 + Math.ceil(o.dueMistakes / 2)) };
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.done) continue;
    if (u.accuracy != null && u.accuracy >= PASS) continue; // اجتازها ولم يؤشّرها: الوحدة التالية
    if (u.accuracy != null) return { kind: "review", unit: i, minutes: summaryMin(u.pages) + QUIZ_MIN, accuracy: u.accuracy };
    if (!u.summary && u.read < 0.8) return { kind: "summary", unit: i, minutes: summaryMin(u.pages) + QUIZ_MIN, then: "quiz" };
    return { kind: "quiz", unit: i, minutes: QUIZ_MIN };
  }
  // كل الوحدات منجزة أو مجتازة: اختبار شامل للكتاب
  return { kind: "final", minutes: 20 };
}
