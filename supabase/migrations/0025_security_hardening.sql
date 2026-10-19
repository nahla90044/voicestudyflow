-- 0025_security_hardening.sql
-- (١) سقف حروف الصوت لكل صفحة محسوبة: الصفحة تُحسب مرة في الشهر، لكن كان يمكن توليد صوت بلا حد
--     بنفس رقم الصفحة. السقف أعلى من أطول صفحة حقيقية مقيسة (٥٤٤٩ حرفًا) مع هامش للتشكيل.
-- (٢) قفل لكل مستخدم داخل احتساب الصفحة: طلبات متوازية كانت تتجاوز حد الباقة.
-- (٣) سياسات العيّنات: القراءة للجميع، والكتابة للسيرفر فقط (كان أي مستخدم يستطيع تعديل نص صفحات العيّنات).
create table if not exists public.page_chars (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  page_key text not null,
  chars integer not null default 0,
  primary key (user_id, period, page_key)
);
alter table public.page_chars enable row level security; -- السيرفر فقط

create or replace function public.add_page_chars(p_user uuid, p_period text, p_key text, p_chars integer, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  insert into page_chars (user_id, period, page_key, chars) values (p_user, p_period, p_key, 0) on conflict do nothing;
  update page_chars set chars = chars + p_chars
    where user_id = p_user and period = p_period and page_key = p_key and chars + p_chars <= p_cap
    returning chars into v;
  return v is not null;
end;
$$;
revoke all on function public.add_page_chars(uuid, text, text, integer, integer) from public, anon, authenticated;

create or replace function public.consume_page(p_user uuid, p_period text, p_key text, p_tier text, p_limit integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtext('consume_page:' || p_user::text));
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
revoke all on function public.consume_page(uuid, text, text, text, integer) from public, anon, authenticated;

-- (٣) العيّنات: قراءة للجميع، وكتابة/تعديل/حذف للمالك فقط (صفوف العيّنات بمفتاح الخدمة)
drop policy if exists page_cache_own on public.page_cache;
create policy page_cache_read on public.page_cache for select
  using (split_part(pdf_path, '/', 1) = auth.uid()::text or split_part(pdf_path, '/', 1) = 'samples');
create policy page_cache_write on public.page_cache for insert with check (split_part(pdf_path, '/', 1) = auth.uid()::text);
create policy page_cache_update on public.page_cache for update
  using (split_part(pdf_path, '/', 1) = auth.uid()::text) with check (split_part(pdf_path, '/', 1) = auth.uid()::text);
create policy page_cache_delete on public.page_cache for delete using (split_part(pdf_path, '/', 1) = auth.uid()::text);

drop policy if exists book_syllabus_own on public.book_syllabus;
create policy book_syllabus_read on public.book_syllabus for select
  using (split_part(pdf_path, '/', 1) = auth.uid()::text or split_part(pdf_path, '/', 1) = 'samples');
create policy book_syllabus_write on public.book_syllabus for insert with check (split_part(pdf_path, '/', 1) = auth.uid()::text);
create policy book_syllabus_update on public.book_syllabus for update
  using (split_part(pdf_path, '/', 1) = auth.uid()::text) with check (split_part(pdf_path, '/', 1) = auth.uid()::text);
create policy book_syllabus_delete on public.book_syllabus for delete using (split_part(pdf_path, '/', 1) = auth.uid()::text);
