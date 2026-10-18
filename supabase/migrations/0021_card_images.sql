-- 0021_card_images.sql
-- صور البطاقات المولّدة بالذكاء: فهرس مشترك (نفس البطاقة = نفس الصورة للجميع، تُولَّد مرة واحدة)
-- وعدّ شهري لكل مستخدم لضبط التكلفة. الصور نفسها في مخزن card-images العام بأسماء مُجزّأة لا تُخمَّن.
create table if not exists public.card_images (
  hash text primary key,
  path text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists card_images_by_user on public.card_images (created_by, created_at);
alter table public.card_images enable row level security; -- لا وصول مباشر: السيرفر فقط (service role)

insert into storage.buckets (id, name, public) values ('card-images', 'card-images', true)
on conflict (id) do nothing;
