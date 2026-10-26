-- 0038: «رصيد الجزء» (قرار نهلة ٢٦ أكتوبر) — الطالب يدفع مرة واحدة لكل جزء من التوليد الطويل
-- (الملخّص الشامل، ملخّص الفيديو، المنهج)، وكل إعادة آلية لنفس الجزء بسبب خلل من جهتنا مجانية:
-- انقطاع، ردّ فارغ أو غير مقروء، توقّف المهمة، فشل البثّ، رفض وكيل الجودة.
-- السبب: فيديو من ٤ أجزاء احتُسب ١٢ طلبًا (٢٦ أكتوبر) لأن كل إعادة كانت تُخصم من جديد.
--
-- كيف تعمل (القواعد نفسها مُختبَرة في tests/partRetryCore.test.ts):
-- - بصمة الجزء part_hash يحسبها السيرفر من الطلب نفسه (الإجراء + النص + خياراته + genId).
-- - الطلب الأول للبصمة يُخصم ويصير «الأصل» (retry_of = null). كل طلب لاحق بنفس البصمة لنفس المستخدم ونفس
--   الإجراء خلال ٦ ساعات من الأصل = إعادة مجانية: قيد بمبلغ صفر مربوط بالأصل (retry_of) للتدقيق.
-- - السقف: ٣ إعادات تُسلِّم نصًا (أو ما زالت تعمل) لكل أصل؛ بعدها RETRY_LIMIT بلا خصم ولا توليد.
--   المحاولة التي لم تُسلِّم شيئًا (failed/empty) لا تُحسب من السقف.
-- - كل محاولة تسجّل حصيلتها outcome عند انتهائها؛ إن انتهت كل محاولات السلسلة ولم تُسلِّم أيٌّ منها شيئًا
--   يُردّ الأصل (ذرّيًا، مرة واحدة). وما وصل الطالبَ منه نص لا يُردّ (فلا يُستغل الردّ).
-- - الحارس الساعي يكمل حصيلة المحاولات التي ماتت بلا تسجيل (مهمة عالقة أو دالة انتهت فجأة).

-- ١) أعمدة الدفتر والمهام
alter table public.usage_ledger add column if not exists part_hash text;
alter table public.usage_ledger add column if not exists retry_of bigint references public.usage_ledger(id) on delete set null;
alter table public.usage_ledger add column if not exists outcome text;
alter table public.usage_ledger drop constraint if exists usage_ledger_outcome_check;
alter table public.usage_ledger add constraint usage_ledger_outcome_check check (outcome is null or outcome in ('ok', 'cut', 'empty', 'failed', 'partial'));
-- الإعادة المجانية قيد بمبلغ صفر (للتدقيق والربط بالمهمة) — كان الشرط amount > 0
alter table public.usage_ledger drop constraint if exists usage_ledger_amount_check;
alter table public.usage_ledger add constraint usage_ledger_amount_check check (amount >= 0);
create index if not exists usage_ledger_part on public.usage_ledger (user_id, action, part_hash, created_at desc) where part_hash is not null;
create index if not exists usage_ledger_retry_of on public.usage_ledger (retry_of) where retry_of is not null;
create index if not exists usage_ledger_open on public.usage_ledger (created_at) where part_hash is not null and outcome is null;

-- سبب توقّف النموذج (end_turn / max_tokens / refusal) — كانت المهمة المقطوعة عند السقف تُعلَّم «منتهية» بلا أثر
alter table public.ai_jobs add column if not exists stop_reason text;
-- الحارس يعتمد آخر نشاط (السيرفر يحدّث updated_at كل ١٠ ثوانٍ حتى أثناء التفكير)
create index if not exists ai_jobs_running on public.ai_jobs (updated_at) where status = 'running';

