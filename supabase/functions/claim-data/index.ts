// supabase/functions/claim-data/index.ts
// يرحّل بيانات المستخدم من «معرّف الجهاز» القديم إلى حساب المصادقة الحقيقي.
// يُستدعى مرّة بعد أول تسجيل دخول مؤكَّد. آمن: يتحقّق من هوية المتصل عبر التوكن،
// ولا يحرّك أي ملفات تخزين — يكتفي بإعادة تعيين الملكية (user_id) في الجداول.
// الطلب:  { deviceId: string, accessToken: string }
// الرد:   { moved: { books, plans, events, sessions } }
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

// شكل معرّف صالح (UUID) — حماية من حقن قيم غريبة
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars");

    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "");
    const accessToken = String(body.accessToken ?? "");
    if (!UUID.test(deviceId)) return json({ error: "Invalid deviceId" }, 400);
    if (!accessToken) return json({ error: "Missing accessToken" }, 401);

    // تحقّق من هوية المتصل عبر التوكن → نأخذ uid الحقيقي منه (لا من جسم الطلب)
    const authClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const {
      data: { user },
      error: uErr,
    } = await authClient.auth.getUser();
    if (uErr || !user?.id) return json({ error: "Invalid session" }, 401);
    const uid = user.id;

    // المتصل لا يحتاج أن يكون مالكًا مسبقًا — هو يطالب ببيانات جهازه القديم
    if (deviceId === uid) return json({ moved: { books: 0, plans: 0, events: 0, sessions: 0 } });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    async function reassign(table: string): Promise<number> {
      const { data, error } = await admin
        .from(table)
        .update({ user_id: uid })
        .eq("user_id", deviceId)
        .select("id");
      if (error) throw new Error(`${table}: ${error.message}`);
      return data?.length ?? 0;
    }

    const books = await reassign("books");
    const plans = await reassign("study_plans").catch(() => 0);
    const events = await reassign("student_events").catch(() => 0);
    const sessions = await reassign("plan_sessions").catch(() => 0);

    return json({ moved: { books, plans, events, sessions } });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
