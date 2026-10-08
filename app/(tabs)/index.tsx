import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppDrawer } from "../../components/brand/app-drawer";
import { BookCover } from "../../components/brand/book-cover";
import { DownloadIndicator } from "../../components/brand/download-indicator";
import { FadeIn } from "../../components/brand/fade-in";
import { GlassCard } from "../../components/brand/glass-card";
import { CountUp, PressableScale } from "../../components/brand/motion";
import { ProgressRing } from "../../components/brand/progress-ring";
import { ScreenBackground } from "../../components/brand/screen-background";
import { WeekBars } from "../../components/brand/week-bars";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { getDisplayName } from "../../lib/auth";
import { countDue, reviewedToday } from "../../lib/flashcards";
import { getDailyGoal } from "../../lib/goals";
import { getContinueBook, getTodayPlan, type ContinueBook, type TodayPlan } from "../../lib/home";
import { dropEmptyVocative, useDir, useI18n } from "../../lib/i18n";
import { goalProgress, lastSevenDays, pickNextActions, type NextActionId } from "../../lib/nextActions";
import { getBookReadiness, type BookReadiness } from "../../lib/readiness";
import { buildDailyPath, type PathStep, type PathStepId } from "../../lib/readinessCore";
import { getMyBookCount, getStats, type Stats } from "../../lib/stats";
import { useTheme } from "../../lib/themeContext";


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
  const [ready, setReady] = useState<BookReadiness | null>(null);
  const [cardsToday, setCardsToday] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      (async () => {
        const [s, d, n, b, g, c, p, rv] = await Promise.all([
          getStats(),
          countDue(),
          getDisplayName(),
          getMyBookCount(),
          getDailyGoal(),
          getContinueBook(),
          getTodayPlan(),
          reviewedToday(),
        ]);
        if (!on) return;
        setCardsToday(rv);
        // جاهزية الكتاب الحالي (لبطاقة الجاهزية ومسار اليوم)
        getBookReadiness(c?.pdf_path ?? "").then((r) => on && setReady(r));
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

  // تظهر بطاقة الجاهزية متى كان للكتاب منهج أو اختبارات أو موعد اختبار
  const showReady = !!ready && (ready.unitCount > 0 || ready.answered > 0 || !!ready.examISO);
  const path = useMemo(
    () =>
      buildDailyPath({
        hasBook: !!cont,
        todayMinutes,
        goalMinutes: goal,
        dueCards: due,
        reviewedCardsToday: cardsToday,
        dueMistakes: ready?.dueMistakes ?? 0,
        quizzedToday: !!ready?.quizzedToday,
        hasSyllabus: (ready?.unitCount ?? 0) > 0,
        weakUnit: ready?.weakUnit ?? null,
        summaryToday: !!ready?.summaryToday,
      }),
    [cont, todayMinutes, goal, due, cardsToday, ready]
  );
  const firstOpen = path.steps.findIndex((s) => !s.done);

  function runStep(id: PathStepId) {
    if (!cont) return;
    const unitParams = ready && ready.weakUnit !== null
      ? { pdf_path: cont.pdf_path, unit: String(ready.weakUnit), title: ready.weakTitle, book_title: cont.title }
      : null;
    switch (id) {
      case "listen":
        return openBook(cont);
      case "cards":
        return router.push("/flashcards");
      case "mistakes":
        return router.push({ pathname: "/unit-quiz", params: { pdf_path: cont.pdf_path, mode: "mistakes", book_title: cont.title } });
      case "quiz":
        return unitParams && router.push({ pathname: "/unit-quiz", params: unitParams });
      case "summary":
        return unitParams && router.push({ pathname: "/unit-summary", params: unitParams });
    }
  }

  function stepText(s: PathStep): { title: string; sub: string } {
    const unitN = (ready?.weakUnit ?? 0) + 1;
    switch (s.id) {
      case "listen":
        return { title: t("path.listen.title", { book: cont?.title ?? "" }), sub: t("path.listen.sub", { min: s.minutes, page: cont?.page ?? 1 }) };
      case "cards":
        return s.done
          ? { title: t("path.cards.done"), sub: "" }
          : { title: t("path.cards.title", { n: due }), sub: t("path.cards.sub", { min: s.minutes }) };
      case "mistakes":
        return { title: t("path.mistakes.title", { n: ready?.dueMistakes ?? 0 }), sub: t("path.mistakes.sub", { min: s.minutes }) };
      case "quiz":
        return { title: t("path.quiz.title", { n: unitN }), sub: t("path.quiz.sub", { min: s.minutes }) };
      case "summary":
        return { title: t("path.summary.title", { n: unitN }), sub: t("path.summary.sub", { min: s.minutes }) };
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

          {/* بطاقة الجاهزية (تصميم 2.0) — تحلّ محلّ بطاقة الهدف متى توفّرت بيانات */}
          {showReady && ready && cont && (
            <FadeIn delay={0}>
              <PressableScale onPress={() => router.push({ pathname: "/book/[id]", params: { id: cont.id } })}>
                <GlassCard radius={Radius.xl} glow={Palette.primary} style={styles.block}>
                  <LinearGradient
                    colors={["rgba(124,108,255,0.16)", "rgba(16,18,27,0)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[styles.todayRow, { flexDirection: dir.row }]}>
                    <ProgressRing progress={ready.score / 100} colors={[Gradients.neon[0], Gradients.neon[2]]} size={112}>
                      <Text style={styles.readyNum}>{ready.score}%</Text>
                      <Text style={styles.ringUnit}>{t("ready.title")}</Text>
                    </ProgressRing>
                    <View style={styles.todayInfo}>
                      <Text style={[styles.sectionLabel, { textAlign: dir.textAlign }]} numberOfLines={2}>
                        {ready.daysLeft == null || ready.daysLeft < 0
                          ? t("ready.noExam", { book: cont.title })
                          : ready.daysLeft === 0
                            ? t("ready.examToday", { book: cont.title })
                            : t("ready.exam", { book: cont.title, n: ready.daysLeft })}
                      </Text>
                      <Text style={[styles.readyHeadline, { textAlign: dir.textAlign }]}>
                        {ready.delta && ready.delta > 0
                          ? t("ready.up", { n: ready.delta })
                          : ready.delta && ready.delta < 0
                            ? t("ready.down", { n: -ready.delta })
                            : t("ready.flat")}
                      </Text>
                      {ready.weakUnit !== null && (
                        <View style={[styles.weakChip, { alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
                          <Text style={styles.weakChipTxt}>
                            {t(ready.weakUntested ? "ready.untested" : "ready.weak", { n: ready.weakUnit + 1 })}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </GlassCard>
              </PressableScale>
            </FadeIn>
          )}

          {/* بطاقة اليوم: حلقة الهدف + أعمدة الأسبوع */}
          {!showReady && (
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
          )}

          {/* مسار اليوم (تصميم 2.0): خطوات اليوم بالترتيب — يحلّ محلّ «تابع القراءة» والاقتراحات */}
          {cont && path.steps.length > 0 && (
            <FadeIn delay={70}>
              <View style={[styles.pathHead, { flexDirection: dir.row }]}>
                <Text style={styles.sectionTitle}>{t("path.title")}</Text>
                <Text style={styles.pathMeta}>
                  {path.done === path.steps.length
                    ? t("path.complete")
                    : t("path.progress", { done: path.done, total: path.steps.length, min: path.minutesLeft })}
                </Text>
              </View>
              <GlassCard radius={Radius.xl} style={styles.block}>
                {path.steps.map((st, i) => {
                  const txt = stepText(st);
                  const current = i === firstOpen;
                  return (
                    <PressableScale
                      key={st.id}
                      onPress={() => runStep(st.id)}
                      style={[
                        styles.stepRow,
                        { flexDirection: dir.row },
                        i > 0 && styles.actionDivider,
                        current && styles.stepCurrent,
                        st.done && { opacity: 0.55 },
                      ]}
                    >
                      {st.done ? (
                        <View style={styles.stepDone}>
                          <Ionicons name="checkmark" size={16} color="#6CF3C5" />
                        </View>
                      ) : current ? (
                        <View style={styles.stepRing}>
                          <View style={styles.stepDot} />
                        </View>
                      ) : (
                        <View style={styles.stepEmpty} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.stepTitle, { textAlign: dir.textAlign }, current && { fontWeight: "800" }, st.done && styles.strike]}
                          numberOfLines={1}
                        >
                          {txt.title}
                        </Text>
                        {!!txt.sub && !st.done && (
                          <Text style={[styles.actionSub, { textAlign: dir.textAlign }]} numberOfLines={1}>
                            {txt.sub}
                          </Text>
                        )}
                      </View>
                      {current && (
                        <View style={styles.startPill}>
                          <Text style={styles.startTxt}>{t("path.start")}</Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </GlassCard>
            </FadeIn>
          )}

          {/* تابع القراءة (حين لا يوجد مسار) */}
          {cont && path.steps.length === 0 && (
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

          {/* اقتراحات ذكية — حين لا يوجد كتاب حالي (مثل: إضافة أول كتاب) */}
          {!cont && (
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
          )}

          {/* أرقامك */}
          {!showReady && (
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
          )}

        </ScrollView>
      </SafeAreaView>
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

  readyNum: { color: "#D9D3FF", fontSize: 30, fontWeight: "900", lineHeight: 34 },
  readyHeadline: { color: Palette.text, fontSize: 16.5, fontWeight: "800", lineHeight: 23 },
  weakChip: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: "rgba(255,179,138,0.12)" },
  weakChipTxt: { color: "#FFB38A", fontSize: 12, fontWeight: "700" },
  pathHead: { alignItems: "baseline", justifyContent: "space-between", marginBottom: Spacing.sm, marginTop: Spacing.xs },
  pathMeta: { color: Palette.textDim, fontSize: 11.5, fontWeight: "700" },
  stepRow: { alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  stepCurrent: { backgroundColor: "rgba(124,108,255,0.08)" },
  stepDone: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(108,243,197,0.16)", alignItems: "center", justifyContent: "center" },
  stepRing: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#B9AFFF", alignItems: "center", justifyContent: "center" },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#B9AFFF" },
  stepEmpty: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.18)" },
  stepTitle: { color: Palette.text, fontSize: 14.5, fontWeight: "600" },
  strike: { textDecorationLine: "line-through" },
  startPill: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: "#F3F4F8" },
  startTxt: { color: "#07080D", fontSize: 12.5, fontWeight: "800" },
});
