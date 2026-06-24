-- ============================================================
-- VoiceStudyFlow — إعداد مشروع Supabase جديد (انسخي كل الملف مرة واحدة)
-- Supabase → SQL Editor → New query → الصق → Run
-- هذه نسخة "تشتغل فورًا" للتجربة. للحماية الكاملة قبل النشر
-- شغّلي بعدها supabase/migrations/0001_rls_security.sql.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- الجداول ----------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null default 'كتاب',
  pdf_path text,
  page_count int default 0,
  is_archived boolean default false,
  archived_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  book_id uuid references public.books(id) on delete cascade,
  start_date date,
  end_date date,
  daily_minutes int default 60,
  buffer_ratio numeric default 0.15,
  created_at timestamptz default now()
);

create table if not exists public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.study_plans(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  session_date date,
  kind text default 'study',
  minutes int default 0,
  status text default 'pending',
  pages_target int default 0,
  pages_done int default 0,
  created_at timestamptz default now()
);

create table if not exists public.student_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  event_date date,
  event_time text,
  event_type text,
  status text default 'pending',
  created_at timestamptz default now()
);

-- ---------- صلاحيات الوصول عبر الـAPI (للتجربة) ----------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- ---------- التخزين (حاوية ملفات PDF) ----------
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', true)
on conflict (id) do update set public = true;

drop policy if exists "pdfs_anon_all" on storage.objects;
create policy "pdfs_anon_all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'pdfs')
  with check (bucket_id = 'pdfs');
