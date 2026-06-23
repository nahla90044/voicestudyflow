// components/brand/logo.tsx
// شعار VoiceStudyFlow: كتاب مفتوح تتصاعد منه موجة صوت، داخل مربّع متدرّج.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { Palette } from "../../constants/design";

type MarkProps = { size?: number; rounded?: boolean };

/** العلامة (الأيقونة) فقط */
export function BrandMark({ size = 64, rounded = true }: MarkProps) {
  const r = rounded ? 22 : 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Palette.primary} />
          <Stop offset="1" stopColor={Palette.accent} />
        </LinearGradient>
        <LinearGradient id="lg-wave" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#e7efff" />
        </LinearGradient>
      </Defs>

      {/* خلفية المربّع المتدرّج */}
      <Rect x="0" y="0" width="100" height="100" rx={r} fill="url(#lg-bg)" />

      {/* الكتاب المفتوح */}
      <Path
        d="M20 38 C30 31, 44 31, 50 36 C56 31, 70 31, 80 38 L80 70 C70 63, 56 63, 50 68 C44 63, 30 63, 20 70 Z"
        fill="#ffffff"
        opacity={0.96}
      />
      {/* خط منتصف الكتاب */}
      <Path d="M50 36 L50 68" stroke={Palette.primary} strokeWidth="2.5" opacity={0.5} />

      {/* موجة الصوت المتصاعدة */}
      <Path
        d="M40 24 C46 18, 54 18, 60 24"
        stroke="url(#lg-wave)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity={0.95}
      />
      <Path
        d="M34 20 C44 9, 56 9, 66 20"
        stroke="url(#lg-wave)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
    </Svg>
  );
}

type FullProps = MarkProps & {
  showWordmark?: boolean;
  tagline?: string;
};

/** العلامة + الاسم */
export function BrandLogo({
  size = 64,
  showWordmark = true,
  tagline,
}: FullProps) {
  return (
    <View style={styles.row}>
      <BrandMark size={size} />
      {showWordmark ? (
        <View style={styles.textWrap}>
          <Text style={[styles.word, { fontSize: size * 0.34 }]}>
            VoiceStudyFlow
          </Text>
          {tagline ? <Text style={styles.tag}>{tagline}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  textWrap: { justifyContent: "center" },
  word: { color: Palette.text, fontWeight: "900", letterSpacing: 0.3 },
  tag: { color: Palette.textDim, fontSize: 11, fontWeight: "700", marginTop: 2 },
});
