import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDrawer } from "../../components/brand/app-drawer";
import { BookCover } from "../../components/brand/book-cover";
import { DownloadIndicator } from "../../components/brand/download-indicator";
import { FadeIn } from "../../components/brand/fade-in";
import { GlassCard } from "../../components/brand/glass-card";
import { HowToTour } from "../../components/brand/howto-tour";
import { CountUp, PressableScale } from "../../components/brand/motion";
import { ProgressRing } from "../../components/brand/progress-ring";
import { ScreenBackground } from "../../components/brand/screen-background";
import { WeekBars } from "../../components/brand/week-bars";
import { Palette, Radius, Spacing } from "../../constants/design";
import { getDisplayName } from "../../lib/auth";
import { countDue } from "../../lib/flashcards";
import { getDailyGoal } from "../../lib/goals";
import { getContinueBook, getTodayPlan, type ContinueBook, type TodayPlan } from "../../lib/home";
import { dropEmptyVocative, useDir, useI18n } from "../../lib/i18n";
import { goalProgress, lastSevenDays, pickNextActions, type NextActionId } from "../../lib/nextActions";
import { getMyBookCount, getStats, type Stats } from "../../lib/stats";
import { useTheme } from "../../lib/themeContext";

const HOWTO_KEY = "howto-tour-seen-v1";

