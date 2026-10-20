-- 0033: إعادة توليد مجانية واحدة لكل مهمة رفضها وكيل الجودة (الملخّص/الفيديو)
-- المستخدم لا يدفع ثمن خلل اكتشفه التطبيق؛ والعلامة تمنع تكرار المجانية لنفس المهمة.
alter table public.ai_jobs add column if not exists qa_retried boolean not null default false;
