// lib/security.ts
// استجابة التطبيق لحماية السيرفر: محتوى غير آمن (رُفض الطلب ولم يُنفَّذ) أو حساب موقوف.
// الشاشة العامة (app/_layout) تستمع وتعرض التنبيه أو شاشة الإيقاف.
import { supabase } from "./supabase";

type Ev = { kind: "unsafe" | "locked" };
const listeners = new Set<(e: Ev) => void>();

export function onSecurity(fn: (e: Ev) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** يفحص ردّ السيرفر: إن كان «غير آمن» أو «موقوف» يُبلغ الواجهة ويرمي خطأً (لا يُنفَّذ شيء بعده) */
export function checkSecurity(d: unknown): void {
  const x = d as { unsafe?: boolean; locked?: boolean } | null;
  if (!x || (!x.unsafe && !x.locked)) return;
  const kind = x.locked ? "locked" : "unsafe";
  listeners.forEach((f) => f({ kind }));
  throw new Error(kind === "locked" ? "ACCOUNT_LOCKED" : "UNSAFE_CONTENT");
}

/** هل الحساب موقوف؟ (عند فتح التطبيق) */
export async function accountLocked(): Promise<boolean> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    const { data } = await supabase.from("account_locks").select("user_id").eq("user_id", u.user.id).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
