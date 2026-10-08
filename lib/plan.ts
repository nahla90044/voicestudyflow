// lib/plan.ts
// خطة المستخدم في التطبيق (للعرض وفتح الميزات) واستهلاكه هذا الشهر.
// مصدر الحقيقة للحدود هو السيرفر (_shared/plan.ts)؛ هنا نعرضها ونوجّه للاشتراك فقط.
import { router } from "expo-router";

import { getUserId, isOwner } from "./auth";
import { purchasesAvailable, storeActivePlan } from "./purchases";
import { supabase } from "./supabase";

export type Plan = "owner" | "pro" | "plus" | "free";

// نفس أرقام السيرفر (للعرض: «بقي لك ١٢ دقيقة»)
export const LIMITS: Record<Exclude<Plan, "owner">, { voiceMin: number; ai: number }> = {
  free: { voiceMin: 30, ai: 60 },
  plus: { voiceMin: 300, ai: 1000 },
  pro: { voiceMin: 900, ai: 4000 },
};
const CHARS_PER_MIN = 1000;

let cached: { plan: Plan; at: number } | null = null;

/** الخطة الحالية: المالكة أولًا، ثم المتجر (فوري)، ثم السيرفر */
export async function getPlan(force = false): Promise<Plan> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.plan;
  let plan: Plan = "free";
  if (await isOwner()) plan = "owner";
  else {
    const store = await storeActivePlan();
    if (store) plan = store;
    else {
      try {
        const uid = await getUserId();
        const { data } = await supabase.from("entitlements").select("plan_id,expires_at").eq("user_id", uid).maybeSingle();
        const active = !!data && (data.expires_at === null || new Date(data.expires_at).getTime() > Date.now());
        if (active) plan = String(data!.plan_id).startsWith("pro") ? "pro" : "plus";
      } catch {
        // بلا شبكة → مجاني للعرض؛ السيرفر يقرّر عند الطلب
      }
    }
  }
  cached = { plan, at: Date.now() };
  return plan;
}

export function invalidatePlan(): void {
  cached = null;
}

export type Usage = { voiceMin: number; ai: number };

/** استهلاك هذا الشهر (UTC) */
export async function getUsage(): Promise<Usage> {
  try {
    const uid = await getUserId();
    const period = new Date().toISOString().slice(0, 7);
    const { data } = await supabase.from("usage_monthly").select("voice_chars,ai_requests").eq("user_id", uid).eq("period", period).maybeSingle();
    return { voiceMin: Math.round((Number(data?.voice_chars) || 0) / CHARS_PER_MIN), ai: Number(data?.ai_requests) || 0 };
  } catch {
    return { voiceMin: 0, ai: 0 };
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
  return p === "pro" || p === "owner";
}
