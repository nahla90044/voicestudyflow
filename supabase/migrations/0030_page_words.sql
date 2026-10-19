-- مواضع كلمات الصفحة من التعرّف الضوئي تُحفظ مرة واحدة (التظليل فوري وبلا تكلفة متكررة)
create table if not exists public.page_words (
  pdf_path text not null,
  page integer not null,
  words jsonb not null,
  created_at timestamptz default now(),
  primary key (pdf_path, page)
);
alter table public.page_words enable row level security;
