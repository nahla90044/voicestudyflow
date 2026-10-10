// app/(tabs)/activity.tsx
// «التقدّم» (العالم الحيّ): «سماؤك» — وحدات الكتاب كوكبات نجوم تضيء بقدر تقدّم كل وحدة
// (لوحة ليلية ثابتة في كل المشاهد لأنها «السماء»)، ثم المؤشرات (الجاهزية وتغيّرها، دقة
// الاختبارات، السلسلة، الصفحات)، ووقت المذاكرة للأسبوع/الشهر بأعمدة، وجاهزية كل كتاب،
// وهدف اليوم، وخريطة النشاط لآخر ٣ أشهر — كلها بألوان المشهد الحالي.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { AppDrawer } from "../../components/brand/app-drawer";
import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { FadeIn } from "../../components/brand/fade-in";
import { PressableScale } from "../../components/brand/motion";
import { ProgressRing } from "../../components/brand/progress-ring";
import { SceneBanner, SceneCard, SceneScreen } from "../../components/brand/scene-screen";
import { Radius } from "../../constants/design";
import { myBooks } from "../../lib/bookQA";
import { getDailyGoal, setDailyGoal } from "../../lib/goals";
import { useDir, useI18n } from "../../lib/i18n";
import { periodSeries, splitMinutes } from "../../lib/progressCore";
import { getBookReadiness, type BookReadiness } from "../../lib/readiness";
import { useScene, type ScenePalette } from "../../lib/scene";
import { getStats, type Stats } from "../../lib/stats";

const GOAL_OPTIONS = [10, 20, 30, 45, 60];
type Period = "week" | "month";

// ألوان «السماء» ثابتة في كل المشاهد
const SKY = {
  top: "#070A1F",
  bottom: "#1A2257",
  star: "#FFE7A8",
  glow: "#F6D58A",
  ink: "#F5F1FF",
  dim: "#A9A5CC",
};

function todayISOLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [stats, setStats] = useState<Stats | null>(null);
  const [goal, setGoal] = useState(20);
  const [period, setPeriod] = useState<Period>("week");
  const [ready, setReady] = useState<BookReadiness[]>([]);
  const [skyBookId, setSkyBookId] = useState<string | null>(null);

  // جولة الإرشاد: السماء، واختيار الكتاب، والفترة، وجاهزية كل كتاب، وهدف اليوم
  const coach = useCoachTour("activity_v1", [
    { id: "sky", title: t("coach.act.sky.title"), body: t("coach.act.sky.body"), shape: "rect" },
    { id: "books", title: t("coach.act.books.title"), body: t("coach.act.books.body"), shape: "rect" },
    { id: "period", title: t("coach.act.period.title"), body: t("coach.act.period.body"), shape: "rect" },
    { id: "row", title: t("coach.act.row.title"), body: t("coach.act.row.body"), shape: "rect" },
    { id: "goal", title: t("coach.act.goal.title"), body: t("coach.act.goal.body"), shape: "rect" },
  ], { delay: 2200, ready: stats !== null });

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

  // كتاب السماء: المختار، أو أقرب كتاب لموعد اختباره
  const skyBook = ready.find((r) => r.bookId === skyBookId) ?? ready[0] ?? null;

  function cycleGoal() {
    const next = GOAL_OPTIONS[(GOAL_OPTIONS.indexOf(goal) + 1) % GOAL_OPTIONS.length] ?? 20;
    setGoal(next);
    setDailyGoal(next);
  }

  const cardShadow = { shadowColor: pal.dark ? "#000" : "#3C5028" };

  return (
    <SceneScreen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SceneBanner
          title={t("nav.progress")}
          subtitle={t("activity.header.subtitle")}
          height={170}
          left={<AppDrawer tint={pal.dark ? "#FFFFFF" : pal.ink} light={!pal.dark} />}
          right={<CoachHelpButton onPress={coach.replay} />}
        />

        <View style={styles.body}>
          {/* «سماؤك»: كوكبات الوحدات */}
          <FadeIn delay={0}>
            <View {...coach.bind("sky")}>
              <SkyPanel book={skyBook} pagesFallback={series.pages} />
            </View>
          </FadeIn>

          {/* اختيار كتاب السماء */}
          {ready.length > 1 && (
            <View {...coach.bind("books")}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.chips, { flexDirection: dir.row }]}
              >
                {ready.map((r) => {
                  const on = r.bookId === skyBook?.bookId;
                  return (
                    <Pressable
                      key={r.bookId}
                      onPress={() => setSkyBookId(r.bookId)}
                      style={[
                        styles.chip,
                        { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder },
                      ]}
                    >
                      <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]} numberOfLines={1}>
                        {r.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* المؤشرات */}
          <FadeIn delay={70}>
            <View style={[styles.kpis, { flexDirection: dir.row }]}>
              <Kpi
                value={skyBook ? `${skyBook.score}%` : "—"}
                label={t("ready.title")}
                icon="trending-up"
                sub={
                  skyBook
                    ? skyBook.delta != null && skyBook.delta > 0
                      ? t("ready.up", { n: skyBook.delta })
                      : skyBook.delta != null && skyBook.delta < 0
                        ? t("ready.down", { n: -skyBook.delta })
                        : t("ready.flat")
                    : undefined
                }
                subUp={!!skyBook && skyBook.delta != null && skyBook.delta > 0}
              />
              <Kpi value={accuracy === null ? "—" : `${accuracy}%`} label={t("progress.accuracy")} icon="checkmark-done" />
            </View>
            <View style={[styles.kpis, { flexDirection: dir.row, marginTop: 10 }]}>
              <Kpi value={String(stats?.streak ?? 0)} label={t("progress.streak")} icon="flame" />
              <Kpi value={String(series.pages)} label={t("progress.pages")} icon="document-text" />
            </View>
          </FadeIn>

          {/* الفترة */}
          <View {...coach.bind("period")} style={[styles.seg, { flexDirection: dir.row, backgroundColor: pal.track }]}>
            {(["week", "month"] as Period[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.segItem, period === p && [styles.segOn, { backgroundColor: pal.card }, cardShadow]]}
              >
                <Text style={[styles.segTxt, { color: period === p ? pal.ink : pal.dim }]}>{t(`progress.period.${p}`)}</Text>
              </Pressable>
            ))}
          </View>

          {/* وقت المذاكرة + الأعمدة */}
          <FadeIn delay={120}>
            <SceneCard style={styles.tile}>
              <View style={[styles.heroHead, { flexDirection: dir.row }]}>
                <View>
                  <Text style={[styles.cap, { color: pal.dim, textAlign: dir.textAlign }]}>{t("progress.studyTime")}</Text>
                  <Text style={[styles.heroNum, { color: pal.ink, textAlign: dir.textAlign }]}>
                    {h > 0 ? t("progress.hm", { h, m }) : t("progress.m", { m })}
                  </Text>
                </View>
                {series.prevMinutes > 0 || series.minutes > 0 ? (
                  <View style={[styles.deltaChip, { backgroundColor: delta < 0 ? pal.track : pal.soft }]}>
                    <Text style={[styles.deltaTxt, { color: delta < 0 ? pal.dim : pal.accent }]}>
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
                      <Text style={[styles.barVal, { color: pal.accent }]}>{b.minutes > 0 && b.current ? b.minutes : ""}</Text>
                      <View
                        style={[
                          styles.bar,
                          { height: hgt, backgroundColor: b.current ? pal.accent : pal.dark ? "rgba(255,255,255,0.14)" : pal.accent + "33" },
                        ]}
                      />
                      <Text style={[styles.barLbl, { color: b.current ? pal.ink : pal.dim }]}>
                        {period === "week" ? dayLabels[b.dayIndex] ?? "" : t("progress.weekN", { n: i + 1 })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </SceneCard>
          </FadeIn>

          {/* جاهزية الاختبارات */}
          {ready.length > 0 && (
            <FadeIn delay={170}>
              <SceneCard style={[styles.tile, { gap: 14 }]}>
                <Text style={[styles.tileTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("progress.readiness")}</Text>
                {ready.map((r, index) => {
                  const fill = r.score >= 40 ? pal.accent : pal.dark ? pal.dim : "#C9862E";
                  return (
                    <PressableScale
                      key={r.bookId}
                      {...(index === 0 ? coach.bind("row") : null)}
                      onPress={() => router.push({ pathname: "/book/[id]", params: { id: r.bookId } })}
                      style={styles.rRow}
                    >
                      <View style={[styles.rHead, { flexDirection: dir.row }]}>
                        <Text style={[styles.rTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text style={[styles.rPct, { color: pal.ink }]}>{r.score}%</Text>
                      </View>
                      <View style={[styles.rTrack, { backgroundColor: pal.track }]}>
                        <View
                          style={[
                            styles.rFill,
                            { width: `${Math.max(3, r.score)}%`, backgroundColor: fill, opacity: r.score >= 70 ? 1 : 0.8 },
                            dir.isRTL ? { alignSelf: "flex-end" } : null,
                          ]}
                        />
                      </View>
                      <Text style={[styles.rSub, { color: pal.dim, textAlign: dir.textAlign }]}>
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
              </SceneCard>
            </FadeIn>
          )}

          {/* هدف اليوم */}
          <FadeIn delay={220}>
            <SceneCard style={[styles.tile, styles.goalRow, { flexDirection: dir.row }]}>
              <ProgressRing progress={goalFrac} colors={[pal.accent, pal.accent]} trackColor={pal.track} size={74}>
                <Text style={[styles.goalNum, { color: pal.ink }]}>{Math.round(goalFrac * 100)}%</Text>
              </ProgressRing>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.tileTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("progress.goal")}</Text>
                <Text style={[styles.cap, { color: pal.dim, textAlign: dir.textAlign }]}>
                  {goalFrac >= 1 ? t("activity.goal.done") : t("progress.goalSub", { done: todayMin, goal })}
                </Text>
              </View>
              <PressableScale {...coach.bind("goal")} onPress={cycleGoal} style={[styles.goalChip, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
                <Text style={[styles.goalChipTxt, { color: pal.accent }]}>{t("activity.goal.chip", { goal })}</Text>
              </PressableScale>
            </SceneCard>
          </FadeIn>

          {/* خريطة النشاط */}
          <FadeIn delay={270}>
            <SceneCard style={[styles.tile, { gap: 14 }]}>
              <Text style={[styles.tileTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("progress.heatmap")}</Text>
              <SceneHeatmap days={stats?.days ?? {}} pal={pal} />
            </SceneCard>
          </FadeIn>
        </View>
      </ScrollView>
      {coach.overlay}
    </SceneScreen>
  );
}

function Kpi({
  value,
  label,
  icon,
  sub,
  subUp,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sub?: string;
  subUp?: boolean;
}) {
  const dir = useDir();
  const { pal } = useScene();
  return (
    <SceneCard style={styles.kpi} padded={false}>
      <View style={[styles.kpiIcon, { backgroundColor: pal.soft, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
        <Ionicons name={icon} size={15} color={pal.accent} />
      </View>
      <Text style={[styles.kpiVal, { color: pal.ink, textAlign: dir.textAlign }]}>{value}</Text>
      <Text style={[styles.cap, { color: pal.dim, textAlign: dir.textAlign }]}>{label}</Text>
      {!!sub && (
        <Text style={[styles.kpiSub, { color: subUp ? pal.accent : pal.dim, textAlign: dir.textAlign }]} numberOfLines={2}>
          {sub}
        </Text>
      )}
    </SceneCard>
  );
}

// ───────────── «سماؤك»: كوكبات الوحدات ─────────────

type Pt = [number, number];
// أشكال كوكبات (نقاط ٠..١ تُرسم بخطوط متتالية) — ٤ إلى ٦ نجوم
const SHAPES: Pt[][] = [
  [[0.12, 0.7], [0.32, 0.38], [0.55, 0.52], [0.78, 0.22], [0.9, 0.62]],
  [[0.15, 0.3], [0.38, 0.62], [0.6, 0.35], [0.85, 0.7]],
  [[0.1, 0.55], [0.28, 0.25], [0.5, 0.4], [0.62, 0.75], [0.82, 0.5], [0.92, 0.18]],
  [[0.2, 0.2], [0.45, 0.3], [0.7, 0.2], [0.6, 0.6], [0.3, 0.72]],
  [[0.1, 0.4], [0.35, 0.68], [0.58, 0.28], [0.88, 0.45]],
  [[0.14, 0.24], [0.3, 0.55], [0.5, 0.75], [0.7, 0.5], [0.86, 0.26], [0.5, 0.2]],
];

type Constellation = { key: string; label: string; stars: number; lit: number; shape: Pt[] };

/** تقدّم الوحدة: دقة اختبارها إن اختُبرت، وإلا نصيبها من الصفحات المقروءة */
function unitProgress(book: BookReadiness, i: number): number {
  const acc = book.accuracy[i];
  if (acc != null) return Math.max(0, Math.min(1, acc));
  return Math.max(0, Math.min(1, book.readFraction * book.unitCount - i));
}

function SkyPanel({ book, pagesFallback }: { book: BookReadiness | null; pagesFallback: number }) {
  const { t } = useI18n();
  const dir = useDir();
  const [w, setW] = useState(0);

  const groups: Constellation[] = useMemo(() => {
    if (book && book.unitCount > 0) {
      return Array.from({ length: book.unitCount }, (_, i) => {
        const shape = SHAPES[i % SHAPES.length]!;
        const lit = Math.round(unitProgress(book, i) * shape.length);
        const status = lit >= shape.length ? t("book.unit.done") : `${lit}/${shape.length}`;
        return { key: `u${i}`, label: `${t("glossary.unitN", { n: i + 1 })} · ${status}`, stars: shape.length, lit, shape };
      });
    }
    // لا منهج: كوكبة واحدة تضيء بالصفحات المقروءة
    const shape = SHAPES[2]!.concat([[0.7, 0.88]] as Pt[]).concat([[0.4, 0.9]] as Pt[]);
    const lit = book
      ? Math.round(Math.max(0, Math.min(1, book.readFraction)) * shape.length)
      : Math.min(shape.length, Math.max(0, pagesFallback));
    const label = book ? `${Math.round(book.readFraction * 100)}%` : `${pagesFallback} ${t("progress.pages")}`;
    return [{ key: "one", label, stars: shape.length, lit, shape }];
  }, [book, pagesFallback, t]);

  const cols = groups.length === 1 ? 1 : groups.length > 8 ? 3 : 2;
  const gap = 10;
  const cellW = w > 0 ? (w - gap * (cols - 1)) / cols : 0;
  const cellH = groups.length === 1 ? 150 : cols === 3 ? 74 : 92;

  // نجوم الخلفية الصغيرة (ثابتة لا عشوائية في كل رسم)
  const dust = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 46; i++) out.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.1, o: 0.25 + rnd() * 0.55 });
    return out;
  }, []);

  return (
    <View style={styles.sky}>
      <LinearGradient colors={[SKY.top, SKY.bottom]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          {dust.map((d, i) => (
            <Circle key={i} cx={`${d.x * 100}%`} cy={`${d.y * 100}%`} r={d.r} fill="#FFFFFF" opacity={d.o} />
          ))}
        </Svg>
      </View>

      <View style={{ padding: 18, gap: 4 }}>
        <View style={[{ flexDirection: dir.row, alignItems: "center", gap: 8 }]}>
          <Ionicons name="sparkles" size={14} color={SKY.glow} />
          <Text style={[styles.skyCap, { textAlign: dir.textAlign }]}>{t("scene.pref.sky")}</Text>
          <View style={{ flex: 1 }} />
          {book ? <Text style={styles.skyScore}>{book.score}%</Text> : null}
        </View>
        {book ? (
          <Text style={[styles.skyTitle, { textAlign: dir.textAlign }]} numberOfLines={1}>
            {book.title}
          </Text>
        ) : null}

        <View
          style={[styles.skyGrid, { flexDirection: dir.row, gap }]}
          onLayout={(e) => {
            const nw = e.nativeEvent.layout.width;
            if (Math.abs(nw - w) > 1) setW(nw);
          }}
        >
          {cellW > 0 &&
            groups.map((g) => (
              <View key={g.key} style={{ width: cellW, alignItems: "center" }}>
                <ConstellationSvg g={g} width={cellW} height={cellH} />
                <Text style={styles.skyLbl} numberOfLines={1}>
                  {g.label}
                </Text>
              </View>
            ))}
        </View>
      </View>
    </View>
  );
}

function ConstellationSvg({ g, width, height }: { g: Constellation; width: number; height: number }) {
  const pad = 12;
  const pts = g.shape.map(([x, y]) => [pad + x * (width - pad * 2), pad + y * (height - pad * 2)] as Pt);
  const isLit = (i: number) => i < g.lit;
  return (
    <Svg width={width} height={height}>
      {pts.slice(1).map((p, i) => {
        const a = pts[i]!;
        const on = isLit(i) && isLit(i + 1);
        return (
          <Line
            key={`l${i}`}
            x1={a[0]}
            y1={a[1]}
            x2={p[0]}
            y2={p[1]}
            stroke={on ? SKY.glow : "#FFFFFF"}
            strokeOpacity={on ? 0.55 : 0.14}
            strokeWidth={on ? 1.2 : 1}
          />
        );
      })}
      {pts.map((p, i) =>
        isLit(i) ? (
          <React.Fragment key={`s${i}`}>
            <Circle cx={p[0]} cy={p[1]} r={8} fill={SKY.glow} opacity={0.14} />
            <Circle cx={p[0]} cy={p[1]} r={4.8} fill={SKY.glow} opacity={0.3} />
            <Circle cx={p[0]} cy={p[1]} r={2.7} fill={SKY.star} />
          </React.Fragment>
        ) : (
          <Circle key={`s${i}`} cx={p[0]} cy={p[1]} r={2.6} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1} />
        )
      )}
    </Svg>
  );
}

// ───────────── خريطة النشاط بألوان المشهد ─────────────

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function SceneHeatmap({ days, pal, weeks = 13 }: { days: Record<string, { m: number }>; pal: ScenePalette; weeks?: number }) {
  const { t } = useI18n();
  const dir = useDir();
  const level = (min: number) => {
    if (min <= 0) return pal.track;
    if (min < 10) return pal.accent + "4D";
    if (min < 20) return pal.accent + "80";
    if (min < 40) return pal.accent + "BF";
    return pal.accent;
  };
  const today = new Date();
  const todayISO = toLocalISO(today);
  const start = new Date(today);
  start.setDate(start.getDate() - today.getDay() - (weeks - 1) * 7);
  const cols: { iso: string; min: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: { iso: string; min: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const iso = toLocalISO(date);
      col.push({ iso, min: days?.[iso]?.m ?? 0, future: iso > todayISO });
    }
    cols.push(col);
  }
  return (
    <View>
      <Text style={[styles.hmCaption, { color: pal.dim, textAlign: dir.textAlign }]}>{t("heatmap.caption")}</Text>
      <View style={styles.hmGrid}>
        {cols.map((col, ci) => (
          <View key={ci} style={styles.hmCol}>
            {col.map((c) => (
              <View key={c.iso} style={[styles.hmCell, { backgroundColor: c.future ? "transparent" : level(c.min) }]} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.hmLegend}>
        <Text style={[styles.hmLegendTxt, { color: pal.dim }]}>{t("heatmap.less")}</Text>
        {[0, 9, 19, 39, 50].map((mm, i) => (
          <View key={i} style={[styles.hmCell, { backgroundColor: level(mm) }]} />
        ))}
        <Text style={[styles.hmLegendTxt, { color: pal.dim }]}>{t("heatmap.more")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  body: { paddingHorizontal: 20, gap: 12, marginTop: -6 },
  seg: { padding: 4, borderRadius: 16, gap: 4 },
  segItem: { flex: 1, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segOn: { shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  segTxt: { fontSize: 13.5, fontWeight: "700" },
  tile: { padding: 18, borderRadius: 26 },
  tileTitle: { fontSize: 15, fontWeight: "800" },
  cap: { fontSize: 12, fontWeight: "600" },
  heroHead: { alignItems: "flex-end", justifyContent: "space-between" },
  heroNum: { fontSize: 32, fontWeight: "900", marginTop: 2 },
  deltaChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.pill },
  deltaTxt: { fontSize: 12, fontWeight: "800" },
  bars: { alignItems: "flex-end", height: 140, gap: 6, marginTop: 16 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bar: { width: "62%", maxWidth: 26, borderRadius: 8 },
  barVal: { fontSize: 11, fontWeight: "800", height: 14 },
  barLbl: { fontSize: 11, fontWeight: "600" },
  kpis: { gap: 10 },
  kpi: { flex: 1, padding: 14, gap: 3, borderRadius: 24 },
  kpiIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiVal: { fontSize: 26, fontWeight: "900" },
  kpiSub: { fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 2 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: 200 },
  chipTxt: { fontSize: 12.5, fontWeight: "700" },
  sky: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: SKY.top,
  },
  skyCap: { color: SKY.glow, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  skyScore: { color: SKY.ink, fontSize: 22, fontWeight: "900" },
  skyTitle: { color: SKY.ink, fontSize: 17, fontWeight: "900" },
  skyGrid: { flexWrap: "wrap", marginTop: 8, rowGap: 6 },
  skyLbl: { color: SKY.dim, fontSize: 11, fontWeight: "700", marginTop: -2 },
  rRow: { gap: 7 },
  rHead: { alignItems: "center", gap: 10 },
  rTitle: { flex: 1, fontSize: 13.5, fontWeight: "700" },
  rPct: { fontSize: 14, fontWeight: "900" },
  rTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  rFill: { height: 8, borderRadius: 4 },
  rSub: { fontSize: 11.5 },
  goalRow: { alignItems: "center", gap: 14 },
  goalNum: { fontSize: 15, fontWeight: "900" },
  goalChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  goalChipTxt: { fontWeight: "800", fontSize: 12.5 },
  hmCaption: { fontSize: 12.5, lineHeight: 21, marginBottom: 12 },
  hmGrid: { flexDirection: "row", justifyContent: "space-between" },
  hmCol: { gap: 3 },
  hmCell: { width: 13, height: 13, borderRadius: 3 },
  hmLegend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, justifyContent: "flex-end" },
  hmLegendTxt: { fontSize: 11, fontWeight: "700" },
});
