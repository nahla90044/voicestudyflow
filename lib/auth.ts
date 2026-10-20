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

// حسابات المالكة (نهلة — المطوّرة): مجانية دائمًا بكل المزايا (كتب غير محدودة، خانة سؤال الصفحة…).
// عند إضافة الاشتراكات: تُستثنى هذه الحسابات من صفحة الدفع ومن حدود الاستخدام على السيرفر أيضًا.
const OWNER_EMAILS = new Set(["nahlah@hotmail.com", "nahla90044@gmail.com", "nahla.m.o@icloud.com"]);

/** هل الحساب الحالي هو حساب المالك؟ القائمة الثابتة أولًا، ثم السيرفر (جدول app_owners) —
 *  فأي بريد يُضاف للسيرفر يُتعرَّف عليه فورًا بلا تحديث للتطبيق. النتيجة محفوظة لكل مستخدم. */
let ownerCache: { uid: string; owner: boolean } | null = null;
export async function isOwner(): Promise<boolean> {
  try {
    // الجلسة المحفوظة على الجهاز (بلا شبكة). كانت getUser() تطلب السيرفر في كل فحص، فإن تعثّر الاتصال
    // لحظة رجعت «ليست المالكة» فتظهر الباقة مجانية برصيد صفر حتى إعادة الفتح (بلاغ نهلة ٢٠ أكتوبر).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return false;
    if (OWNER_EMAILS.has(user.email?.trim().toLowerCase() ?? "")) return true;
    if (ownerCache?.uid === user.id) return ownerCache.owner;
    const KEY = `vsf:owner:${user.id}`;
    const { data, error } = await supabase.rpc("am_i_owner");
    if (error) {
      // بلا شبكة: آخر نتيجة مؤكدة لهذا الحساب على الجهاز، لا «ليست المالكة»
      const known = await AsyncStorage.getItem(KEY).catch(() => null);
      return known === "1";
    }
    ownerCache = { uid: user.id, owner: data === true };
    await AsyncStorage.setItem(KEY, data === true ? "1" : "0").catch(() => {});
    return ownerCache.owner;
  } catch {
    return ownerCache?.owner ?? false;
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

/**
 * الاسم الذي يُنادى به المستخدم صوتيًا (وضع التركيز): الاسم المحفوظ في الإعدادات،
 * وإلا الاسم المسجَّل في الحساب. لا نستخدم بادئة البريد هنا — نطقها يبدو آليًا.
 */
export async function getSpokenName(): Promise<string> {
  try {
    const local = (await AsyncStorage.getItem("settings:user_name"))?.trim();
    if (local) return local;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return (user?.user_metadata as { name?: string } | undefined)?.name?.trim() ?? "";
  } catch {
    return "";
  }
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
  "voice:read_style", // طريقة القراءة المفضّلة (إعداد جهاز)
]);

/** يمسح كل بيانات المستخدم المخزّنة محليًا (كتب/خطط/بطاقات/إحصاءات/تظليلات…)
 *  مع الإبقاء على إعدادات الجهاز — حتى لا يرى مستخدمٌ جديد بيانات السابق. */
export async function clearUserCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) =>
        !PRESERVE_KEYS.has(k) &&
        // الجولة التعريفية وإرشادات الصفحات: تُعرض مرة واحدة على الجهاز (وتعود بزر «؟»)، لا بعد كل خروج
        !k.startsWith("vsf_onboarded_") &&
        !k.startsWith("vsf_coach_") &&
        !k.startsWith("howto-tour-seen") &&
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
  // أوقف أي قراءة قبل الخروج: الشريط العائم، الصوت، موسيقى الخلفية، وبطاقة القراءة في الجزيرة.
  // (تسكير الشاشة وحده لا يوقف القراءة — هذا فقط عند «تسجيل الخروج».)
  // استيراد عند الحاجة: player يستورد auth، فالاستيراد في الأعلى يصنع حلقة.
  try {
    const [{ close }, { stopSpeaking }, { stopAmbient }, { closeReadingCard }] = await Promise.all([
      import("./player"),
      import("./voice"),
      import("./sfx"),
      import("./readingCard"),
    ]);
    close();
    await stopSpeaking().catch(() => {});
    stopAmbient();
    closeReadingCard();
  } catch {
    // غير حرج — نكمل الخروج
  }
  await supabase.auth.signOut();
  await clearUserCache(); // امسح كاش الحساب حتى لا يظهر للمستخدم التالي
  // ملفات الحساب على الجهاز: صوت نصوص كتبه وصور صفحاتها — لا تبقى لحساب آخر على نفس الجهاز
  try {
    const { Directory, Paths } = await import("expo-file-system");
    for (const name of ["tts-cache-v10", "page-img", "offline-books-v1", "book-files-v1"]) {
      for (const base of [Paths.cache, Paths.document]) {
        const d = new Directory(base, name);
        if (d.exists) d.delete();
      }
    }
  } catch {
    // تنظيف أفضل-جهد
  }
}

