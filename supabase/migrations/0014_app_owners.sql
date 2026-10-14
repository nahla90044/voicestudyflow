-- حسابات المطوّرة (نهلة): مجانية دائمًا بكل المزايا. القائمة هنا (لا داخل التطبيق فقط)
-- حتى يُتعرَّف على أي بريد جديد فورًا بلا تحديث للتطبيق.
create table if not exists public.app_owners (email text primary key);
alter table public.app_owners enable row level security; -- لا سياسات: لا قراءة مباشرة للعملاء

insert into public.app_owners (email) values
  ('nahlah@hotmail.com'), ('nahla90044@gmail.com'), ('nahla.m.o@icloud.com')
on conflict do nothing;

-- هل المستخدم الحالي حساب مطوّرة؟ (لا يكشف القائمة نفسها)
create or replace function public.am_i_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_owners where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.am_i_owner() from public;
grant execute on function public.am_i_owner() to authenticated;
