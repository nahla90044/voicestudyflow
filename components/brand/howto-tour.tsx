// components/brand/howto-tour.tsx
// جولة تعريفية بخطوات مصوّرة تشرح أهم ميزات التطبيق.
// تُستخدم أول مرة تلقائيًا، ويمكن إعادتها من صفحة المساعدة.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";

type Step = { emoji: string; titleKey: string; bodyKey: string };

// صياغة محايدة (للجميع) بأسلوب الأسماء بدل الأفعال المؤنّثة/المذكّرة
const STEPS: Step[] = [
  { emoji: "📚", titleKey: "howto.step0.title", bodyKey: "howto.step0.body" },
  { emoji: "👆", titleKey: "howto.step1.title", bodyKey: "howto.step1.body" },
  { emoji: "📋", titleKey: "howto.step2.title", bodyKey: "howto.step2.body" },
  { emoji: "🎧", titleKey: "howto.step3.title", bodyKey: "howto.step3.body" },
  { emoji: "🗣️", titleKey: "howto.step4.title", bodyKey: "howto.step4.body" },
  { emoji: "🛠️", titleKey: "howto.step5.title", bodyKey: "howto.step5.body" },
];

export function HowToTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const dir = useDir();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  function close() {
    setStep(0);
    onClose();
  }
  function next() {
    if (isLast) close();
    else setStep((p) => p + 1);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.mask}>
        <View style={styles.card}>
          <Pressable onPress={close} style={styles.skip} hitSlop={8}>
            <Text style={styles.skipTxt}>{t("howto.skip")}</Text>
          </Pressable>

          <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emojiWrap}>
            <Text style={styles.emoji}>{s.emoji}</Text>
          </LinearGradient>

          <Text style={styles.title}>{t(s.titleKey)}</Text>
          <Text style={styles.body}>{t(s.bodyKey)}</Text>

          {/* نقاط التقدّم */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>

          <Pressable onPress={next} style={styles.nextBtn}>
            <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextGrad}>
              <Text style={styles.nextTxt}>{isLast ? t("howto.start") : t("common.next")}</Text>
              {!isLast && <Ionicons name="chevron-back" size={18} color="#fff" />}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.66)", alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Palette.bgElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.xl,
    alignItems: "center",
  },
  skip: { position: "absolute", top: 14, left: 14, padding: 6 },
  skipTxt: { color: Palette.textDim, fontSize: 13, fontWeight: "700" },
  emojiWrap: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginTop: 8 },
  emoji: { fontSize: 40 },
  title: { color: Palette.text, fontSize: 22, fontWeight: "900", marginTop: 18, textAlign: "center" },
  body: { color: Palette.textMuted, fontSize: 15, lineHeight: 26, textAlign: "center", marginTop: 10 },
  dots: { flexDirection: "row", gap: 7, marginTop: 22 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.border },
  dotOn: { width: 20, backgroundColor: Palette.neonViolet },
  nextBtn: { alignSelf: "stretch", marginTop: 22, borderRadius: Radius.lg, overflow: "hidden" },
  nextGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 15 },
  nextTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
