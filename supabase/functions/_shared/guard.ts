// supabase/functions/_shared/guard.ts
// حماية الخدمة من المحتوى غير الآمن قبل إرساله لأنظمة الذكاء: رموز خفية، أو نص موجّه للنموذج
// بقصد تغيير سلوكه أو كشف إعداداته. عند الرصد: يُرفض الطلب (بلا خصم)، وتُسجَّل الحادثة كدليل،
// ويُوقف الحساب عند الخطورة العالية أو تكرار الحوادث خلال ٢٤ ساعة. المالكة تُسجَّل ولا تُوقف.
// (أنماط الكشف هنا فقط — لا تُعرض في أي نص للمستخدم.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { userIdFrom } from "./cost.ts";
import { scanText, type GuardResult } from "./guardCore.ts";
export { scanText, type GuardResult };

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

// حالة الإيقاف مخزّنة مؤقتًا في الذاكرة دقيقة واحدة (لا استعلام مع كل طلب صوت)
const lockCache = new Map<string, { locked: boolean; at: number }>();

/** بريد المستخدم من رمز الدخول (لسجل الحادثة) */
export function emailFrom(req: Request): string | null {
  try {
    const part = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").split(".")[1];
    const j = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof j.email === "string" ? j.email : null;
  } catch {
    return null;
  }
}

export async function isLocked(req: Request): Promise<boolean> {
  const uid = userIdFrom(req);
  if (!uid) return false;
  const c = lockCache.get(uid);
  if (c && Date.now() - c.at < 60_000) return c.locked;
  try {
    const { data } = await admin().from("account_locks").select("user_id").eq("user_id", uid).maybeSingle();
    const locked = !!data;
    lockCache.set(uid, { locked, at: Date.now() });
    return locked;
  } catch {
    return false;
  }
}

/** يسجّل الحادثة ويقرر الإيقاف. يُرجع true إن أُوقف الحساب */
export async function recordIncident(
  req: Request,
  g: Exclude<GuardResult, { ok: true }>,
  o: { fn: string; action?: string; email?: string | null; owner?: boolean }
): Promise<boolean> {
  const uid = userIdFrom(req);
  try {
    const db = admin();
    const { data: inc } = await db
      .from("security_incidents")
      .insert({
        user_id: uid,
        email: o.email ?? null,
        fn: o.fn,
        action: o.action ?? null,
        severity: g.severity,
        signals: g.signals,
        excerpt: g.excerpt.slice(0, 600),
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
        app_version: req.headers.get("x-vsf-version"),
      })
      .select("id")
      .single();
    if (!uid || o.owner) return false;
    let lock = g.severity === "high";
    if (!lock) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await db.from("security_incidents").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
      lock = (count ?? 0) >= 2; // تكرار خلال ٢٤ ساعة
    }
    if (lock) {
      await db.from("account_locks").upsert({ user_id: uid, reason: g.signals.join(","), incident_id: inc?.id ?? null });
      lockCache.set(uid, { locked: true, at: Date.now() });
    }
    return lock;
  } catch (e) {
    console.error("recordIncident", (e as Error).message);
    return false;
  }
}

/** ردود موحّدة للتطبيق */
export const LOCKED_BODY = { error: "LOCKED", locked: true };
export const UNSAFE_BODY = (locked: boolean) => ({ error: locked ? "LOCKED" : "UNSAFE", unsafe: true, locked });
