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

    // ملفات PDF داخل مجلّد المستخدم
    try {
      const { data: files } = await admin.storage.from("pdfs").list(uid);
      if (files?.length) {
        await admin.storage.from("pdfs").remove(files.map((f) => `${uid}/${f.name}`));
      }
    } catch {
      // نتجاهل
    }

    // صفوف القاعدة (الكتب تتسلسل للخطط والجلسات)
    await admin.from("books").delete().eq("user_id", uid);
    await admin.from("study_plans").delete().eq("user_id", uid);
    await admin.from("student_events").delete().eq("user_id", uid);
    await admin.from("page_cache").delete().like("pdf_path", `${uid}/%`);
    await admin.from("book_syllabus").delete().like("pdf_path", `${uid}/%`);

    // 3) حذف حساب المصادقة نهائيًا
    const { error: dErr } = await admin.auth.admin.deleteUser(uid);
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
