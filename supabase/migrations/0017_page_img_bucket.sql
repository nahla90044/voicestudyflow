-- كاش صور صفحات PDF (JPEG) على السيرفر: تُولَّد الصفحة مرة واحدة، ثم تُنزَّل برابط موقّع
-- مباشرة (بلا تحويل base64 في التطبيق — كان يجمّد الواجهة). خاص: لا وصول للعملاء إلا بروابط موقّعة.
insert into storage.buckets (id, name, public)
values ('page-img', 'page-img', false)
on conflict (id) do nothing;
