// app/(tabs)/activity.tsx
// «التقدّم» (تصميم 2.0): وقت المذاكرة للأسبوع/الشهر مع الفرق عن الفترة السابقة وأعمدة
// يومية/أسبوعية، ثم ثلاثة مؤشرات (السلسلة، الصفحات، دقة الاختبارات)، وجاهزية كل كتاب،
// وهدف اليوم، وخريطة النشاط لآخر ٣ أشهر.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FadeIn } from "../../components/brand/fade-in";
import { StudyHeatmap } from "../../components/brand/heatmap";
import { PressableScale } from "../../components/brand/motion";
import { ProgressRing } from "../../components/brand/progress-ring";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { myBooks } from "../../lib/bookQA";
import { getDailyGoal, setDailyGoal } from "../../lib/goals";
import { useDir, useI18n } from "../../lib/i18n";
import { periodSeries, splitMinutes } from "../../lib/progressCore";
import { getBookReadiness, type BookReadiness } from "../../lib/readiness";
import { getStats, type Stats } from "../../lib/stats";

const GOAL_OPTIONS = [10, 20, 30, 45, 60];
type Period = "week" | "month";

function todayISOLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const [stats, setStats] = useState<Stats | null>(null);
  const [goal, setGoal] = useState(20);
  const [period, setPeriod] = useState<Period>("week");
  const [ready, setReady] = useState<BookReadiness[]>([]);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getStats().then((s) => on && setStats(s));
      getDailyGoal().then((g) => on && setGoal(g));
      // جاهزية الكتب التي لها منهج أو اختبارات أو موعد اختبار
      (async () => {
        const books = await myBooks().catch(() => []);
        const out: BookReadiness[] = [];
        for (const b of books) {
          const r = await getBookReadiness(b.pdf_path);
          if (r && (r.unitCount > 0 || r.answered > 0 || r.examISO)) out.push(r);
        }
        if (on) setReady(out.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)));
      })();
      return () => {
        on = false;
      };
    }, [])
  );

  const series = useMemo(() => periodSeries(stats?.days ?? {}, period, new Date()), [stats, period]);
  const { h, m } = splitMinutes(series.minutes);
  const delta = series.minutes - series.prevMinutes;
  const maxBar = Math.max(1, ...series.bars.map((b) => b.minutes));
  const dayLabels = t("home.days").split(",");

  const answered = ready.reduce((a, r) => a + r.answered, 0);
  const correct = ready.reduce((a, r) => a + r.correct, 0);
  const accuracy = answered ? Math.round((correct / answered) * 100) : null;

  const todayMin = stats?.days?.[todayISOLocal()]?.m ?? 0;
  const goalFrac = Math.min(1, todayMin / Math.max(1, goal));

  function cycleGoal() {
    const next = GOAL_OPTIONS[(GOAL_OPTIONS.indexOf(goal) + 1) % GOAL_OPTIONS.length] ?? 20;
    setGoal(next);
    setDailyGoal(next);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScreenHeader icon="stats-chart" title={t("nav.progress")} subtitle={t("activity.header.subtitle")} color={Palette.neonCyan} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* الفترة */}
          <View style={[styles.seg, { flexDirection: dir.row }]}>
            {(["week", "month"] as Period[]).map((p) => (
              <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.segItem, period === p && styles.segOn]}>
                <Text style={[styles.segTxt, period === p && styles.segTxtOn]}>{t(`progress.period.${p}`)}</Text>
              </Pressable>
            ))}
          </View>

          {/* وقت المذاكرة + الأعمدة */}
          <FadeIn delay={0}>
            <View style={styles.tile}>
              <View style={[styles.heroHead, { flexDirection: dir.row }]}>
                <View>
                  <Text style={[styles.cap, { textAlign: dir.textAlign }]}>{t("progress.studyTime")}</Text>
                  <Text style={[styles.heroNum, { textAlign: dir.textAlign }]}>
                    {h > 0 ? t("progress.hm", { h, m }) : t("progress.m", { m })}
                  </Text>
                </View>
                {series.prevMinutes > 0 || series.minutes > 0 ? (
                  <View style={[styles.deltaChip, delta < 0 && styles.deltaDown]}>
                    <Text style={[styles.deltaTxt, delta < 0 && { color: "#FFB38A" }]}>
                      {delta >= 0
                        ? t(period === "week" ? "progress.upWeek" : "progress.upMonth", { n: delta })
                        : t(period === "week" ? "progress.downWeek" : "progress.downMonth", { n: -delta })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.bars, { flexDirection: dir.row }]}>
                {series.bars.map((b, i) => {
                  const hgt = Math.max(6, Math.round((b.minutes / maxBar) * 104));
                  return (
                    <View key={b.key} style={styles.barCol}>
                      <Text style={styles.barVal}>{b.minutes > 0 && b.current ? b.minutes : ""}</Text>
                      {b.current ? (
                        <LinearGradient colors={["#5ED9FF", "#7C6CFF"]} style={[styles.bar, { height: hgt }]} />
                      ) : (
                        <View style={[styles.bar, styles.barDim, { height: hgt }]} />
                      )}
                      <Text style={[styles.barLbl, b.current && { color: Palette.text }]}>
                        {period === "week" ? dayLabels[b.dayIndex] ?? "" : t("progress.weekN", { n: i + 1 })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </FadeIn>

          {/* المؤشرات */}
          <FadeIn delay={70}>
            <View style={[styles.kpis, { flexDirection: dir.row }]}>
              <Kpi value={String(stats?.streak ?? 0)} label={t("progress.streak")} color="#FFB38A" icon="flame" />
              <Kpi value={String(series.pages)} label={t("progress.pages")} color={Palette.text} icon="document-text" />
              <Kpi value={accuracy === null ? "—" : `${accuracy}%`} label={t("progress.accuracy")} color="#6CF3C5" icon="checkmark-done" />
            </View>
          </FadeIn>

          {/* جاهزية الاختبارات */}
          {ready.length > 0 && (
            <FadeIn delay={140}>
              <View style={[styles.tile, { gap: 14 }]}>
                <Text style={[styles.tileTitle, { textAlign: dir.textAlign }]}>{t("progress.readiness")}</Text>
                {ready.map((r) => {
                  const color = r.score >= 70 ? Gradients.neon : r.score >= 40 ? (["#7C6CFF", "#3FD0FF"] as const) : (["#FFB38A", "#FF8A6B"] as const);
                  return (
                    <PressableScale key={r.bookId} onPress={() => router.push({ pathname: "/book/[id]", params: { id: r.bookId } })} style={styles.rRow}>
                      <View style={[styles.rHead, { flexDirection: dir.row }]}>
                        <Text style={[styles.rTitle, { textAlign: dir.textAlign }]} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text style={styles.rPct}>{r.score}%</Text>
                      </View>
                      <View style={styles.rTrack}>
                        <LinearGradient
                          colors={color}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.rFill, { width: `${Math.max(3, r.score)}%` }, dir.isRTL ? { alignSelf: "flex-end" } : null]}
                        />
                      </View>
                      <Text style={[styles.rSub, { textAlign: dir.textAlign }]}>
                        {[
                          r.daysLeft != null && r.daysLeft >= 0 ? t("progress.examIn", { n: r.daysLeft }) : "",
                          r.weakUnit !== null ? t(r.weakUntested ? "ready.untested" : "ready.weak", { n: r.weakUnit + 1 }) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </FadeIn>
          )}

          {/* هدف اليوم */}
          <FadeIn delay={200}>
            <View style={[styles.tile, styles.goalRow, { flexDirection: dir.row }]}>
              <ProgressRing progress={goalFrac} colors={["#6CF3C5", "#3FD0FF"]} size={74}>
                <Text style={styles.goalNum}>{Math.round(goalFrac * 100)}%</Text>
              </ProgressRing>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.tileTitle, { textAlign: dir.textAlign }]}>{t("progress.goal")}</Text>
                <Text style={[styles.cap, { textAlign: dir.textAlign }]}>
                  {goalFrac >= 1 ? t("activity.goal.done") : t("progress.goalSub", { done: todayMin, goal })}
                </Text>
              </View>
              <PressableScale onPress={cycleGoal} style={styles.goalChip}>
                <Text style={styles.goalChipTxt}>{t("activity.goal.chip", { goal })}</Text>
              </PressableScale>
            </View>
          </FadeIn>

          {/* خريطة النشاط */}
          <FadeIn delay={260}>
            <View style={[styles.tile, { gap: 14 }]}>
              <Text style={[styles.tileTitle, { textAlign: dir.textAlign }]}>{t("progress.heatmap")}</Text>
              <StudyHeatmap days={stats?.days ?? {}} />
            </View>
          </FadeIn>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function Kpi({ value, label, color, icon }: { value: string; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }) {
  const dir = useDir();
  return (
    <View style={[styles.tile, styles.kpi]}>
      <Ionicons name={icon} size={15} color={color} style={{ alignSelf: dir.isRTL ? "flex-end" : "flex-start" }} />
      <Text style={[styles.kpiVal, { color, textAlign: dir.textAlign }]}>{value}</Text>
      <Text style={[styles.cap, { textAlign: dir.textAlign }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 120, gap: 12 },
  seg: { padding: 4, borderRadius: 14, backgroundColor: "#10121B", gap: 4 },
  segItem: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: "#262A3D" },
  segTxt: { color: "#8E95AB", fontSize: 13.5, fontWeight: "600" },
  segTxtOn: { color: Palette.text },
  tile: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tileTitle: { color: Palette.text, fontSize: 15, fontWeight: "700" },
  cap: { color: "#8E95AB", fontSize: 12, fontWeight: "600" },
  heroHead: { alignItems: "flex-end", justifyContent: "space-between" },
  heroNum: { color: "#A8C8FF", fontSize: 34, fontWeight: "800", marginTop: 2 },
  deltaChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: "rgba(108,243,197,0.12)" },
  deltaDown: { backgroundColor: "rgba(255,179,138,0.12)" },
  deltaTxt: { color: "#6CF3C5", fontSize: 12, fontWeight: "700" },
  bars: { alignItems: "flex-end", height: 140, gap: 6, marginTop: 16 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bar: { width: "62%", maxWidth: 26, borderRadius: 8 },
  barDim: { backgroundColor: "rgba(255,255,255,0.14)" },
  barVal: { color: "#D9D3FF", fontSize: 11, fontWeight: "700", height: 14 },
  barLbl: { color: "#8E95AB", fontSize: 11, fontWeight: "600" },
  kpis: { gap: 8 },
  kpi: { flex: 1, padding: 12, gap: 2 },
  kpiVal: { fontSize: 21, fontWeight: "800" },
  rRow: { gap: 7 },
  rHead: { alignItems: "center", gap: 10 },
  rTitle: { flex: 1, color: Palette.text, fontSize: 13.5, fontWeight: "600" },
  rPct: { color: Palette.text, fontSize: 14, fontWeight: "800" },
  rTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  rFill: { height: 8, borderRadius: 4 },
  rSub: { color: "#8E95AB", fontSize: 11.5 },
  goalRow: { alignItems: "center", gap: 14 },
  goalNum: { color: Palette.text, fontSize: 15, fontWeight: "800" },
  goalChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.08)" },
  goalChipTxt: { color: Palette.text, fontWeight: "700", fontSize: 12.5 },
});
