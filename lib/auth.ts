// lib/auth.ts
// مصادقة حقيقية عبر Supabase. نبدأ بحساب مجهول (anonymous) تلقائيًا — بدون
// شاشة تسجيل دخول — حتى يحصل كل مستخدم على auth.uid() حقيقي تفرضه سياسات RLS
// على مستوى قاعدة البيانات. لاحقًا يقدر المستخدم يربط بريدًا إلكترونيًا
// للمزامنة بين الأجهزة عبر linkEmail/signInWithEmail.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

/**
 * يُرجع معرّف المستخدم المُصادَق عليه فقط (auth.uid). يرمي خطأ إن لم توجد جلسة.
 * حرج للأمان: لا نستخدم أبداً «معرّف جهاز» محلي مشترك بين الحسابات — وإلا
 * اختلطت بيانات الحسابات على نفس الجهاز (إنشاء/قراءة/حذف على هوية مشتركة).
 * كل عملية بيانات تمرّ من هنا، فتبقى مقصورة على حساب المستخدم الحقيقي + RLS.
 */
export async function getUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error("لا توجد جلسة مصادقة");
  return uid;
}

/** الجلسة الحالية (أو null). */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// حساب المالك (نهلة): يفتح ميزات خاصة (كتب غير محدودة، خانة سؤال الصفحة…)
const OWNER_EMAIL = "nahlah@hotmail.com";

/** هل الحساب الحالي هو حساب المالك؟ (لإظهار ميزات مقيّدة عليه فقط) */
export async function isOwner(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email?.trim().toLowerCase() === OWNER_EMAIL;
  } catch {
    return false;
  }
}

/** هل المستخدم الحالي مجهول (لم يربط بريدًا بعد)؟ */
export async function isAnonymous(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // is_anonymous تُضاف من Supabase؛ والبريد فارغ للحساب المجهول
  return !!user && (((user as User & { is_anonymous?: boolean }).is_anonymous ?? !user.email));
}

/** ربط بريد/كلمة مرور بالحساب المجهول الحالي (يحافظ على نفس المعرّف والبيانات). */
export async function linkEmail(email: string, password: string) {
  await getUserId(); // تأكد من وجود جلسة أولًا
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
}

/** إنشاء حساب جديد ببريد/كلمة مرور. مع تأكيد البريد، لا تُفتح جلسة حتى التأكيد. */
export async function signUpEmail(
  email: string,
  password: string,
  name?: string,
): Promise<{ needsConfirm: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "https://voicestudyflow.app/confirmed",
      // نخزّن الاسم في بيانات الحساب نفسه ليبقى مع الحساب على أي جهاز
      data: name?.trim() ? { name: name.trim() } : undefined,
    },
  });
  if (error) throw error;
  return { needsConfirm: !data.session }; // لا جلسة = ينتظر تأكيد البريد
}

/** يحدّث اسم العرض في بيانات الحساب (ليبقى مع الحساب على أي جهاز). */
export async function updateName(name: string): Promise<void> {
  await supabase.auth.updateUser({ data: { name: name.trim() } }).catch(() => {});
}

/** اسم العرض: الاسم المحلي (الإعدادات) ثم اسم الحساب ثم جزء البريد قبل @. */
export async function getDisplayName(): Promise<string> {
  try {
    const local = (await AsyncStorage.getItem("settings:user_name"))?.trim();
    if (local) return local;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const metaName = (user?.user_metadata as { name?: string } | undefined)?.name?.trim();
    if (metaName) return metaName;
    if (user?.email) return user.email.split("@")[0];
  } catch {
    // نتجاهل — نُرجع فارغًا
  }
  return "";
}

/** تسجيل دخول بحساب موجود (على جهاز آخر مثلًا). */
export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** هل المستخدم الحالي لديه حساب حقيقي (بريد مؤكَّد)؟ */
export async function hasEmailAccount(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user?.email && !!(user.email_confirmed_at ?? (user as User & { confirmed_at?: string }).confirmed_at);
}

// مفاتيح تُحفظ عند تسجيل الخروج (إعدادات الجهاز لا بيانات المستخدم).
// نُبقي فقط إعدادات الجهاز غير الشخصية (المظهر/اللغة/سرعة القراءة/علامات
// «شوهد») — أما أي شيء يخص المستخدم (الاسم، الإحصاءات، البطاقات، الهدف،
// المنبّه، وضع التركيز) فيُمسح حتى لا يرى مستخدمٌ جديد أثرًا من السابق.
const PRESERVE_KEYS = new Set([
  "settings:theme_id",
  "settings:lang",
  "settings:min_per_page",
  "vsf_minutes_per_page",
  "vsf_onboarded_v1",
  "vsf_device_user_id",
  "howto-tour-seen-v1",
]);

/** يمسح كل بيانات المستخدم المخزّنة محليًا (كتب/خطط/بطاقات/إحصاءات/تظليلات…)
 *  مع الإبقاء على إعدادات الجهاز — حتى لا يرى مستخدمٌ جديد بيانات السابق. */
export async function clearUserCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) =>
        !PRESERVE_KEYS.has(k) &&
        // لا تمسح جلسة Supabase نفسها (توكن الدخول) وإلا خرج المستخدم من حسابه
        !k.startsWith("sb-") &&
        !k.startsWith("supabase.auth."),
    );
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // تنظيف أفضل-جهد — نتجاهل أي خطأ
  }
}

/** تسجيل الخروج ومسح كاش بيانات المستخدم محليًا. */
export async function signOut() {
  await supabase.auth.signOut();
  await clearUserCache(); // امسح كاش الحساب حتى لا يظهر للمستخدم التالي
}

/** إرسال رسالة إعادة تعيين كلمة المرور للبريد. */
export async function resetPassword(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const { error } = await supabase.auth.resetPasswordForEmail(e, {
    redirectTo: "https://voicestudyflow.app/reset",
  });
  if (error) throw error;
}

/* ===================== التحقق الثنائي (2FA / TOTP) ===================== */

/** قائمة عوامل 2FA من نوع TOTP. */
export async function listMfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data?.totp ?? [];
}

/** هل المستخدم مفعّل 2FA (عامل مؤكَّد)؟ */
export async function hasMfaEnabled(): Promise<boolean> {
  try {
    const factors = await listMfaFactors();
    return factors.some((f) => f.status === "verified");
  } catch {
    return false;
  }
}

/** يبدأ تسجيل 2FA — يُرجع رمز QR (SVG) والمفتاح السري للإدخال اليدوي. */
export async function enrollMfa(): Promise<{ factorId: string; qrSvg: string; secret: string }> {
  // أزل أي عامل غير مؤكَّد قديم حتى لا تتراكم العوامل المعلّقة
  try {
    const existing = await listMfaFactors();
    for (const f of existing) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }
  } catch {
    // نتجاهل
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "VoiceStudyFlow" });
  if (error) throw error;
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** يتحقق من رمز 2FA (يُستخدم لإكمال التسجيل وللتحدّي عند الدخول). */
export async function verifyMfa(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw error;
}

/** يلغي تفعيل 2FA. */
export async function unenrollMfa(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** هل يلزم تحدّي 2FA الآن (بعد الدخول بكلمة المرور)؟ */
export async function mfaChallengeRequired(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}

/** يحلّ تحدّي 2FA عند الدخول بأول عامل مؤكَّد. */
export async function solveMfaChallenge(code: string): Promise<void> {
  const factors = await listMfaFactors();
  const verified = factors.find((f) => f.status === "verified");
  if (!verified) throw new Error("No verified 2FA factor");
  await verifyMfa(verified.id, code);
}
