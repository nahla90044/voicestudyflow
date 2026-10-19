-- توثيق مخالفات «كتابك يجيب»: نص السؤال كاملًا مع سياق المحادثة (للمراجعة والتصعيد لأبل عند الحاجة)
alter table public.security_incidents add column if not exists context jsonb;
