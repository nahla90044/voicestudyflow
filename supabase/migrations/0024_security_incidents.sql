-- 0024_security_incidents.sql
-- حوادث الاستخدام غير الآمن (محتوى فيه أوامر موجّهة لأنظمة الذكاء أو رموز خفية): تُسجَّل كدليل
-- (للمراجعة ومخاطبة Apple عند الحاجة)، ويُوقف الحساب عند الخطورة العالية أو التكرار.
create table if not exists public.security_incidents (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  email text,
  fn text not null,
  action text,
  severity text not null check (severity in ('medium', 'high')),
  signals text[] not null default '{}',
  excerpt text,
  user_agent text,
  app_version text
);
create index if not exists security_incidents_user on public.security_incidents (user_id, created_at desc);
alter table public.security_incidents enable row level security; -- السيرفر والمالكة فقط (لوحة التحكم)

create table if not exists public.account_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  incident_id bigint references public.security_incidents(id) on delete set null,
  locked_at timestamptz not null default now()
);
alter table public.account_locks enable row level security;
drop policy if exists account_locks_own_select on public.account_locks;
-- صاحب الحساب يرى حالة حسابه فقط (ليعرض التطبيق شاشة الإيقاف)
create policy account_locks_own_select on public.account_locks for select using (auth.uid() = user_id);
