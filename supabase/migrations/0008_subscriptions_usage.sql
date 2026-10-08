-- 0008: الاشتراكات (بلس/برو) وحصص الاستخدام الشهرية.
--
-- entitlements: اشتراك المستخدم الحالي. يكتبه ويب-هوك المتجر فقط (بمفتاح الخدمة)،
--   والمستخدم يقرأ صفّه فقط — التطبيق لا يستطيع منح نفسه اشتراكًا.
-- store_events: كل حدث وصل من المتجر (لمنع معالجة الحدث مرتين).
-- usage_monthly: استهلاك كل مستخدم في الشهر: أحرف الصوت المولَّدة وطلبات الذكاء.
--   الصوت المخبّأ مسبقًا (الكاش المشترك) لا يُحسب — فقط التوليد الجديد.

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('plus_month', 'plus_year', 'pro_month', 'pro_year')),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
drop policy if exists "entitlements_read_own" on public.entitlements;
create policy "entitlements_read_own" on public.entitlements
  for select using (auth.uid() = user_id);

create table if not exists public.store_events (
  id text primary key,
  user_id uuid,
  type text,
  product_id text,
  created_at timestamptz not null default now()
);
alter table public.store_events enable row level security; -- بلا سياسات: مفتاح الخدمة فقط

create table if not exists public.usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null, -- YYYY-MM (UTC)
  voice_chars integer not null default 0,
  ai_requests integer not null default 0,
  primary key (user_id, period)
);
alter table public.usage_monthly enable row level security;
drop policy if exists "usage_read_own" on public.usage_monthly;
create policy "usage_read_own" on public.usage_monthly
  for select using (auth.uid() = user_id);

-- يستهلك من حصة الشهر ذرّيًا. p_limit < 0 = بلا حد (تسجيل فقط).
-- يُرجع true إن سُمح (وسُجّل الاستهلاك)، وfalse إن تجاوز الحد (ولا يُسجَّل شيء).
create or replace function public.consume_usage(p_user uuid, p_kind text, p_amount integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_used integer;
begin
  insert into usage_monthly (user_id, period) values (p_user, v_period) on conflict do nothing;
  if p_kind = 'voice' then
    update usage_monthly set voice_chars = voice_chars + p_amount
      where user_id = p_user and period = v_period and (p_limit < 0 or voice_chars + p_amount <= p_limit)
      returning voice_chars into v_used;
  elsif p_kind = 'ai' then
    update usage_monthly set ai_requests = ai_requests + p_amount
      where user_id = p_user and period = v_period and (p_limit < 0 or ai_requests + p_amount <= p_limit)
      returning ai_requests into v_used;
  else
    raise exception 'unknown usage kind %', p_kind;
  end if;
  return v_used is not null;
end;
$$;

revoke all on function public.consume_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, integer, integer) to service_role;
