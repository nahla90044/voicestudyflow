-- أسبوع التجربة المجانية لاشتراك مدفوع: حدود صغيرة (١٠ صفحات + ٥ طلبات) حتى يبدأ الدفع
alter table public.entitlements add column if not exists trial boolean not null default false;
