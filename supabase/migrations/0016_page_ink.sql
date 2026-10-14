-- كتابة القلم على صفحات الكتب (الآيباد): خطوط كل صفحة لكل مستخدم، تظهر على كل أجهزته.
-- الإحداثيات نسبية لعرض الصفحة (x<0 أو x>1 = الهامش)، فلا تتأثر بالتكبير أو حجم الشاشة.
create table if not exists public.page_ink (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  page integer not null,
  strokes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id, page)
);
alter table public.page_ink enable row level security;
drop policy if exists "page_ink_own" on public.page_ink;
create policy "page_ink_own" on public.page_ink
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
