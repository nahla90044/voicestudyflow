-- 0002_rls_cache_syllabus.sql
-- يُكمل تأمين قاعدة البيانات: يُفعّل RLS على جدولَي page_cache و book_syllabus
-- اللذين كانا بلا حماية.
--
-- مسارات الملفات نوعان:
--   • «samples/...»  → كتب تجريبية عامة مشتركة للجميع (قراءة/كتابة مسموحة للكل).
--   • «{auth.uid()}/...» → كتب المستخدم الخاصة (لمالكها فقط).
-- بهذا لا يستطيع أي مستخدم قراءة أو تعديل محتوى كتب غيره الخاصة.
-- ملاحظة: دوال الحافة تكتب بمفتاح service_role فتتجاوز RLS طبيعيًا.

-- ---------- page_cache (نص الصفحات المستخرَج) ----------
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

-- ---------- book_syllabus (المنهج المُولّد للكتاب) ----------
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
