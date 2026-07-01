-- 0004_enforce_isolation.sql
-- ضمان نهائي لعزل البيانات: كل مستخدم يصل لبياناته فقط (auth.uid()).
-- آمن للتكرار (idempotent) — شغّليه في Supabase: SQL Editor → Run.

-- ===== books =====
alter table public.books enable row level security;
alter table public.books force row level security;
drop policy if exists "books_select_own" on public.books;
create policy "books_select_own" on public.books for select to authenticated using (auth.uid() = user_id);
drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own" on public.books for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "books_update_own" on public.books;
create policy "books_update_own" on public.books for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own" on public.books for delete to authenticated using (auth.uid() = user_id);

-- ===== study_plans =====
alter table public.study_plans enable row level security;
alter table public.study_plans force row level security;
drop policy if exists "plans_all_own" on public.study_plans;
create policy "plans_all_own" on public.study_plans for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== student_events =====
alter table public.student_events enable row level security;
alter table public.student_events force row level security;
drop policy if exists "events_all_own" on public.student_events;
create policy "events_all_own" on public.student_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== plan_sessions (ملكية من الخطة الأم) =====
alter table public.plan_sessions enable row level security;
alter table public.plan_sessions force row level security;
drop policy if exists "sessions_all_own" on public.plan_sessions;
create policy "sessions_all_own" on public.plan_sessions for all to authenticated
  using (exists (select 1 from public.study_plans p where p.id = plan_sessions.plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.study_plans p where p.id = plan_sessions.plan_id and p.user_id = auth.uid()));

-- ===== page_cache (ملكية من بادئة pdf_path) =====
alter table public.page_cache enable row level security;
alter table public.page_cache force row level security;
drop policy if exists "page_cache_own" on public.page_cache;
create policy "page_cache_own" on public.page_cache for all to authenticated
  using (split_part(pdf_path,'/',1) = auth.uid()::text or split_part(pdf_path,'/',1) = 'samples')
  with check (split_part(pdf_path,'/',1) = auth.uid()::text or split_part(pdf_path,'/',1) = 'samples');

-- ===== book_syllabus =====
alter table public.book_syllabus enable row level security;
alter table public.book_syllabus force row level security;
drop policy if exists "book_syllabus_own" on public.book_syllabus;
create policy "book_syllabus_own" on public.book_syllabus for all to authenticated
  using (split_part(pdf_path,'/',1) = auth.uid()::text or split_part(pdf_path,'/',1) = 'samples')
  with check (split_part(pdf_path,'/',1) = auth.uid()::text or split_part(pdf_path,'/',1) = 'samples');

-- ===== storage: pdfs (حاوية خاصة + كل مستخدم في مجلّده) =====
update storage.buckets set public = false where id = 'pdfs';
drop policy if exists "pdfs_anon_all" on storage.objects;
drop policy if exists "pdfs_read_own" on storage.objects;
create policy "pdfs_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pdfs_insert_own" on storage.objects;
create policy "pdfs_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pdfs_delete_own" on storage.objects;
create policy "pdfs_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
