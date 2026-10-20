-- 0032: جدول وحدات الكتاب (تواريخ مذاكرة كل وحدة) وتقدّم المذاكرة (مقاطع الملخص المسموعة ومشاهد الفيديو) — يتزامن بين أجهزة المستخدم
alter table public.book_syllabus add column if not exists schedule jsonb;
alter table public.book_syllabus add column if not exists progress jsonb not null default '{}'::jsonb;
