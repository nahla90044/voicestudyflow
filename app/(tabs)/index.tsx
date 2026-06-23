import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FadeIn } from "../../components/brand/fade-in";
import { GlassCard } from "../../components/brand/glass-card";
import { ReadListenArt } from "../../components/brand/illustrations";
import { ScreenBackground } from "../../components/brand/screen-background";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { getStats, type Stats } from "../../lib/stats";

type Feature = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  color: string;
  route: "/library" | "/add-book" | "/calendar" | "/more";
};

const FEATURES: Feature[] = [
  { icon: "library", label: "المكتبة", sub: "كل كتبك", color: Palette.neonBlue, route: "/library" },
  { icon: "add-circle", label: "إضافة كتاب", sub: "ارفع PDF", color: Palette.neonViolet, route: "/add-book" },
  { icon: "calendar", label: "خطة اليوم", sub: "نظّم وقتك", color: Palette.neonCyan, route: "/calendar" },
  { icon: "options", label: "الإعدادات", sub: "الصوت والمزيد", color: Palette.neonPink, route: "/more" },
];

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);

  // نحدّث الإحصائيات كل ما ترجع للشاشة
  useFocusEffect(
    useCallback(() => {
      getStats().then(setStats);
    }, [])
  );

  const statItems = [
    { icon: "flame" as const, label: "سلسلة", value: `${stats?.streak ?? 0}`, color: Palette.neonPink },
    { icon: "headset" as const, label: "دقائق", value: `${stats?.totalMinutes ?? 0}`, color: Palette.neonCyan },
    { icon: "documents" as const, label: "صفحات", value: `${stats?.totalPages ?? 0}`, color: Palette.neonBlue },
    { icon: "checkmark-done" as const, label: "كتب", value: `${stats?.booksCompleted ?? 0}`, color: Palette.neonViolet },
  ];

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* الهيرو الزجاجي */}
          <FadeIn delay={0}>
            <GlassCard radius={Radius.xl} glow={Palette.neonViolet} style={{ marginBottom: Spacing.xl }}>
              <View style={styles.hero}>
                <ReadListenArt size={150} />
                <Text style={styles.title}>VoiceStudyFlow</Text>
                <Text style={styles.subtitle}>ذاكر بذكاء ✨ اقرأ، اسمع، خطّط، وأنجز</Text>
              </View>
            </GlassCard>
          </FadeIn>

          {/* بطاقة الإحصائيات */}
          <FadeIn delay={90}>
            <GlassCard glow={Palette.neonPink} style={{ marginBottom: Spacing.xl }}>
              <View style={styles.statsRow}>
                {statItems.map((s) => (
                  <View key={s.label} style={styles.statItem}>
                    <Ionicons name={s.icon} size={20} color={s.color} />
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          </FadeIn>

          {/* زر رئيسي نيون */}
          <FadeIn delay={180}>
            <Pressable
              onPress={() => router.push("/library")}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={Gradients.neon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGrad}
              >
                <Ionicons name="library" size={20} color="#fff" />
                <Text style={styles.ctaTxt}>اذهب إلى المكتبة</Text>
              </LinearGradient>
            </Pressable>
          </FadeIn>

          {/* شبكة المزايا الزجاجية */}
          <View style={styles.grid}>
            {FEATURES.map((f, i) => (
              <FadeIn key={f.route} delay={260 + i * 70} style={styles.cardWrap}>
                <Pressable
                  onPress={() => router.push(f.route)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <GlassCard glow={f.color} style={styles.card}>
                    <View style={styles.cardInner}>
                      <View style={[styles.iconWrap, { backgroundColor: f.color + "22", borderColor: f.color + "66" }]}>
                        <Ionicons name={f.icon} size={22} color={f.color} />
                      </View>
                      <Text style={styles.cardLabel}>{f.label}</Text>
                      <Text style={styles.cardSub}>{f.sub}</Text>
                    </View>
                  </GlassCard>
                </Pressable>
              </FadeIn>
            ))}
          </View>

          {/* تلميح */}
          <FadeIn delay={540}>
          <GlassCard style={{ marginTop: Spacing.xl }}>
            <View style={styles.hintRow}>
              <Ionicons name="sparkles" size={18} color={Palette.neonCyan} />
              <Text style={styles.hint}>
                ابدأ بإضافة كتاب PDF من «إضافة كتاب»، ثم افتحه من المكتبة واستمع له بصوت بشري.
              </Text>
            </View>
          </GlassCard>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  hero: { alignItems: "center", padding: Spacing.xl },
  title: { color: Palette.text, fontSize: 28, fontWeight: "900", textAlign: "center", marginTop: Spacing.sm },
  subtitle: {
    color: Palette.textDim,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginTop: Spacing.sm,
  },

  statsRow: { flexDirection: "row-reverse", justifyContent: "space-around", paddingVertical: Spacing.lg, paddingHorizontal: Spacing.sm },
  statItem: { alignItems: "center", gap: 4 },
  statValue: { color: Palette.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: Palette.textDim, fontSize: 11, fontWeight: "700" },

  cta: { borderRadius: Radius.lg, overflow: "hidden", marginBottom: Spacing.xl },
  ctaGrad: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    justifyContent: "space-between",
  },
  cardWrap: { width: "47.5%" },
  card: { flex: 1 },
  cardInner: { padding: Spacing.lg, gap: 6 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  cardLabel: { color: Palette.text, fontWeight: "900", fontSize: 16, textAlign: "right" },
  cardSub: { color: Palette.textDim, fontSize: 12, textAlign: "right" },

  hintRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: Spacing.lg },
  hint: { flex: 1, color: Palette.textMuted, fontSize: 13, lineHeight: 20, textAlign: "right" },

  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
