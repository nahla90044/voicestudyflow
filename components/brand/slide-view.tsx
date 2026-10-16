// components/brand/slide-view.tsx
// شريحة العرض التقديمي (القارئ + «محفوظات الكتاب»): خلفية متدرّجة غنية لكل شريحة،
// دوائر ضوئية زخرفية، رقم كبير شفاف، ميدالية الرمز التعبيري، شريط تقدّم،
// ونقاط مرقّمة تظهر واحدة بعد الأخرى. الأولى «غلاف» والأخيرة «خلاصة».
// النص أبيض دائمًا فوق تدرّج داكن كفاية — مقروء على أي مشهد (فاتح/داكن).
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Slide } from "../../lib/ai";
import { useDir, useI18n } from "../../lib/i18n";

/** أزواج تدرّج (من → إلى) بتباين كافٍ للنص الأبيض */
export const SLIDE_GRADIENTS: [string, string][] = [
  ["#5B4BF5", "#2A9DF4"],
  ["#E8505B", "#B8338C"],
  ["#0E8F7E", "#2563EB"],
  ["#E07A1F", "#C2410C"],
  ["#7C3AED", "#DB2777"],
  ["#0369A1", "#4F46E5"],
  ["#15803D", "#0E7490"],
  ["#9D174D", "#6D28D9"],
];

type Props = { slide: Slide; index: number; total: number; maxBulletsHeight?: number };

export function SlideView({ slide, index, total, maxBulletsHeight = 340 }: Props) {
  const dir = useDir();
  const { t } = useI18n();
  const [c1, c2] = SLIDE_GRADIENTS[index % SLIDE_GRADIENTS.length];
  const kind: "cover" | "summary" | "normal" = index === 0 && total > 1 ? "cover" : index === total - 1 && total > 2 ? "summary" : "normal";

  // دخول الشريحة: تكبير خفيف + ظهور، ثم النقاط واحدة بعد الأخرى
  const card = useMemo(() => new Animated.Value(0), [index, slide]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => slide.bullets.map(() => new Animated.Value(0)), [index, slide]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(card, { toValue: 1, duration: 420, easing: ease, useNativeDriver: true }),
      Animated.stagger(
        120,
        rows.map((v) => Animated.timing(v, { toValue: 1, duration: 380, delay: 160, easing: ease, useNativeDriver: true }))
      ),
    ]).start();
  }, [card, rows]);

  const shift = dir.isRTL ? 24 : -24;
  const label =
    kind === "cover" ? t("reader.present.kindCover") : kind === "summary" ? t("reader.present.kindSummary") : t("reader.present.slideOf", { n: index + 1, total });

  return (
    <Animated.View
      style={[
        styles.card,
        { shadowColor: c1 },
        { opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] },
      ]}
    >
      <LinearGradient colors={[c1, c2]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* دوائر ضوئية زخرفية */}
      <View style={[styles.orb, { width: 220, height: 220, borderRadius: 110, top: -70, [dir.isRTL ? "left" : "right"]: -60 }]} />
      <View style={[styles.orb, { width: 160, height: 160, borderRadius: 80, bottom: -50, [dir.isRTL ? "right" : "left"]: -40, opacity: 0.6 }]} />
      {/* رقم الشريحة الكبير الشفاف */}
      <Text style={[styles.watermark, { [dir.isRTL ? "left" : "right"]: 14 }]}>{index + 1}</Text>

      {/* شريط التقدّم */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / Math.max(1, total)) * 100}%`, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]} />
      </View>

      <View style={[styles.topRow, { flexDirection: dir.row }]}>
        <View style={styles.chip}>
          <Text style={styles.chipTxt}>{label}</Text>
        </View>
      </View>

      <View style={[styles.medal, kind === "cover" && styles.medalBig]}>
        <View style={styles.medalRing} />
        <Text style={[styles.emoji, kind === "cover" && { fontSize: 58 }]}>{slide.emoji || "📌"}</Text>
      </View>

      <Text style={[styles.title, kind === "cover" && styles.titleCover]}>{slide.title}</Text>
      <View style={styles.divider} />

      <ScrollView style={{ maxHeight: maxBulletsHeight, flexGrow: 0, alignSelf: "stretch" }} contentContainerStyle={{ gap: 9 }} showsVerticalScrollIndicator={false}>
        {slide.bullets.map((b, bi) => (
          <Animated.View
            key={bi}
            style={[
              styles.row,
              { flexDirection: dir.row },
              { opacity: rows[bi], transform: [{ translateX: rows[bi].interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }] },
            ]}
          >
            {kind === "summary" ? (
              <Text style={styles.check}>✓</Text>
            ) : (
              <View style={styles.num}>
                <Text style={[styles.numTxt, { color: c1 }]}>{bi + 1}</Text>
              </View>
            )}
            <Text style={[styles.bullet, { textAlign: dir.textAlign }]}>{b}</Text>
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 22,
    paddingTop: 18,
    overflow: "hidden",
    minHeight: 340,
    justifyContent: "center",
    shadowOpacity: 0.45,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  orb: { position: "absolute", backgroundColor: "rgba(255,255,255,0.13)" },
  watermark: {
    position: "absolute",
    bottom: -28,
    fontSize: 170,
    fontWeight: "900",
    color: "rgba(255,255,255,0.08)",
  },
  progressTrack: { position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: "rgba(255,255,255,0.18)" },
  progressFill: { height: 5, backgroundColor: "#FFFFFF", borderRadius: 3 },
  topRow: { justifyContent: "center", marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  chipTxt: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  medal: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 14,
  },
  medalBig: { width: 112, height: 112, borderRadius: 56 },
  medalRing: { ...StyleSheet.absoluteFillObject, borderRadius: 999, borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", margin: -6 },
  emoji: { fontSize: 42, textAlign: "center" },
  title: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 37,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  titleCover: { fontSize: 30, lineHeight: 44 },
  divider: { width: 56, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.85)", alignSelf: "center", marginVertical: 14 },
  row: {
    alignItems: "flex-start",
    gap: 11,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginTop: 1 },
  numTxt: { fontSize: 13.5, fontWeight: "900" },
  check: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", width: 26, textAlign: "center", marginTop: 1 },
  bullet: { flex: 1, color: "#FFFFFF", fontSize: 16.5, lineHeight: 27, fontWeight: "700" },
});
