// supabase/functions/ops-mail/index.ts
// يرسل تقرير الحارس اليومي (ops_reports) لبريد المالكة. يستدعيه المجدول على السيرفر كل يوم.
// بلا بيانات مُدخلة: يرسل فقط آخر تقرير لم يُرسل، لعناوين ثابتة — فاستدعاؤه لا يكشف شيئًا ولا يتكرر.
// بلا مفتاح الإرسال (RESEND_API_KEY) يُتخطّى بهدوء ويبقى التقرير محفوظًا في الجدول.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TO = ["nahla90044@gmail.com"];
const FROM = "VoiceStudyFlow <reports@voicestudyflow.app>";

type Report = {
  errors: { message: string; n: number; users: number }[];
  quality: { op: string; n: number }[];
  failed_jobs: number;
  refunds: { reason: string; n: number }[];
  counter_mismatch: { user: string; period: string; ledger: number; counter: number }[];
};

const QA: Record<string, string> = {
  "syllabus.unverified": "منهج لم يتحقق منه وكيل الوحدات",
  "syllabus.healed": "منهج صحّحه الإصلاح الذاتي",
  "qa.quiz.dropped": "أسئلة حُذفت لعدم وجود دليلها",
  "qa.quiz.unmatched": "اختبار تعذّرت مطابقة اقتباساته",
};
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function html(day: string, r: Report): { subject: string; body: string } {
  const issues = r.errors.reduce((a, e) => a + e.n, 0) + r.failed_jobs + r.counter_mismatch.length;
  const subject = issues ? `تقرير VoiceStudyFlow ${day}: ${issues} يحتاج نظرة` : `تقرير VoiceStudyFlow ${day}: لا أعطال`;
  const li = (items: string[]) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "<p>لا شيء ✓</p>");
  const body = `<div dir="rtl" style="font-family:-apple-system,Tahoma,sans-serif;line-height:1.8">
<h2>تقرير الحارس اليومي — ${day}</h2>
<h3>الأعطال في التطبيق (آخر ٢٤ ساعة)</h3>${li(r.errors.map((e) => `${esc(e.message)} — ${e.n} مرة، ${e.users} مستخدم`))}
<h3>وكلاء الجودة</h3>${li(r.quality.map((q) => `${QA[q.op] ?? esc(q.op)}: ${q.n}`))}
<h3>مهام توليد فشلت</h3><p>${r.failed_jobs}</p>
<h3>خصومات رُدّت تلقائيًا</h3>${li(r.refunds.map((x) => `${esc(x.reason ?? "")}: ${x.n}`))}
<h3>العدّاد</h3>${li(r.counter_mismatch.map((m) => `مستخدم ${m.user} (${m.period}): الدفتر ${m.ledger} والعدّاد ${m.counter}`))}
</div>`;
  return { subject, body };
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const key = Deno.env.get("RESEND_API_KEY");
  if (!url || !service) return new Response(JSON.stringify({ error: "not configured" }), { status: 500 });
  if (!key) return new Response(JSON.stringify({ skipped: "no sender key" }));
  const admin = createClient(url, service);
  const { data: rep } = await admin.from("ops_reports").select("id,day,data").is("sent_at", null).order("day", { ascending: false }).limit(1).maybeSingle();
  if (!rep) return new Response(JSON.stringify({ sent: 0 }));
  const { subject, body } = html(String(rep.day), rep.data as Report);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: TO, subject, html: body }),
  });
  if (!res.ok) return new Response(JSON.stringify({ error: `send ${res.status}` }), { status: 502 });
  await admin.from("ops_reports").update({ sent_at: new Date().toISOString() }).eq("id", rep.id);
  return new Response(JSON.stringify({ sent: 1 }));
});
