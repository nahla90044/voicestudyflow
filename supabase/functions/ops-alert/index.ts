// supabase/functions/ops-alert/index.ts
// تنبيه المالكة فورًا (٢٨ أكتوبر: نفد رصيد الذكاء مرتين ولم تعرف إلا من التطبيق). يستدعيه المجدول كل ١٥ دقيقة.
// بلا بيانات مُدخلة: يقرأ الحالة من القاعدة (owner_alert_state) ويرسل لأجهزة المالكة المسجّلة (owner_push_tokens)
// إشعارًا فوريًا عبر خدمة إشعارات Expo، وبريدًا إن وُجد مفتاح الإرسال. كل حدث مرة واحدة: توقف واحد حتى يعود،
// وتجاوز الصرف مرة في اليوم — فاستدعاؤه المتكرر لا يُزعج ولا يكشف شيئًا.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TO = ["nahla90044@gmail.com"];
const FROM = "VoiceStudyFlow <reports@voicestudyflow.app>";

type State = { ai_down_at: string | null; spend_today: number; spend_limit: number; open_tickets?: number; last_ticket?: { id: number; q: string } | null };

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return new Response(JSON.stringify({ error: "not configured" }), { status: 500 });
  const admin = createClient(url, service);
  const { data: st, error } = await admin.rpc("owner_alert_state");
  if (error || !st) return new Response(JSON.stringify({ error: error?.message ?? "no state" }), { status: 500 });
  const s = st as State;

  const cfg = async (key: string) => (await admin.from("app_config").select("value").eq("key", key).maybeSingle()).data?.value as string | undefined;
  const setCfg = (key: string, value: string) => admin.from("app_config").upsert({ key, value, updated_at: new Date().toISOString() });
  const today = new Date().toISOString().slice(0, 10);

  const alerts: { title: string; body: string }[] = [];
  // علامات «أُرسل» لا تُحفظ إلا بعد وصول التنبيه فعلًا (جهاز أو بريد) — وإلا يُعاد في الدورة التالية
  const marks: [string, string][] = [];
  // توقف الذكاء: مرة لكل توقف (يُعاد التنبيه إن عاد بعد أن انتهى السابق بساعة)
  if (s.ai_down_at) {
    const last = await cfg("alert_ai_down_sent");
    if (!last || Date.parse(s.ai_down_at) - Date.parse(last) > 60 * 60_000) {
      alerts.push({ title: "⚠️ توقفت خدمة الذكاء", body: "رصيد Anthropic نفد على الأرجح — الملخّصات والفيديو والاختبارات متوقفة للجميع. يلزم الشحن من صفحة الفوترة." });
      marks.push(["alert_ai_down_sent", s.ai_down_at]);
    }
  }
  // تجاوز الصرف: مرة في اليوم
  if (Number(s.spend_today) > Number(s.spend_limit) && (await cfg("alert_spend_sent")) !== today) {
    alerts.push({ title: "💸 صرف الذكاء اليوم مرتفع", body: `صُرف اليوم ${s.spend_today}$ على نماذج Claude (الحد ${s.spend_limit}$).` });
    marks.push(["alert_spend_sent", today]);
  }
  // رسالة دعم جديدة (لم يحلّها الوكيل): مرة لكل رسالة
  if (s.last_ticket?.id) {
    const lastSent = Number((await cfg("alert_ticket_sent")) ?? 0);
    if (s.last_ticket.id > lastSent) {
      alerts.push({ title: "💬 رسالة دعم جديدة", body: `${s.last_ticket.q}${(s.open_tickets ?? 0) > 1 ? ` — (${s.open_tickets} رسائل مفتوحة)` : ""}` });
      marks.push(["alert_ticket_sent", String(s.last_ticket.id)]);
    }
  }
  if (!alerts.length) return new Response(JSON.stringify({ sent: 0 }));

  // إشعار فوري لأجهزة المالكة
  const { data: toks } = await admin.from("owner_push_tokens").select("token");
  const tokens = (toks ?? []).map((t: { token: string }) => t.token);
  let pushed = 0;
  if (tokens.length) {
    const msgs = alerts.flatMap((a) => tokens.map((to) => ({ to, title: a.title, body: a.body, sound: "default" })));
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(msgs),
    }).catch(() => null);
    if (res?.ok) {
      const out = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
      pushed = out?.data?.filter((d) => d.status === "ok").length ?? 0;
      // جهاز أُزيل منه التطبيق: يُحذف رمزه
      out?.data?.forEach((d, i) => {
        if (d.details?.error === "DeviceNotRegistered") void admin.from("owner_push_tokens").delete().eq("token", msgs[i].to);
      });
    }
  }
  // بريد (إن أُضيف مفتاح الإرسال)
  const key = Deno.env.get("RESEND_API_KEY");
  let mailed = false;
  if (key) {
    const html = `<div dir="rtl" style="font-family:-apple-system,Tahoma,sans-serif;line-height:1.8">${alerts.map((a) => `<h3>${a.title}</h3><p>${a.body}</p>`).join("")}</div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: TO, subject: alerts[0].title, html }),
    }).catch(() => null);
    mailed = !!r?.ok;
  }
  if (pushed > 0 || mailed) for (const [k, v] of marks) await setCfg(k, v);
  return new Response(JSON.stringify({ alerts: alerts.length, pushed, mailed }));
});
