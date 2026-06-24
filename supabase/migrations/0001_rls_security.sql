-- 0001_rls_security.sql
-- أمان على مستوى قاعدة البيانات: كل مستخدم يصل فقط لبياناته (auth.uid()).
-- شغّلي هذا الملف مرة واحدة في Supabase: SQL Editor → الصق → Run.
-- (يتطلب تفعيل "Anonymous sign-ins" من Authentication → Providers.)

-- ============================================================
-- 1) الجداول التي تحمل عمود user_id مباشرة
-- ============================================================

-- books -------------------------------------------------------
alter table public.books enable row level security;

drop policy if exists "books_select_own" on public.books;
create policy "books_select_own" on public.books
  for select using (auth.uid() = user_id);

drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own" on public.books
  for insert with check (auth.uid() = user_id);

drop policy if exists "books_update_own" on public.books;
create policy "books_update_own" on public.books
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own" on public.books
  for delete using (auth.uid() = user_id);

-- study_plans -------------------------------------------------
alter table public.study_plans enable row level security;

drop policy if exists "plans_all_own" on public.study_plans;
create policy "plans_all_own" on public.study_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- student_events ----------------------------------------------
alter table public.student_events enable row level security;

drop policy if exists "events_all_own" on public.student_events;
create policy "events_all_own" on public.student_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 2) الجداول الفرعية (تُورَث ملكيتها من الخطة الأم)
-- ============================================================

-- plan_sessions ينتمي لخطة عبر plan_id
alter table public.plan_sessions enable row level security;

drop policy if exists "sessions_all_own" on public.plan_sessions;
create policy "sessions_all_own" on public.plan_sessions
  for all
  using (
    exists (
      select 1 from public.study_plans p
      where p.id = plan_sessions.plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.study_plans p
      where p.id = plan_sessions.plan_id and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3) التخزين: حاوية pdfs خاصة + كل مستخدم في مجلّده فقط
--    (المسار: <user_id>/<file>.pdf)
-- ============================================================

-- اجعلي الحاوية خاصة (أو من Dashboard: Storage → pdfs → Make private)
update storage.buckets set public = false where id = 'pdfs';

drop policy if exists "pdfs_read_own" on storage.objects;
create policy "pdfs_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pdfs_insert_own" on storage.objects;
create policy "pdfs_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pdfs_delete_own" on storage.objects;
create policy "pdfs_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
