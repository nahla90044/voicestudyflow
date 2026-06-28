# Privacy Policy — VoiceStudyFlow

_Last updated: June 28, 2026_

VoiceStudyFlow ("the app", "we") is a study app that lets you read your own
PDF books, listen to them in a natural human voice, and organize a study plan.
This policy explains what data we handle and why. We collect the minimum needed
to run the app, and your study content is private to your account.

## Who is responsible
The app is designed and developed by Nahla. For any privacy question or request,
contact: **Nahlah@Nahlah.io**.

## What we collect

- **Account data:** your email address and an encrypted password, used only to
  create and secure your account. We never see your password in plain text.
- **Your content:** PDF files you upload, plus the study data you create
  (reading progress, study plans, highlights, notes, flashcards, activity/streak
  stats). This is stored under your account and is not shared with other users.
- **Voice cache:** generated audio is cached (on your device and on our server,
  keyed by content) so the same passage isn't regenerated, which keeps the app
  fast and reduces cost. The cache holds audio, not your identity.
- **Device language:** read once to pick your interface language. Not stored on
  our servers.
- **Notifications token** (only if you enable the daily reminder): used solely to
  deliver your reminder.

We do **not** collect advertising identifiers, contacts, location, or browsing
history, and we do **not** sell your data.

## How your content is processed

To provide reading features, page text and images are sent to trusted service
providers strictly to perform the requested task, then returned to you:

- **Supabase** — authentication, database, and file storage (our backend).
- **ElevenLabs** — converts text to a human voice (text‑to‑speech).
- **Google Cloud Vision** — reads text from scanned/image pages (OCR).
- **AI assistant provider** — generates summaries, questions, and flashcards
  when you ask for them.

These providers process the content only to return the result; provider API keys
are kept on our server and are never embedded in the app.

## Data security

- Each user can access only their own rows and files, enforced at the database
  level (row‑level security scoped to your account) and on file storage
  (each user's files live in their own private folder).
- All traffic uses encrypted connections (HTTPS).
- Secrets (provider keys) live only on the server, never in the app bundle.

## Your responsibility for uploaded content

You are responsible for the content you upload. Please upload only material you
have the right to use. The app is not responsible for the uploading of
copyright‑protected material by users.

## Your rights

- **Archive or delete** any book at any time from inside the app.
- **Delete your account and data:** email **Nahlah@Nahlah.io** and we will remove
  your account and associated content.

## Children

The app is intended for students and general users and is not directed at
children under the age required by your local app store. We do not knowingly
collect data from children below that age.

## Changes

If this policy changes, we will update the date above and, for material changes,
notify you in the app.

## Contact

Questions or requests: **Nahlah@Nahlah.io** · Made in Riyadh.

---

# سياسة الخصوصية — VoiceStudyFlow

_آخر تحديث: ٢٨ يونيو ٢٠٢٦_

تطبيق VoiceStudyFlow («التطبيق») يتيح لك قراءة كتبك بصيغة PDF، والاستماع إليها
بصوت بشري طبيعي، وتنظيم خطة مذاكرة. توضّح هذه السياسة البيانات التي نتعامل معها
ولماذا. نجمع الحدّ الأدنى اللازم لتشغيل التطبيق، ومحتوى مذاكرتك خاصّ بحسابك.

## المسؤول عن التطبيق
تصميم وتطوير: Nahla. لأي استفسار أو طلب يخصّ الخصوصية: **Nahlah@Nahlah.io**.

## ما الذي نجمعه

- **بيانات الحساب:** بريدك الإلكتروني وكلمة مرور مشفّرة، لإنشاء حسابك وحمايته فقط.
  لا نرى كلمة المرور كنص صريح أبدًا.
- **محتواك:** ملفات PDF التي ترفعها، وبيانات المذاكرة التي تنشئها (تقدّم القراءة،
  الخطط، التظليلات، الملاحظات، البطاقات، إحصاءات النشاط والسلسلة). تُحفظ ضمن حسابك
  ولا تُشارَك مع مستخدمين آخرين.
- **ذاكرة الصوت:** يُخزَّن الصوت المُولَّد (على جهازك وعلى خادمنا، بمفتاح للمحتوى)
  حتى لا يُعاد توليد المقطع نفسه، فيبقى التطبيق سريعًا وأقل تكلفة. الذاكرة تخزّن
  الصوت لا هويتك.
- **لغة الجهاز:** تُقرأ مرة واحدة لاختيار لغة الواجهة، ولا تُخزَّن على خوادمنا.
- **رمز الإشعارات** (فقط إذا فعّلت التذكير اليومي): لإيصال تذكيرك لا غير.

نحن **لا** نجمع معرّفات إعلانية، ولا جهات الاتصال، ولا الموقع، ولا سجل التصفّح،
و**لا** نبيع بياناتك.

## كيف يُعالَج محتواك

لتوفير ميزات القراءة، يُرسَل نص الصفحة وصورها إلى مزوّدي خدمات موثوقين لأداء المهمة
المطلوبة فقط، ثم تُعاد إليك النتيجة:

- **Supabase** — المصادقة وقاعدة البيانات وتخزين الملفات (الخادم الخلفي).
- **ElevenLabs** — تحويل النص إلى صوت بشري.
- **Google Cloud Vision** — استخراج النص من الصفحات المصوّرة (OCR).
- **مزوّد مساعد الذكاء** — توليد الملخّصات والأسئلة والبطاقات عند طلبك.

يعالج هؤلاء المزوّدون المحتوى لإعادة النتيجة فقط، ومفاتيح المزوّدين محفوظة على
خادمنا ولا تُضمَّن داخل التطبيق إطلاقًا.

## أمان البيانات

- يصل كل مستخدم إلى صفوفه وملفاته فقط، مفروضًا على مستوى قاعدة البيانات
  (أمان صفوف مقيّد بحسابك) وعلى التخزين (ملفات كل مستخدم في مجلّده الخاص).
- كل الاتصالات مشفّرة (HTTPS).
- الأسرار (مفاتيح المزوّدين) على الخادم فقط، لا في حزمة التطبيق.

## مسؤوليتك عن المحتوى المرفوع

أنت مسؤول عن المحتوى الذي ترفعه. الرجاء رفع ما تملك حق استخدامه فقط. لا يتحمّل
التطبيق مسؤولية رفع مواد محمية بحقوق ملكية فكرية من قِبَل المستخدمين.

## حقوقك

- **الأرشفة أو الحذف** لأي كتاب في أي وقت من داخل التطبيق.
- **حذف الحساب والبيانات:** راسل **Nahlah@Nahlah.io** وسنحذف حسابك ومحتواه.

## الأطفال

التطبيق موجّه للطلاب والمستخدمين عمومًا وليس موجّهًا للأطفال دون السن الذي يحدّده
متجر التطبيقات في بلدك، ولا نجمع عن قصد بيانات ممّن هم دون ذلك السن.

## التغييرات

عند تغيّر هذه السياسة سنحدّث التاريخ أعلاه، ولأي تغيير جوهري سننبّهك داخل التطبيق.

## التواصل

للاستفسارات والطلبات: **Nahlah@Nahlah.io** · صُنع في الرياض.
