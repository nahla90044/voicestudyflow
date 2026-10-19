-- أخطاء التطبيق (بدل الإغلاق الصامت): رسالة الخطأ ومكانه ونسخة التطبيق، لتشخيص أي كراش بدقة
create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  message text not null,
  stack text,
  where_ text,
  fatal boolean default false,
  app_version text,
  created_at timestamptz default now()
);
alter table public.app_errors enable row level security;
drop policy if exists app_errors_insert_own on public.app_errors;
create policy app_errors_insert_own on public.app_errors for insert to authenticated with check (user_id = auth.uid());
