// supabase/functions/apple-verify/index.ts
// التطبيق يرسل المعاملات الموقّعة من Apple (بعد الشراء/الاستعادة/عند كل فتح) فنتحقّق
// منها ونحدّث اشتراك المستخدم. الطلب يتطلّب دخول المستخدم (verify_jwt=true).
// لا يُمنح اشتراك إلا بمعاملة موقّعة حقيقية من Apple لهذا التطبيق.
import { getCaller } from "../_shared/plan.ts";
import { isActive, PAGE_PACKS, PRODUCT_PLAN, verifyTransaction } from "../_shared/apple.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  let list: string[] = [];
  try {
    const body = await req.json();
    list = (Array.isArray(body?.jws) ? body.jws : [body?.jws]).filter((x: unknown) => typeof x === "string").slice(0, 20);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!list.length) return json({ error: "bad request" }, 400);

  const { admin } = caller;
  let best: { plan: string; expires: number } | null = null;
  let credited = 0;
  for (const jws of list) {
    let t;
    try {
      t = await verifyTransaction(jws);
    } catch (e) {
      console.error("verify failed", String(e));
      continue;
    }
    // صفحات إضافية (شراء استهلاكي): تُضاف للرصيد مرة واحدة لكل معاملة
    const packPages = PAGE_PACKS[String(t.productId)];
    if (packPages) {
      if (t.appAccountToken && t.appAccountToken.toLowerCase() !== caller.id.toLowerCase()) continue;
      if (t.transactionId && !t.revocationDate) {
        const { data: added } = await admin.rpc("credit_pages", {
          p_user: caller.id,
          p_tx: t.transactionId,
          p_product: t.productId,
          p_pages: packPages,
        });
        if (added) credited += packPages;
      }
      continue;
    }
    const plan = PRODUCT_PLAN[String(t.productId)];
    if (!plan || !t.originalTransactionId) continue;
    // معاملة اشتُريت بحساب آخر في تطبيقنا (appAccountToken مختلف) → لا نمنحها لهذا الحساب
    if (t.appAccountToken && t.appAccountToken.toLowerCase() !== caller.id.toLowerCase()) continue;
    await admin.from("apple_transactions").upsert({
      original_transaction_id: t.originalTransactionId,
      user_id: caller.id,
      product_id: t.productId,
      environment: String(t.environment ?? ""),
      expires_at: t.expiresDate ? new Date(t.expiresDate).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (isActive(t)) {
      const rank = plan.startsWith("pro") ? 2 : 1;
      const bestRank = best ? (best.plan.startsWith("pro") ? 2 : 1) : 0;
      if (rank > bestRank || (rank === bestRank && t.expiresDate! > (best?.expires ?? 0))) {
        best = { plan, expires: t.expiresDate! };
      }
    }
  }

  // اشتراك ممنوح يدويًا بلا تاريخ انتهاء لا يُغيَّر
  const { data: current } = await admin.from("entitlements").select("expires_at").eq("user_id", caller.id).maybeSingle();
  if (current && current.expires_at === null) return json({ plan: "comp", credited });

  if (best) {
    await admin.from("entitlements").upsert({
      user_id: caller.id,
      plan_id: best.plan,
      expires_at: new Date(best.expires).toISOString(),
      updated_at: new Date().toISOString(),
    });
    return json({ plan: best.plan, expires_at: new Date(best.expires).toISOString(), credited });
  }
  return json({ plan: null, credited });
});
