import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDrawer } from "../../components/brand/app-drawer";
import { FadeIn } from "../../components/brand/fade-in";
import { GlassCard } from "../../components/brand/glass-card";
import { ReadListenArt } from "../../components/brand/illustrations";
import { ScreenBackground } from "../../components/brand/screen-background";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";

type Feature = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  color: string;
  route: "/library" | "/add-book" | "/calendar" | "/activity";
};

const FEATURES: Feature[] = [
  { icon: "library", label: "المكتبة", sub: "كل كتبك", color: Palette.neonBlue, route: "/library" },
  { icon: "add-circle", label: "إضافة كتاب", sub: "ارفع PDF", color: Palette.neonViolet, route: "/add-book" },
  { icon: "calendar", label: "خطة اليوم", sub: "نظّم وقتك", color: Palette.neonCyan, route: "/calendar" },
  { icon: "stats-chart", label: "النشاط", sub: "تقدّمك وسلسلتك", color: Palette.neonPink, route: "/activity" },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* الشريط العلوي: قائمة جانبية */}
          <View style={styles.topBar}>
            <AppDrawer />
          </View>

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

          {/* زر رئيسي نيون */}
          <FadeIn delay={120}>
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

  topBar: { flexDirection: "row-reverse", marginBottom: Spacing.md },

  hero: { alignItems: "center", padding: Spacing.xl },
  title: { color: Palette.text, fontSize: 28, fontWeight: "900", textAlign: "center", marginTop: Spacing.sm },
  subtitle: {
    color: Palette.textDim,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginTop: Spacing.sm,
  },

  goalCard: { padding: Spacing.lg, gap: 10 },
  goalHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  goalTitle: { color: Palette.text, fontWeight: "900", fontSize: 16, textAlign: "right" },
  goalChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  goalChipTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },
  goalBarBg: { height: 12, borderRadius: Radius.pill, backgroundColor: Palette.surfaceStrong, overflow: "hidden" },
  goalBarFill: { height: 12, borderRadius: Radius.pill },
  goalSub: { color: Palette.textDim, fontSize: 13, fontWeight: "700", textAlign: "right" },
  heatCard: { padding: Spacing.lg, gap: 14 },
  reviewCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: Spacing.lg },
  reviewIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewTitle: { color: Palette.text, fontWeight: "900", fontSize: 16, textAlign: "right" },
  reviewSub: { color: Palette.textDim, fontSize: 12, textAlign: "right", marginTop: 2 },
  dueBadge: { minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 13, backgroundColor: Palette.neonPink, alignItems: "center", justifyContent: "center" },
  dueBadgeTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },

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
