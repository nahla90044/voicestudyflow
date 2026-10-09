-- 0009: الاشتراكات مباشرة عبر Apple (StoreKit 2) بدل وسيط خارجي.
-- apple_transactions: ربط كل اشتراك Apple (المعاملة الأصلية) بصاحبه في التطبيق، حتى
-- تصل إشعارات التجديد/الانتهاء للحساب الصحيح. يكتبها السيرفر فقط (مفتاح الخدمة).
create table if not exists public.apple_transactions (
  original_transaction_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text,
  environment text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists apple_transactions_user on public.apple_transactions (user_id);
alter table public.apple_transactions enable row level security; -- بلا سياسات: مفتاح الخدمة فقط
