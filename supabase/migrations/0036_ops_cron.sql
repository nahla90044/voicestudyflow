-- 0036: جدولة الحارس على السيرفر (pg_cron) — يعمل وحده بلا أي جهاز:
-- كل ساعة: إصلاح المهام العالقة وردّ خصمها. كل يوم ٥:٠٠ UTC (٨ صباحًا بتوقيت السعودية): التقرير ثم إرساله بالبريد.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname in ('ops-guard-hourly', 'ops-daily-report', 'ops-daily-mail');
select cron.schedule('ops-guard-hourly', '7 * * * *', $$select public.ops_guard_hourly()$$);
select cron.schedule('ops-daily-report', '0 5 * * *', $$select public.ops_daily_report()$$);
select cron.schedule('ops-daily-mail', '5 5 * * *', $$select net.http_post(url := 'https://jhfufoltmjhauqvgqezv.supabase.co/functions/v1/ops-mail', body := '{}'::jsonb)$$);