// شكل كل اقتراح ذكي: أيقونة + لون (النص يُبنى في الشاشة لأنه يحتاج بيانات)
const ACTION_LOOK: Record<NextActionId, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  addFirstBook: { icon: "cloud-upload", color: Palette.neonViolet },
  protectStreak: { icon: "flame", color: "#ff7a59" },
  plan: { icon: "calendar-clear", color: Palette.neonCyan },
  review: { icon: "albums", color: Palette.neonPink },
  continue: { icon: "headset", color: Palette.neonBlue },
  goal: { icon: "trophy", color: "#f5a623" },
  focus: { icon: "timer", color: Palette.success },
};

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { theme } = useTheme();

  const [stats, setStats] = useState<Stats | null>(null);
  const [due, setDue] = useState(0);
  const [books, setBooks] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(20);
  const [cont, setCont] = useState<ContinueBook | null>(null);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [tour, setTour] = useState(false);

  // جولة تعريفية أول مرة فقط
  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem(HOWTO_KEY);
      if (seen !== "1") setTour(true);
    })();
  }, []);

  async function closeTour() {
    setTour(false);
    await AsyncStorage.setItem(HOWTO_KEY, "1").catch(() => {});
  }

  useFocusEffect(
    useCallback(() => {
      let on = true;
      (async () => {
        const [s, d, n, b, g, c, p] = await Promise.all([
          getStats(),
          countDue(),
          getDisplayName(),
          getMyBookCount(),
          getDailyGoal(),
          getContinueBook(),
          getTodayPlan(),
        ]);
        if (!on) return;
        setStats(s);
        setDue(d);
        setName(n.trim());
        setBooks(b);
        setGoal(g);
        setCont(c);
        setPlan(p);
      })();
      return () => {
        on = false;
      };
    }, [])
  );

  const accent: readonly [string, string] = [theme.glow3, theme.accent];
  const streak = stats?.streak ?? 0;

  const week = useMemo(
    () => lastSevenDays(new Date()).map((iso) => ({ iso, minutes: stats?.days?.[iso]?.m ?? 0 })),
    [stats]
  );
  const todayMinutes = week.at(-1)?.minutes ?? 0;
  const progress = goalProgress(todayMinutes, goal);
  const goalLeft = Math.max(0, goal - todayMinutes);

  const actions = useMemo(
    () =>
      pickNextActions({
        books,
        dueCards: due,
        todayMinutes,
        goalMinutes: goal,
        streak,
        studiedToday: todayMinutes > 0 || (stats?.days?.[week.at(-1)?.iso ?? ""]?.p ?? 0) > 0,
        hasContinueBook: !!cont,
        todayPlan: plan,
        hour: new Date().getHours(),
      }),
    [books, due, todayMinutes, goal, streak, stats, week, cont, plan]
  );

  function openBook(b: ContinueBook) {
    router.push({ pathname: "/reader/[id]", params: { id: b.id, title: b.title, pdf_path: b.pdf_path } });
  }

  function runAction(id: NextActionId) {
    switch (id) {
      case "addFirstBook":
        return router.push("/add-book");
      case "plan":
        return router.push("/calendar");
      case "review":
        return router.push("/flashcards");
      case "focus":
        return router.push("/pomodoro");
      case "continue":
      case "protectStreak":
      case "goal":
        return cont ? openBook(cont) : router.push("/library");
    }
  }

  function actionText(id: NextActionId): { title: string; sub: string } {
    switch (id) {
      case "protectStreak":
        return { title: t("home.next.protectStreak.title", { streak }), sub: t("home.next.protectStreak.sub") };
      case "plan":
        return {
          title: t("home.next.plan.title", { left: Math.max(0, (plan?.pagesTarget ?? 0) - (plan?.pagesDone ?? 0)) }),
          sub: plan?.bookTitle ? t("home.next.plan.sub", { book: plan.bookTitle }) : "",
        };
      case "review":
        return { title: t("home.next.review.title", { count: due }), sub: t("home.next.review.sub") };
      case "continue":
        return { title: t("home.next.continue.title", { title: cont?.title ?? "" }), sub: t("home.next.continue.sub", { page: cont?.page ?? 1 }) };
      case "goal":
        return { title: t("home.next.goal.title", { left: goalLeft }), sub: t("home.next.goal.sub") };
      default:
        return { title: t(`home.next.${id}.title`), sub: t(`home.next.${id}.sub`) };
    }
  }

  const dayIndex = Math.floor(Date.now() / 86_400_000) % 10;
  const dailyCheer = dropEmptyVocative(t(`home.cheer.${dayIndex}`, { name }));
  const dayLabels = t("home.days").split(",");
  const contFraction = cont && cont.pageCount > 0 ? Math.min(1, cont.page / cont.pageCount) : 0;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* الشريط العلوي: قائمة + تحية */}
          <View style={[styles.topBar, { flexDirection: dir.row }]}>
            <AppDrawer />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hello, { textAlign: dir.textAlign }]} numberOfLines={1}>
                {name ? t("home.greeting", { name }) : "VoiceStudyFlow"}
              </Text>
              <Text style={[styles.cheer, { textAlign: dir.textAlign, color: theme.accent }]} numberOfLines={1}>
                {dailyCheer}
              </Text>
            </View>
            <View style={styles.streakPill}>
              <Text style={styles.streakFlame}>🔥</Text>
              <Text style={styles.streakNum}>{streak}</Text>
            </View>
          </View>

          <DownloadIndicator />

          {/* بطاقة اليوم: حلقة الهدف + أعمدة الأسبوع */}
          <FadeIn delay={0}>
            <PressableScale onPress={() => router.push("/activity")}>
            <GlassCard radius={Radius.xl} glow={theme.accent} style={styles.block}>
              <View style={[styles.todayRow, { flexDirection: dir.row }]}>
                <ProgressRing progress={progress} colors={accent} size={118}>
                  <CountUp value={todayMinutes} style={styles.ringNum} />
                  <Text style={styles.ringUnit}>{t("home.today.unit", { goal })}</Text>
                </ProgressRing>
                <View style={styles.todayInfo}>
                  <Text style={[styles.sectionLabel, { textAlign: dir.textAlign }]}>{t("home.today.title")}</Text>
                  <Text style={[styles.todayStatus, { textAlign: dir.textAlign }]}>
                    {progress >= 1 ? t("home.today.done") : t("home.today.left", { left: goalLeft })}
                  </Text>
                  <Text style={[styles.weekLabel, { textAlign: dir.textAlign }]}>{t("home.week.title")}</Text>
                  <WeekBars days={week} dayLabels={dayLabels} accent={accent} isRTL={dir.isRTL} height={44} />
                </View>
              </View>
            </GlassCard>
            </PressableScale>
          </FadeIn>

          {/* تابع القراءة */}
          {cont && (
            <FadeIn delay={70}>
              <PressableScale onPress={() => openBook(cont)}>
                <GlassCard radius={Radius.xl} style={styles.block}>
                  <View style={[styles.contRow, { flexDirection: dir.row }]}>
                    <BookCover title={cont.title} width={62} height={86} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={[styles.sectionLabel, { textAlign: dir.textAlign }]}>{t("home.continue.title")}</Text>
                      <Text style={[styles.contTitle, { textAlign: dir.textAlign }]} numberOfLines={2}>
                        {cont.title}
                      </Text>
                      <View style={styles.progTrack}>
                        <LinearGradient
                          colors={accent}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[
                            styles.progFill,
                            { width: `${Math.max(4, contFraction * 100)}%` },
                            dir.isRTL ? { alignSelf: "flex-end" } : null,
                          ]}
                        />
                      </View>
                      <Text style={[styles.contSub, { textAlign: dir.textAlign }]}>
                        {cont.pageCount > 0
                          ? t("home.continue.page", { page: cont.page, total: cont.pageCount })
                          : t("home.continue.pageOnly", { page: cont.page })}
                      </Text>
                    </View>
                    <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.playBtn}>
                      <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
                    </LinearGradient>
                  </View>
                </GlassCard>
              </PressableScale>
            </FadeIn>
          )}

          {/* اقتراحات ذكية */}
          <FadeIn delay={140}>
            <View style={[styles.sectionHead, { flexDirection: dir.row }]}>
              <Ionicons name="sparkles" size={16} color={theme.accent} />
              <Text style={styles.sectionTitle}>{t("home.smart.title")}</Text>
            </View>
            <GlassCard radius={Radius.xl} style={styles.block}>
              {actions.map((a, i) => {
                const look = ACTION_LOOK[a.id];
                const txt = actionText(a.id);
                return (
                  <PressableScale
                    key={a.id}
                    onPress={() => runAction(a.id)}
                    style={[styles.actionRow, { flexDirection: dir.row }, i > 0 && styles.actionDivider]}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: look.color + "22", borderColor: look.color + "55" }]}>
                      <Ionicons name={look.icon} size={20} color={look.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.actionTitle, { textAlign: dir.textAlign }]} numberOfLines={1}>
                        {txt.title}
                      </Text>
                      {!!txt.sub && (
                        <Text style={[styles.actionSub, { textAlign: dir.textAlign }]} numberOfLines={1}>
                          {txt.sub}
                        </Text>
                      )}
                    </View>
                    <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={Palette.textDim} />
                  </PressableScale>
                );
              })}
            </GlassCard>
          </FadeIn>

          {/* أرقامك */}
          <FadeIn delay={210}>
            <View style={[styles.statsRow, { flexDirection: dir.row }]}>
              <StatTile icon="book" color={Palette.neonBlue} value={books} label={t("home.stat.books")} onPress={() => router.push("/library")} />
              <StatTile icon="document-text" color={Palette.neonCyan} value={stats?.totalPages ?? 0} label={t("home.stat.pages")} onPress={() => router.push("/activity")} />
              <StatTile icon="time" color={Palette.neonViolet} value={stats?.totalMinutes ?? 0} label={t("home.stat.minutes")} onPress={() => router.push("/activity")} />
              <StatTile
                icon="albums"
                color={Palette.neonPink}
                value={due}
                label={t("home.stat.dueCards")}
                highlight={due > 0}
                onPress={() => router.push("/flashcards")}
              />
            </View>
          </FadeIn>

        </ScrollView>
      </SafeAreaView>
      <HowToTour visible={tour} onClose={closeTour} />
    </ScreenBackground>
  );
}

