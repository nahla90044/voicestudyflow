// lib/plan.ts
// خطة المستخدم في التطبيق (للعرض وفتح الميزات) واستهلاكه هذا الشهر.
// مصدر الحقيقة للحدود هو السيرفر (_shared/plan.ts)؛ هنا نعرضها ونوجّه للاشتراك فقط.
import { router } from "expo-router";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { checkOwner, getUserId } from "./auth";
import { recordPerf } from "./perf";
import { purchasesAvailable, storeActivePlan } from "./purchases";
import { supabase } from "./supabase";

export type Plan = "owner" | "premium" | "pro" | "plus" | "free";

// نفس أرقام السيرفر (_shared/plan.ts) — للعرض: «بقي لك ٤٠ صفحة».
// الصفحة تُحسب مرة واحدة في الشهر (إعادة الاستماع مجانية). المجانية تجربة لمرة واحدة.
export const LIMITS: Record<Exclude<Plan, "owner">, { pages: number; premium: number; ai: number }> = {
  free: { pages: 10, premium: 0, ai: 5 },
  plus: { pages: 100, premium: 0, ai: 50 },
  pro: { pages: 200, premium: 0, ai: 100 },
  premium: { pages: 300, premium: 0, ai: 150 },
};
/** دقائق استماع تقريبية لكل صفحة (للعرض فقط) */
export const MIN_PER_PAGE = 2;
export const PAGE_PACK = { productKey: "pages_50" as const, pages: 50 };

/** معرّف الاشتراك (premium_month…) → الخطة */
export function planOf(planId: string): Exclude<Plan, "owner" | "free"> {
  return planId.startsWith("premium") ? "premium" : planId.startsWith("pro") ? "pro" : "plus";
}

let cached: { plan: Plan; at: number } | null = null;
const LAST_KEY = (uid: string) => `vsf:plan:last:${uid}`;

/**
 * الخطة الحالية: المالكة أولًا، ثم السيرفر (هو الذي يطبّق الحدود).
 * المبدأ: الحساب لا يظهر «مجانيًا برصيد صفر» بسبب تعثّر الاتصال أبدًا (بلاغ نهلة ٢٠ أكتوبر، مرتين):
 * كل نتيجة مؤكدة تُحفظ لكل حساب على الجهاز، وعند أي تعثّر تُعرض آخر نتيجة مؤكدة ويُعاد السؤال بعد ثوانٍ.
 */
export async function getPlan(force = false): Promise<Plan> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.plan;
  const uid = (await supabase.auth.getSession().catch(() => null))?.data.session?.user.id ?? "";
  try {
    let plan: Plan = "free";
    let trial = false;
    if (await checkOwner()) plan = "owner";
    else {
      const { data, error } = await supabase.from("entitlements").select("plan_id,expires_at,trial").eq("user_id", uid || (await getUserId())).maybeSingle();
      if (error) throw error;
      const active = !!data && (data.expires_at === null || new Date(data.expires_at).getTime() > Date.now());
      if (active) plan = planOf(String(data!.plan_id));
      trial = active && !!(data as { trial?: boolean }).trial;
    }
    inTrial = trial;
    cached = { plan, at: Date.now() };
    if (uid) AsyncStorage.setItem(LAST_KEY(uid), JSON.stringify({ plan, trial })).catch(() => {});
    return plan;
  } catch {
    // تعثّر: آخر نتيجة مؤكدة لهذا الحساب، ثم ما في الذاكرة، ثم المتجر — ويُعاد التحقق بعد ~٥ ثوانٍ
    recordPerf("plan.fallback", 0, false);
    let last: { plan: Plan; trial: boolean } | null = null;
    try {
      last = uid ? JSON.parse((await AsyncStorage.getItem(LAST_KEY(uid))) || "null") : null;
    } catch {}
    const plan: Plan = last?.plan ?? cached?.plan ?? (await storeActivePlan()) ?? "free";
    if (last) inTrial = last.trial;
    cached = { plan, at: Date.now() - 55_000 };
    return plan;
  }
}

export function invalidatePlan(): void {
  cached = null;
}

let inTrial = false; // أسبوع التجربة المجانية لباقة مدفوعة (حدوده ١٠ صفحات و٥ طلبات حتى أول دفعة)

