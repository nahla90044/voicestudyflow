-- قياس السرعة الفعلية لكل عملية مهمة (لا تقديرات): المدة بالمللي ثانية ونجاحها وحجمها
create table if not exists public.perf_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  op text not null,
  ms integer not null,
  ok boolean default true,
  size integer,
  app_version text,
  created_at timestamptz default now()
);
create index if not exists perf_log_op_time on public.perf_log (op, created_at desc);
alter table public.perf_log enable row level security;
drop policy if exists perf_log_insert_own on public.perf_log;
create policy perf_log_insert_own on public.perf_log for insert to authenticated with check (user_id = auth.uid());