function StatTile({
  icon,
  color,
  value,
  label,
  highlight,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: number;
  label: string;
  highlight?: boolean;
  onPress?: () => void;
}) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} style={styles.statTile}>
      <GlassCard radius={Radius.lg} glow={highlight ? color : undefined}>
        <View style={styles.statInner}>
          <Ionicons name={icon} size={16} color={color} />
          <CountUp value={value} style={[styles.statValue, highlight && { color }]} />
          <Text style={styles.statLabel} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </GlassCard>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.xl, paddingBottom: 120 },
  block: { marginBottom: Spacing.lg },

  topBar: { alignItems: "center", gap: Spacing.md, marginBottom: Spacing.lg },
  hello: { color: Palette.text, fontSize: 22, fontWeight: "900" },
  cheer: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(255,122,89,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,122,89,0.45)",
  },
  streakFlame: { fontSize: 15 },
  streakNum: { color: "#fff", fontSize: 16, fontWeight: "900" },

  todayRow: { alignItems: "center", gap: Spacing.lg, padding: Spacing.lg },
  ringNum: { color: Palette.text, fontSize: 30, fontWeight: "900", lineHeight: 34 },
  ringUnit: { color: Palette.textDim, fontSize: 11, fontWeight: "700" },
  todayInfo: { flex: 1, gap: 4 },
  sectionLabel: { color: Palette.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  todayStatus: { color: Palette.text, fontSize: 17, fontWeight: "900" },
  weekLabel: { color: Palette.textDim, fontSize: 11, fontWeight: "700", marginTop: 10, marginBottom: 4 },

  contRow: { alignItems: "center", gap: Spacing.lg, padding: Spacing.lg },
  contTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", lineHeight: 22 },
  contSub: { color: Palette.textDim, fontSize: 12, fontWeight: "700" },
  progTrack: { height: 6, borderRadius: 3, backgroundColor: Palette.surfaceStrong, overflow: "hidden" },
  progFill: { height: 6, borderRadius: 3 },
  playBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },

  sectionHead: { alignItems: "center", gap: 6, marginBottom: Spacing.sm, marginTop: Spacing.xs },
  sectionTitle: { color: Palette.text, fontSize: 16, fontWeight: "900" },
  actionRow: { alignItems: "center", gap: Spacing.md, paddingVertical: 14, paddingHorizontal: Spacing.lg },
  actionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.glassBorder },
  actionIcon: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionTitle: { color: Palette.text, fontSize: 15, fontWeight: "800" },
  actionSub: { color: Palette.textDim, fontSize: 12, marginTop: 2 },

  statsRow: { gap: Spacing.sm, marginBottom: Spacing.lg },
  statTile: { flex: 1 },
  statInner: { alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, gap: 3 },
  statValue: { color: Palette.text, fontSize: 19, fontWeight: "900" },
  statLabel: { color: Palette.textDim, fontSize: 10.5, fontWeight: "700" },


  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