-- ٢) قبل الخصم: هل هذا الطلب إعادة مجانية لجزء مدفوع؟ (ذرّي: قفل صف الأصل ثم العدّ ثم الإدراج)
-- يُرجع status: 'free' (attempt_id = قيد الإعادة الجديد) أو 'limit' (السقف) أو 'none' (لا أصل ساري → خصم عادي)
create or replace function public.claim_part_retry(p_user uuid, p_action text, p_hash text, p_window_secs integer default 21600, p_cap integer default 3)
returns table (status text, attempt_id bigint, root_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  used integer;
  aid bigint;
begin
  if p_hash is null or p_hash = '' then
    return query select 'none'::text, null::bigint, null::bigint;
    return;
  end if;
  select l.id, l.period, l.kind into r
  from usage_ledger l
  where l.user_id = p_user and l.action = p_action and l.part_hash = p_hash
    and l.retry_of is null and l.amount > 0 and not l.refunded
    and l.created_at > now() - make_interval(secs => p_window_secs)
  order by l.created_at desc, l.id desc
  limit 1
  for update;
  if not found then
    return query select 'none'::text, null::bigint, null::bigint;
    return;
  end if;
  select count(*) into used from usage_ledger
  -- المحاولة المفتوحة تُحسب فقط إن كانت حديثة (حية)؛ الميتة لا تأكل السقف فتوقف التوليد (مراجعة ٢٦ أكتوبر)
  where retry_of = r.id and (outcome in ('ok', 'cut', 'partial') or (outcome is null and created_at > now() - interval '10 minutes'));
  if used >= p_cap then
    return query select 'limit'::text, null::bigint, r.id;
    return;
  end if;
  insert into usage_ledger (user_id, period, kind, amount, action, part_hash, retry_of, reason)
  values (p_user, r.period, r.kind, 0, p_action, p_hash, r.id, 'free_retry')
  returning id into aid;
  return query select 'free'::text, aid, r.id;
end;
$$;

-- ٣) بعد المحاولة: تسجيل حصيلتها (أول تسجيل فقط)، وردّ الأصل إن انتهت السلسلة كلها بلا تسليم أي شيء.
-- يُرجع true إن رُدّ خصم الأصل الآن.
create or replace function public.part_attempt_done(p_attempt bigint, p_outcome text, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  r record;
  root bigint;
begin
  if p_outcome not in ('ok', 'cut', 'empty', 'failed', 'partial') then
    raise exception 'bad outcome %', p_outcome;
  end if;
  select id, retry_of into a from usage_ledger where id = p_attempt;
  if not found then
    return false;
  end if;
  root := coalesce(a.retry_of, a.id);
  -- قفل الأصل: لا تتزامن حصيلتان أو حصيلة وإعادة جديدة على السلسلة نفسها
  select id, user_id, period, kind, amount, refunded into r from usage_ledger where id = root for update;
  update usage_ledger set outcome = p_outcome where id = p_attempt and outcome is null;
  if not found or r.refunded or r.amount <= 0 then
    return false;
  end if;
  -- ما زالت محاولة تعمل، أو سلّمت محاولةٌ نصًا → لا ردّ
  if exists (
    select 1 from usage_ledger
    where (id = root or retry_of = root) and (outcome is null or outcome not in ('failed', 'empty'))
  ) then
    return false;
  end if;
  update usage_ledger set refunded = true, reason = left(coalesce(p_reason, 'part_chain_failed'), 120) where id = root and not refunded;
  if found then
    perform refund_usage(r.user_id, r.period, r.kind, r.amount);
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.claim_part_retry(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.part_attempt_done(bigint, text, text) from public, anon, authenticated;
grant execute on function public.claim_part_retry(uuid, text, text, integer, integer) to service_role;
grant execute on function public.part_attempt_done(bigint, text, text) to service_role;

-- ٤) الحارس الساعي (يحل محل نسخة 0035):
-- أ) المهمة «قيد التشغيل» بلا أي نشاط ٢٠ دقيقة (updated_at، لا created_at: المهمة الطويلة الحية لا تُقتل) → فاشلة.
-- ب) قيود الخصم القديمة (بلا part_hash) المربوطة بها تُردّ كما كانت.
-- ج) محاولات الأجزاء التي لم تُسجَّل حصيلتها: من مهمتها إن انتهت، وإلا فاشلة بعد ٣٠ دقيقة — ثم تُقيَّم السلسلة.
create or replace function public.ops_guard_hourly()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stuck_ids text[];
  r record;
  n integer := 0;
  o text;