/* ===================== استعادة الدخول برمز (بلا متصفح) =====================
 * كانت الاستعادة ترسل رابطًا يفتح صفحة ويب خارجية لتعيين كلمة المرور. ذلك
 * يُخرج المستخدم من التطبيق مرتين، ويفشل كليًا مع التحقق الثنائي: جلسة الرابط
 * بمستوى aal1 وتغيير كلمة المرور يشترط aal2 («AAL2 session is required»).
 *
 * البديل: رمز سداسي بالبريد يُكتب داخل التطبيق فيُدخل المستخدم مباشرة. ولأنه
 * دخول عادي، يمرّ على تحدّي التحقق الثنائي الموجود في شاشة الدخول، فتصبح
 * الجلسة aal2 قبل تعيين كلمة المرور — فتختفي المشكلة من أصلها.
 *
 * شرط في لوحة Supabase: قالب «Magic Link» يجب أن يحوي {{ .Token }} ليصل الرمز.
 */

/**
 * يرسل رمز دخول للبريد. لا ينشئ حسابًا لبريد غير مسجّل (shouldCreateUser: false).
 * خطأ «البريد غير مسجّل» يُبتلع عمدًا: إظهاره يكشف لأي أحد أيّ البُرُد مسجّلة
 * عندنا. الواجهة تعرض رسالة محايدة في الحالتين.
 */
export async function sendLoginCode(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: { shouldCreateUser: false },
  });
  if (!error) return;
  if (/signups? not allowed|not found|user not found/i.test(error.message)) return;
  throw error;
}

/** يتحقق من رمز الدخول ويُنشئ الجلسة (بمستوى aal1). */
export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) throw error;
}

/** يعيّن كلمة مرور جديدة للجلسة الحالية (تتطلّب aal2 إن كان التحقق الثنائي مفعّلًا). */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
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

/**
 * تسجيل الدخول بحساب Apple (iOS). الرمز يُتحقَّق منه في Supabase (مزوّد apple).
 * nonce عشوائي: نرسل تجزئته لآبل والنص الأصلي لـ Supabase، فلا يُعاد استخدام الرمز.
 * التجربة المجانية مشروطة بهذا الدخول (حساب Apple واحد = تجربة واحدة) — يقلّل الحسابات الوهمية.
 */
export async function signInWithApple(): Promise<"ok" | "cancelled"> {
  const AppleAuthentication = await import("expo-apple-authentication");
  const Crypto = await import("expo-crypto");
  const rawNonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") return "cancelled";
    throw e;
  }
  if (!credential.identityToken) throw new Error("No identity token");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
  // آبل ترسل الاسم في أول دخول فقط — نحفظه اسمًا للعرض
  const given = credential.fullName?.givenName?.trim();
  if (given) await updateName(given).catch(() => {});
  return "ok";
}

/** هل الحساب الحالي مسجّل بحساب Apple؟ (شرط التجربة المجانية) */
export async function isAppleAccount(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
    return providers.includes("apple") || (user?.identities ?? []).some((i) => i.provider === "apple");
  } catch {
    return false;
  }
}
