-- 0022_ai_jobs.sql
-- مهام الذكاء الطويلة على السيرفر (الملخّص الشامل، ملخّص الفيديو): التطبيق يطلب ويرجع فورًا،
-- والسيرفر يكمل الكتابة ويحفظ النص أولًا بأول هنا — فيستمر العمل حتى لو قُفلت شاشة الجوال
-- أو أُغلق التطبيق، ويقرأ التطبيق النتيجة عند عودته. كل مستخدم يرى مهامه فقط.
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  partial text not null default '',
  result text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_jobs_user on public.ai_jobs (user_id, created_at desc);
alter table public.ai_jobs enable row level security;
drop policy if exists ai_jobs_own_select on public.ai_jobs;
create policy ai_jobs_own_select on public.ai_jobs for select using (auth.uid() = user_id);
