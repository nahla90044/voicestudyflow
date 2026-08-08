// components/brand/unlock-modal.tsx
// نافذة الاحتفال بإنهاء أول كتاب — تُعلن فتح الحد المجاني إلى ١٠ كتب.
//
// المكافأة تُمنح قبل ظهور هذه النافذة وبلا أي شرط. النافذة تُبلّغ فقط،
// ولا تطلب من المستخدم شيئًا مقابل الهدية (شرط أساسي في قواعد آبل).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { GlassCard } from "./glass-card";

type Props = {
  visible: boolean;
  /** اسم الكتاب الذي أنهاه — يجعل التهنئة شخصية بدل عامّة */
  bookTitle?: string;
  /** الحد الجديد بعد الفتح */
  newLimit: number;
  onClose: () => void;
};

export function UnlockModal({ visible, bookTitle, newLimit, onClose }: Props) {
  const { t } = useI18n();
  const dir = useDir();

  // دخول النافذة: تكبير مرن + ظهور تدريجي
  const pop = useRef(new Animated.Value(0)).current;
  // توهّج نابض خلف الأيقونة — يجذب العين لرقم المكافأة
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    Animated.spring(pop, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pop, pulse]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={{ opacity: pop, transform: [{ scale }], width: "100%", maxWidth: 380 }}>
          <GlassCard glow={Palette.neonViolet} contentStyle={styles.card}>
            {/* الميدالية */}
            <View style={styles.medalWrap}>
              <Animated.View
                style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
              />
              <LinearGradient
                colors={Gradients.neon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.medal}
              >
                <Ionicons name="trophy" size={40} color="#fff" />
              </LinearGradient>
            </View>

            <Text style={styles.title}>{t("unlock.title")}</Text>

            {!!bookTitle && (
              <Text style={styles.book} numberOfLines={2}>
                {bookTitle}
              </Text>
            )}

            {/* رقم المكافأة — البطل البصري للنافذة */}
            <View style={styles.prize}>
              <LinearGradient
                colors={Gradients.neonViolet}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.prizeNum}
              >
                <Text style={styles.prizeNumTxt}>{newLimit}</Text>
              </LinearGradient>
              <View style={styles.prizeTxtWrap}>
                <Text style={[styles.prizeLabel, { textAlign: dir.textAlign }]}>
                  {t("unlock.prize.label")}
                </Text>
                <Text style={[styles.prizeSub, { textAlign: dir.textAlign }]}>
                  {t("unlock.prize.sub")}
                </Text>
              </View>
            </View>

            <Text style={styles.body}>{t("unlock.body")}</Text>

            <Pressable onPress={onClose} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
              <LinearGradient
                colors={Gradients.neon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGrad}
              >
                <Text style={styles.ctaTxt}>{t("unlock.cta")}</Text>
              </LinearGradient>
            </Pressable>
          </GlassCard>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  card: { padding: Spacing.xl, alignItems: "center", gap: Spacing.md },

  medalWrap: { alignItems: "center", justifyContent: "center", marginTop: Spacing.xs },
  glow: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Palette.neonViolet,
  },
  medal: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  title: { color: Palette.text, fontSize: 22, fontWeight: "900", textAlign: "center" },
  book: {
    color: Palette.textMuted,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "center",
    fontStyle: "italic",
  },

  prize: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignSelf: "stretch",
    marginTop: Spacing.xs,
  },
  prizeNum: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  prizeNumTxt: { color: "#fff", fontSize: 26, fontWeight: "900" },
  prizeTxtWrap: { flex: 1, gap: 2 },
  prizeLabel: { color: Palette.text, fontSize: 15, fontWeight: "900" },
  prizeSub: { color: Palette.textDim, fontSize: 12.5, fontWeight: "600" },

  body: {
    color: Palette.textMuted,
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },

  cta: { alignSelf: "stretch", borderRadius: Radius.lg, overflow: "hidden", marginTop: Spacing.xs },
  ctaGrad: { height: 52, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
