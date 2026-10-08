// app/unit-quiz.tsx
// اختبار الجاهزية (تصميم 2.0): أسئلة الوحدة أو الصفحة أو «مراجعة الأخطاء».
// كل إجابة تُسجَّل (lib/readiness) فتتحرّك الجاهزية أمام المستخدم مباشرة، والسؤال
// الخاطئ يعود بعد يومين. الأسئلة تُولَّد مرة واحدة لكل وحدة وتُخزَّن.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PressableScale } from "../components/brand/motion";
import { Palette, Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { setLastPage } from "../lib/readerPrefs";
import { getBookReadiness, getDueMistakes, markQuizDone, recordAnswer } from "../lib/readiness";
import { computeReadiness } from "../lib/readinessCore";
import { addSavedItem } from "../lib/savedStudy";
import { generateUnitQuiz, getSyllabus, type QuizQ } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";

const LEVEL_COLOR: Record<"easy" | "medium" | "hard", string> = {
  easy: "#6CF3C5",
  medium: "#FFB38A",
  hard: "#F79ACB",
};
const GOOD = "#6CF3C5";
const BAD = "#FF6B81";
const CUR = "#B9AFFF";

type Item = QuizQ & { unit: number | null; page: number | null };

export default function UnitQuizScreen() {
  const { t, lang } = useI18n();
  const dir = useDir();
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

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* الرأس: إغلاق · موضع السؤال وشريط النتائج · عدّاد الجاهزية */}
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <PressableScale onPress={() => router.back()} style={styles.ghost}>
            <Ionicons name="close" size={20} color={Palette.text} accessibilityLabel={t("common.close")} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headLabel, { textAlign: dir.textAlign }]} numberOfLines={1}>
              {total ? headLabel : unitTitle}
            </Text>
            {total > 0 && (
              <View style={[styles.bars, { flexDirection: dir.row }]}>
                {quiz.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bar,
                      {
                        backgroundColor:
                          i < results.length ? (results[i] ? GOOD : "#FFB38A") : i === step && !done ? CUR : "rgba(255,255,255,0.1)",
                      },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
          {ready !== null && (
            <View style={styles.readyChip}>
              <Text style={styles.readyNum}>
                {ready}%{lastGain > 0 ? " ▲" : ""}
              </Text>
              <Text style={styles.readyCap}>{t("quiz2.readiness")}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.neonViolet} />
            <Text style={styles.dim}>{t("quiz2.preparing")}</Text>
          </View>
        ) : err ? (
          <View style={styles.center}>
            <Ionicons name={mistakesMode ? "checkmark-done-circle-outline" : "alert-circle-outline"} size={42} color={mistakesMode ? GOOD : Palette.warn} />
            <Text style={styles.dim}>{err}</Text>
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
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                <View style={[styles.chip, { backgroundColor: LEVEL_COLOR[q.level] + "24" }]}>
                  <Text style={[styles.chipTxt, { color: LEVEL_COLOR[q.level] }]}>{t(`syllabus.quiz.level.${q.level}`)}</Text>
                </View>
                {isWeakUnit && (
                  <View style={styles.chipSoft}>
                    <Text style={styles.chipSoftTxt}>{t("quiz2.weakSpot")}</Text>
                  </View>
                )}
                {mistakesMode && (
                  <View style={styles.chipSoft}>
                    <Text style={styles.chipSoftTxt}>{t("quiz2.pastMistake")}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.question, { textAlign: dir.textAlign }]}>{q.q}</Text>

              {q.options.map((opt, oi) => {
                const reveal = picked !== null;
                const isCorrect = oi === q.answer;
                const isPicked = picked === oi;
                const good = reveal && isCorrect;
                const bad = reveal && isPicked && !isCorrect;
                return (
                  <Pressable
                    key={oi}
                    onPress={() => pick(oi)}
                    style={[
                      styles.opt,
                      { flexDirection: dir.row },
                      good && { backgroundColor: "rgba(108,243,197,0.10)", borderColor: GOOD },
                      bad && { backgroundColor: "rgba(255,107,129,0.10)", borderColor: BAD },
                    ]}
                  >
                    <View
                      style={[
                        styles.letter,
                        good && { backgroundColor: "rgba(108,243,197,0.35)" },
                        bad && { backgroundColor: "rgba(255,107,129,0.35)" },
                      ]}
                    >
                      <Text style={styles.letterTxt}>{letters[oi] ?? oi + 1}</Text>
                    </View>
                    <Text style={[styles.optTxt, { textAlign: dir.textAlign }]}>{opt}</Text>
                  </Pressable>
                );
              })}

              {picked !== null && (
                <View
                  style={[
                    styles.feedback,
                    { backgroundColor: picked === q.answer ? "rgba(108,243,197,0.08)" : "rgba(255,179,138,0.08)" },
                  ]}
                >
                  <Text style={[styles.fbTitle, { textAlign: dir.textAlign, color: picked === q.answer ? GOOD : "#FFB38A" }]}>
                    {picked === q.answer
                      ? lastGain > 0
                        ? t("quiz2.rightUp", { n: lastGain })
                        : t("quiz2.right")
                      : t("quiz2.wrong", { answer: q.options[q.answer] ?? "" })}
                  </Text>
                  {picked !== q.answer && (
                    <Text style={[styles.fbBody, { textAlign: dir.textAlign }]}>{t("quiz2.comesBack")}</Text>
                  )}
                  <View style={[styles.fbLinks, { flexDirection: dir.row }]}>
                    {q.page ? (
                      <Pressable onPress={() => openPage(q.page as number)} hitSlop={6}>
                        <Text style={styles.fbLink}>{t("quiz2.openPage", { page: q.page })}</Text>
                      </Pressable>
                    ) : null}
                    {bookId ? (
                      <Pressable onPress={() => askAbout(q)} hitSlop={6}>
                        <Text style={styles.fbLink}>{t("quiz2.askAbout")}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )}
              <View style={{ height: 96 }} />
            </ScrollView>

            {picked !== null && (
              <View style={styles.bottom}>
                <PressableScale onPress={next} style={styles.nextBtn}>
                  <Text style={styles.nextTxt}>
                    {step + 1 >= total ? t("syllabus.quiz.showResult") : t("syllabus.quiz.nextQuestion")}
                  </Text>
                </PressableScale>
              </View>
            )}
          </>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/** شاشة النتيجة: الدرجة، والجاهزية قبل/بعد، وما الذي سيعود للمراجعة */
function Result({ score, total, ready0, ready, wrong }: { score: number; total: number; ready0: number | null; ready: number | null; wrong: number }) {
  const { t } = useI18n();
  const pct = Math.round((score / Math.max(1, total)) * 100);
  const lvl = pct >= 85 ? "advanced" : pct >= 55 ? "intermediate" : "beginner";
  const lvlColor = lvl === "advanced" ? GOOD : lvl === "intermediate" ? Palette.neonCyan : "#FFB38A";
  const gain = ready0 !== null && ready !== null ? ready - ready0 : 0;
  return (
    <View style={styles.center}>
      <Text style={styles.scoreBig}>
        {score} / {total}
      </Text>
      <View style={[styles.levelPill, { borderColor: lvlColor, backgroundColor: lvlColor + "1f" }]}>
        <Text style={[styles.levelPillTxt, { color: lvlColor }]}>
          {t("syllabus.quiz.yourLevel")}: {t(`syllabus.quiz.levelResult.${lvl}`)}
        </Text>
      </View>
      {ready !== null && (
        <View style={styles.resultReady}>
          <Text style={styles.resultReadyNum}>{ready}%</Text>
          <Text style={styles.resultReadyCap}>
            {gain > 0 ? t("quiz2.resultUp", { n: gain }) : gain < 0 ? t("quiz2.resultDown", { n: -gain }) : t("quiz2.resultSame")}
          </Text>
        </View>
      )}
      <Text style={styles.resultMsg}>
        {score === total ? t("syllabus.quiz.perfect") : score >= Math.ceil(total / 2) ? t("syllabus.quiz.good") : t("syllabus.quiz.review")}
      </Text>
      {wrong > 0 && <Text style={styles.dim}>{t("quiz2.wrongBack", { n: wrong })}</Text>}
      <PressableScale onPress={() => router.back()} style={[styles.nextBtn, { alignSelf: "stretch", marginTop: Spacing.lg }]}>
        <Text style={styles.nextTxt}>{t("common.done")}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  header: { alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 6 },
  ghost: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headLabel: { color: "#8E95AB", fontSize: 12 },
  bars: { gap: 4, marginTop: 6 },
  bar: { flex: 1, height: 5, borderRadius: 3 },
  readyChip: {
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(124,108,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.3)",
  },
  readyNum: { color: "#D9D3FF", fontSize: 17, fontWeight: "800" },
  readyCap: { color: "#8E95AB", fontSize: 10 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 12 },
  dim: { color: Palette.textDim, fontSize: 14, textAlign: "center", lineHeight: 22 },
  scroll: { paddingHorizontal: 18, paddingTop: 22, gap: 12 },

  chips: { gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill },
  chipTxt: { fontSize: 11.5, fontWeight: "700" },
  chipSoft: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.06)" },
  chipSoftTxt: { color: "#C4C9D8", fontSize: 11.5, fontWeight: "600" },
  question: { color: Palette.text, fontSize: 20, fontWeight: "700", lineHeight: 34, marginBottom: 2 },

  opt: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#10121B",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.07)",
  },
  letter: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  letterTxt: { color: Palette.text, fontSize: 14, fontWeight: "700" },
  optTxt: { flex: 1, color: Palette.text, fontSize: 15, lineHeight: 23 },

  feedback: { padding: 14, borderRadius: 20, gap: 6 },
  fbTitle: { fontSize: 15, fontWeight: "700", lineHeight: 23 },
  fbBody: { color: "#C4C9D8", fontSize: 13.5, lineHeight: 22 },
  fbLinks: { gap: 16, marginTop: 2 },
  fbLink: { color: "#B9AFFF", fontSize: 13, fontWeight: "700" },

  bottom: { position: "absolute", left: 18, right: 18, bottom: 30 },
  nextBtn: { height: 56, borderRadius: 18, backgroundColor: "#F3F4F8", alignItems: "center", justifyContent: "center" },
  nextTxt: { color: "#07080D", fontSize: 16, fontWeight: "800" },

  scoreBig: { color: Palette.neonCyan, fontSize: 52, fontWeight: "900" },
  levelPill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1.5 },
  levelPillTxt: { fontSize: 15, fontWeight: "800" },
  resultReady: { alignItems: "center", marginTop: 4 },
  resultReadyNum: { color: "#D9D3FF", fontSize: 30, fontWeight: "800" },
  resultReadyCap: { color: Palette.textMuted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  resultMsg: { color: Palette.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" },
});
