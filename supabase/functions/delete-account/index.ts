// supabase/functions/delete-account/index.ts
// حذف نهائي لحساب المستخدم: يتحقق من هوية المستخدم من التوكن (verify_jwt)، ثم
// يحذف عبر مفتاح الخدمة كل بياناته (ملفات + صفوف) وحساب المصادقة نفسه.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Server not configured" }, 500);

    // 1) هوية المستخدم من توكن الطلب
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON ?? SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: uErr,
    } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Unauthorized" }, 401);
    const uid = user.id;

    // 2) عميل بمفتاح الخدمة لحذف كل شيء
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // كل ملفات المستخدم: الكتب (pdfs) وصور صفحاتها (page-img) — بصفحات متتالية (كان يحذف أول ١٠٠ ملف فقط)
    async function wipe(bucket: string, prefix: string): Promise<void> {
      for (let round = 0; round < 50; round++) {
        const { data: items } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
        if (!items?.length) return;
        const files = items.filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
        const dirs = items.filter((f) => !f.id).map((f) => `${prefix}/${f.name}`);
        for (const d of dirs) await wipe(bucket, d);
        if (!files.length) return;
        await admin.storage.from(bucket).remove(files);
      }
    }
    for (const bucket of ["pdfs", "page-img"]) {
      try {
        await wipe(bucket, uid);
      } catch {
        // نكمل الحذف
      }
    }

    // صفوف القاعدة (الكتب تتسلسل للخطط والجلسات)
    await admin.from("books").delete().eq("user_id", uid);
    await admin.from("study_plans").delete().eq("user_id", uid);
    await admin.from("student_events").delete().eq("user_id", uid);
    await admin.from("page_cache").delete().like("pdf_path", `${uid}/%`);
    await admin.from("book_syllabus").delete().like("pdf_path", `${uid}/%`);
    // سجلات تشغيلية مرتبطة بالمستخدم (بلا مفتاح أجنبي). سجل حوادث الأمان يبقى لحماية الخدمة (مذكور في الخصوصية)
    await admin.from("cost_log").delete().eq("user_id", uid);
    await admin.from("iap_log").delete().eq("user_id", uid);

    // 3) حذف حساب المصادقة نهائيًا
    const { error: dErr } = await admin.auth.admin.deleteUser(uid);
    if (dErr) {
      console.error("delete user", dErr.message);
      return json({ error: "DELETE_FAILED" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("delete-account", String((e as Error)?.message ?? e));
    return json({ error: "DELETE_FAILED" }, 500);
  }
});
