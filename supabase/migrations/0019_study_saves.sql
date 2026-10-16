-- محفوظات الكتاب: العروض التقديمية وإجابات المساعد الذكي يحفظها المستخدم ليرجع لها لاحقًا.
-- مرتبطة بالكتاب وبحساب المستخدم (تبقى بعد تسجيل الخروج وتظهر على كل أجهزته).
create table if not exists public.study_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  kind text not null check (kind in ('slides', 'assistant')),
  title text not null,
  scope text, -- page | unit
  page_from integer,
  page_to integer,
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists study_saves_book_idx on public.study_saves (user_id, book_id, created_at desc);
alter table public.study_saves enable row level security;
drop policy if exists "study_saves_own" on public.study_saves;
create policy "study_saves_own" on public.study_saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
