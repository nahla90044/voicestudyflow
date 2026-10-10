-- إعدادات عامة يقرأها التطبيق (بلا تسجيل): أقل نسخة مدعومة لإجبار التحديث
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists "app_config_read_all" on public.app_config;
create policy "app_config_read_all" on public.app_config for select using (true);
insert into public.app_config (key, value) values ('min_ios_version', '2.0.0')
  on conflict (key) do nothing;
