// lib/auth.ts
// مصادقة حقيقية عبر Supabase. نبدأ بحساب مجهول (anonymous) تلقائيًا — بدون
// شاشة تسجيل دخول — حتى يحصل كل مستخدم على auth.uid() حقيقي تفرضه سياسات RLS
// على مستوى قاعدة البيانات. لاحقًا يقدر المستخدم يربط بريدًا إلكترونيًا
// للمزامنة بين الأجهزة عبر linkEmail/signInWithEmail.

import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

let ensuring: Promise<string> | null = null;

/** يضمن وجود جلسة (مجهولة إن لزم) ويُرجع معرّف المستخدم الحقيقي. */
export async function getUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;

  // تفادي إنشاء أكثر من جلسة مجهولة عند النداء المتزامن
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
  return ensuring;
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
}