/**
 * الحدود الفعلية كما يطبّقها السيرفر (_shared/plan.ts limitsFor): المجاني بلا دخول Apple = صفر،
 * وأسبوع التجربة = ١٠ صفحات و٥ طلبات، وإلا حدود الباقة. (كان العدّاد يعرض حدود الباقة دائمًا)
 */
export async function planLimits(plan: Plan): Promise<{ pages: number; premium: number; ai: number } | null> {
  if (plan === "owner") return null;
  if (plan === "free") {
    // من الجلسة المحفوظة (بلا شبكة) حتى لا يتحوّل الحد إلى صفر عند تعثّر الاتصال
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const u = data?.session?.user;
    const apple =
      ((u?.app_metadata?.providers as string[] | undefined) ?? []).includes("apple") ||
      (u?.identities ?? []).some((i) => i.provider === "apple") ||
      (u?.email ?? "").toLowerCase() === "review@voicestudyflow.app";
    return apple ? LIMITS.free : { pages: 0, premium: 0, ai: 0 };
  }
  return inTrial ? { pages: 10, premium: 0, ai: 5 } : LIMITS[plan];
}

const usageListeners = new Set<() => void>();
/** يُستدعى بعد أي استهلاك (طلب ذكاء/صفحة) فتتحدّث كل العدّادات الظاهرة */
export function refreshUsage(): void {
  usageListeners.forEach((f) => f());
}
export function onUsageChange(fn: () => void): () => void {
  usageListeners.add(fn);
  return () => usageListeners.delete(fn);
}

export type Usage = { pages: number; premium: number; ai: number; credits: number };

/** استهلاك الفترة الحالية: الشهر (أو التجربة لمرة واحدة للمجانية) + رصيد الصفحات الإضافية */
let lastUsage: Usage | null = null;
export async function getUsage(): Promise<Usage> {
  try {
    const uid = await getUserId();
    const plan = await getPlan();
    const period = plan === "free" ? "lifetime" : new Date().toISOString().slice(0, 7);
    const [std, prem, u, c] = await Promise.all([
      supabase.from("page_listens").select("page_key", { count: "exact", head: true }).eq("user_id", uid).eq("period", period).eq("tier", "std"),
      supabase.from("page_listens").select("page_key", { count: "exact", head: true }).eq("user_id", uid).eq("period", period).eq("tier", "prem"),
      supabase.from("usage_monthly").select("ai_requests").eq("user_id", uid).eq("period", period).maybeSingle(),
      supabase.from("page_credits").select("balance").eq("user_id", uid).maybeSingle(),
    ]);
    if (std.error || prem.error || u.error || c.error) throw new Error("usage");
    lastUsage = {
      pages: std.count ?? 0,
      premium: prem.count ?? 0,
      ai: Number(u.data?.ai_requests) || 0,
      credits: Number(c.data?.balance) || 0,
    };
    return lastUsage;
  } catch {
    // تعثّر الاتصال: آخر قراءة صحيحة (لا أصفار مضلّلة)
    return lastUsage ?? { pages: 0, premium: 0, ai: 0, credits: 0 };
  }
}

export type PaywallReason = "voice" | "ai" | "books" | "voiceAsk" | "upgrade";

let lastShown = 0;

/**
 * يفتح شاشة الاشتراك — فقط إن كان الشراء متاحًا فعلًا (وإلا لا معنى لعرضها).
 * لا تُعرض أكثر من مرة كل ١٠ دقائق تلقائيًا، إلا إن طلبها المستخدم بنفسه.
 */
export function requestPaywall(reason: PaywallReason, userInitiated = false): boolean {
  if (!purchasesAvailable()) return false;
  if (!userInitiated && Date.now() - lastShown < 10 * 60_000) return false;
  lastShown = Date.now();
  router.push({ pathname: "/paywall", params: { reason } });
  return true;
}

/** ميزة برو (السؤال بالصوت): مسموحة إن كانت الخطة برو/مالكة، أو إن لم يتوفر الشراء أصلًا */
export async function canUseVoiceAsk(): Promise<boolean> {
  if (!purchasesAvailable()) return true;
  const p = await getPlan();
  return p === "pro" || p === "premium" || p === "owner";
}
