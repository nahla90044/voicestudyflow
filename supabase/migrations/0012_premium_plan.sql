-- باقة «بريميوم» (٣٠٠ صفحة + ١٥٠ طلبًا) — توسيع القيم المسموحة لاشتراك المستخدم
alter table public.entitlements drop constraint if exists entitlements_plan_id_check;
alter table public.entitlements add constraint entitlements_plan_id_check
  check (plan_id in ('plus_month', 'plus_year', 'pro_month', 'pro_year', 'premium_month', 'premium_year'));
