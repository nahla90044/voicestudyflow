-- 0034: وكيل العدّاد — كل خصم طلب ذكي يُسجَّل في دفتر، والعمل الذي فشل على السيرفر يُردّ خصمه تلقائيًا
-- (مرة واحدة فقط لكل قيد)، فلا يُحسب على المستخدم زيادة. والحارس اليومي يطابق العدّاد مع الدفتر.
create table if not exists public.usage_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  kind text not null check (kind in ('ai', 'voice')),
  amount integer not null check (amount > 0),
  action text,
  refunded boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists usage_ledger_user_period on public.usage_ledger (user_id, period);
alter table public.usage_ledger enable row level security;
drop policy if exists "usage_ledger_read_own" on public.usage_ledger;
create policy "usage_ledger_read_own" on public.usage_ledger for select using (auth.uid() = user_id);

-- ردّ خصم (لا ينزل العدّاد تحت الصفر)
create or replace function public.refund_usage(p_user uuid, p_period text, p_kind text, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'ai' then
    update usage_monthly set ai_requests = greatest(0, ai_requests - p_amount) where user_id = p_user and period = p_period;
  elsif p_kind = 'voice' then
    update usage_monthly set voice_chars = greatest(0, voice_chars - p_amount) where user_id = p_user and period = p_period;
  end if;
end;
$$;
revoke all on function public.refund_usage(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.refund_usage(uuid, text, text, integer) to service_role;
