-- 0035: حارس الأعطال على السيرفر (يعمل وحده كل ساعة بلا جهاز أحد):
-- ١) المهام العالقة (running أكثر من ٢٠ دقيقة) تُعلَّم فاشلة ويُردّ خصمها تلقائيًا (القيد مربوط بالمهمة ref).
-- ٢) تقرير يومي في ops_reports: الأعطال، رفض وكلاء الجودة، المناهج غير المتحقَّق منها، الردود، وشذوذ العدّاد.
-- ٣) التقرير يُرسل بالبريد عبر الدالة ops-mail (إن وُجد مفتاح الإرسال)، ويبقى محفوظًا دائمًا.
alter table public.usage_ledger add column if not exists ref text;
create index if not exists usage_ledger_ref on public.usage_ledger (ref) where ref is not null;

create table if not exists public.ops_reports (
  id bigserial primary key,
  day date not null unique,
  data jsonb not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ops_reports enable row level security; -- مفتاح الخدمة فقط

create or replace function public.ops_guard_hourly()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stuck_ids text[];
  r record;
  n integer := 0;
begin
  with s as (
    update ai_jobs set status = 'failed', error = 'guard: stuck', updated_at = now()
    where status = 'running' and created_at < now() - interval '20 minutes'
    returning id::text
  )
  select coalesce(array_agg(id), '{}') into stuck_ids from s;
  for r in select id, user_id, period, kind, amount from usage_ledger where ref = any(stuck_ids) and not refunded loop
    update usage_ledger set refunded = true, reason = 'guard:stuck_job' where id = r.id and not refunded;
    if found then
      perform refund_usage(r.user_id, r.period, r.kind, r.amount);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.ops_daily_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
begin
  d := jsonb_build_object(
    'errors', (select coalesce(jsonb_agg(x), '[]') from (
      select left(message, 160) as message, count(*) as n, count(distinct user_id) as users, min(created_at) as first, max(created_at) as last
      from app_errors where created_at > now() - interval '24 hours' group by 1 order by 2 desc limit 15) x),
    'quality', (select coalesce(jsonb_agg(x), '[]') from (
      select op, count(*) as n from perf_log where created_at > now() - interval '24 hours'
        and (op like 'qa.%' or op like 'syllabus.%') group by 1 order by 2 desc) x),
    'failed_jobs', (select count(*) from ai_jobs where status = 'failed' and updated_at > now() - interval '24 hours'),
    'refunds', (select coalesce(jsonb_agg(x), '[]') from (
      select reason, count(*) as n from usage_ledger where refunded and created_at > now() - interval '24 hours' group by 1) x),
    -- شذوذ العدّاد: ما سُجّل في الدفتر (غير المردود) أكبر مما في العدّاد = خصم ضاع أو ردّ زائد
    'counter_mismatch', (select coalesce(jsonb_agg(x), '[]') from (
      select left(l.user_id::text, 8) as user, l.period, sum(l.amount) as ledger, coalesce(max(u.ai_requests), 0) as counter
      from usage_ledger l left join usage_monthly u on u.user_id = l.user_id and u.period = l.period
      where l.kind = 'ai' and not l.refunded group by l.user_id, l.period
      having sum(l.amount) > coalesce(max(u.ai_requests), 0)) x)
  );
  insert into ops_reports (day, data) values (current_date, d)
  on conflict (day) do update set data = excluded.data, sent_at = null;
end;
$$;

revoke all on function public.ops_guard_hourly() from public, anon, authenticated;
revoke all on function public.ops_daily_report() from public, anon, authenticated;
