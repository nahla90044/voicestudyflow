// components/brand/glass-card.tsx
// بطاقة زجاجية (glassmorphism) بطابع Web3: ضباب حقيقي + حافة متدرّجة لامعة.
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { Gradients, Palette, Radius } from "../../constants/design";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  intensity?: number;
  radius?: number;
  /** لون توهّج خفيف خلف البطاقة */
  glow?: string;
};

export function GlassCard({
  children,
  style,
  contentStyle,
  intensity = 24,
  radius = Radius.lg,
  glow,
}: Props) {
  return (
    <View style={[glow ? { shadowColor: glow, ...glowShadow } : null, style]}>
      {/* الحافة المتدرّجة اللامعة */}
      <LinearGradient
        colors={Gradients.glassEdge}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.border, { borderRadius: radius }]}
      >
        <BlurView
          intensity={intensity}
          tint="dark"
          style={[styles.blur, { borderRadius: radius - 1 }]}
        >
          <View style={[styles.fill, contentStyle]}>{children}</View>
        </BlurView>
      </LinearGradient>
    </View>
  );
}

const glowShadow = {
  shadowOpacity: 0.5,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
};

const styles = StyleSheet.create({
  border: { padding: 1 },
  blur: { overflow: "hidden" },
  fill: { backgroundColor: Palette.glass },
});
