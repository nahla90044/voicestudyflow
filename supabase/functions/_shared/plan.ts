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

// حدود الشهر. الصوت بالأحرف (≈ ١٠٠٠ حرف لكل دقيقة استماع).
export const LIMITS: Record<Exclude<Plan, "owner">, { voice: number; ai: number }> = {
  free: { voice: 30_000, ai: 60 }, // ~٣٠ دقيقة صوت بشري
  plus: { voice: 300_000, ai: 1_000 }, // ~٥ ساعات
  pro: { voice: 900_000, ai: 4_000 }, // ~١٥ ساعة
};

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
 * يستهلك من حصة الشهر. يُرجع true إن سُمح.
 * المالكة: دائمًا مسموح بلا تسجيل. بلا فرض (QUOTAS_ENFORCED≠true): يُسجَّل ويُسمح.
 */
export async function consume(caller: Caller, kind: "voice" | "ai", amount: number): Promise<boolean> {
  const enforced = Deno.env.get("QUOTAS_ENFORCED") === "true";
  if (!caller) return !enforced;
  if (caller.plan === "owner") return true;
  const limit = enforced ? LIMITS[caller.plan][kind] : -1;
  const { data, error } = await caller.admin.rpc("consume_usage", {
    p_user: caller.id,
    p_kind: kind,
    p_amount: Math.max(1, Math.round(amount)),
    p_limit: limit,
  });
  if (error) {
    console.error("consume_usage", error.message);
    return true; // عطل في العدّ لا يجب أن يوقف المستخدم
  }
  return data === true;
}
