-- 0007: تخزين دائم لمخرجات «النطق الدقيق» لكل صفحة.
-- tashkeel: النص المشكول (وللصفحات الممسوحة: مصحَّح من أخطاء OCR ثم مشكول).
-- tashkeel_ver: إصدار المعالجة (ocr-v1 / plain-v1) — تغييره يبطل المخزّن.
-- الفائدة: تكلفة الذكاء تُدفع مرة واحدة لكل صفحة بدل كل جلسة قراءة.
-- الأمان: صفوف page_cache محمية أصلًا بسياسة RLS بملكية بادئة pdf_path (هجرة 0004).
alter table public.page_cache add column if not exists tashkeel text;
alter table public.page_cache add column if not exists tashkeel_ver text;
