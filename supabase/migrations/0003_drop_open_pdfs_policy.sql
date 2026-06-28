-- 0003_drop_open_pdfs_policy.sql
-- إصلاح أمني: حذف سياسة التخزين المفتوحة "pdfs_anon_all" المتبقّية من setup.sql.
--
-- المشكلة: setup.sql أنشأ سياسة «pdfs_anon_all» على storage.objects تمنح صلاحية
-- كاملة (for all) للدور anon و authenticated لأي ملف داخل حاوية pdfs. أمّا
-- 0001_rls_security.sql فأضاف سياسات مقيّدة بالمجلّد (<user_id>/...) لكنه **لم
-- يحذف** السياسة المفتوحة. وبما أنّ سياسات RLS من نوع PERMISSIVE تُجمَع بـ OR،
-- فإنّ السياسة المفتوحة تتغلّب على المقيّدة وتسمح لأي مستخدم بالوصول لكل ملفات
-- الحاوية (تسريب ملفات المستخدمين). هذا الملف يحذفها فيبقى الوصول مقصورًا على
-- صاحب المجلّد فقط عبر سياسات 0001.
--
-- آمن وقابل للتكرار (idempotent): drop ... if exists.

drop policy if exists "pdfs_anon_all" on storage.objects;

-- تأكيد أنّ الحاوية خاصّة (ليست عامّة) — تكرارٌ دفاعيّ لِما في 0001.
update storage.buckets set public = false where id = 'pdfs';
