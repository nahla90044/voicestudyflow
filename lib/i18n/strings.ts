// lib/i18n/strings.ts
// قاموس الترجمة. المفتاح ثابت، والقيم لكل لغة. العربية هي المرجع (fallback).
// نضيف المفاتيح تدريجيًا مع تعريب كل شاشة. الفرنسي يُملأ لاحقًا (حاليًا = الإنجليزي مؤقتًا).
import type { Lang } from "./index";

const ar: Record<string, string> = {
  // عام
  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.delete": "حذف",
  "common.edit": "تعديل",
  "common.done": "تم",
  "common.ok": "حسناً",
  "common.back": "رجوع",
  "common.next": "التالي",
  "common.close": "إغلاق",
  "common.loading": "جارٍ التحميل…",
  "common.search": "بحث",
  "common.retry": "إعادة المحاولة",
  // اللغة
  "lang.title": "اللغة",
  "lang.subtitle": "اختاري لغة الواجهة",
  "lang.ar": "العربية",
  "lang.en": "English",
  "lang.fr": "Français",
  // المصادقة (تسجيل الدخول / إنشاء حساب)
  "auth.tab.signup": "حساب جديد",
  "auth.tab.login": "تسجيل الدخول",
  "auth.email": "البريد الإلكتروني",
  "auth.password": "كلمة المرور",
  "auth.passwordHint": "٦ أحرف على الأقل",
  "auth.cta.signup": "إنشاء الحساب",
  "auth.cta.login": "دخول",
  "auth.note": "حسابك خاص بك، وكتبك وتقدّمك محفوظة فيه ومنفصلة تمامًا عن غيرك.",
  "auth.confirm.title": "أكّدي بريدك",
  "auth.confirm.sentTo": "أرسلنا رسالة تأكيد إلى",
  "auth.confirm.instructions": "افتحيها واضغطي رابط التأكيد، ثم ارجعي هنا.",
  "auth.confirm.cta": "أكّدت بريدي — دخّليني",
  "auth.err.email": "أدخلي بريدًا صحيحًا",
  "auth.err.password": "كلمة المرور ٦ أحرف على الأقل",
  "auth.err.exists": "هذا البريد مسجّل — سجّلي دخولك بدله.",
  "auth.err.credentials": "البريد أو كلمة المرور غير صحيحة.",
  "auth.err.notConfirmed": "لم يتم تأكيد البريد بعد — افتحي رسالة التأكيد أولًا.",
  "auth.err.notConfirmedRetry": "لم يتم التأكيد بعد. افتحي رسالة التأكيد في بريدك ثم أعيدي المحاولة.",
  "auth.err.generic": "تعذّر إتمام العملية",
};

const en: Record<string, string> = {
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.done": "Done",
  "common.ok": "OK",
  "common.back": "Back",
  "common.next": "Next",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.retry": "Retry",
  "lang.title": "Language",
  "lang.subtitle": "Choose the interface language",
  "lang.ar": "العربية",
  "lang.en": "English",
  "lang.fr": "Français",
  "auth.tab.signup": "Sign up",
  "auth.tab.login": "Log in",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.passwordHint": "At least 6 characters",
  "auth.cta.signup": "Create account",
  "auth.cta.login": "Log in",
  "auth.note": "Your account is yours alone — your books and progress are saved in it and kept completely separate from anyone else.",
  "auth.confirm.title": "Confirm your email",
  "auth.confirm.sentTo": "We sent a confirmation message to",
  "auth.confirm.instructions": "Open it and tap the confirmation link, then come back here.",
  "auth.confirm.cta": "I confirmed — let me in",
  "auth.err.email": "Enter a valid email",
  "auth.err.password": "Password must be at least 6 characters",
  "auth.err.exists": "This email is already registered — log in instead.",
  "auth.err.credentials": "Email or password is incorrect.",
  "auth.err.notConfirmed": "Email not confirmed yet — open the confirmation message first.",
  "auth.err.notConfirmedRetry": "Not confirmed yet. Open the confirmation message in your inbox, then try again.",
  "auth.err.generic": "Couldn't complete the operation",
};

// الفرنسي: يُملأ في مرحلة لاحقة. حاليًا نعتمد على fallback الإنجليزي عبر دالة t.
const fr: Record<string, string> = {
  "lang.ar": "العربية",
  "lang.en": "English",
  "lang.fr": "Français",
};

export const dict: Record<Lang, Record<string, string>> = { ar, en, fr };
