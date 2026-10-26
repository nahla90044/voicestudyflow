// supabase/functions/_shared/plan.ts
// خطة المستخدم وحصصه الشهرية — مصدر الحقيقة على السيرفر (لا يُوثق بالتطبيق).
//
// المالكة (حسابا نهلة) مجانية دائمًا بلا حدود. البقية: مجاني / بلس / برو حسب
// جدول entitlements الذي يكتبه ويب-هوك المتجر فقط.
//
// الفرض الفعلي للحدود يُفعَّل بالسر QUOTAS_ENFORCED=true — قبل ذلك نسجّل الاستهلاك
// فقط، حتى لا تتوقف ميزات مستخدمي النسخة الحالية في المتجر قبل نزول نسخة فيها الاشتراك.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Plan = "owner" | "premium" | "pro" | "plus" | "free";

// نفس القائمة في lib/auth.ts (OWNER_EMAILS) — حسابا المالكة.
const OWNER_EMAILS = new Set(["nahlah@hotmail.com", "nahla90044@gmail.com", "nahla.m.o@icloud.com"]);

// حدود الخطط (اتفقنا عليها مع نهلة ٩ أكتوبر — رابحة حتى مع الاستهلاك الكامل):
//  الصفحات: صفحة الكتاب تُحسب مرة واحدة في الشهر (إعادة الاستماع مجانية).
//  std = صفحات الصوت (جيميناي، فئة واحدة). prem قديم (لا صوت فاخر بعد ١٠ أكتوبر).
//  voice = أحرف خارج صفحات الكتب (القاموس، كلماتي، البطاقات…).
//  المجانية تجربة لمرة واحدة (فترة lifetime)، والمدفوعة شهرية.
export const LIMITS: Record<Exclude<Plan, "owner">, { std: number; prem: number; ai: number; voice: number }> = {
  free: { std: 10, prem: 0, ai: 5, voice: 3_000 },
  plus: { std: 100, prem: 0, ai: 50, voice: 40_000 },
  pro: { std: 200, prem: 0, ai: 100, voice: 80_000 },
  premium: { std: 300, prem: 0, ai: 150, voice: 120_000 },
};

/** الفترة المحسوبة: lifetime للمجانية، وإلا الشهر الحالي (UTC) */
export function periodOf(plan: Plan): string {
  return plan === "free" ? "lifetime" : new Date().toISOString().slice(0, 7);
}

// apple = دخل بحساب Apple (شرط التجربة المجانية: حساب Apple واحد = تجربة واحدة، فيصعب صنع حسابات وهمية)
// trial = في أسبوع التجربة المجانية لاشتراك مدفوع → حدود التجربة فقط حتى يبدأ الدفع
export type Caller = { id: string; plan: Plan; admin: SupabaseClient; apple: boolean; trial?: boolean } | null;

// حساب مراجعة آبل (بريد وكلمة سر في App Store Connect): يأخذ التجربة المجانية بلا Apple
const TRIAL_OK_EMAILS = new Set(["review@voicestudyflow.app"]);
// الشراء التجريبي (Sandbox) يمنح اشتراكًا في الإنتاج لهذه الحسابات فقط (المراجعة والتجربة والمالكة)
const SANDBOX_OK_EMAILS = new Set(["review@voicestudyflow.app", "test@voicestudyflow.app"]);

/** هل يُقبل شراء تجريبي (Sandbox) لهذا المستخدم؟ (يمنع مختبري TestFlight من اشتراك مجاني حقيقي) */
export async function sandboxAllowed(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const u = data?.user;
    if (!u?.email_confirmed_at) return false;
    const email = (u.email ?? "").trim().toLowerCase();
    if (SANDBOX_OK_EMAILS.has(email) || OWNER_EMAILS.has(email)) return true;
    return !!(await admin.from("app_owners").select("email").eq("email", email).maybeSingle()).data;
  } catch {
    return false;
  }
}

