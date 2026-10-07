// components/brand/screen-header.tsx
// عنوان الشاشة في تصميم 2.0: عنوان كبير هادئ + سطر وصف + القائمة الجانبية،
// مع خانة اختيارية لأزرار جانبية (مثل «+» في المكتبة). بلا إطار متوهّج —
// المحتوى هو البطل. يتبع اتجاه اللغة (RTL/LTR) تلقائيًا.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { Palette, Spacing } from "../../constants/design";
import { useDir } from "../../lib/i18n";
import { AppDrawer } from "./app-drawer";
import { FadeIn } from "./fade-in";
import { PressableScale } from "./motion";

export type HeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** زر بارز (خلفية فاتحة) بدل زر شفاف */
  primary?: boolean;
};

type Props = {
  /** لم يعد يُرسم (كان شارة ملوّنة) — باقٍ للتوافق مع الشاشات */
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** لم يعد يُستخدم — باقٍ للتوافق */
  color?: string;
  style?: ViewStyle;
  /** إظهار زر القائمة الجانبية (☰) — مفعّل افتراضيًا */
  menu?: boolean;
  actions?: HeaderAction[];
};

export function ScreenHeader({ title, subtitle, style, menu = true, actions = [] }: Props) {
  const dir = useDir();
  return (
    <FadeIn offset={10}>
      <View style={[styles.row, { flexDirection: dir.row }, style]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.sub, { textAlign: dir.textAlign }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions.map((a) => (
          <PressableScale key={a.label} onPress={a.onPress} style={[styles.btn, a.primary && styles.btnPrimary]}>
            <Ionicons name={a.icon} size={20} color={a.primary ? Palette.bg : Palette.text} accessibilityLabel={a.label} />
          </PressableScale>
        ))}
        {menu ? <AppDrawer /> : null}
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: { color: Palette.text, fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  sub: { color: Palette.textDim, fontSize: 13, marginTop: 2 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: Palette.text, borderColor: Palette.text },
});
