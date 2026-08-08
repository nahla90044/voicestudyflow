-- 0006_music_shared_bucket.sql
-- كاش الموسيقى المشترك.
--
-- دالة music كانت تولّد المقطوعة من جديد لكل مستخدم: انتظار طويل (٣٠–١٢٠ ثانية
-- من الصوت تُولَّد لحظيًا) وتكلفة مكرّرة على محتوى ثابت. المقطوعات محدودة العدد
-- ومعرّفة سلفًا في MUSIC_OPTIONS، فتخزينها مرة واحدة يجعلها فورية للجميع.
--
-- خاص تمامًا وبلا سياسات للعملاء — الوصول عبر الدالة بمفتاح الخدمة فقط،
-- تمامًا كـ bucket «tts-shared».
insert into storage.buckets (id, name, public)
values ('music-shared', 'music-shared', false)
on conflict (id) do nothing;
