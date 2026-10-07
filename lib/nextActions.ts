// lib/nextActions.ts
// محرّك «الخطوة التالية الذكية» في الرئيسية: يرتّب ما يجب أن يفعله المستخدم الآن
// بحسب بياناته (خطة اليوم، بطاقات مستحقة، السلسلة، آخر كتاب، هدف اليوم).
// دالة نقية بلا أي استيراد من React Native — حتى تُختبر بـ `npm test` مباشرة.

export type NextActionId =
  | "addFirstBook"
  | "protectStreak"
  | "plan"
  | "review"
  | "continue"
  | "goal"
  | "focus";

export type NextAction = { id: NextActionId; priority: number };

export type NextActionInput = {
  books: number;
  dueCards: number;
  todayMinutes: number;
  goalMinutes: number;
  streak: number;
  /** هل سُجّل أي نشاط اليوم؟ */
  studiedToday: boolean;
  hasContinueBook: boolean;
  /** صفحات خطة اليوم (إن وُجدت جلسة مذاكرة اليوم). */
  todayPlan?: { pagesTarget: number; pagesDone: number } | null;
  /** الساعة المحلية 0–23 — المساء يرفع أولوية حماية السلسلة. */
  hour: number;
};

/** يرجع أهم الإجراءات مرتّبة تنازليًا (افتراضيًا ٣ كحد أقصى). */
export function pickNextActions(input: NextActionInput, limit = 3): NextAction[] {
  const out: NextAction[] = [];

  // بلا كتب: لا شيء آخر له معنى قبل إضافة أول كتاب
  if (input.books <= 0) {
    out.push({ id: "addFirstBook", priority: 100 });
    out.push({ id: "focus", priority: 10 });
    return out.slice(0, limit);
  }

  // سلسلة مهدّدة: لم يذاكر اليوم والوقت مساءً
  if (input.streak > 0 && !input.studiedToday && input.hour >= 18) {
    out.push({ id: "protectStreak", priority: 95 });
  }

  const plan = input.todayPlan;
  if (plan && plan.pagesTarget > 0 && plan.pagesDone < plan.pagesTarget) {
    out.push({ id: "plan", priority: 90 });
  }

  if (input.dueCards > 0) {
    // كلما تراكمت البطاقات ارتفعت الأولوية (بسقف حتى لا تطغى على الخطة دائمًا)
    out.push({ id: "review", priority: 70 + Math.min(input.dueCards, 15) });
  }

  if (input.hasContinueBook) {
    out.push({ id: "continue", priority: 72 });
  }

  const goalLeft = input.goalMinutes - input.todayMinutes;
  if (goalLeft > 0 && !input.hasContinueBook) {
    out.push({ id: "goal", priority: 50 });
  }

  if (out.length < limit) out.push({ id: "focus", priority: 10 });

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** نسبة إنجاز هدف اليوم بين 0 و1. */
export function goalProgress(todayMinutes: number, goalMinutes: number): number {
  if (!(goalMinutes > 0)) return 0;
  return Math.max(0, Math.min(1, todayMinutes / goalMinutes));
}

/** آخر ٧ أيام (الأقدم أولًا) بصيغة YYYY-MM-DD محلية، تنتهي بتاريخ `today`. */
export function lastSevenDays(today: Date): string[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}