begin
  with s as (
    update ai_jobs set status = 'failed', error = 'guard: stuck', updated_at = now()
    where status = 'running' and updated_at < now() - interval '20 minutes'
    returning id::text
  )
  select coalesce(array_agg(id), '{}') into stuck_ids from s;
  for r in select id, user_id, period, kind, amount from usage_ledger where ref = any(stuck_ids) and not refunded and part_hash is null loop
    update usage_ledger set refunded = true, reason = 'guard:stuck_job' where id = r.id and not refunded;
    if found then
      perform refund_usage(r.user_id, r.period, r.kind, r.amount);
      n := n + 1;
    end if;
  end loop;
  for r in
    select l.id, j.status as job_status, j.stop_reason, length(coalesce(j.result, '')) as len
    from usage_ledger l
    left join ai_jobs j on j.id::text = l.ref
    where l.part_hash is not null and l.outcome is null
      and (l.ref = any(stuck_ids) or l.created_at < now() - interval '30 minutes')
  loop
    if r.job_status = 'running' then
      continue; -- مهمة حية (نشاطها حديث) → تُقيَّم عند انتهائها
    elsif r.job_status = 'done' then
      o := case when r.len = 0 then 'empty' when r.stop_reason in ('max_tokens', 'refusal') then 'cut' else 'ok' end;
    else
      o := 'failed';
    end if;
    if part_attempt_done(r.id, o, 'guard:part_chain_failed') then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ٥) التقرير اليومي (يحل محل نسخة 0035): نفس الحقول + الإعادات المجانية لكل مستخدم + أعطال المهام من التطبيق
create or replace function public.ops_daily_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
begin
  d := jsonb_build_object(
    'errors', (select coalesce(jsonb_agg(x), '[]') from (
      select left(message, 160) as message, count(*) as n, count(distinct user_id) as users, min(created_at) as first, max(created_at) as last
      from app_errors where created_at > now() - interval '24 hours' group by 1 order by 2 desc limit 15) x),
    'quality', (select coalesce(jsonb_agg(x), '[]') from (
      select op, count(*) as n from perf_log where created_at > now() - interval '24 hours'
        and (op like 'qa.%' or op like 'syllabus.%') group by 1 order by 2 desc) x),
    -- أعطال المهام والأجزاء كما رآها التطبيق (توقّف، فقد، سقف الإعادات، الخروج من الواجهة…)
    'job_failures', (select coalesce(jsonb_agg(x), '[]') from (
      select op, count(*) as n, count(distinct user_id) as users from perf_log where created_at > now() - interval '24 hours'
        and not ok and (op like 'job.%' or op like 'parts.%') group by 1 order by 2 desc limit 20) x),
    'failed_jobs', (select count(*) from ai_jobs where status = 'failed' and updated_at > now() - interval '24 hours'),
    'refunds', (select coalesce(jsonb_agg(x), '[]') from (
      select reason, count(*) as n from usage_ledger where refunded and created_at > now() - interval '24 hours' group by 1) x),
    -- الإعادات المجانية: نسبة عالية لمستخدم واحد = خلل متكرر عنده (أو محاولة استغلال) — للمراجعة
    'free_retries', (select coalesce(jsonb_agg(x), '[]') from (
      select left(user_id::text, 8) as user,
        count(*) filter (where retry_of is not null) as free,
        count(*) filter (where retry_of is null and amount > 0 and not refunded) as paid,
        count(*) filter (where retry_of is not null and outcome in ('ok', 'cut', 'partial')) as delivered
      from usage_ledger where part_hash is not null and created_at > now() - interval '24 hours'
      group by user_id having count(*) filter (where retry_of is not null) > 0
      order by 2 desc limit 15) x),
    -- شذوذ العدّاد: ما سُجّل في الدفتر (غير المردود) أكبر مما في العدّاد = خصم ضاع أو ردّ زائد
    'counter_mismatch', (select coalesce(jsonb_agg(x), '[]') from (
      select left(l.user_id::text, 8) as user, l.period, sum(l.amount) as ledger, coalesce(max(u.ai_requests), 0) as counter
      from usage_ledger l left join usage_monthly u on u.user_id = l.user_id and u.period = l.period
      where l.kind = 'ai' and not l.refunded group by l.user_id, l.period
      having sum(l.amount) > coalesce(max(u.ai_requests), 0)) x)
  );
  insert into ops_reports (day, data) values (current_date, d)
  on conflict (day) do update set data = excluded.data, sent_at = null;
end;
$$;

revoke all on function public.ops_guard_hourly() from public, anon, authenticated;
revoke all on function public.ops_daily_report() from public, anon, authenticated;
