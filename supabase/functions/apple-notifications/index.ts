// supabase/functions/apple-notifications/index.ts
// إشعارات Apple للخادم (App Store Server Notifications V2): التجديد، الإلغاء، الانتهاء،
// الاسترجاع… تصل موقّعة من Apple فنتحقّق منها بمكتبتها الرسمية قبل أي تغيير.
// الإعداد في App Store Connect → التطبيق → App Information → App Store Server Notifications:
//   https://jhfufoltmjhauqvgqezv.functions.supabase.co/apple-notifications  (Production وSandbox، النسخة 2)
// منشور بلا تحقّق JWT (Apple لا ترسل رمز دخول) — الحماية بتوقيع Apple نفسه.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isActive, isTrial, PRODUCT_PLAN, verifyNotification, verifyTransaction } from "../_shared/apple.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let note;
  try {
    const body = await req.json();
    note = await verifyNotification(String(body?.signedPayload ?? ""));
  } catch (e) {
    console.error("notification verify failed", String(e));
    return new Response("invalid", { status: 400 });
  }

  const type = String(note.notificationType ?? "");
  const id = String(note.notificationUUID ?? "");
  const signedTx = note.data?.signedTransactionInfo;
  if (!signedTx) return new Response("ok (no transaction)", { status: 200 }); // TEST وغيره
  let t;
  try {
    t = await verifyTransaction(signedTx);
  } catch (e) {
    console.error("tx verify failed", String(e));
    return new Response("invalid", { status: 400 });
  }

  // لمن هذا الاشتراك؟ appAccountToken (هوية المستخدم وقت الشراء) أو ربط سابق بالمعاملة الأصلية
  let userId = t.appAccountToken && UUID.test(t.appAccountToken) ? t.appAccountToken : "";
  if (!userId && t.originalTransactionId) {
    const { data } = await admin.from("apple_transactions").select("user_id").eq("original_transaction_id", t.originalTransactionId).maybeSingle();
    userId = data?.user_id ?? "";
  }

  // نفس الإشعار لو وصل مرتين يُعالج مرة واحدة
  if (id) {
    const seen = await admin.from("store_events").insert({ id: `apple:${id}`, user_id: userId || null, type, product_id: t.productId ?? null });
    if (seen.error?.code === "23505") return new Response("ok (duplicate)", { status: 200 });
  }
  if (!userId) return new Response("ok (unlinked)", { status: 200 });

  if (t.originalTransactionId) {
    await admin.from("apple_transactions").upsert({
      original_transaction_id: t.originalTransactionId,
      user_id: userId,
      product_id: t.productId,
      environment: String(t.environment ?? ""),
      expires_at: t.expiresDate ? new Date(t.expiresDate).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  }

  const { data: current } = await admin.from("entitlements").select("expires_at").eq("user_id", userId).maybeSingle();
  if (current && current.expires_at === null) return new Response("ok (comp)", { status: 200 });

  const plan = PRODUCT_PLAN[String(t.productId)];
  if (plan && isActive(t)) {
    await admin.from("entitlements").upsert({
      user_id: userId,
      plan_id: plan,
      trial: isTrial(t),
      expires_at: new Date(t.expiresDate!).toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else if (["EXPIRED", "REFUND", "REVOKE", "GRACE_PERIOD_EXPIRED"].includes(type) || !isActive(t)) {
    // الإلغاء وحده (DID_CHANGE_RENEWAL_STATUS) لا يسحب: يستمر حتى تاريخ الانتهاء
    await admin.from("entitlements").delete().eq("user_id", userId);
  }
  return new Response("ok", { status: 200 });
});
