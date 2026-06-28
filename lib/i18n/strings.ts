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
};

// الفرنسي: يُملأ في مرحلة لاحقة. حاليًا نعتمد على fallback الإنجليزي عبر دالة t.
const fr: Record<string, string> = {
  "lang.ar": "العربية",
  "lang.en": "English",
  "lang.fr": "Français",
};

export const dict: Record<Lang, Record<string, string>> = { ar, en, fr };
