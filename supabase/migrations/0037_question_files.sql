-- ملفات الأسئلة الجاهزة (قرار نهلة ٢٥ أكتوبر): يرفع الطالب ملف أسئلة لكتاب، فتُستخرج أسئلته
-- (وجوابها من الملف، أو من الكتاب مع اقتباس الإثبات) وتُربط بوحداته، ويُبنى منها اختبار للمراجعة.
-- جدول مستقل (لا study_saves) فيتزامن بين أجهزة الطالب ولا يضيع بتغيير لغة الواجهة.
create table if not exists public.question_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  pdf_path text not null,          -- مسار ملف الأسئلة في حاوية pdfs
  name text not null default '',
  pages int not null default 0,
  status text not null default 'reading' check (status in ('reading', 'solving', 'ready', 'failed')),
  done_chunks int not null default 0,   -- تقدّم الاستخراج (يكمل من حيث توقف بعد القفل)
  total_chunks int not null default 0,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists question_files_book on public.question_files (book_id);
alter table public.question_files enable row level security;
drop policy if exists question_files_own on public.question_files;
create policy question_files_own on public.question_files for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
