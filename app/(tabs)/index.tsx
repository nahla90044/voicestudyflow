import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppDrawer } from "../../components/brand/app-drawer";
import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { UsageBar } from "../../components/brand/usage-chip";
import { DownloadIndicator } from "../../components/brand/download-indicator";
import { FadeIn } from "../../components/brand/fade-in";
import { CountUp, PressableScale } from "../../components/brand/motion";
import { SceneArt } from "../../components/brand/scene-art";
import { UpgradeBanner } from "../../components/brand/upgrade-banner";
import { WeekBars } from "../../components/brand/week-bars";
import { Palette, Radius, Spacing } from "../../constants/design";
import { getDisplayName } from "../../lib/auth";
import { countDue, reviewedToday } from "../../lib/flashcards";
import { getDailyGoal } from "../../lib/goals";
import { getContinueBook, getTodayPlan, type ContinueBook, type TodayPlan } from "../../lib/home";
import { dropEmptyVocative, useDir, useI18n } from "../../lib/i18n";
import { goalProgress, lastSevenDays, pickNextActions, type NextActionId } from "../../lib/nextActions";
import { getBookReadiness, type BookReadiness } from "../../lib/readiness";
import { buildDailyPath, type PathStep, type PathStepId } from "../../lib/readinessCore";
import { getMyBookCount, getStats, type Stats } from "../../lib/stats";
import { useScene } from "../../lib/scene";
import { sceneGrowth } from "../../lib/sceneCore";


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
  const scene = useScene();
  const { width, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // جولة الرئيسية (مرة أولى، وتعود بزر «؟»)
  const coach = useCoachTour(
    "home_v1",
    [
      { id: "streak", title: t("coach.home.streak.title"), body: t("coach.home.streak.body"), shape: "rect" },
      { id: "cont", title: t("coach.home.cont.title"), body: t("coach.home.cont.body"), shape: "rect" },
      { id: "path", title: t("coach.home.path.title"), body: t("coach.home.path.body"), shape: "rect" },
      { id: "menu", title: t("coach.home.menu.title"), body: t("coach.home.menu.body") },
    ],
    { delay: 3800 }
  );

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
  const contFraction = cont && cont.pageCount > 0 && cont.page > 1 ? Math.min(1, cont.page / cont.pageCount) : 0; // الصفحة الأولى = لم تبدأ

  // المشهد الحيّ: يتبدّل مع وقت اليوم ويكبر مع التقدّم الحقيقي
  const todayISO = week.at(-1)?.iso ?? "";
  const unitCount = ready?.unitCount ?? 0;
  const unitsDone = ready
    ? Math.max(ready.accuracy.filter((a) => a !== null && a >= 0.7).length, Math.floor((ready.readFraction ?? 0) * unitCount))
    : 0;
  const growth = sceneGrowth(scene.id, {
    pagesToday: stats?.days?.[todayISO]?.p ?? 0,
    unitsDone,
    unitCount,
    readiness: ready?.score ?? 0,
  });
  const pal = scene.pal;
  // على الآيباد كان المشهد بطول الشاشة كلها (١٫٠٦ × العرض) فلا يظهر غيره؛ نحدّه بنصف الشاشة تقريبًا
  const heroH = Math.round(Math.min(width * 1.06, winH * 0.55));
  const headline = t(`scene.${scene.id}.title`).split("|");
  const sceneSub =
    scene.id === "sky"
      ? t("scene.sky.sub", { n: growth.lit })
      : scene.id === "study"
        ? unitCount > 0
          ? t("scene.study.sub", { n: growth.lit, total: unitCount })
          : t("scene.study.subEmpty")
        : t("scene.garden.sub");
  const greet = name ? t(`scene.${scene.id === "garden" ? "morning" : "evening"}`, { name }) : t(`scene.${scene.id === "garden" ? "morningNoName" : "eveningNoName"}`);
  const headTop = scene.id === "garden";
  const cardStyle = { backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: pal.dark ? "#000" : "#3C5028" };

  return (
    <View style={[styles.safe, { backgroundColor: pal.bg }]}>
      <StatusBar style={pal.dark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* المشهد + التحية */}
        <View style={{ height: heroH }}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <SceneArt id={scene.id} growth={growth} width={width} height={heroH} />
          </View>
          <View style={[styles.heroInner, { paddingTop: insets.top + 6, justifyContent: headTop ? "flex-start" : "space-between" }]}>
            <View style={[styles.topBar, { flexDirection: dir.row }]}>
              <View {...coach.bind("menu")}>
                <AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />
              </View>
              <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 6 }}>
                <UsageBar />
              </View>
              <CoachHelpButton onPress={coach.replay} />
              <View {...coach.bind("streak")} style={[styles.streakPill, { backgroundColor: pal.dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.75)", borderColor: pal.dark ? pal.accent + "55" : "transparent" }]}>
                <Ionicons name="flame" size={14} color={pal.dark ? pal.accent : "#E07A2E"} />
                <Text style={[styles.streakNum, { color: pal.dark ? pal.accent : "#E07A2E" }]}>{t("scene.streak", { n: streak })}</Text>
              </View>
            </View>
            <View style={[styles.headBlock, !headTop && { paddingBottom: Math.round(heroH * 0.17) + 16 }]}>
              <Text style={[styles.greet, { color: pal.dark ? pal.dim : "#5F6F58", textAlign: dir.textAlign }]} numberOfLines={1}>
                {greet}
              </Text>
              <Text style={[styles.headline, { color: pal.ink, textAlign: dir.textAlign }]}>
                {headline[0]}
                {headline[1] ? <Text style={{ color: pal.dark ? pal.accent : pal.accent }}>{headline[1]}</Text> : null}
              </Text>
              <Text style={[styles.sceneSub, { color: pal.dark ? pal.dim : "#6E7B66", textAlign: dir.textAlign }]} numberOfLines={2}>
                {sceneSub}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.body, { marginTop: -Math.round(heroH * 0.17) }]}>
          <DownloadIndicator />
          <UpgradeBanner />

          {/* البطاقة الرئيسية: متابعة الاستماع + أرقام اليوم + الخطوة التالية */}
          {cont && (
            <FadeIn delay={0}>
              <View {...coach.bind("cont")} style={[styles.card, cardStyle]}>
                <PressableScale onPress={() => openBook(cont)} style={[styles.contRow, { flexDirection: dir.row }]}>
                  <View style={[styles.playBtn, { backgroundColor: pal.accent, shadowColor: pal.accent }]}>
                    <Ionicons name="play" size={20} color={pal.onAccent} style={{ marginLeft: 3 }} />
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={[styles.small, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                      {t("home.continue.title")} ·{" "}
                      {cont.pageCount > 0 ? t("home.continue.page", { page: cont.page, total: cont.pageCount }) : t("home.continue.pageOnly", { page: cont.page })}
                    </Text>
                    <Text style={[styles.contTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                      {cont.title}
                    </Text>
                    <View style={[styles.progTrack, { backgroundColor: pal.track }]}>
                      <View style={[styles.progFill, { width: `${Math.max(4, contFraction * 100)}%`, backgroundColor: pal.accent }, dir.isRTL ? { alignSelf: "flex-end" } : null]} />
                    </View>
                  </View>
                </PressableScale>

                <View style={[styles.hair, { backgroundColor: pal.track }]} />

                <View style={[styles.statsRow, { flexDirection: dir.row }]}>
                  {/* إحصاءات للعرض فقط (التقدم له تبويبه)، إلا البطاقات المستحقة فهي دعوة للمراجعة */}
                  <View style={styles.statCell}>
                    <Text style={[styles.statNum, { color: pal.ink }]}>
                      <CountUp value={todayMinutes} style={[styles.statNum, { color: pal.ink }]} />
                      <Text style={[styles.statUnit, { color: pal.dim }]}> / {goal}</Text>
                    </Text>
                    <Text style={[styles.statLbl, { color: pal.dim }]}>{t("scene.stat.minutes")}</Text>
                  </View>
                  <View style={[styles.vHair, { backgroundColor: pal.track }]} />
                  <View style={styles.statCell}>
                    <Text style={[styles.statNum, { color: pal.ink }]}>{ready ? `${ready.score}%` : "—"}</Text>
                    <Text style={[styles.statLbl, { color: pal.dim }]}>{t("ready.title")}</Text>
                  </View>
                  <View style={[styles.vHair, { backgroundColor: pal.track }]} />
                  <PressableScale onPress={() => router.push("/flashcards")} style={styles.statCell}>
                    <Text style={[styles.statNum, { color: due > 0 ? pal.accent : pal.ink }]}>{due}</Text>
                    <Text style={[styles.statLbl, { color: pal.dim }]}>{t("home.stat.dueCards")}</Text>
                  </PressableScale>
                </View>

                {ready && ready.daysLeft != null && ready.daysLeft >= 0 && (
                  <Text style={[styles.examLine, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                    {ready.daysLeft === 0 ? t("ready.examToday", { book: cont.title }) : t("ready.exam", { book: cont.title, n: ready.daysLeft })}
                  </Text>
                )}
              </View>
            </FadeIn>
          )}

          {/* مسار اليوم */}
          {cont && path.steps.length > 0 && (
            <FadeIn delay={70}>
              <View style={[styles.sectionHead, { flexDirection: dir.row }]}>
                <Text style={[styles.sectionTitle, { color: pal.ink }]}>{t("path.title")}</Text>
                <Text style={[styles.small, { color: pal.dim }]}>
                  {path.done === path.steps.length
                    ? t("path.complete")
                    : t("path.progress", { done: path.done, total: path.steps.length, min: path.minutesLeft })}
                </Text>
              </View>
              <View {...coach.bind("path")} style={[styles.card, cardStyle, { padding: 8, gap: 6 }]}>
                {path.steps.map((st, i) => {
                  const txt = stepText(st);
                  const current = i === firstOpen;
                  return (
                    <PressableScale
                      key={st.id}
                      onPress={() => runStep(st.id)}
                      style={[styles.stepRow, { flexDirection: dir.row }, current && { backgroundColor: pal.soft }, st.done && { opacity: 0.5 }]}
                    >
                      {st.done ? (
                        <View style={[styles.stepIcon, { backgroundColor: pal.soft }]}>
                          <Ionicons name="checkmark" size={16} color={pal.accent} />
                        </View>
                      ) : (
                        <View style={[styles.stepIcon, { borderWidth: 2, borderColor: current ? pal.accent : pal.track }]}>
                          {current && <View style={[styles.stepDot, { backgroundColor: pal.accent }]} />}
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.stepTitle, { color: pal.ink, textAlign: dir.textAlign }, current && { fontWeight: "800" }, st.done && styles.strike]}
                          numberOfLines={1}
                        >
                          {txt.title}
                        </Text>
                        {!!txt.sub && !st.done && (
                          <Text style={[styles.small, { color: pal.dim, textAlign: dir.textAlign, marginTop: 2 }]} numberOfLines={1}>
                            {txt.sub}
                          </Text>
                        )}
                      </View>
                      {current && (
                        <View style={[styles.startPill, { backgroundColor: pal.accent }]}>
                          <Text style={[styles.startTxt, { color: pal.onAccent }]}>{t("path.start")}</Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </View>
            </FadeIn>
          )}

          {/* اقتراحات ذكية — حين لا يوجد كتاب حالي (مثل: إضافة أول كتاب) */}
          {!cont && (
            <FadeIn delay={70}>
              <View style={[styles.sectionHead, { flexDirection: dir.row }]}>
                <Text style={[styles.sectionTitle, { color: pal.ink }]}>{t("home.smart.title")}</Text>
              </View>
              <View style={[styles.card, cardStyle, { padding: 8, gap: 6 }]}>
                {actions.map((a) => {
                  const look = ACTION_LOOK[a.id];
                  const txt = actionText(a.id);
                  return (
                    <PressableScale key={a.id} onPress={() => runAction(a.id)} style={[styles.stepRow, { flexDirection: dir.row }]}>
                      <View style={[styles.actionIcon, { backgroundColor: look.color + "22" }]}>
                        <Ionicons name={look.icon} size={19} color={look.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, { color: pal.ink, textAlign: dir.textAlign, fontWeight: "800" }]} numberOfLines={1}>
                          {txt.title}
                        </Text>
                        {!!txt.sub && (
                          <Text style={[styles.small, { color: pal.dim, textAlign: dir.textAlign, marginTop: 2 }]} numberOfLines={1}>
                            {txt.sub}
                          </Text>
                        )}
                      </View>
                      <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
                    </PressableScale>
                  );
                })}
              </View>
            </FadeIn>
          )}

          {/* الأسبوع */}
          <FadeIn delay={140}>
            <PressableScale onPress={() => router.push("/activity")} style={[styles.card, cardStyle, { padding: 16, marginTop: 14 }]}>
              <View style={[styles.sectionHead, { flexDirection: dir.row, marginTop: 0 }]}>
                <Text style={[styles.sectionTitle, { color: pal.ink, fontSize: 15 }]}>{t("home.week.title")}</Text>
                <Text style={[styles.small, { color: pal.dim }]}>
                  {progress >= 1 ? t("home.today.done") : t("home.today.left", { left: goalLeft })}
                </Text>
              </View>
              <WeekBars days={week} dayLabels={dayLabels} accent={[pal.accent, pal.accent]} isRTL={dir.isRTL} height={54} />
            </PressableScale>
          </FadeIn>
        </View>
      </ScrollView>
      {coach.overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  heroInner: { flex: 1, paddingHorizontal: 20 },
  topBar: { alignItems: "center", gap: Spacing.md },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1 },
  streakNum: { fontSize: 13, fontWeight: "800" },
  headBlock: { marginTop: 10 },
  greet: { fontSize: 13.5, fontWeight: "600" },
  headline: { fontSize: 33, fontWeight: "900", lineHeight: 46 },
  sceneSub: { fontSize: 13, fontWeight: "600", lineHeight: 20 },

  body: { paddingHorizontal: 16 },
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  contRow: { alignItems: "center", gap: 12 },
  playBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  small: { fontSize: 11.5, fontWeight: "600" },
  contTitle: { fontSize: 17, fontWeight: "900" },
  progTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  progFill: { height: 5, borderRadius: 3 },
  hair: { height: 1, marginVertical: 14 },
  vHair: { width: 1, alignSelf: "stretch" },
  statsRow: { alignItems: "center" },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statNum: { fontSize: 21, fontWeight: "900" },
  statUnit: { fontSize: 12, fontWeight: "600" },
  statLbl: { fontSize: 11, fontWeight: "600" },
  examLine: { fontSize: 12, fontWeight: "600", marginTop: 12 },

  sectionHead: { alignItems: "baseline", justifyContent: "space-between", marginTop: 20, marginBottom: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  stepRow: { alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 18 },
  stepIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepTitle: { fontSize: 14.5, fontWeight: "600" },
  strike: { textDecorationLine: "line-through" },
  startPill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.pill },
  startTxt: { fontSize: 12.5, fontWeight: "800" },
  actionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
