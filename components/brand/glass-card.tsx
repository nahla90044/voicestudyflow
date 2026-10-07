// components/brand/glass-card.tsx
// بطاقة التصميم 2.0: سطح مسطّح هادئ بحافة شعرية ولمعة علوية خفيفة.
// (الاسم «GlassCard» باقٍ حتى لا نعدّل كل الشاشات؛ الزجاج والضباب أُزيلا لأنهما
//  يثقلان الأداء ويشتّتان العين — التوهّج الآن اختياري وخافت جدًا.)
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { Palette, Radius } from "../../constants/design";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /** لم يعد مستخدمًا (كان شدّة الضباب) — باقٍ للتوافق */
  intensity?: number;
  radius?: number;
  /** لون توهّج خافت جدًا خلف البطاقة (للبطاقة الأهم في الشاشة فقط) */
  glow?: string;
};

export function GlassCard({ children, style, contentStyle, radius = Radius.lg, glow }: Props) {
  return (
    <View style={[glow ? { shadowColor: glow, ...glowShadow } : null, style]}>
      <View style={[styles.tile, { borderRadius: radius }]}>
        <View style={[styles.highlight, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const glowShadow = {
  shadowOpacity: 0.22,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const styles = StyleSheet.create({
  tile: {
    backgroundColor: Palette.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.glassBorder,
    overflow: "hidden",
  },
  // لمعة علوية رفيعة تعطي عمقًا بلا ضباب
  highlight: { position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: Palette.glassHighlight },
});
