-- 0031: دالة فحص المالكة للمستخدمين المسجّلين فقط (لا للزائر anon)
revoke execute on function public.am_i_owner() from anon, public;
grant execute on function public.am_i_owner() to authenticated;
