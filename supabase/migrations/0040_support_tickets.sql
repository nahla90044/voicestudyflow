-- 0040_support_tickets.sql
-- وكيل الدعم (قرار نهلة ٢٨ أكتوبر): ما لم يحلّه الوكيل يُحفظ رسالةً للمالكة («لم تُحلّ مشكلتي»)،
-- ويصلها إشعار فوري (ops-alert)، وتراها في قائمة «رسائل الدعم» في التطبيق مع بريد صاحبها للرد.

create table if not exists public.support_tickets (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null check (length(question) between 1 and 1000),
  answer text check (length(answer) <= 4000),
  app_version text check (length(app_version) <= 40),
  plan text check (length(plan) <= 20),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists tickets_insert_own on public.support_tickets;
create policy tickets_insert_own on public.support_tickets for insert to authenticated with check (user_id = auth.uid() and status = 'open');
drop policy if exists tickets_select_own on public.support_tickets;
create policy tickets_select_own on public.support_tickets for select to authenticated using (user_id = auth.uid());

-- حد الإساءة: عشر رسائل في اليوم لكل مستخدم
create or replace function public.support_ticket_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.support_tickets where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'TICKET_LIMIT';
  end if;
  return new;
end $$;
drop trigger if exists support_ticket_limit on public.support_tickets;
create trigger support_ticket_limit before insert on public.support_tickets for each row execute function public.support_ticket_limit();

-- للمالكة: القائمة (مع البريد للرد) وإغلاق الرسالة
create or replace function public.owner_tickets()
returns table (id bigint, question text, answer text, plan text, app_version text, status text, created_at timestamptz, email text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner_session() then return; end if;
  return query
    select t.id, t.question, t.answer, t.plan, t.app_version, t.status, t.created_at, u.email::text
    from public.support_tickets t left join auth.users u on u.id = t.user_id
    order by (t.status = 'open') desc, t.created_at desc limit 200;
end $$;

create or replace function public.owner_close_ticket(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner_session() then return false; end if;
  update public.support_tickets set status = 'done' where id = p_id;
  return found;
end $$;
grant execute on function public.owner_tickets() to authenticated;
grant execute on function public.owner_close_ticket(bigint) to authenticated;

-- حالة التنبيه: ومعها الرسائل المفتوحة وآخر رقم (لإشعار كل رسالة جديدة مرة واحدة)
create or replace function public.owner_alert_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ai_down_at', (select max(updated_at) from public.ai_jobs where error = 'AI_UNAVAILABLE' and updated_at > now() - interval '60 minutes'),
    'spend_today', public.claude_spend_today(),
    'spend_limit', coalesce((select value::numeric from public.app_config where key = 'alert_spend_usd'), 10),
    'open_tickets', (select count(*) from public.support_tickets where status = 'open'),
    'last_ticket', (select jsonb_build_object('id', id, 'q', left(question, 120)) from public.support_tickets order by id desc limit 1)
  );
$$;
revoke all on function public.owner_alert_state() from public, anon, authenticated;
