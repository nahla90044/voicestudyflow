-- 0026_book_checks.sql
-- فحص كل كتاب عند رفعه على السيرفر (إلزامي، لا يُتجاوز من التطبيق): الأوامر الخفية، الصور المخلة،
-- والمحتوى المخالف بحسب سياقه. دوال الكتاب ترفض أي ملف لم يجتز الفحص. الكتب السابقة تُعدّ مجتازة.
create table if not exists public.book_checks (
  pdf_path text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null check (status in ('allow', 'reject')),
  category text,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.book_checks enable row level security;
drop policy if exists book_checks_own_select on public.book_checks;
create policy book_checks_own_select on public.book_checks for select using (auth.uid() = user_id);

-- الكتب المرفوعة قبل هذا الفحص: مجتازة
insert into public.book_checks (pdf_path, user_id, status, category, reason)
select o.name, (split_part(o.name, '/', 1))::uuid, 'allow', 'legacy', 'رُفع قبل الفحص الإلزامي'
from storage.objects o
where o.bucket_id = 'pdfs' and split_part(o.name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and exists (select 1 from auth.users u where u.id = (split_part(o.name, '/', 1))::uuid)
on conflict (pdf_path) do nothing;
