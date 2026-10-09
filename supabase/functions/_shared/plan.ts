// supabase/functions/_shared/plan.ts
// خطة المستخدم وحصصه الشهرية — مصدر الحقيقة على السيرفر (لا يُوثق بالتطبيق).
//
// المالكة (حسابا نهلة) مجانية دائمًا بلا حدود. البقية: مجاني / بلس / برو حسب
// جدول entitlements الذي يكتبه ويب-هوك المتجر فقط.
//
// الفرض الفعلي للحدود يُفعَّل بالسر QUOTAS_ENFORCED=true — قبل ذلك نسجّل الاستهلاك
// فقط، حتى لا تتوقف ميزات مستخدمي النسخة الحالية في المتجر قبل نزول نسخة فيها الاشتراك.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Plan = "owner" | "pro" | "plus" | "free";

// نفس القائمة في lib/auth.ts (OWNER_EMAILS) — حسابا المالكة.
const OWNER_EMAILS = new Set(["nahlah@hotmail.com", "nahla90044@gmail.com"]);

// حدود الخطط (اتفقنا عليها مع نهلة ٩ أكتوبر — رابحة حتى مع الاستهلاك الكامل):
//  الصفحات: صفحة الكتاب تُحسب مرة واحدة في الشهر (إعادة الاستماع مجانية).
//  std = الصوت الأساسي (Azure)، prem = الصوت الفاخر (ElevenLabs).
//  voice = أحرف خارج صفحات الكتب (القاموس، كلماتي، البطاقات…).
//  المجانية تجربة لمرة واحدة (فترة lifetime)، والمدفوعة شهرية.
export const LIMITS: Record<Exclude<Plan, "owner">, { std: number; prem: number; ai: number; voice: number }> = {
  free: { std: 10, prem: 0, ai: 5, voice: 3_000 },
  plus: { std: 100, prem: 5, ai: 50, voice: 40_000 },
  pro: { std: 200, prem: 10, ai: 100, voice: 80_000 },
};

/** الفترة المحسوبة: lifetime للمجانية، وإلا الشهر الحالي (UTC) */
export function periodOf(plan: Plan): string {
  return plan === "free" ? "lifetime" : new Date().toISOString().slice(0, 7);
}

export type Caller = { id: string; plan: Plan; admin: SupabaseClient } | null;

/** يتعرّف على المستخدم من رمز الدخول ويحدّد خطته. null إن لم يُعرف. */
export async function getCaller(req: Request): Promise<Caller> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!url || !service || !token) return null;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;

  if (OWNER_EMAILS.has((user.email ?? "").trim().toLowerCase())) return { id: user.id, plan: "owner", admin };

  const { data: ent } = await admin.from("entitlements").select("plan_id,expires_at").eq("user_id", user.id).maybeSingle();
  const active = !!ent && (ent.expires_at === null || new Date(ent.expires_at).getTime() > Date.now());
  const plan: Plan = active ? (String(ent!.plan_id).startsWith("pro") ? "pro" : "plus") : "free";
  return { id: user.id, plan, admin };
}

/**
 * يستهلك من الحصة (طلبات ذكاء أو أحرف صوت خارج الصفحات). يُرجع true إن سُمح.
 * المالكة: دائمًا مسموح بلا تسجيل. بلا فرض (QUOTAS_ENFORCED≠true): يُسجَّل ويُسمح.
 */
export async function consume(caller: Caller, kind: "voice" | "ai", amount: number): Promise<boolean> {
  const enforced = Deno.env.get("QUOTAS_ENFORCED") === "true";
  if (!caller) return !enforced;
  if (caller.plan === "owner") return true;
  const limit = enforced ? LIMITS[caller.plan][kind] : -1;
  const { data, error } = await caller.admin.rpc("consume_usage_p", {
    p_user: caller.id,
    p_period: periodOf(caller.plan),
    p_kind: kind,
    p_amount: Math.max(1, Math.round(amount)),
    p_limit: limit,
  });
  if (error) {
    console.error("consume_usage_p", error.message);
    return true; // عطل في العدّ لا يجب أن يوقف المستخدم
  }
  return data === true;
}

export type PageResult = "again" | "ok" | "credit" | "over";

/** يستهلك صفحة كتاب (مرة واحدة لكل صفحة في الفترة). */
export async function consumePage(caller: Caller, pageKey: string, tier: "std" | "prem"): Promise<PageResult> {
  const enforced = Deno.env.get("QUOTAS_ENFORCED") === "true";
  if (!caller) return enforced ? "over" : "ok";
  if (caller.plan === "owner") return "ok";
  const limit = enforced ? LIMITS[caller.plan][tier] : -1;
  const { data, error } = await caller.admin.rpc("consume_page", {
    p_user: caller.id,
    p_period: periodOf(caller.plan),
    p_key: pageKey,
    p_tier: tier,
    p_limit: limit,
  });
  if (error) {
    console.error("consume_page", error.message);
    return "ok";
  }
  return (data as PageResult) ?? "ok";
}
