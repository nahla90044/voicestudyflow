-- سجل تشخيص مختصر لمسار الشراء (التحقق من معاملات Apple): لمعرفة سبب أي فشل بدقة.
create table if not exists public.iap_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  stage text not null,
  product_id text,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.iap_log enable row level security; -- مفتاح الخدمة فقط
