// lib/subscription.ts
// خطط الاشتراك (بعدد الكتب شهريًا). الدفع الفعلي عبر آبل/قوقل يُربط لاحقًا —
// هنا التعريفات + حفظ الخطة الحالية + عدّاد الكتب الشهري (للحدود مستقبلًا).
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PlanKey = "free" | "basic" | "pro" | "premium";

export type Plan = {
  key: PlanKey;
  name: string;
  books: number; // كتب جديدة مسموح بها شهريًا (0 = معاينة فقط)
  priceSar: number;
  priceUsd: number;
  tagline: string;
  features: string[];
  recommended?: boolean;
  gradient: readonly [string, string, ...string[]];
};

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "مجاني",
    books: 0,
    priceSar: 0,
    priceUsd: 0,
    tagline: "جرّبي قبل الاشتراك",
    features: ["معاينة كل كتاب (صفحتان مسموعتان)", "صوت بشري طبيعي", "أدوات التنظيم والمذاكرة"],
    gradient: ["#3b82f6", "#22d3ee"],
  },
  {
    key: "basic",
    name: "أساسي",
    books: 3,
    priceSar: 29,
    priceUsd: 8,
    tagline: "للطالب العادي",
    features: ["٣ كتب شهريًا", "استماع كامل بصوت بشري", "ملخصات واختبارات ذكية", "عدسة وتظليل متزامن"],
    gradient: ["#22d3ee", "#a855f7"],
  },
  {
    key: "pro",
    name: "برو",
    books: 10,
    priceSar: 79,
    priceUsd: 21,
    tagline: "الأكثر مذاكرة",
    recommended: true,
    features: ["١٠ كتب شهريًا", "كل مزايا الأساسي", "منهج دراسي وخريطة ذهنية", "موسيقى خلفية وعرض تقديمي"],
    gradient: ["#7c5cff", "#ec4899"],
  },
  {
    key: "premium",
    name: "بريميوم",
    books: 30,
    priceSar: 149,
    priceUsd: 40,
    tagline: "للمكثّف",
    features: ["٣٠ كتابًا شهريًا", "كل مزايا برو", "أولوية في المعالجة", "دعم مميّز"],
    gradient: ["#ec4899", "#f59e0b"],
  },
];

export function planByKey(key: PlanKey): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

const PLAN_STORE = "vsf_plan";
const USAGE_STORE = "vsf_books_usage"; // { month: "YYYY-MM", count: number }

/** الخطة الحالية (الافتراضي: مجاني). */
export async function getCurrentPlan(): Promise<PlanKey> {
  const v = (await AsyncStorage.getItem(PLAN_STORE).catch(() => null)) as PlanKey | null;
  return v && PLANS.some((p) => p.key === v) ? v : "free";
}

export async function setCurrentPlan(key: PlanKey): Promise<void> {
  await AsyncStorage.setItem(PLAN_STORE, key).catch(() => {});
}

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** عدد الكتب الجديدة المضافة هذا الشهر. */
export async function booksUsedThisMonth(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_STORE);
    if (!raw) return 0;
    const u = JSON.parse(raw) as { month: string; count: number };
    return u.month === monthKey() ? u.count || 0 : 0;
  } catch {
    return 0;
  }
}

/** سجّل إضافة كتاب جديد لهذا الشهر. */
export async function noteBookAdded(): Promise<void> {
  const count = (await booksUsedThisMonth()) + 1;
  await AsyncStorage.setItem(USAGE_STORE, JSON.stringify({ month: monthKey(), count })).catch(() => {});
}

/** هل تستطيع إضافة كتاب جديد ضمن خطتها؟ (يُفعَّل عند ربط الدفع). */
export async function canAddBook(): Promise<{ ok: boolean; used: number; limit: number; plan: Plan }> {
  const plan = planByKey(await getCurrentPlan());
  const used = await booksUsedThisMonth();
  return { ok: used < plan.books, used, limit: plan.books, plan };
}
