-- 0002_rls_cache_syllabus.sql
-- ⚠️ لا تُطبّق هذه السياسات إلا بعد تفعيل **مصادقة حقيقية** (تسجيل بريد/كلمة مرور)
-- بحيث يصبح لكل مستخدم جلسة `authenticated` بـ auth.uid(). حاليًا التطبيق بلا
-- جلسة مصادقة (يستخدم معرّف جهاز احتياطيًا)، فتطبيق RLS الآن يحجب الوصول.
-- بعد تفعيل المصادقة + ترحيل بيانات المستخدم من معرّف الجهاز إلى auth.uid()،
-- تُطبَّق هذه السياسات (وكذلك 0001 على books/study_plans) لإغلاق الوصول العام.
--
-- ملكية الصف تُشتق من بادئة pdf_path: «{auth.uid()}/...» للمالك، و«samples/...» مشترك.

-- ---------- page_cache ----------
alter table public.page_cache enable row level security;
drop policy if exists "page_cache_own" on public.page_cache;
create policy "page_cache_own" on public.page_cache
  for all
  to authenticated
  using (
    split_part(pdf_path, '/', 1) = auth.uid()::text
    or split_part(pdf_path, '/', 1) = 'samples'
  )
  with check (
    split_part(pdf_path, '/', 1) = auth.uid()::text
    or split_part(pdf_path, '/', 1) = 'samples'
  );

-- ---------- book_syllabus ----------
alter table public.book_syllabus enable row level security;
drop policy if exists "book_syllabus_own" on public.book_syllabus;
create policy "book_syllabus_own" on public.book_syllabus
  for all
  to authenticated
  using (
    split_part(pdf_path, '/', 1) = auth.uid()::text
    or split_part(pdf_path, '/', 1) = 'samples'
  )
  with check (
    split_part(pdf_path, '/', 1) = auth.uid()::text
    or split_part(pdf_path, '/', 1) = 'samples'
  );
