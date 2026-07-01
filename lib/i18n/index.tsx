// lib/i18n/index.tsx
// نظام تعريب خفيف وإضافي: قاموس + مزوّد + خطّافات. لا يغيّر أي سلوك حتى تُعرَّب الشاشة.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dict } from "./strings";

export type Lang = "ar" | "en" | "fr";
// اللغات المعروضة في الواجهة. الفرنسية مؤجَّلة لتحديث لاحق (البنية جاهزة:
// أعِد "fr" هنا واملأ قاموسها في strings.ts فتظهر تلقائيًا).
export const LANGS: Lang[] = ["ar", "en"];
export const LANG_LABELS: Record<Lang, string> = { ar: "العربية", en: "English", fr: "Français" };
export const isRTLLang = (l: Lang): boolean => l === "ar";

const STORAGE_KEY = "settings:lang";

// سلسلة الاحتياط لكل لغة: الفرنسي يرجع للإنجليزي ثم العربي ريثما يُملأ.
const FALLBACK: Record<Lang, Lang[]> = {
  ar: ["ar"],
  en: ["en", "ar"],
  fr: ["fr", "en", "ar"],
};

/** لغة الجهاز إن كانت مدعومة، وإلا العربية (لغة التطبيق الأساسية). */
function detectDeviceLang(): Lang {
  try {
    const code = getLocales?.()[0]?.languageCode?.toLowerCase();
    if (code === "ar") return "ar";
    // الإنجليزية متاحة الآن؛ والفرنسية مؤجَّلة → نوجّه أجهزتها للإنجليزية مؤقتًا.
    if (code === "en" || code === "fr") return "en";
  } catch {
    // تجاهُل — نرجع للافتراضي
  }
  return "ar";
}

// اللغة الحالية للواجهة كمتغيّر وحدة — لقراءتها خارج React (مثل مولّدات الذكاء
// التي تعمل في المكتبات) فتتبع مخرجات الذكاء لغة الواجهة تلقائيًا.
let _currentLang: Lang = detectDeviceLang();
/** لغة الواجهة الحالية (غير-خطّافية). الفرنسية مؤجَّلة → تُعامَل كإنجليزية. */
export function getCurrentLang(): Lang {
  return _currentLang === "fr" ? "en" : _currentLang;
}

function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s: string | undefined;
  for (const l of FALLBACK[lang]) {
    s = dict[l]?.[key];
    if (s !== undefined) break;
  }
  if (s === undefined) s = key; // المفتاح نفسه كحلّ أخير (يكشف المفاتيح الناقصة بوضوح)
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    }
  }
  return s;
}

type Ctx = {
  lang: Lang;
  isRTL: boolean;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // افتراضي = لغة الجهاز (متزامن، بلا وميض)، ثم يطغى عليه الاختيار المخزّن إن وُجد.
  const [lang, setLangState] = useState<Lang>(detectDeviceLang);

  useEffect(() => {
    (async () => {
      try {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Lang | null;
        // الفرنسية مؤجَّلة: أي اختيار "fr" مخزَّن سابقًا يُعامَل كإنجليزية.
        if (stored === "ar" || stored === "en") setLangState(stored);
        else if (stored === "fr") setLangState("en");
      } catch {
        // تجاهُل
      }
    })();
  }, []);

  // زامن المتغيّر غير-الخطّافي مع لغة الواجهة الحالية (لمولّدات الذكاء)
  useEffect(() => {
    _currentLang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    _currentLang = l;
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const value = useMemo<Ctx>(() => ({ lang, isRTL: isRTLLang(lang), setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export function useLang() {
  const { lang, setLang } = useI18n();
  return { lang, setLang };
}

/**
 * مساعدات الاتجاه — تُستخدم بدل القيم الثابتة عند تعريب كل شاشة:
 *   textAlign:"right"      → dir.textAlign
 *   flexDirection:"row-reverse" → dir.row
 * فتنقلب تلقائيًا للإنجليزي/الفرنسي (LTR) وتبقى عربية (RTL).
 */
export function useDir() {
  const { isRTL } = useI18n();
  return useMemo(
    () => ({
      isRTL,
      textAlign: (isRTL ? "right" : "left") as "right" | "left",
      row: (isRTL ? "row-reverse" : "row") as "row-reverse" | "row",
      writingDirection: (isRTL ? "rtl" : "ltr") as "rtl" | "ltr",
    }),
    [isRTL],
  );
}
