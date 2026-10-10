// lib/appVersion.ts
// إجبار التحديث: أقل نسخة مدعومة محفوظة على السيرفر (app_config.min_ios_version).
// النسخة الأقدم تُقفل بشاشة «تحديث مطلوب» برابط App Store. ويكفي تغيير القيمة في
// قاعدة البيانات لإجبار كل المستخدمين على نسخة جديدة — بلا تحديث للتطبيق نفسه.
// والدوال السحابية ترفض النسخ القديمة أيضًا (426 UPDATE_REQUIRED) فيظهر نفس القفل.
import { APP_VERSION, supabase } from "./supabase";

export const APP_STORE_URL = "https://apps.apple.com/app/id6785257689";

/** مقارنة أرقام النسخ (2.0.10 > 2.0.9) */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const listeners = new Set<() => void>();
let required = false;

/** يُستدعى عند أي رد «تحديث مطلوب» من السيرفر */
export function markUpdateRequired() {
  if (required) return;
  required = true;
  listeners.forEach((fn) => fn());
}

export function onUpdateRequired(fn: () => void): () => void {
  listeners.add(fn);
  if (required) fn();
  return () => listeners.delete(fn);
}

/** يقارن نسخة التطبيق بأقل نسخة مدعومة على السيرفر (صامت عند انقطاع الشبكة) */
export async function checkMinVersion(): Promise<void> {
  try {
    const { data } = await supabase.from("app_config").select("value").eq("key", "min_ios_version").maybeSingle();
    const min = (data as { value?: string } | null)?.value;
    if (min && compareVersions(APP_VERSION, min) < 0) markUpdateRequired();
  } catch {
    // بلا شبكة: لا نقفل التطبيق
  }
}
