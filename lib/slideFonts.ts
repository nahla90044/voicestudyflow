// lib/slideFonts.ts
// خطوط أشكال شرائح «ملخّص الفيديو»: Reem Kufi للعناوين، وAmiri للتعريفات والأرقام العملاقة،
// وIBM Plex Sans Arabic للشرح والترجمة، وAref Ruqaa لمسة خطية. ملفات TTF داخل حزم JS خالصة
// (@expo-google-fonts/*) فتصل بالتحديث الهوائي بلا بناء جديد. كل وزن يُستورد من مساره الفرعي
// فلا يدخل التحديث إلا الأوزان التسعة المستعملة، وكل وزن باسم مستقل (أندرويد لا يركّب الأوزان).
// - preloadSlideFonts(): عند فتح شاشة الفيديو (لا في _layout حتى لا تتأخر شاشة البداية).
// - useSlideFonts(): ff(role) → { fontFamily } بعد التحميل، وقبله أو عند فشله { fontWeight } بخط النظام.
//   ممنوع وضع fontWeight مع خط مخصص: iOS يرجع عندها إلى خط النظام.
import { ArefRuqaa_700Bold } from "@expo-google-fonts/aref-ruqaa/700Bold";
import { Amiri_400Regular } from "@expo-google-fonts/amiri/400Regular";
import { Amiri_700Bold } from "@expo-google-fonts/amiri/700Bold";
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { ReemKufi_600SemiBold } from "@expo-google-fonts/reem-kufi/600SemiBold";
import { ReemKufi_700Bold } from "@expo-google-fonts/reem-kufi/700Bold";
import * as Font from "expo-font";
import { useMemo } from "react";
import type { TextStyle } from "react-native";

/** الدور = العائلة + الوزن */
export type FontRole = "kufi600" | "kufi700" | "amiri400" | "amiri700" | "plex400" | "plex500" | "plex600" | "plex700" | "ruqaa700";

/** الأسماء الثابتة المسجّلة لكل وزن */
export const FONT_FAMILY: Record<FontRole, string> = {
  kufi600: "VSF-Kufi-600",
  kufi700: "VSF-Kufi-700",
  amiri400: "VSF-Amiri-400",
  amiri700: "VSF-Amiri-700",
  plex400: "VSF-Plex-400",
  plex500: "VSF-Plex-500",
  plex600: "VSF-Plex-600",
  plex700: "VSF-Plex-700",
  ruqaa700: "VSF-Ruqaa-700",
};

/** الوزن المقابل بخط النظام (قبل التحميل أو عند فشله) */
const FALLBACK_WEIGHT: Record<FontRole, NonNullable<TextStyle["fontWeight"]>> = {
  kufi600: "600",
  kufi700: "700",
  amiri400: "400",
  amiri700: "700",
  plex400: "400",
  plex500: "500",
  plex600: "600",
  plex700: "700",
  ruqaa700: "700",
};

const MAP: Record<string, Font.FontSource> = {
  [FONT_FAMILY.kufi600]: ReemKufi_600SemiBold,
  [FONT_FAMILY.kufi700]: ReemKufi_700Bold,
  [FONT_FAMILY.amiri400]: Amiri_400Regular,
  [FONT_FAMILY.amiri700]: Amiri_700Bold,
  [FONT_FAMILY.plex400]: IBMPlexSansArabic_400Regular,
  [FONT_FAMILY.plex500]: IBMPlexSansArabic_500Medium,
  [FONT_FAMILY.plex600]: IBMPlexSansArabic_600SemiBold,
  [FONT_FAMILY.plex700]: IBMPlexSansArabic_700Bold,
  [FONT_FAMILY.ruqaa700]: ArefRuqaa_700Bold,
};

/** تحميل مبكر عند فتح شاشة الفيديو — لا يرمي أبدًا (الفشل = خط النظام) */
export function preloadSlideFonts(): Promise<void> {
  return Font.loadAsync(MAP).catch(() => {});
}

/** دالة الخط لكل دور: { fontFamily } بعد التحميل، و{ fontWeight } بخط النظام قبله أو عند فشله */
export function useSlideFonts(): (r: FontRole) => TextStyle {
  // useFonts يتذكر ما حُمِّل (بلا وميض عند تكرار الاستدعاء في أكثر من مكان)
  const [loaded, error] = Font.useFonts(MAP);
  const ok = loaded && !error;
  return useMemo(() => (r: FontRole): TextStyle => (ok ? { fontFamily: FONT_FAMILY[r] } : { fontWeight: FALLBACK_WEIGHT[r] }), [ok]);
}
