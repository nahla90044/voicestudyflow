// lib/errorLog.ts
// تسجيل أخطاء التطبيق على السيرفر (جدول app_errors) لتشخيص أي كراش بدقة، بدل الإغلاق الصامت.
// لا يرمي أبدًا، ويحدّ التكرار (نفس الخطأ مرة كل دقيقة).
import { APP_VERSION, supabase } from "./supabase";

const recent = new Map<string, number>();

export async function logAppError(err: unknown, where: string, fatal = false): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const key = `${where}|${e.message}`;
    if (Date.now() - (recent.get(key) ?? 0) < 60_000) return;
    recent.set(key, Date.now());
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await supabase.from("app_errors").insert({
      user_id: uid,
      message: e.message.slice(0, 1000),
      stack: (e.stack ?? "").slice(0, 4000),
      where_: where.slice(0, 200),
      fatal,
      app_version: APP_VERSION,
    });
  } catch {
    // التسجيل اختياري
  }
}

/** يلتقط الأخطاء القاتلة غير المعالجة (يسجّلها قبل أن يُغلق النظام التطبيق) */
export function installGlobalErrorLogging(): void {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, f?: boolean) => void; setGlobalHandler: (h: (e: Error, f?: boolean) => void) => void } };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((e, isFatal) => {
    void logAppError(e, "global", !!isFatal);
    // مهلة قصيرة ليصل التسجيل قبل الإغلاق
    if (isFatal) setTimeout(() => prev(e, isFatal), 800);
    else prev(e, isFatal);
  });
}
