// app/unit-quiz.tsx
// صفحة مستقلة لاختبار الوحدة (بدل النافذة) — أسئلة متدرّجة الصعوبة، شارة صعوبة،
// نقاط تقدّم، ونتيجة تُظهر مستوى الطالب. تُولَّد مرة واحدة وتُخزَّن.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GradientButton } from "../components/brand/gradient-button";
import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { generateUnitQuiz, getSyllabus, type QuizQ } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";

const LEVEL_COLOR: Record<"easy" | "medium" | "hard", string> = {
  easy: "#2ecc71",
  medium: "#f5a623",
  hard: "#ff6b9d",
};

export default function UnitQuizScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pdf_path, unit, title } = useLocalSearchParams<{ pdf_path?: string; unit?: string; title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const unitIdx = Number(unit ?? 0) || 0;
  const unitTitle = typeof title === "string" ? title : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [quiz, setQuiz] = useState<QuizQ[]>([]);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const cached = await getUnitContent<QuizQ[]>(pdfPath, unitIdx, "quiz");
        if (cached && cached.length) {
          if (on) setQuiz(cached);
          return;
        }
        const r = await getSyllabus(pdfPath);
        const u = r?.data.units[unitIdx];
        if (!u) {
          if (on) setErr(t("syllabus.err.quiz"));
          return;
        }
        const ctx = `الوحدة: ${u.title}\nالمواضيع: ${u.topics.join("، ")}\n${u.outcome ?? ""}`;
        const qs = await generateUnitQuiz(ctx);
        if (qs.length === 0) {
          if (on) setErr(t("syllabus.err.quiz"));
          return;
        }
        setUnitContent(pdfPath, unitIdx, "quiz", qs);
        if (on) setQuiz(qs);
      } catch {
        if (on) setErr(t("syllabus.err.quiz"));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [pdfPath, unitIdx, t]);

  function pick(opt: number) {
    if (picked !== null) return;
    setPicked(opt);
    if (opt === quiz[step].answer) setScore((s) => s + 1);
  }

  function next() {
    if (step + 1 >= quiz.length) {
      setDone(true);
    } else {
      setStep((s) => s + 1);
      setPicked(null);
    }
  }

  const q = quiz[step];

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            🧠 {t("syllabus.action.quiz").replace(/^🧠\s*/, "")}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.neonViolet} />
            <Text style={styles.dim}>{t("syllabus.action.quiz")}…</Text>
          </View>
        ) : err ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={Palette.warn} />
            <Text style={styles.dim}>{err}</Text>
          </View>
        ) : done ? (
          (() => {
            const pct = Math.round((score / Math.max(1, quiz.length)) * 100);
            const lvl = pct >= 85 ? "advanced" : pct >= 55 ? "intermediate" : "beginner";
            const lvlColor = lvl === "advanced" ? Palette.success : lvl === "intermediate" ? Palette.neonCyan : Palette.warn;
            return (
              <View style={styles.center}>
                <Text style={styles.scoreBig}>{score} / {quiz.length}</Text>
                <View style={[styles.levelPill, { borderColor: lvlColor, backgroundColor: lvlColor + "1f" }]}>
                  <Text style={[styles.levelPillTxt, { color: lvlColor }]}>
                    {t("syllabus.quiz.yourLevel")}: {t(`syllabus.quiz.levelResult.${lvl}`)}
                  </Text>
                </View>
                <Text style={styles.resultMsg}>
                  {score === quiz.length
                    ? t("syllabus.quiz.perfect")
                    : score >= Math.ceil(quiz.length / 2)
                    ? t("syllabus.quiz.good")
                    : t("syllabus.quiz.review")}
                </Text>
                <GradientButton
                  title={t("common.done")}
                  icon="checkmark"
                  onPress={() => router.back()}
                  style={{ alignSelf: "stretch", marginTop: Spacing.lg }}
                />
              </View>
            );
          })()
        ) : q ? (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {!!unitTitle && <Text style={[styles.unitTitle, { textAlign: dir.textAlign }]} numberOfLines={2}>{unitTitle}</Text>}

            {/* شارة الصعوبة + نقاط التقدّم */}
            <View style={[styles.diffRow, { flexDirection: dir.row }]}>
              <View style={[styles.diffBadge, { borderColor: LEVEL_COLOR[q.level], backgroundColor: LEVEL_COLOR[q.level] + "22" }]}>
                <Text style={[styles.diffBadgeTxt, { color: LEVEL_COLOR[q.level] }]}>{t(`syllabus.quiz.level.${q.level}`)}</Text>
              </View>
              <View style={[styles.dotsRow, { flexDirection: dir.row }]}>
                {quiz.map((qq, di) => (
                  <View key={di} style={[styles.qDot, { backgroundColor: di <= step ? LEVEL_COLOR[qq.level] : Palette.glassBorder }]} />
                ))}
              </View>
            </View>

            <Text style={styles.counter}>{t("syllabus.quiz.question", { step: step + 1, total: quiz.length })}</Text>
            <Text style={[styles.question, { textAlign: dir.textAlign }]}>{q.q}</Text>

            {q.options.map((opt, oi) => {
              const isCorrect = oi === q.answer;
              const isPicked = picked === oi;
              const reveal = picked !== null;
              return (
                <Pressable
                  key={oi}
                  onPress={() => pick(oi)}
                  style={[
                    styles.opt,
                    { flexDirection: dir.row },
                    reveal && isCorrect && styles.optCorrect,
                    reveal && isPicked && !isCorrect && styles.optWrong,
                  ]}
                >
                  <Text style={[styles.optTxt, { textAlign: dir.textAlign }]}>{opt}</Text>
                  {reveal && isCorrect ? (
                    <Ionicons name="checkmark-circle" size={20} color={Palette.success} />
                  ) : reveal && isPicked && !isCorrect ? (
                    <Ionicons name="close-circle" size={20} color={Palette.danger} />
                  ) : null}
                </Pressable>
              );
            })}

            {picked !== null && (
              <GradientButton
                title={step + 1 >= quiz.length ? t("syllabus.quiz.showResult") : t("syllabus.quiz.nextQuestion")}
                icon="arrow-back"
                onPress={next}
                style={{ marginTop: Spacing.md }}
              />
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { flex: 1, textAlign: "center", color: Palette.text, fontSize: 18, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 10 },
  dim: { color: Palette.textDim, fontSize: 14, textAlign: "center", lineHeight: 22 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 12 },
  unitTitle: { color: Palette.textMuted, fontSize: 14, fontWeight: "800", lineHeight: 22 },

  diffRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  diffBadge: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1.5 },
  diffBadgeTxt: { fontSize: 13, fontWeight: "900" },
  dotsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  qDot: { width: 8, height: 8, borderRadius: 4 },

  counter: { color: Palette.textDim, fontSize: 13, fontWeight: "800" },
  question: { color: Palette.text, fontSize: 19, fontWeight: "900", lineHeight: 31, marginBottom: 4 },
  opt: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  optCorrect: { backgroundColor: "rgba(46,204,113,0.18)", borderColor: Palette.success },
  optWrong: { backgroundColor: "rgba(231,76,60,0.16)", borderColor: Palette.danger },
  optTxt: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: "700" },

  scoreBig: { color: Palette.neonCyan, fontSize: 52, fontWeight: "900" },
  levelPill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1.5 },
  levelPillTxt: { fontSize: 15, fontWeight: "900" },
  resultMsg: { color: Palette.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" },
});
