import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { getMyBookCount, getStats, type Stats } from "../../lib/stats";

const GOAL_OPTIONS = [10, 20, 30, 45, 60];

type Period = "today" | "week" | "month";

function todayISOLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// مجموع الدقائق/الصفحات للفترة المختارة (اليوم = يوم واحد، الأسبوع = ٧ أيام، الشهر = ٣٠)
function periodSum(days: Record<string, { m: number; p: number }>, period: Period) {
  const back = period === "today" ? 0 : period === "week" ? 6 : 29;
  const p2 = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  let m = 0;
  let p = 0;
  for (let i = 0; i <= back; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const log = days[iso];
    if (log) {
      m += log.m || 0;
      p += log.p || 0;
    }
  }
  return { m, p };
}

export default function ActivityScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const [stats, setStats] = useState<Stats | null>(null);
  const [books, setBooks] = useState(0);
  const [goal, setGoal] = useState(20);
  const [period, setPeriod] = useState<Period>("today");

  const { m: periodMin, p: periodPages } = useMemo(
    () => periodSum(stats?.days ?? {}, period),
    [stats, period]
  );

  const cells = [
    { icon: "flame" as const, label: t("activity.stat.streak"), value: stats?.streak ?? 0, color: Palette.neonPink },
    { icon: "headset" as const, label: t("activity.stat.minutes"), value: periodMin, color: Palette.neonCyan },
    { icon: "documents" as const, label: t("activity.stat.pages"), value: periodPages, color: Palette.neonBlue },
    { icon: "library" as const, label: t("activity.stat.books"), value: books, color: Palette.neonViolet },
  ];

  useFocusEffect(
    useCallback(() => {
      getStats().then(setStats);
      getDailyGoal().then(setGoal);
      getMyBookCount().then(setBooks);
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
            {/* مبدّل الفترة: اليوم / الأسبوع / الشهر — يؤثّر على الدقائق والصفحات */}
            <View style={[styles.periodRow, { flexDirection: dir.row }]}>
              {(["today", "week", "month"] as Period[]).map((p) => (
                <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.periodChip, period === p && styles.periodChipOn]}>
                  <Text style={[styles.periodTxt, period === p && styles.periodTxtOn]}>{t(`activity.period.${p}`)}</Text>
                </Pressable>
              ))}
            </View>
            <GlassCard glow={Palette.neonPink}>
              <View style={[styles.statsRow, { flexDirection: dir.row }]}>
                {cells.map((c) => (
                  <View key={c.label} style={styles.statItem}>
                    <Ionicons name={c.icon} size={20} color={c.color} />
                    <Text style={styles.statValue}>{`${c.value}`}</Text>
                    <Text style={styles.statLabel}>{c.label}</Text>
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
  periodRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 10, justifyContent: "center" },
  periodChip: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  periodChipOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  periodTxt: { color: Palette.textMuted, fontSize: 13, fontWeight: "800" },
  periodTxtOn: { color: "#0b1220" },
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
