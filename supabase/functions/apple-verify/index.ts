// supabase/functions/apple-verify/index.ts
// التطبيق يرسل المعاملات الموقّعة من Apple (بعد الشراء/الاستعادة/عند كل فتح) فنتحقّق
// منها ونحدّث اشتراك المستخدم. الطلب يتطلّب دخول المستخدم (verify_jwt=true).
// لا يُمنح اشتراك إلا بمعاملة موقّعة حقيقية من Apple لهذا التطبيق.
import { getCaller } from "../_shared/plan.ts";
import { isActive, isTrial, PAGE_PACKS, PRODUCT_PLAN, verifyTransaction } from "../_shared/apple.ts";

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
  // هل الحساب ما زال موجودًا؟ (حساب محذوف لا «يملك» اشتراكًا — فتنجح الاستعادة على الحساب الجديد)
  const alive = new Map<string, boolean>();
  async function exists(uid: string): Promise<boolean> {
    if (!alive.has(uid)) {
      const { data } = await admin.auth.admin.getUserById(uid).catch(() => ({ data: { user: null } }));
      alive.set(uid, !!data?.user);
    }
    return alive.get(uid)!;
  }
  const me = caller.id.toLowerCase();
  let conflict = false;
  let handled = 0; // معاملات عولجت فعلًا (أو عولجت سابقًا) — التطبيق لا ينهي المعاملة إلا بعدها
  let best: { plan: string; expires: number; trial: boolean } | null = null;
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
        handled++; // أُضيفت الآن أو سابقًا (نفس المعاملة لا تُضاف مرتين)
      } else if (t.revocationDate) {
        handled++; // مسترجعة: لا تُضاف، لكنها عولجت (فلا تعيدها Apple كل مرة)
      }
      continue;
    }
    const plan = PRODUCT_PLAN[String(t.productId)];
    if (!plan || !t.originalTransactionId) continue;
    // اشتراك Apple واحد = حساب واحد في تطبيقنا. نرفض منحه لهذا الحساب إن كان لحساب آخر موجود:
    //  - اشتُري بحساب آخر (appAccountToken مختلف) وذلك الحساب ما زال موجودًا
    //  - أو مربوط سابقًا بحساب آخر موجود (معاملة بلا appAccountToken كانت تُنسب لأي حساب يرسلها)
    // أما إن حُذف الحساب الأصلي فالاستعادة على الحساب الجديد مسموحة.
    const token = (t.appAccountToken ?? "").toLowerCase();
    if (token && token !== me && (await exists(token))) {
      conflict = true;
      continue;
    }
    const { data: owner } = await admin
      .from("apple_transactions")
      .select("user_id")
      .eq("original_transaction_id", t.originalTransactionId)
      .maybeSingle();
    const prev = String(owner?.user_id ?? "").toLowerCase();
    if (prev && prev !== me && token !== me && (await exists(prev))) {
      conflict = true;
      continue;
    }
    // انتقال مشروع (اشتُري بهذا الحساب، أو الحساب السابق محذوف): نسحب الاشتراك من المالك السابق
    if (prev && prev !== me) {
      await admin.from("entitlements").delete().eq("user_id", prev).not("expires_at", "is", null);
    }
    await admin.from("apple_transactions").upsert({
      original_transaction_id: t.originalTransactionId,
      user_id: caller.id,
      product_id: t.productId,
      environment: String(t.environment ?? ""),
      expires_at: t.expiresDate ? new Date(t.expiresDate).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    handled++;
    if (isActive(t)) {
      const rankOf = (p: string) => (p.startsWith("premium") ? 3 : p.startsWith("pro") ? 2 : 1);
      const rank = rankOf(plan);
      const bestRank = best ? rankOf(best.plan) : 0;
      if (rank > bestRank || (rank === bestRank && t.expiresDate! > (best?.expires ?? 0))) {
        best = { plan, expires: t.expiresDate!, trial: isTrial(t) };
      }
    }
  }

  // اشتراك ممنوح يدويًا بلا تاريخ انتهاء لا يُغيَّر
  const { data: current } = await admin.from("entitlements").select("expires_at").eq("user_id", caller.id).maybeSingle();
  if (current && current.expires_at === null) return json({ plan: "comp", credited, conflict, handled });

  if (best) {
    await admin.from("entitlements").upsert({
      user_id: caller.id,
      plan_id: best.plan,
      trial: best.trial,
      expires_at: new Date(best.expires).toISOString(),
      updated_at: new Date().toISOString(),
    });
    return json({ plan: best.plan, expires_at: new Date(best.expires).toISOString(), credited, conflict, handled });
  }
  return json({ plan: null, credited, conflict, handled });
});
