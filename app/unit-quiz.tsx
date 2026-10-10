// app/unit-quiz.tsx
// اختبار الجاهزية (تصميم 2.0): أسئلة الوحدة أو الصفحة أو «مراجعة الأخطاء».
// كل إجابة تُسجَّل (lib/readiness) فتتحرّك الجاهزية أمام المستخدم مباشرة، والسؤال
// الخاطئ يعود بعد يومين. الأسئلة تُولَّد مرة واحدة لكل وحدة وتُخزَّن.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { CoachHelpButton, useCoachTour } from "../components/brand/coach-mark";
import { PressableScale } from "../components/brand/motion";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { setLastPage } from "../lib/readerPrefs";
import { getBookReadiness, getDueMistakes, markQuizDone, recordAnswer } from "../lib/readiness";
import { computeReadiness } from "../lib/readinessCore";
import { addSavedItem } from "../lib/savedStudy";
import { generateUnitQuiz, getSyllabus, type QuizQ } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
import { useScene, type ScenePalette } from "../lib/scene";

/** ألوان دلالية (صح/خطأ/تنبيه/مستوى) مقروءة على الحديقة الفاتحة وعلى المشاهد الداكنة */
function tones(pal: ScenePalette) {
  const d = pal.dark;
  return {
    good: d ? { bg: "rgba(110,215,160,0.14)", border: "#6CD6A0", fg: "#86E3B4" } : { bg: "#E5F3E9", border: "#3E9A5C", fg: "#25713F" },
    bad: d ? { bg: "rgba(255,125,135,0.14)", border: "#FF8C96", fg: "#FFA0A8" } : { bg: "#FCEBEC", border: "#D9636B", fg: "#B03A43" },
    warm: d ? { bg: "rgba(246,184,128,0.12)", border: "#F6B880", fg: "#F6C092" } : { bg: "#FBF0E3", border: "#D08A45", fg: "#9A5A1C" },
    hard: d ? { bg: "rgba(242,160,200,0.14)", fg: "#F2A9CE" } : { bg: "#F8E9F1", fg: "#A2416F" },
  };
}

type Item = QuizQ & { unit: number | null; page: number | null };

