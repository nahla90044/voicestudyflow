// supabase/functions/store-webhook/index.ts
// ويب-هوك المتجر (RevenueCat): الطريق الوحيد لفتح اشتراك بلس/برو أو سحبه.
// التطبيق نفسه لا يستطيع منح اشتراك — يلزم شراء حقيقي من Apple.
// الإعداد: RevenueCat → Integrations → Webhooks
//   الرابط: https://jhfufoltmjhauqvgqezv.functions.supabase.co/store-webhook
//   Authorization: نفس قيمة السر STORE_WEBHOOK_SECRET
// (نُشر بلا تحقّق JWT: verify_jwt=false في config.toml — التحقّق بالسر أعلاه)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// معرّفات المنتجات في App Store Connect → خطط VoiceStudyFlow
const PRODUCTS: Record<string, string> = {
  vsf_plus_month: "plus_month",
  vsf_plus_year: "plus_year",
  vsf_pro_month: "pro_month",
  vsf_pro_year: "pro_year",
};

const GRANT = ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "SUBSCRIPTION_EXTENDED", "TRANSFER"];
const REVOKE = ["EXPIRATION"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const secret = Deno.env.get("STORE_WEBHOOK_SECRET");
  if (!secret || req.headers.get("Authorization") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    const e = body?.event ?? {};
    const eventId = String(e.id ?? "");
    const type = String(e.type ?? "");
    const userId = String(e.app_user_id ?? "");
    const productId = String(e.product_id ?? "");
    if (!eventId || !userId) return new Response("bad request", { status: 400 });
    // هوية الشراء = هوية المستخدم في السيرفر (uuid). غيرها (حدث تجربة من لوحة المتجر) لا يُربط بأحد.
    const known = UUID.test(userId);

    // نفس الحدث لو وصل مرتين يُعالج مرة واحدة
    const seen = await admin.from("store_events").insert({ id: eventId, user_id: known ? userId : null, type, product_id: productId });
    if (seen.error) {
      if (seen.error.code === "23505") return new Response("ok (duplicate)", { status: 200 });
      throw seen.error;
    }
    if (!known) return new Response("ok (unlinked user)", { status: 200 });

    // اشتراك ممنوح يدويًا بلا تاريخ انتهاء: أحداث المتجر لا تغيّره
    const { data: current } = await admin.from("entitlements").select("expires_at").eq("user_id", userId).maybeSingle();
    if (current && current.expires_at === null) return new Response("ok (comp)", { status: 200 });

    const plan = PRODUCTS[productId];
    if (plan && GRANT.includes(type)) {
      await admin.from("entitlements").upsert({
        user_id: userId,
        plan_id: plan,
        expires_at: e.expiration_at_ms ? new Date(Number(e.expiration_at_ms)).toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    } else if (REVOKE.includes(type)) {
      // الإلغاء (CANCELLATION) لا يسحب الاشتراك — يستمر حتى نهايته ثم يصل EXPIRATION
      await admin.from("entitlements").delete().eq("user_id", userId);
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
