-- 0023_cost_log.sql
-- التكلفة الدقيقة لكل طلب (لتسعير الباقات بأرقام حقيقية لا تقدير): الأرقام كما تعيدها الخدمات نفسها —
-- رموز Anthropic الداخلة والخارجة، وثواني صوت جيميناي المولّدة، وعدد الصور. يُسجَّل لكل الحسابات
-- (المالكة أيضًا). الكاش المشترك (صوت/صورة موجودة) يُسجَّل بتكلفة صفر (cached=true) لمعرفة نسبة التوفير.
create table if not exists public.cost_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  fn text not null,            -- ai-assist | tts | card-image
  action text,                 -- studysummary, videoscript, tashkeel… أو page/voice للصوت
  model text,
  input_tokens integer,
  output_tokens integer,
  audio_seconds numeric(10,3),
  chars integer,
  images integer,
  cached boolean not null default false,
  page_key text                -- للصوت: صفحة الكتاب (لحساب تكلفة الصفحة الكاملة)
);
create index if not exists cost_log_time on public.cost_log (created_at);
create index if not exists cost_log_user on public.cost_log (user_id, created_at);
alter table public.cost_log enable row level security; -- السيرفر فقط
