// components/brand/screen-header.tsx
// عنوان شاشة موحّد داخل إطار احترافي متناسق مع الثيم:
// تدرّج لوني ناعم خلف العنوان + شارة أيقونة متدرّجة + شريط لمسة جانبي + توهّج نيون.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { Palette, Radius, Spacing } from "../../constants/design";
import { AppDrawer } from "./app-drawer";
import { FadeIn } from "./fade-in";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  color?: string;
  style?: ViewStyle;
  /** إظهار زر القائمة الجانبية (☰) — مفعّل افتراضيًا */
  menu?: boolean;
};

export function ScreenHeader({
  icon,
  title,
  subtitle,
  color = Palette.neonViolet,
  style,
  menu = true,
}: Props) {
  return (
    <FadeIn>
    <View
      style={[styles.frame, { borderColor: color + "55", shadowColor: color }, style]}
    >
      {/* تدرّج لوني ناعم في الخلفية */}
      <LinearGradient
        colors={[color + "26", "transparent"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* شريط لمسة جانبي (يمين في RTL) */}
      <View style={[styles.accent, { backgroundColor: color }]} />

      {/* شارة الأيقونة المتدرّجة */}
      <LinearGradient
        colors={[color, color + "AA"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.badge}
      >
        <Ionicons name={icon} size={22} color="#fff" />
      </LinearGradient>

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>

      {/* القائمة الجانبية (☰) على اليسار في RTL */}
      {menu ? <AppDrawer /> : null}
    </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: Palette.surface,
    overflow: "hidden",
    // توهّج خفيف بلون الشاشة
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  accent: {
    position: "absolute",
    right: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Palette.text, fontSize: 22, fontWeight: "900", textAlign: "right", letterSpacing: 0.3 },
  sub: { color: Palette.textDim, fontSize: 12.5, textAlign: "right", marginTop: 3 },
});
