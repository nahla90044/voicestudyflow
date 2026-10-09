-- 0010: حصص الاشتراك بالصفحات (بدل الأحرف) + رصيد صفحات إضافية.
--
-- page_listens: كل صفحة استمع لها المستخدم في الفترة (شهر YYYY-MM، أو lifetime للخطة
--   المجانية) وفئة الصوت (std = الصوت الأساسي، prem = الصوت الفاخر). الصفحة تُحسب مرة
--   واحدة في الفترة: إعادة الاستماع لها مجانية.
-- page_credits: رصيد صفحات إضافية مشتراة (يُستهلك بعد انتهاء صفحات الخطة الأساسية).
-- apple_consumables: مشتريات الصفحات الإضافية من Apple — كل معاملة تُضاف مرة واحدة.
create table if not exists public.page_listens (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  page_key text not null,
  tier text not null check (tier in ('std', 'prem')),
  created_at timestamptz not null default now(),
  primary key (user_id, period, page_key, tier)
);
alter table public.page_listens enable row level security;
drop policy if exists "page_listens_read_own" on public.page_listens;
create policy "page_listens_read_own" on public.page_listens for select using (auth.uid() = user_id);

create table if not exists public.page_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
alter table public.page_credits enable row level security;
drop policy if exists "page_credits_read_own" on public.page_credits;
create policy "page_credits_read_own" on public.page_credits for select using (auth.uid() = user_id);

create table if not exists public.apple_consumables (
  transaction_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  pages integer not null,
  created_at timestamptz not null default now()
);
alter table public.apple_consumables enable row level security; -- مفتاح الخدمة فقط

-- يستهلك صفحة: 'again' (سُمعت سابقًا في الفترة — مجانية)، 'ok' (من حصة الخطة)،
-- 'credit' (من الرصيد الإضافي — للصوت الأساسي فقط)، 'over' (انتهت الحصة).
-- p_limit < 0 = بلا حد (تسجيل فقط).
create or replace function public.consume_page(p_user uuid, p_period text, p_key text, p_tier text, p_limit integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if exists (select 1 from page_listens where user_id = p_user and period = p_period and page_key = p_key and tier = p_tier) then
    return 'again';
  end if;
  select count(*) into v_used from page_listens where user_id = p_user and period = p_period and tier = p_tier;
  if p_limit < 0 or v_used < p_limit then
    insert into page_listens (user_id, period, page_key, tier) values (p_user, p_period, p_key, p_tier) on conflict do nothing;
    return 'ok';
  end if;
  if p_tier = 'std' then
    update page_credits set balance = balance - 1, updated_at = now() where user_id = p_user and balance > 0;
    if found then
      insert into page_listens (user_id, period, page_key, tier) values (p_user, p_period, p_key, p_tier) on conflict do nothing;
      return 'credit';
    end if;
  end if;
  return 'over';
end;
$$;

-- استهلاك عام (طلبات الذكاء / أحرف خارج الصفحات) بفترة صريحة (lifetime للمجانية).
create or replace function public.consume_usage_p(p_user uuid, p_period text, p_kind text, p_amount integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into usage_monthly (user_id, period) values (p_user, p_period) on conflict do nothing;
  if p_kind = 'voice' then
    update usage_monthly set voice_chars = voice_chars + p_amount
      where user_id = p_user and period = p_period and (p_limit < 0 or voice_chars + p_amount <= p_limit)
      returning voice_chars into v_used;
  elsif p_kind = 'ai' then
    update usage_monthly set ai_requests = ai_requests + p_amount
      where user_id = p_user and period = p_period and (p_limit < 0 or ai_requests + p_amount <= p_limit)
      returning ai_requests into v_used;
  else
    raise exception 'unknown usage kind %', p_kind;
  end if;
  return v_used is not null;
end;
$$;

-- يضيف صفحات مشتراة مرة واحدة لكل معاملة Apple
create or replace function public.credit_pages(p_user uuid, p_tx text, p_product text, p_pages integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into apple_consumables (transaction_id, user_id, product_id, pages) values (p_tx, p_user, p_product, p_pages);
  insert into page_credits (user_id, balance) values (p_user, p_pages)
    on conflict (user_id) do update set balance = page_credits.balance + p_pages, updated_at = now();
  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke all on function public.consume_page(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.consume_usage_p(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.credit_pages(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_page(uuid, text, text, text, integer) to service_role;
grant execute on function public.consume_usage_p(uuid, text, text, integer, integer) to service_role;
grant execute on function public.credit_pages(uuid, text, text, integer) to service_role;
