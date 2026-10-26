// supabase/functions/_shared/partRetry.ts
// «رصيد الجزء» على قاعدة البيانات: استدعاء دالتي SQL الذرّيتين (0038_part_retry.sql).
// القواعد نفسها في partRetryCore.ts (مُختبَرة). أي عطل هنا لا يوقف الخدمة: يرجع السلوك القديم (خصم/ردّ عادي).
import type { Caller } from "./plan.ts";
import { FREE_RETRIES, RETRY_WINDOW_MS, type Outcome } from "./partRetryCore.ts";

export type Claim = { status: "free" | "limit" | "none"; attemptId: number | null; rootId: number | null };
const NONE: Claim = { status: "none", attemptId: null, rootId: null };

/** قبل الخصم: هل الطلب إعادة مجانية لجزء مدفوع؟ (free: سُجّل قيد إعادة بمبلغ صفر رقمه attemptId) */
export async function claimPartRetry(caller: NonNullable<Caller>, action: string, hash: string): Promise<Claim> {
  try {
    const { data, error } = await caller.admin.rpc("claim_part_retry", {
      p_user: caller.id,
      p_action: action,
      p_hash: hash,
      p_window_secs: Math.round(RETRY_WINDOW_MS / 1000),
      p_cap: FREE_RETRIES,
    });
    if (error) {
      console.error("claim_part_retry", error.message);
      return NONE;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { status?: string; attempt_id?: number | string | null; root_id?: number | string | null } | null;
    const status = row?.status === "free" || row?.status === "limit" ? row.status : "none";
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    return { status, attemptId: num(row?.attempt_id), rootId: num(row?.root_id) };
  } catch (e) {
    console.error("claim_part_retry", (e as Error).message);
    return NONE;
  }
}

/** بعد المحاولة: تسجيل حصيلتها؛ الدالة تردّ الأصل إن انتهت السلسلة كلها بلا تسليم. ok=false: الدالة غير متاحة */
export async function partAttemptDone(caller: NonNullable<Caller>, attemptId: number, outcome: Outcome, reason: string): Promise<{ ok: boolean; refunded: boolean }> {
  try {
    const { data, error } = await caller.admin.rpc("part_attempt_done", { p_attempt: attemptId, p_outcome: outcome, p_reason: reason.slice(0, 120) });
    if (error) {
      console.error("part_attempt_done", error.message);
      return { ok: false, refunded: false };
    }
    return { ok: true, refunded: data === true };
  } catch (e) {
    console.error("part_attempt_done", (e as Error).message);
    return { ok: false, refunded: false };
  }
}
