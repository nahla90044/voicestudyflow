-- استرجاع ثمن باقة صفحات (إشعار REFUND/REVOKE من Apple): نسحب صفحاتها من الرصيد مرة واحدة.
alter table public.apple_consumables add column if not exists refunded_at timestamptz;

create or replace function public.refund_pages(p_tx text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update apple_consumables set refunded_at = now()
    where transaction_id = p_tx and refunded_at is null
    returning user_id, pages into r;
  if not found then
    return 0;
  end if;
  update page_credits set balance = greatest(0, balance - r.pages), updated_at = now() where user_id = r.user_id;
  return r.pages;
end;
$$;

revoke all on function public.refund_pages(text) from public, anon, authenticated;
grant execute on function public.refund_pages(text) to service_role;