/** حدود الحساب: المجاني بلا Apple لا تجربة له (صفر) */
function limitsFor(caller: NonNullable<Caller>) {
  const base = LIMITS[caller.plan as Exclude<Plan, "owner">];
  if (caller.plan === "free" && !caller.apple) return { std: 0, prem: 0, ai: 0, voice: 0 };
  // أسبوع التجربة المجانية (قرار نهلة ١٠ أكتوبر): ١٠ صفحات و٥ طلبات، ثم الباقة كاملة بعد الدفع
  if (caller.trial && caller.plan !== "free") return { std: 10, prem: 0, ai: 5, voice: 3_000 };
  return base;
}

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

  // البريد لا يُعتمد لصلاحيات خاصة (المالكة/حساب المراجعة) إلا إن كان مؤكَّدًا
  const confirmed = !!user.email_confirmed_at;
  const email = confirmed ? (user.email ?? "").trim().toLowerCase() : "";
  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? []).concat((user.identities ?? []).map((i) => i.provider));
  const apple = providers.includes("apple") || TRIAL_OK_EMAILS.has(email);
  // المطوّرة: القائمة الثابتة أو جدول app_owners (يُضاف له أي بريد جديد بلا نشر)
  const owner = OWNER_EMAILS.has(email) || (!!email && !!(await admin.from("app_owners").select("email").eq("email", email).maybeSingle()).data);
  if (owner) return { id: user.id, plan: "owner", admin, apple };

  const { data: ent } = await admin.from("entitlements").select("plan_id,expires_at,trial").eq("user_id", user.id).maybeSingle();
  const active = !!ent && (ent.expires_at === null || new Date(ent.expires_at).getTime() > Date.now());
  const pid = String(ent?.plan_id ?? "");
  const plan: Plan = !active ? "free" : pid.startsWith("premium") ? "premium" : pid.startsWith("pro") ? "pro" : "plus";
  return { id: user.id, plan, admin, apple, trial: active && !!ent?.trial };
}

/**
 * يستهلك من الحصة (طلبات ذكاء أو أحرف صوت خارج الصفحات). يُرجع true إن سُمح.
 * المالكة: دائمًا مسموح بلا تسجيل. بلا فرض (QUOTAS_ENFORCED≠true): يُسجَّل ويُسمح.
 */
export async function consume(caller: Caller, kind: "voice" | "ai", amount: number): Promise<boolean> {
  const enforced = Deno.env.get("QUOTAS_ENFORCED") === "true";
  if (!caller) return !enforced;
  // المالكة: بلا حد، لكن يُسجَّل استهلاكها (للعدّادات وقياس التكلفة الحقيقية)
  const limit = caller.plan === "owner" ? -1 : enforced ? limitsFor(caller)[kind] : -1;
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
  return caller.plan === "owner" || data === true;
}

// ===== وكيل العدّاد: خصم مسجَّل في دفتر، وردّ تلقائي لخصم العمل الفاشل =====
export type Charge = { ok: boolean; id: number | null };

/**
 * يخصم ويسجّل القيد (للمطابقة والردّ). ok=false: انتهت الحصة.
 * extra: حقول إضافية للقيد (part_hash لرصيد الجزء). إن فشل الإدراج بها (قاعدة لم تُحدَّث بعد) يُعاد بدونها
 * فلا يضيع القيد ولا الردّ.
 */
export async function charge(caller: Caller, kind: "voice" | "ai", amount: number, action: string, extra?: Record<string, unknown>): Promise<Charge> {
  const ok = await consume(caller, kind, amount);
  if (!ok || !caller) return { ok, id: null };
  const row = { user_id: caller.id, period: periodOf(caller.plan), kind, amount: Math.max(1, Math.round(amount)), action };
  let { data, error } = await caller.admin.from("usage_ledger").insert({ ...row, ...extra }).select("id").single();
  if (error && extra) {
    console.error("usage_ledger extra", error.message);
    ({ data } = await caller.admin.from("usage_ledger").insert(row).select("id").single());
  }
  return { ok, id: (data?.id as number | undefined) ?? null };
}

/** يردّ خصم قيد مرة واحدة فقط (العلامة refunded تُضبط ذرّيًا قبل الردّ) */
export async function refund(caller: Caller, c: Charge, reason: string): Promise<void> {
  if (!caller || !c.id) return;
  try {
    const { data } = await caller.admin
      .from("usage_ledger")
      .update({ refunded: true, reason: reason.slice(0, 120) })
      .eq("id", c.id)
      .eq("refunded", false)
      .select("period,kind,amount")
      .maybeSingle();
    if (!data) return;
    await caller.admin.rpc("refund_usage", { p_user: caller.id, p_period: data.period, p_kind: data.kind, p_amount: data.amount });
  } catch (e) {
    console.error("refund", (e as Error).message);
  }
}

export type PageResult = "again" | "ok" | "credit" | "over";

/** يستهلك صفحة كتاب (مرة واحدة لكل صفحة في الفترة). */
export async function consumePage(caller: Caller, pageKey: string, tier: "std" | "prem"): Promise<PageResult> {
  const enforced = Deno.env.get("QUOTAS_ENFORCED") === "true";
  if (!caller) return enforced ? "over" : "ok";
  const limit = caller.plan === "owner" ? -1 : enforced ? limitsFor(caller)[tier] : -1;
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
  if (caller.plan === "owner") return "ok";
  return (data as PageResult) ?? "ok";
}
