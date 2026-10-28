-- 0039_owner_alerts.sql
-- تنبيه المالكة قبل أن يلاحظ العملاء (٢٨ أكتوبر: نفد رصيد الذكاء مرتين ولم تعرف إلا من التطبيق):
-- • توقف الذكاء (مهمة فشلت بـ AI_UNAVAILABLE خلال آخر ساعة)
-- • صرف اليوم على نماذج Claude تجاوز الحد (app_config.alert_spend_usd، الافتراضي ١٠$)
-- تقرؤها المالكة في التطبيق (owner_alerts)، ويرسلها ops-alert إشعارًا فوريًا لأجهزتها (owner_push_tokens) وبريدًا إن وُجد مفتاحه.

create table if not exists public.owner_push_tokens (
  token text primary key,
  created_at timestamptz not null default now()
);
alter table public.owner_push_tokens enable row level security; -- لا وصول مباشر: الإضافة عبر الدالة فقط

-- حساب المالكة من بريد الجلسة المؤكَّد (نفس قائمة التطبيق والسيرفر + app_owners)
create or replace function public.is_owner_session() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and (lower(u.email) in ('nahlah@hotmail.com', 'nahla90044@gmail.com', 'nahla.m.o@icloud.com')
           or exists (select 1 from public.app_owners o where lower(o.email) = lower(u.email)))
  );
$$;

-- صرف اليوم (UTC) على Claude بأسعار ٢٨ أكتوبر لكل مليون رمز
create or replace function public.claude_spend_today() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(case
    when model like 'claude-sonnet-5-5%' then (coalesce(input_tokens,0)*2.0 + coalesce(output_tokens,0)*10.0)/1e6
    when model like 'claude-sonnet-4-6%' then (coalesce(input_tokens,0)*3.0 + coalesce(output_tokens,0)*15.0)/1e6
    when model like 'claude-haiku-5-5%' then (coalesce(input_tokens,0)*0.1 + coalesce(output_tokens,0)*0.5)/1e6
    when model like 'claude-haiku-4-5%' then (coalesce(input_tokens,0)*1.0 + coalesce(output_tokens,0)*5.0)/1e6
    when model like 'claude-opus-5-5%' then (coalesce(input_tokens,0)*4.0 + coalesce(output_tokens,0)*20.0)/1e6
    when model like 'claude-opus%' then (coalesce(input_tokens,0)*5.0 + coalesce(output_tokens,0)*25.0)/1e6
    else 0 end)::numeric, 2), 0)
  from public.cost_log
  where created_at >= date_trunc('day', now()) and model like 'claude%' and not coalesce(cached, false);
$$;

create or replace function public.owner_alert_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ai_down_at', (select max(updated_at) from public.ai_jobs where error = 'AI_UNAVAILABLE' and updated_at > now() - interval '60 minutes'),
    'spend_today', public.claude_spend_today(),
    'spend_limit', coalesce((select value::numeric from public.app_config where key = 'alert_spend_usd'), 10)
  );
$$;

-- للمالكة فقط من التطبيق
create or replace function public.owner_alerts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner_session() then return null; end if;
  return public.owner_alert_state();
end $$;

create or replace function public.register_owner_push(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner_session() or p_token is null or p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' then return false; end if;
  insert into public.owner_push_tokens(token) values (p_token) on conflict do nothing;
  return true;
end $$;

revoke all on function public.owner_alert_state() from public, anon, authenticated;
revoke all on function public.claude_spend_today() from public, anon, authenticated;
grant execute on function public.owner_alerts() to authenticated;
grant execute on function public.register_owner_push(text) to authenticated;

-- كل ١٥ دقيقة: ops-alert يفحص ويرسل (مرة لكل حدث: توقف واحد، وتجاوز واحد في اليوم)
select cron.schedule('ops-owner-alert', '*/15 * * * *',
  $$select net.http_post(url := 'https://jhfufoltmjhauqvgqezv.supabase.co/functions/v1/ops-alert', body := '{}'::jsonb)$$);
