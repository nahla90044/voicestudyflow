-- 0020_apple_tx_ignore.sql
-- معاملات Apple مستبعدة: لا تمنح اشتراكًا لأي حساب (إشعارات التجديد أو الاستعادة).
-- السبب (١٨ أكتوبر 2026): اشتراك تجريبي (Sandbox) اشتُري بالخطأ على حساب المراجعة في ١٥ أكتوبر
-- يتجدد يوميًا عبر إشعارات Apple، فيعيد Premium للحساب بعد كل حذف → المراجع لا يرى زر الشراء.
create table if not exists public.apple_tx_ignore (
  original_transaction_id text primary key,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.apple_tx_ignore enable row level security; -- السيرفر فقط (service role)

insert into public.apple_tx_ignore (original_transaction_id, reason)
values ('2000001252075130', 'Sandbox premium bought on the App Review demo account (15 Oct 2026)')
on conflict do nothing;
