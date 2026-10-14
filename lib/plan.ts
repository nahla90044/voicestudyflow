// lib/plan.ts
// خطة المستخدم في التطبيق (للعرض وفتح الميزات) واستهلاكه هذا الشهر.
// مصدر الحقيقة للحدود هو السيرفر (_shared/plan.ts)؛ هنا نعرضها ونوجّه للاشتراك فقط.
import { router } from "expo-router";

import { getUserId, isOwner } from "./auth";
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

/** الخطة الحالية: المالكة أولًا، ثم السيرفر (هو الذي يطبّق الحدود)، والمتجر احتياط بلا شبكة فقط.
 *  (كان المتجر أولًا: أي حساب على نفس الجهاز يظهر مدفوعًا بينما السيرفر يعامله مجانيًا) */
export async function getPlan(force = false): Promise<Plan> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.plan;
  let plan: Plan = "free";
  if (await isOwner()) plan = "owner";
  else {
    try {
      const uid = await getUserId();
      const { data, error } = await supabase.from("entitlements").select("plan_id,expires_at").eq("user_id", uid).maybeSingle();
      if (error) throw error;
      const active = !!data && (data.expires_at === null || new Date(data.expires_at).getTime() > Date.now());
      if (active) plan = planOf(String(data!.plan_id));
    } catch {
      // بلا شبكة → نعرض ما يقوله المتجر مؤقتًا؛ السيرفر يقرّر عند الطلب
      plan = (await storeActivePlan()) ?? "free";
    }
  }
  cached = { plan, at: Date.now() };
  return plan;
}

export function invalidatePlan(): void {
  cached = null;
}

export type Usage = { pages: number; premium: number; ai: number; credits: number };

/** استهلاك الفترة الحالية: الشهر (أو التجربة لمرة واحدة للمجانية) + رصيد الصفحات الإضافية */
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
    return {
      pages: std.count ?? 0,
      premium: prem.count ?? 0,
      ai: Number(u.data?.ai_requests) || 0,
      credits: Number(c.data?.balance) || 0,
    };
  } catch {
    return { pages: 0, premium: 0, ai: 0, credits: 0 };
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
