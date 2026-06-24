// lib/auth.ts
// مصادقة حقيقية عبر Supabase. نبدأ بحساب مجهول (anonymous) تلقائيًا — بدون
// شاشة تسجيل دخول — حتى يحصل كل مستخدم على auth.uid() حقيقي تفرضه سياسات RLS
// على مستوى قاعدة البيانات. لاحقًا يقدر المستخدم يربط بريدًا إلكترونيًا
// للمزامنة بين الأجهزة عبر linkEmail/signInWithEmail.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

let ensuring: Promise<string> | null = null;

const DEVICE_KEY = "vsf_device_user_id";

// معرّف جهاز محلي — يُستخدم فقط كاحتياط أثناء التجربة إذا لم يُفعّل
// "Anonymous sign-ins" بعد في Supabase. في الإنتاج تُستخدم جلسة المصادقة الحقيقية.
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getLocalDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = uuidv4();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

// نخزّن المعرّف بعد أول حساب حتى لا نكرّر نداء الشبكة في كل مرة (يسرّع التطبيق)
let cachedUserId: string | null = null;
let anonDisabled = false;

/** يضمن وجود جلسة (مجهولة إن لزم) ويُرجع معرّف المستخدم الحقيقي. */
export async function getUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) {
    cachedUserId = session.user.id;
    return cachedUserId;
  }

  // إذا سبق وفشل الحساب المجهول، لا نكرّر نداء الشبكة — نستخدم معرّف الجهاز فورًا
  if (!anonDisabled) {
    if (!ensuring) {
      ensuring = (async () => {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        if (!data.user?.id) throw new Error("تعذّر إنشاء جلسة");
        return data.user.id;
      })().finally(() => {
        ensuring = null;
      });
    }
    try {
      cachedUserId = await ensuring;
      return cachedUserId;
    } catch {
      // الحساب المجهول غير مفعّل → لا نحاول مرة أخرى هذه الجلسة
      anonDisabled = true;
    }
  }

  cachedUserId = await getLocalDeviceId();
  return cachedUserId;
}

/** الجلسة الحالية (أو null). */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
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

/** تسجيل دخول بحساب موجود (على جهاز آخر مثلًا). */
export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** تسجيل الخروج (يعود الحساب مجهولًا عند أول استخدام لاحق). */
export async function signOut() {
  await supabase.auth.signOut();
  cachedUserId = null;
}
