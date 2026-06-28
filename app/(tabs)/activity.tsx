import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FadeIn } from "../../components/brand/fade-in";
import { GlassCard } from "../../components/brand/glass-card";
import { StudyHeatmap } from "../../components/brand/heatmap";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Palette, Radius, Spacing } from "../../constants/design";
import { getDailyGoal, setDailyGoal } from "../../lib/goals";
import { useDir, useI18n } from "../../lib/i18n";
import { getStats, type Stats } from "../../lib/stats";

const GOAL_OPTIONS = [10, 20, 30, 45, 60];

const STAT_ITEMS = [
  { icon: "flame" as const, labelKey: "activity.stat.streak", get: (s: Stats | null) => s?.streak ?? 0, color: Palette.neonPink },
  { icon: "headset" as const, labelKey: "activity.stat.minutes", get: (s: Stats | null) => s?.totalMinutes ?? 0, color: Palette.neonCyan },
  { icon: "documents" as const, labelKey: "activity.stat.pages", get: (s: Stats | null) => s?.totalPages ?? 0, color: Palette.neonBlue },
  { icon: "checkmark-done" as const, labelKey: "activity.stat.books", get: (s: Stats | null) => s?.booksCompleted ?? 0, color: Palette.neonViolet },
];

function todayISOLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ActivityScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const [stats, setStats] = useState<Stats | null>(null);
  const [goal, setGoal] = useState(20);

  useFocusEffect(
    useCallback(() => {
      getStats().then(setStats);
      getDailyGoal().then(setGoal);
    }, [])
  );

  const todayMin = stats?.days?.[todayISOLocal()]?.m ?? 0;
  const goalPct = Math.min(100, Math.round((todayMin / Math.max(1, goal)) * 100));

  function cycleGoal() {
    const next = GOAL_OPTIONS[(GOAL_OPTIONS.indexOf(goal) + 1) % GOAL_OPTIONS.length] ?? 20;
    setGoal(next);
    setDailyGoal(next);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScreenHeader icon="stats-chart" title={t("activity.header.title")} subtitle={t("activity.header.subtitle")} color={Palette.neonCyan} />

        <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 110, gap: Spacing.lg }} showsVerticalScrollIndicator={false}>
          <FadeIn delay={0}>
            <GlassCard glow={Palette.neonPink}>
              <View style={[styles.statsRow, { flexDirection: dir.row }]}>
                {STAT_ITEMS.map((s) => (
                  <View key={s.labelKey} style={styles.statItem}>
                    <Ionicons name={s.icon} size={20} color={s.color} />
                    <Text style={styles.statValue}>{`${s.get(stats)}`}</Text>
                    <Text style={styles.statLabel}>{t(s.labelKey)}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          </FadeIn>

          <FadeIn delay={90}>
            <GlassCard glow={Palette.success}>
              <View style={styles.goalCard}>
                <View style={[styles.goalHead, { flexDirection: dir.row }]}>
                  <Text style={[styles.goalTitle, { textAlign: dir.textAlign }]}>{t("activity.goal.title")}</Text>
                  <Pressable onPress={cycleGoal} style={styles.goalChip}>
                    <Text style={styles.goalChipTxt}>{t("activity.goal.chip", { goal })}</Text>
                  </Pressable>
                </View>
                <View style={styles.goalBarBg}>
                  <View style={[styles.goalBarFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? Palette.success : Palette.primary }]} />
                </View>
                <Text style={[styles.goalSub, { textAlign: dir.textAlign }]}>
                  {goalPct >= 100 ? t("activity.goal.done") : t("activity.goal.progress", { todayMin, goal, goalPct })}
                </Text>
              </View>
            </GlassCard>
          </FadeIn>

          <FadeIn delay={170}>
            <GlassCard glow={Palette.neonCyan}>
              <View style={styles.heatCard}>
                <Text style={[styles.goalTitle, { textAlign: dir.textAlign }]}>{t("activity.heatmap.title")}</Text>
                <StudyHeatmap days={stats?.days ?? {}} />
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
  statsRow: { flexDirection: "row-reverse", justifyContent: "space-around", paddingVertical: Spacing.lg, paddingHorizontal: Spacing.sm },
  statItem: { alignItems: "center", gap: 4 },
  statValue: { color: Palette.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: Palette.textDim, fontSize: 11, fontWeight: "700" },

  goalCard: { padding: Spacing.lg, gap: 10 },
  goalHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  goalTitle: { color: Palette.text, fontWeight: "900", fontSize: 16, textAlign: "right" },
  goalChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  goalChipTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },
  goalBarBg: { height: 12, borderRadius: Radius.pill, backgroundColor: Palette.surfaceStrong, overflow: "hidden" },
  goalBarFill: { height: 12, borderRadius: Radius.pill },
  goalSub: { color: Palette.textDim, fontSize: 13, fontWeight: "700", textAlign: "right" },
  heatCard: { padding: Spacing.lg, gap: 14 },
});