export default function UnitQuizScreen() {
  const { t, lang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const tone = tones(pal);
  const { pdf_path, unit, page, title, book_title, mode } = useLocalSearchParams<{
    pdf_path?: string;
    unit?: string;
    page?: string;
    title?: string;
    book_title?: string;
    mode?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const mistakesMode = mode === "mistakes";
  const unitIdx = Number(unit ?? 0) || 0;
  const pageNum = Number(page);
  const pageMode = !mistakesMode && Number.isFinite(pageNum) && pageNum > 0; // من القارئ (صفحة)
  const srcId = pageMode ? pageNum : unitIdx;
  const kind = pageMode ? "pagequiz" : "quiz";
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [quiz, setQuiz] = useState<Item[]>([]);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  // الجاهزية: قبل الاختبار، والآن، وتغيّر آخر إجابة
  const [ready0, setReady0] = useState<number | null>(null);
  const [ready, setReady] = useState<number | null>(null);
  const [lastGain, setLastGain] = useState(0);
  const [weak, setWeak] = useState<{ unit: number | null; untested: boolean }>({ unit: null, untested: true });
  const [bookId, setBookId] = useState("");
  const ctxRef = useRef({ unitCount: 0, readFraction: 0 });

  // جولة الإرشاد: عند ظهور أول سؤال، ثم جولة قصيرة بعد أول إجابة (الروابط وزر التالي)
  const coach = useCoachTour(
    "unitquiz_v1",
    [
      { id: "bars", title: t("coach.quiz.bars.title"), body: t("coach.quiz.bars.body"), shape: "rect" },
      { id: "ready", title: t("coach.quiz.ready.title"), body: t("coach.quiz.ready.body"), shape: "rect" },
      { id: "opt", title: t("coach.quiz.opt.title"), body: t("coach.quiz.opt.body"), shape: "rect" },
    ],
    { ready: !loading && !err && quiz.length > 0 && picked === null && !done }
  );
  const answerCoach = useCoachTour(
    "unitquiz_answer_v1",
    [
      { id: "links", title: t("coach.quiz.links.title"), body: t("coach.quiz.links.body"), shape: "rect" },
      { id: "next", title: t("coach.quiz.next.title"), body: t("coach.quiz.next.body"), shape: "rect" },
    ],
    { delay: 900, ready: picked !== null && !done }
  );

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        // الجاهزية الحالية (لعدّاد الرأس) — لا تعطّل الاختبار إن فشلت
        getBookReadiness(pdfPath).then((r) => {
          if (!on || !r) return;
          ctxRef.current = { unitCount: r.unitCount, readFraction: r.readFraction };
          setReady0(r.score);
          setReady(r.score);
          setWeak({ unit: r.weakUnit, untested: r.weakUntested });
          setBookId(r.bookId);
        });

        if (mistakesMode) {
          const due = await getDueMistakes(pdfPath);
          if (on) setQuiz(due.slice(0, 10).map((s) => ({ ...s.item, unit: s.unit, page: s.page })));
          if (!due.length && on) setErr(t("quiz2.noMistakes"));
          return;
        }

        const where = { unit: pageMode ? null : unitIdx, page: pageMode ? pageNum : null };
        const cached = await getUnitContent<QuizQ[]>(pdfPath, srcId, kind);
        if (cached && cached.length) {
          if (on) setQuiz(cached.map((q) => ({ ...q, ...where })));
          return;
        }
        let ctx = "";
        if (pageMode) {
          const res = await extractPdfPageText(pdfPath, pageNum);
          ctx = (res.text || "").slice(0, 4000);
        } else {
          const r = await getSyllabus(pdfPath);
          const u = r?.data.units[unitIdx];
          if (u) ctx = `الوحدة: ${u.title}\nالمواضيع: ${u.topics.join("، ")}\n${u.outcome ?? ""}`;
        }
        if (!ctx.trim()) {
          if (on) setErr(t("syllabus.err.quiz"));
          return;
        }
        const qs = await generateUnitQuiz(ctx);
        if (qs.length === 0) {
          if (on) setErr(t("syllabus.err.quiz"));
          return;
        }
        setUnitContent(pdfPath, srcId, kind, qs);
        if (on) setQuiz(qs.map((q) => ({ ...q, ...where })));
      } catch {
        if (on) setErr(t("syllabus.err.quiz"));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [pdfPath, srcId, kind, pageMode, pageNum, unitIdx, mistakesMode, t]);

  // سجّل العنصر في المحفوظات (يظهر في تبويب البطاقات → اختبارات) متى توفّرت الأسئلة
  useEffect(() => {
    if (!quiz.length || !pdfPath || mistakesMode) return;
    addSavedItem({
      key: `quiz|${pdfPath}|${pageMode ? "p" + pageNum : "u" + unitIdx}`,
      kind: "quiz",
      pdfPath,
      bookTitle,
      label: unitTitle || (pageMode ? String(pageNum) : ""),
      page: pageMode ? pageNum : undefined,
      unit: pageMode ? undefined : unitIdx,
      savedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.length]);

  async function pick(opt: number) {
    if (picked !== null) return;
    const q = quiz[step];
    const correct = opt === q.answer;
    setPicked(opt);
    setResults((r) => [...r, correct]);
    const all = await recordAnswer(pdfPath, q, { unit: q.unit, page: q.page }, correct);
    const now = computeReadiness({ questions: all, ...ctxRef.current }).score;
    setLastGain(ready !== null ? now - ready : 0);
    setReady(now);
  }

  function next() {
    if (step + 1 >= quiz.length) {
      setDone(true);
      void markQuizDone(pdfPath);
    } else {
      setStep((s) => s + 1);
      setPicked(null);
      setLastGain(0);
    }
  }

  function askAbout(q: Item) {
    if (!bookId) return;
    router.push({ pathname: "/ask/[id]", params: { id: bookId, q: t("quiz2.askPrompt", { q: q.q }) } });
  }

  async function openPage(p: number) {
    if (!bookId) return;
    await setLastPage(bookId, p);
    router.push({ pathname: "/reader/[id]", params: { id: bookId, title: bookTitle, pdf_path: pdfPath } });
  }

  const q = quiz[step];
  const letters = lang === "ar" ? ["أ", "ب", "ج", "د", "هـ", "و"] : ["A", "B", "C", "D", "E", "F"];
  const total = quiz.length;
  const headLabel = mistakesMode
    ? t("quiz2.headMistakes", { step: step + 1, total })
    : pageMode
      ? t("quiz2.headPage", { page: pageNum, step: step + 1, total })
      : t("quiz2.headUnit", { unit: unitIdx + 1, step: step + 1, total });
  const isWeakUnit = !mistakesMode && !pageMode && weak.unit === unitIdx && !weak.untested;

  const levelTone = q ? (q.level === "easy" ? tone.good : q.level === "medium" ? tone.warm : tone.hard) : tone.good;
  const backIcon = dir.isRTL ? "chevron-forward" : "chevron-back";

  return (
    <SceneScreen>
      {/* الرأس: رجوع · موضع السؤال · عدّاد الجاهزية */}
      <SceneBanner
        title={total ? headLabel : unitTitle}
        subtitle={total && unitTitle && unitTitle !== headLabel ? unitTitle : undefined}
        height={140}
        left={
          <Pressable onPress={() => router.back()} hitSlop={6} accessibilityLabel={t("common.close")}>
            <SceneIconButton>
              <Ionicons name={backIcon} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8 }}>
            <CoachHelpButton onPress={picked !== null ? answerCoach.replay : coach.replay} />
            {ready !== null ? (
              <View {...coach.bind("ready")} style={[styles.readyChip, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
                <Text style={[styles.readyNum, { color: pal.accent }]}>
                  {ready}%{lastGain > 0 ? " ▲" : ""}
                </Text>
                <Text style={[styles.readyCap, { color: pal.dim }]}>{t("quiz2.readiness")}</Text>
              </View>
            ) : null}
          </View>
        }
      />

      {/* شرطات التقدّم: صح/خطأ بعد الإجابة، والسؤال الحالي باللون المميّز */}
      {total > 0 && !loading && !err && (
        <View {...coach.bind("bars")} style={[styles.bars, { flexDirection: dir.row }]}>
          {quiz.map((_, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor:
                    i < results.length
                      ? results[i]
                        ? tone.good.border
                        : tone.warm.border
                      : i === step && !done
                        ? pal.accent
                        : pal.track,
                },
              ]}
            />
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("quiz2.preparing")}</Text>
          <Text style={[styles.dim, { color: pal.dim, fontSize: 12.5, opacity: 0.8 }]}>{t("quiz2.preparingHint")}</Text>
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Ionicons
            name={mistakesMode ? "checkmark-done-circle-outline" : "alert-circle-outline"}
            size={42}
            color={mistakesMode ? tone.good.fg : tone.warm.fg}
          />
          <Text style={[styles.dim, { color: pal.dim }]}>{err}</Text>
        </View>
      ) : done ? (
        <Result
          score={results.filter(Boolean).length}
          total={total}
          ready0={ready0}
          ready={ready}
          wrong={results.filter((r) => !r).length}
        />
      ) : q ? (
        <>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <SceneCard style={styles.qCard}>
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                <View style={[styles.chip, { backgroundColor: levelTone.bg }]}>
                  <Text style={[styles.chipTxt, { color: levelTone.fg }]}>{t(`syllabus.quiz.level.${q.level}`)}</Text>
                </View>
                {isWeakUnit && (
                  <View style={[styles.chip, { backgroundColor: pal.soft }]}>
                    <Text style={[styles.chipSoftTxt, { color: pal.accent }]}>{t("quiz2.weakSpot")}</Text>
                  </View>
                )}
                {mistakesMode && (
                  <View style={[styles.chip, { backgroundColor: pal.soft }]}>
                    <Text style={[styles.chipSoftTxt, { color: pal.accent }]}>{t("quiz2.pastMistake")}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.question, { color: pal.ink, textAlign: dir.textAlign }]}>{q.q}</Text>
            </SceneCard>

            {q.options.map((opt, oi) => {
              const reveal = picked !== null;
              const isCorrect = oi === q.answer;
              const isPicked = picked === oi;
              const good = reveal && isCorrect;
              const bad = reveal && isPicked && !isCorrect;
              const sel = isPicked && !good && !bad;
              return (
                <Pressable
                  key={oi}
                  {...(oi === 0 ? coach.bind("opt") : null)}
                  onPress={() => pick(oi)}
                  style={[
                    styles.opt,
                    { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder },
                    sel && { backgroundColor: pal.soft, borderColor: pal.accent },
                    good && { backgroundColor: tone.good.bg, borderColor: tone.good.border },
                    bad && { backgroundColor: tone.bad.bg, borderColor: tone.bad.border },
                  ]}
                >
                  <View
                    style={[
                      styles.letter,
                      { backgroundColor: pal.soft },
                      good && { backgroundColor: tone.good.border },
                      bad && { backgroundColor: tone.bad.border },
                    ]}
                  >
                    {good || bad ? (
                      <Ionicons name={good ? "checkmark" : "close"} size={17} color={pal.dark ? pal.bg : "#FFFFFF"} />
                    ) : (
                      <Text style={[styles.letterTxt, { color: pal.accent }]}>{letters[oi] ?? oi + 1}</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.optTxt,
                      { color: pal.ink, textAlign: dir.textAlign },
                      good && { color: tone.good.fg, fontWeight: "700" },
                      bad && { color: tone.bad.fg },
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              );
            })}

            {picked !== null && (
              <View
                style={[
                  styles.feedback,
                  picked === q.answer
                    ? { backgroundColor: tone.good.bg, borderColor: tone.good.border + "55" }
                    : { backgroundColor: tone.warm.bg, borderColor: tone.warm.border + "55" },
                ]}
              >
                <Text style={[styles.fbTitle, { textAlign: dir.textAlign, color: picked === q.answer ? tone.good.fg : tone.warm.fg }]}>
                  {picked === q.answer
                    ? lastGain > 0
                      ? t("quiz2.rightUp", { n: lastGain })
                      : t("quiz2.right")
                    : t("quiz2.wrong", { answer: q.options[q.answer] ?? "" })}
                </Text>
                {picked !== q.answer && (
                  <Text style={[styles.fbBody, { color: pal.dim, textAlign: dir.textAlign }]}>{t("quiz2.comesBack")}</Text>
                )}
                <View {...answerCoach.bind("links")} style={[styles.fbLinks, { flexDirection: dir.row }]}>
                  {q.page ? (
                    <Pressable onPress={() => openPage(q.page as number)} hitSlop={6}>
                      <Text style={[styles.fbLink, { color: pal.accent }]}>{t("quiz2.openPage", { page: q.page })}</Text>
                    </Pressable>
                  ) : null}
                  {bookId ? (
                    <Pressable onPress={() => askAbout(q)} hitSlop={6}>
                      <Text style={[styles.fbLink, { color: pal.accent }]}>{t("quiz2.askAbout")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )}
            <View style={{ height: 96 }} />
          </ScrollView>

          {picked !== null && (
            <View style={styles.bottom}>
              <PressableScale {...answerCoach.bind("next")} onPress={next} style={[styles.nextBtn, { backgroundColor: pal.accent, shadowColor: pal.dark ? "#000" : "#3C5028" }]}>
                <Text style={[styles.nextTxt, { color: pal.onAccent }]}>
                  {step + 1 >= total ? t("syllabus.quiz.showResult") : t("syllabus.quiz.nextQuestion")}
                </Text>
              </PressableScale>
            </View>
          )}
        </>
      ) : null}
      {coach.overlay}
      {answerCoach.overlay}
    </SceneScreen>
  );
}

/** حلقة النتيجة الكبيرة باللون المميّز فوق مسار المشهد */
function ScoreRing({ pct, size, children }: { pct: number; size: number; children: React.ReactNode }) {
  const { pal } = useScene();
  const sw = 12;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={pal.track} strokeWidth={sw} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={pal.accent}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** شاشة النتيجة: الدرجة، والجاهزية قبل/بعد، وما الذي سيعود للمراجعة */
function Result({ score, total, ready0, ready, wrong }: { score: number; total: number; ready0: number | null; ready: number | null; wrong: number }) {
  const { t } = useI18n();
  const { pal } = useScene();
  const tone = tones(pal);
  const pct = Math.round((score / Math.max(1, total)) * 100);
  const lvl = pct >= 85 ? "advanced" : pct >= 55 ? "intermediate" : "beginner";
  const lvlTone = lvl === "advanced" ? tone.good : lvl === "intermediate" ? { bg: pal.soft, border: pal.accent, fg: pal.accent } : tone.warm;
  const gain = ready0 !== null && ready !== null ? ready - ready0 : 0;
  return (
    <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
      <SceneCard style={styles.resultCard}>
        <ScoreRing pct={pct} size={190}>
          <Text style={[styles.scoreBig, { color: pal.ink }]}>
            {score} / {total}
          </Text>
          <Text style={[styles.scorePct, { color: pal.accent }]}>{pct}%</Text>
        </ScoreRing>
        <View style={[styles.levelPill, { borderColor: lvlTone.border, backgroundColor: lvlTone.bg }]}>
          <Text style={[styles.levelPillTxt, { color: lvlTone.fg }]}>
            {t("syllabus.quiz.yourLevel")}: {t(`syllabus.quiz.levelResult.${lvl}`)}
          </Text>
        </View>
        {ready !== null && (
          <View style={[styles.resultReady, { backgroundColor: pal.soft }]}>
            <Text style={[styles.resultReadyNum, { color: pal.accent }]}>{ready}%</Text>
            <Text style={[styles.resultReadyCap, { color: pal.dim }]}>
              {gain > 0 ? t("quiz2.resultUp", { n: gain }) : gain < 0 ? t("quiz2.resultDown", { n: -gain }) : t("quiz2.resultSame")}
            </Text>
          </View>
        )}
        <Text style={[styles.resultMsg, { color: pal.ink }]}>
          {score === total ? t("syllabus.quiz.perfect") : score >= Math.ceil(total / 2) ? t("syllabus.quiz.good") : t("syllabus.quiz.review")}
        </Text>
        {wrong > 0 && <Text style={[styles.dim, { color: pal.dim }]}>{t("quiz2.wrongBack", { n: wrong })}</Text>}
      </SceneCard>
      <PressableScale onPress={() => router.back()} style={[styles.nextBtn, { backgroundColor: pal.accent, marginTop: Spacing.lg }]}>
        <Text style={[styles.nextTxt, { color: pal.onAccent }]}>{t("common.done")}</Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bars: { gap: 4, paddingHorizontal: 20, marginTop: 2, marginBottom: 4 },
  bar: { flex: 1, height: 5, borderRadius: 3 },
  readyChip: {
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  readyNum: { fontSize: 16, fontWeight: "900" },
  readyCap: { fontSize: 10, fontWeight: "700" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 12 },
  dim: { fontSize: 14, textAlign: "center", lineHeight: 22, fontWeight: "600" },
  scroll: { paddingHorizontal: 18, paddingTop: 14, gap: 10 },

  qCard: { gap: 10, marginBottom: 6, borderRadius: 24 },
  chips: { gap: 6, flexWrap: "wrap" },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill },
  chipTxt: { fontSize: 11.5, fontWeight: "800" },
  chipSoftTxt: { fontSize: 11.5, fontWeight: "700" },
  question: { fontSize: 20, fontWeight: "900", lineHeight: 34 },

  opt: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  letter: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  letterTxt: { fontSize: 14, fontWeight: "900" },
  optTxt: { flex: 1, fontSize: 15, lineHeight: 23, fontWeight: "600" },

  feedback: { padding: 14, borderRadius: 22, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  fbTitle: { fontSize: 15, fontWeight: "800", lineHeight: 23 },
  fbBody: { fontSize: 13.5, lineHeight: 22 },
  fbLinks: { gap: 16, marginTop: 2 },
  fbLink: { fontSize: 13, fontWeight: "800" },

  bottom: { position: "absolute", left: 18, right: 18, bottom: 30 },
  nextBtn: {
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  nextTxt: { fontSize: 16, fontWeight: "900" },

  resultScroll: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 40 },
  resultCard: { alignItems: "center", gap: 14, paddingVertical: 26 },
  scoreBig: { fontSize: 40, fontWeight: "900" },
  scorePct: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  levelPill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1.5 },
  levelPillTxt: { fontSize: 15, fontWeight: "800" },
  resultReady: { alignItems: "center", alignSelf: "stretch", paddingVertical: 12, borderRadius: 18 },
  resultReadyNum: { fontSize: 28, fontWeight: "900" },
  resultReadyCap: { fontSize: 13, fontWeight: "700", marginTop: 2, textAlign: "center" },
  resultMsg: { fontSize: 16, fontWeight: "900", textAlign: "center" },
});
