// supabase/functions/apple-notifications/index.ts
// إشعارات Apple للخادم (App Store Server Notifications V2): التجديد، الإلغاء، الانتهاء،
// الاسترجاع… تصل موقّعة من Apple فنتحقّق منها بمكتبتها الرسمية قبل أي تغيير.
// الإعداد في App Store Connect → التطبيق → App Information → App Store Server Notifications:
//   https://jhfufoltmjhauqvgqezv.functions.supabase.co/apple-notifications  (Production وSandbox، النسخة 2)
// منشور بلا تحقّق JWT (Apple لا ترسل رمز دخول) — الحماية بتوقيع Apple نفسه.
import { sandboxAllowed } from "../_shared/plan.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isActive, isTrial, PAGE_PACKS, PRODUCT_PLAN, verifyNotification, verifyRenewalInfo, verifyTransaction } from "../_shared/apple.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let note: Awaited<ReturnType<typeof verifyNotification>>;
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
  const renewalJws = note.data?.signedRenewalInfo;
  if (!signedTx) return new Response("ok (no transaction)", { status: 200 }); // TEST وغيره
  let t: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    t = await verifyTransaction(signedTx);
  } catch (e) {
    console.error("tx verify failed", String(e));
    return new Response("invalid", { status: 400 });
  }

  // لمن هذا الاشتراك؟ appAccountToken (هوية المستخدم وقت الشراء) أو ربط سابق بالمعاملة الأصلية
  let userId = t.appAccountToken && UUID.test(t.appAccountToken) ? t.appAccountToken : "";
  // صاحب الرمز حُذف حسابه (انتقل الاشتراك لحساب جديد)؟ → نعتمد الربط المسجّل بالمعاملة
  if (userId) {
    const { data: u } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
    if (!u?.user) userId = "";
  }
  if (!userId && t.originalTransactionId) {
    const { data } = await admin.from("apple_transactions").select("user_id").eq("original_transaction_id", t.originalTransactionId).maybeSingle();
    userId = data?.user_id ?? "";
  }

  // نفس الإشعار لو وصل مرتين يُعالج مرة واحدة. إن فشلت المعالجة نحذف البصمة ونرجع 500
  // فتعيد Apple الإرسال (كانت البصمة تُسجَّل قبل المعالجة فيُعامل الإعادة كتكرار ويضيع التحديث).
  const eventId = id ? `apple:${id}` : "";
  if (eventId) {
    const seen = await admin.from("store_events").insert({ id: eventId, user_id: userId || null, type, product_id: t.productId ?? null });
    if (seen.error?.code === "23505") return new Response("ok (duplicate)", { status: 200 });
  }
  try {
    const result = await handle();
    return new Response(result, { status: 200 });
  } catch (e) {
    console.error("notification handling failed", String(e));
    if (eventId) await admin.from("store_events").delete().eq("id", eventId);
    return new Response("retry", { status: 500 });
  }

  async function handle(): Promise<string> {
    // باقة الصفحات (شراء استهلاكي): لا علاقة لها بالاشتراك إطلاقًا. كانت تصل هنا بلا تاريخ
    // انتهاء فتُعامل كاشتراك منتهٍ وتحذف اشتراك المستخدم! الآن: الاسترجاع يسحب صفحاتها فقط.
    if (PAGE_PACKS[String(t.productId)]) {
      if ((type === "REFUND" || type === "REVOKE" || t.revocationDate) && t.transactionId) {
        const { error } = await admin.rpc("refund_pages", { p_tx: t.transactionId });
        if (error) throw error;
      }
      return "ok (pages)";
    }

    if (!userId) return "ok (unlinked)";
    // شراء تجريبي (Sandbox) لا يمنح اشتراكًا حقيقيًا إلا لحسابات المراجعة والتجربة والمالكة
    if (String(t.environment ?? "") !== "Production" && !(await sandboxAllowed(admin, userId))) return "ok (sandbox ignored)";
    // معاملة مستبعدة (مثل اشتراك تجريبي اشتُري بالخطأ على حساب المراجعة) → لا تمنح شيئًا
    if (t.originalTransactionId) {
      const { data: ignored } = await admin.from("apple_tx_ignore").select("original_transaction_id").eq("original_transaction_id", t.originalTransactionId).maybeSingle();
      if (ignored) return "ok (ignored)";
    }

    if (t.originalTransactionId) {
      const { error } = await admin.from("apple_transactions").upsert({
        original_transaction_id: t.originalTransactionId,
        user_id: userId,
        product_id: t.productId,
        environment: String(t.environment ?? ""),
        expires_at: t.expiresDate ? new Date(t.expiresDate).toISOString() : null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    const { data: current } = await admin.from("entitlements").select("expires_at").eq("user_id", userId).maybeSingle();
    if (current && current.expires_at === null) return "ok (comp)";

    const plan = PRODUCT_PLAN[String(t.productId)];
    if (!plan) return "ok (unknown product)";

    // مهلة الدفع (Billing Grace Period): فشل التجديد لا يسحب الاشتراك ما دامت Apple تمنح مهلة
    let graceUntil = 0;
    const signedRenewal = renewalJws;
    if (signedRenewal && !t.revocationDate) {
      try {
        graceUntil = Number((await verifyRenewalInfo(signedRenewal)).gracePeriodExpiresDate ?? 0);
      } catch {
        // بلا مهلة
      }
    }
    const until = Math.max(isActive(t) ? t.expiresDate! : 0, graceUntil > Date.now() ? graceUntil : 0);

    if (until > 0 && type !== "REFUND" && type !== "REVOKE") {
      const { error } = await admin.from("entitlements").upsert({
        user_id: userId,
        plan_id: plan,
        trial: isTrial(t),
        expires_at: new Date(until).toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } else if (["EXPIRED", "REFUND", "REVOKE", "GRACE_PERIOD_EXPIRED"].includes(type) || until === 0) {
      // الإلغاء وحده (DID_CHANGE_RENEWAL_STATUS) لا يسحب: يستمر حتى تاريخ الانتهاء
      const { error } = await admin.from("entitlements").delete().eq("user_id", userId);
      if (error) throw error;
    }
    return "ok";
  }
});
