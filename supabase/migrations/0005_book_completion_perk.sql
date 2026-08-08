-- 0005_book_completion_perk.sql
-- إنهاء الكتاب يفتح الحد المجاني من ٣ إلى ١٠ كتب.
--
-- نخزّن الإنجاز على السيرفر (وليس محليًا) حتى لا يضيع عند تغيير الجهاز أو
-- إعادة تثبيت التطبيق — المستخدم يستحق مكافأته مهما انتقل.
--
-- عمود واحد إضافي على books يكفي: وجود صف واحد للمستخدم فيه completed_at
-- غير فارغ = الحد مفتوح. لا حاجة لجدول منفصل، وسياسات RLS الحالية على books
-- (books_select_own / books_update_own) تحمي العمود تلقائيًا.

alter table public.books
  add column if not exists completed_at timestamptz;

comment on column public.books.completed_at is
  'وقت إنهاء المستخدم للكتاب. أول كتاب منتهٍ يرفع الحد المجاني إلى ١٠ كتب.';

-- فهرس جزئي: الاستعلام الوحيد المتوقّع هو "هل لهذا المستخدم كتاب منتهٍ؟"
-- الفهرس الجزئي يتجاهل الصفوف غير المنتهية (الأغلبية) فيبقى صغيرًا.
create index if not exists books_completed_by_user_idx
  on public.books (user_id)
  where completed_at is not null;
