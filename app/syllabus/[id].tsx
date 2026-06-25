// app/syllabus/[id].tsx
// المنهج الدراسي (Syllabus) لكتاب: وحدات بعناوين ومواضيع ومخرجات،
// تشيك ليست لمتابعة التقدّم، ونسبة إنجاز، وطباعة/مشاركة المنهج.
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../../components/brand/glass-card";
import { aiAssist } from "../../lib/ai";
import { DEFAULT_VOICE_ID, speakText, stopSpeaking } from "../../lib/voice";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../../constants/design";
import {
  generateMindmap,
  generateSyllabus,
  generateUnitQuiz,
  getSyllabus,
  getUnitSchedule,
  setUnitDone,
  type MindMap,
  type QuizQ,
  type Syllabus,
  type UnitSchedule,
} from "../../lib/syllabus";

const MM_COLORS = ["#7c5cff", "#4f8cff", "#22d3ee", "#2ecc71", "#f5a623", "#ff6b9d"];

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
function fmtISO(iso: string): string {
  const p = (iso || "").split("-");
  if (p.length < 3) return iso;
  return `${Number(p[2])} ${AR_MONTHS[Number(p[1]) - 1] ?? ""}`.trim();
}
function fmtRange(s: UnitSchedule): string {
  return s.startISO === s.endISO ? fmtISO(s.startISO) : `${fmtISO(s.startISO)} – ${fmtISO(s.endISO)}`;
}

export default function SyllabusScreen() {
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof id === "string" ? id : "";
  const bookTitle = typeof title === "string" ? title : "المنهج الدراسي";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syl, setSyl] = useState<Syllabus | null>(null);
  const [done, setDone] = useState<boolean[]>([]);
  const [sched, setSched] = useState<UnitSchedule[]>([]);
  const [err, setErr] = useState("");

  // كويز الوحدة
  const [quizUnit, setQuizUnit] = useState<number | null>(null); // الوحدة قيد الاختبار
  const [quizLoading, setQuizLoading] = useState(false);
  const [quiz, setQuiz] = useState<QuizQ[]>([]);
  const [qStep, setQStep] = useState(0);
  const [qPicked, setQPicked] = useState<number | null>(null);
  const [qScore, setQScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);

  // الخريطة الذهنية
  const [mmUnit, setMmUnit] = useState<number | null>(null);
  const [mmLoading, setMmLoading] = useState(false);
  const [mm, setMm] = useState<MindMap | null>(null);

  // الملخّص الصوتي
  const [sumUnit, setSumUnit] = useState<number | null>(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [sumText, setSumText] = useState("");
  const [sumPlaying, setSumPlaying] = useState(false);

  async function loadSchedule(unitCount: number) {
    try {
      setSched(await getUnitSchedule(bookId, unitCount));
    } catch {
      setSched([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await getSyllabus(pdfPath);
        if (r) {
          setSyl(r.data);
          setDone(r.done.length === r.data.units.length ? r.done : new Array(r.data.units.length).fill(false));
          await loadSchedule(r.data.units.length);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [pdfPath]);

  async function onGenerate() {
    setErr("");
    setBusy(true);
    try {
      const data = await generateSyllabus(pdfPath);
      setSyl(data);
      setDone(new Array(data.units.length).fill(false));
      await loadSchedule(data.units.length);
    } catch (e: any) {
      setErr(e?.message ?? "تعذّر إنشاء المنهج");
    } finally {
      setBusy(false);
    }
  }

  async function startMindmap(i: number) {
    if (!syl) return;
    const u = syl.units[i];
    setMmUnit(i);
    setMmLoading(true);
    setMm(null);
    try {
      const ctx = `وحدة: ${u.title}. المواضيع: ${u.topics.join("، ")}.${u.outcome ? ` ${u.outcome}` : ""}`;
      const map = await generateMindmap(ctx);
      if (!map) {
        setMmUnit(null);
        setErr("تعذّر إنشاء الخريطة الذهنية.");
      } else {
        setMm(map);
      }
    } catch {
      setMmUnit(null);
    } finally {
      setMmLoading(false);
    }
  }

  async function startSummary(i: number) {
    if (!syl) return;
    const u = syl.units[i];
    setSumUnit(i);
    setSumLoading(true);
    setSumText("");
    setSumPlaying(false);
    try {
      const ctx = `وحدة بعنوان «${u.title}». النقاط الرئيسية: ${u.topics.join("، ")}.${
        u.outcome ? ` الهدف: ${u.outcome}.` : ""
      } اشرح هذه النقاط بإيجاز في فقرة متصلة مناسبة للاستماع.`;
      const text = (await aiAssist("summarize", ctx)).trim();
      if (!text) {
        setSumUnit(null);
        setErr("تعذّر إنشاء الملخّص.");
        return;
      }
      setSumText(text);
      playSummary(text);
    } catch {
      setSumUnit(null);
    } finally {
      setSumLoading(false);
    }
  }

  function playSummary(text: string) {
    setSumPlaying(true);
    speakText(text, {
      voiceId: DEFAULT_VOICE_ID,
      onDone: () => setSumPlaying(false),
      onError: () => setSumPlaying(false),
    });
  }

  function toggleSummaryPlay() {
    if (sumPlaying) {
      stopSpeaking();
      setSumPlaying(false);
    } else if (sumText) {
      playSummary(sumText);
    }
  }

  function closeSummary() {
    stopSpeaking();
    setSumPlaying(false);
    setSumUnit(null);
  }

  async function startQuiz(i: number) {
    if (!syl) return;
    const u = syl.units[i];
    setQuizUnit(i);
    setQuizLoading(true);
    setQuiz([]);
    setQStep(0);
    setQPicked(null);
    setQScore(0);
    setQuizDone(false);
    try {
      const ctx = `الوحدة: ${u.title}\nالمواضيع: ${u.topics.join("، ")}\n${u.outcome ?? ""}`;
      const qs = await generateUnitQuiz(ctx);
      if (qs.length === 0) {
        setErr("تعذّر إنشاء الكويز، حاولي مرة أخرى.");
        setQuizUnit(null);
      } else {
        setQuiz(qs);
      }
    } catch {
      setQuizUnit(null);
    } finally {
      setQuizLoading(false);
    }
  }

  function pickAnswer(opt: number) {
    if (qPicked !== null) return;
    setQPicked(opt);
    if (opt === quiz[qStep].answer) setQScore((s) => s + 1);
  }

  function nextQuestion() {
    if (qStep + 1 >= quiz.length) {
      setQuizDone(true);
    } else {
      setQStep((s) => s + 1);
      setQPicked(null);
    }
  }

  function closeQuiz() {
    setQuizUnit(null);
    setQuiz([]);
  }

  async function toggle(i: number) {
    const next = [...done];
    next[i] = !next[i];
    setDone(next);
    try {
      await setUnitDone(pdfPath, next);
    } catch {}
  }

  const completed = done.filter(Boolean).length;
  const total = syl?.units.length ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  async function onPrint() {
    if (!syl) return;
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const units = syl.units
      .map(
        (u, i) => `
        <div class="unit">
          <h3>${i + 1}. ${esc(u.title)}</h3>
          ${sched[i] ? `<p class="when">📅 ذاكريها: ${esc(fmtRange(sched[i]))}</p>` : ""}
          ${u.topics.length ? `<ul>${u.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
          ${u.outcome ? `<p class="out">🎯 ${esc(u.outcome)}</p>` : ""}
        </div>`
      )
      .join("");
    const tips = syl.tips?.length
      ? `<div class="tips"><h2>نصائح دراسية</h2><ul>${syl.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`
      : "";
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
      * { font-family: -apple-system, 'SF Arabic', sans-serif; }
      body { padding: 28px; color: #14233a; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .sub { color: #6b7a90; margin: 0 0 18px; }
      .unit { border: 1px solid #dce3ee; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; page-break-inside: avoid; }
      h3 { font-size: 16px; margin: 0 0 6px; color: #5b3df5; }
      ul { margin: 6px 0; padding-inline-start: 20px; }
      li { margin: 3px 0; }
      .out { color: #0a7d52; font-size: 13px; margin: 6px 0 0; }
      .when { color: #0a6ed1; font-size: 12.5px; margin: 2px 0 6px; font-weight: 700; }
      .tips { margin-top: 18px; }
      .box { display:inline-block; width:14px; height:14px; border:1.5px solid #5b3df5; border-radius:4px; margin-inline-start:8px; vertical-align:middle; }
    </style></head><body>
      <h1>${esc(syl.title ?? bookTitle)}</h1>
      <p class="sub">منهج دراسي — ${total} وحدة · للطباعة والمتابعة ✅</p>
      ${units}
      ${tips}
    </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch {}
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* رأس */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            المنهج الدراسي
          </Text>
          {syl ? (
            <Pressable onPress={onPrint} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="print" size={20} color={Palette.text} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.primary} />
          </View>
        ) : !syl ? (
          <View style={styles.center}>
            <Ionicons name="sparkles" size={40} color={Palette.neonViolet} />
            <Text style={styles.emptyTitle}>أنشئي منهجًا دراسيًا لهذا الكتاب</Text>
            <Text style={styles.emptySub}>
              نقرأ أوّل صفحات الكتاب ونحوّلها إلى وحدات بعناوين ومواضيع ومخرجات تعلّم،
              مع تشيك ليست لمتابعة تقدّمك.
            </Text>
            {!!err && <Text style={styles.err}>{err}</Text>}
            <GradientButton
              title="إنشاء المنهج بالذكاء ✨"
              icon="sparkles"
              onPress={onGenerate}
              loading={busy}
              style={{ marginTop: Spacing.lg, alignSelf: "stretch" }}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* عنوان + تقدّم */}
            <GlassCard contentStyle={styles.progCard} glow={Palette.neonViolet}>
              <Text style={styles.bookTitle} numberOfLines={3}>
                {syl.title ?? bookTitle}
              </Text>
              <View style={styles.progRow}>
                <Text style={styles.progPct}>{pct}%</Text>
                <Text style={styles.progLabel}>
                  {completed} / {total} وحدة مكتملة
                </Text>
              </View>
              <View style={styles.progTrack}>
                <View style={[styles.progFill, { width: `${pct}%` }]} />
              </View>
              {sched.length === 0 && (
                <Text style={[styles.noPlanHint, { marginTop: 12 }]}>
                  💡 أنشئي خطة لهذا الكتاب (زر «حفظ + إنشاء خطة ذكية») لتظهر أيام مذاكرة كل وحدة هنا.
                </Text>
              )}
            </GlassCard>

            {/* الوحدات (تشيك ليست) */}
            {syl.units.map((u, i) => {
              const isDone = done[i];
              return (
                <Pressable key={i} onPress={() => toggle(i)} style={styles.unitWrap}>
                  <GlassCard contentStyle={styles.unitCard} glow={isDone ? Palette.neonCyan : undefined}>
                    <View style={styles.unitHead}>
                      <View style={[styles.check, isDone && styles.checkOn]}>
                        {isDone && <Ionicons name="checkmark" size={16} color="#0b1220" />}
                      </View>
                      <Text style={[styles.unitTitle, isDone && styles.unitTitleDone]}>
                        {i + 1}. {u.title}
                      </Text>
                    </View>
                    {sched[i] && (
                      <View style={styles.schedRow}>
                        <Ionicons name="calendar-outline" size={13} color={Palette.neonCyan} />
                        <Text style={styles.schedTxt}>
                          ذاكريها: {fmtRange(sched[i])}{"  ·  "}اليوم {sched[i].dayFrom}
                          {sched[i].dayTo !== sched[i].dayFrom ? `–${sched[i].dayTo}` : ""}
                        </Text>
                      </View>
                    )}
                    {u.topics.map((t, k) => (
                      <View key={k} style={styles.topicRow}>
                        <Text style={styles.topicDot}>•</Text>
                        <Text style={styles.topicTxt}>{t}</Text>
                      </View>
                    ))}
                    {!!u.outcome && (
                      <Text style={styles.outcome}>🎯 {u.outcome}</Text>
                    )}

                    <View style={styles.unitActions}>
                      <Pressable
                        onPress={() => startSummary(i)}
                        disabled={sumLoading}
                        style={[styles.quizBtn, styles.sumBtn]}
                      >
                        {sumLoading && sumUnit === i ? (
                          <ActivityIndicator size="small" color={Palette.neonCyan} />
                        ) : (
                          <Ionicons name="headset" size={15} color={Palette.neonCyan} />
                        )}
                        <Text style={[styles.quizBtnTxt, { color: Palette.neonCyan }]}>
                          {sumLoading && sumUnit === i ? "…" : "🎧 ملخّص صوتي"}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => startQuiz(i)}
                        disabled={quizLoading}
                        style={[styles.quizBtn, { flex: 1, marginTop: 0 }]}
                      >
                        {quizLoading && quizUnit === i ? (
                          <ActivityIndicator size="small" color={Palette.neonViolet} />
                        ) : (
                          <Ionicons name="help-circle" size={15} color={Palette.neonViolet} />
                        )}
                        <Text style={styles.quizBtnTxt}>
                          {quizLoading && quizUnit === i ? "…" : "🧠 اختبرني"}
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => startMindmap(i)}
                      disabled={mmLoading}
                      style={[styles.quizBtn, styles.mmBtn]}
                    >
                      {mmLoading && mmUnit === i ? (
                        <ActivityIndicator size="small" color="#a3e635" />
                      ) : (
                        <Ionicons name="git-network" size={15} color="#a3e635" />
                      )}
                      <Text style={[styles.quizBtnTxt, { color: "#bef264" }]}>
                        {mmLoading && mmUnit === i ? "جارٍ الرسم…" : "🗺️ خريطة ذهنية"}
                      </Text>
                    </Pressable>
                  </GlassCard>
                </Pressable>
              );
            })}

            {/* نصائح */}
            {!!syl.tips?.length && (
              <GlassCard contentStyle={styles.tipsCard} glow={Palette.neonCyan}>
                <Text style={styles.tipsTitle}>نصائح للدراسة 💡</Text>
                {syl.tips.map((t, i) => (
                  <View key={i} style={styles.topicRow}>
                    <Text style={styles.topicDot}>•</Text>
                    <Text style={styles.topicTxt}>{t}</Text>
                  </View>
                ))}
              </GlassCard>
            )}

            <GradientButton
              title="طباعة / مشاركة المنهج"
              icon="print"
              variant="ghost"
              onPress={onPrint}
              style={{ marginTop: Spacing.md }}
            />
            <View style={{ height: 24 }} />
          </ScrollView>
        )}

        {/* مودال الكويز */}
        <Modal
          visible={quizUnit !== null && quiz.length > 0}
          transparent
          animationType="slide"
          onRequestClose={closeQuiz}
        >
          <View style={styles.quizMask}>
            <View style={styles.quizSheet}>
              <View style={styles.quizHeader}>
                <Text style={styles.quizHeaderTxt}>
                  {quizDone ? "النتيجة" : `سؤال ${qStep + 1} / ${quiz.length}`}
                </Text>
                <Pressable onPress={closeQuiz} hitSlop={8}>
                  <Ionicons name="close" size={22} color={Palette.textMuted} />
                </Pressable>
              </View>

              {quizDone ? (
                <View style={styles.quizResult}>
                  <Text style={styles.quizScoreBig}>
                    {qScore} / {quiz.length}
                  </Text>
                  <Text style={styles.quizResultMsg}>
                    {qScore === quiz.length
                      ? "ممتازة! إتقان كامل 🌟"
                      : qScore >= Math.ceil(quiz.length / 2)
                      ? "أداء جيد، راجعي ما فاتك 👏"
                      : "تحتاج مراجعة هذه الوحدة 📚"}
                  </Text>
                  <GradientButton
                    title="تمام"
                    icon="checkmark"
                    onPress={closeQuiz}
                    style={{ alignSelf: "stretch", marginTop: Spacing.md }}
                  />
                </View>
              ) : quiz[qStep] ? (
                <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                  <Text style={styles.quizQ}>{quiz[qStep].q}</Text>
                  {quiz[qStep].options.map((opt, oi) => {
                    const isCorrect = oi === quiz[qStep].answer;
                    const picked = qPicked === oi;
                    const reveal = qPicked !== null;
                    return (
                      <Pressable
                        key={oi}
                        onPress={() => pickAnswer(oi)}
                        style={[
                          styles.quizOpt,
                          reveal && isCorrect && styles.quizOptCorrect,
                          reveal && picked && !isCorrect && styles.quizOptWrong,
                        ]}
                      >
                        <Text style={styles.quizOptTxt}>{opt}</Text>
                        {reveal && isCorrect ? (
                          <Ionicons name="checkmark-circle" size={18} color={Palette.success} />
                        ) : reveal && picked && !isCorrect ? (
                          <Ionicons name="close-circle" size={18} color={Palette.danger} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {qPicked !== null && (
                    <GradientButton
                      title={qStep + 1 >= quiz.length ? "عرض النتيجة" : "السؤال التالي"}
                      icon="arrow-back"
                      onPress={nextQuestion}
                      style={{ marginTop: Spacing.md }}
                    />
                  )}
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>

        {/* مودال الملخّص الصوتي */}
        <Modal
          visible={sumUnit !== null && !!sumText}
          transparent
          animationType="slide"
          onRequestClose={closeSummary}
        >
          <View style={styles.quizMask}>
            <View style={styles.quizSheet}>
              <View style={styles.quizHeader}>
                <Text style={styles.quizHeaderTxt} numberOfLines={1}>
                  🎧 ملخّص: {sumUnit !== null ? syl?.units[sumUnit]?.title : ""}
                </Text>
                <Pressable onPress={closeSummary} hitSlop={8}>
                  <Ionicons name="close" size={22} color={Palette.textMuted} />
                </Pressable>
              </View>

              <Pressable onPress={toggleSummaryPlay} style={styles.sumPlay}>
                <Ionicons name={sumPlaying ? "pause" : "play"} size={20} color="#0b1220" />
                <Text style={styles.sumPlayTxt}>{sumPlaying ? "إيقاف مؤقّت" : "استماع"}</Text>
              </Pressable>

              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.sumText}>{sumText}</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* مودال الخريطة الذهنية */}
        <Modal
          visible={mmUnit !== null && !!mm}
          transparent
          animationType="slide"
          onRequestClose={() => setMmUnit(null)}
        >
          <View style={styles.quizMask}>
            <View style={styles.quizSheet}>
              <View style={styles.quizHeader}>
                <Text style={styles.quizHeaderTxt}>🗺️ الخريطة الذهنية</Text>
                <Pressable onPress={() => setMmUnit(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={Palette.textMuted} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                {/* العقدة المركزية */}
                <View style={styles.mmCenter}>
                  <Text style={styles.mmCenterTxt}>{mm?.center}</Text>
                </View>
                <View style={styles.mmStem} />

                {/* الفروع */}
                {mm?.branches.map((b, bi) => {
                  const c = MM_COLORS[bi % MM_COLORS.length];
                  return (
                    <View key={bi} style={[styles.mmBranch2, { borderColor: c + "66" }]}>
                      <View style={[styles.mmBranchHead, { backgroundColor: c + "22" }]}>
                        <View style={[styles.mmDot, { backgroundColor: c }]} />
                        <Text style={[styles.mmBranchLabel, { color: c }]}>{b.label}</Text>
                      </View>
                      {b.points.map((p, pi) => (
                        <View key={pi} style={styles.mmPointRow}>
                          <Text style={[styles.mmPointDash, { color: c }]}>—</Text>
                          <Text style={styles.mmPointTxt}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xl, gap: 8 },
  emptyTitle: { color: Palette.text, fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 10 },
  emptySub: { color: Palette.textMuted, fontSize: 14, lineHeight: 24, textAlign: "center" },
  err: { color: Palette.warn, fontSize: 13, textAlign: "center", marginTop: 8, fontWeight: "700" },

  scroll: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: 12 },
  progCard: { padding: Spacing.lg },
  bookTitle: { color: Palette.text, fontSize: 17, fontWeight: "900", textAlign: "center", lineHeight: 28 },
  progRow: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "center", gap: 10, marginTop: 12 },
  progPct: { color: Palette.neonCyan, fontSize: 28, fontWeight: "900" },
  progLabel: { color: Palette.textMuted, fontSize: 13, fontWeight: "700" },
  progTrack: { height: 10, borderRadius: 5, backgroundColor: Palette.surface, marginTop: 10, overflow: "hidden" },
  progFill: { height: "100%", borderRadius: 5, backgroundColor: Palette.neonCyan },

  unitWrap: {},
  unitCard: { padding: Spacing.md },
  unitHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  unitTitle: { flex: 1, color: Palette.text, fontSize: 16, fontWeight: "800", lineHeight: 26 },
  unitTitleDone: { color: Palette.textDim, textDecorationLine: "line-through" },
  schedRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingStart: 36,
  },
  schedTxt: { color: Palette.neonCyan, fontSize: 12.5, fontWeight: "800" },
  noPlanHint: {
    color: Palette.textDim,
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  topicRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, marginTop: 6, paddingStart: 36 },
  topicDot: { color: Palette.neonViolet, fontSize: 15, lineHeight: 22 },
  topicTxt: { flex: 1, color: Palette.textMuted, fontSize: 14, lineHeight: 22 },
  outcome: { color: Palette.success ?? Palette.neonCyan, fontSize: 13, fontWeight: "700", marginTop: 8, paddingStart: 36, lineHeight: 21 },

  tipsCard: { padding: Spacing.md },
  tipsTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", marginBottom: 4 },

  quizBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(124,92,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.4)",
  },
  quizBtnTxt: { color: "#cdbdff", fontSize: 13, fontWeight: "800" },
  unitActions: { flexDirection: "row-reverse", gap: 8, marginTop: 12 },
  sumBtn: {
    marginTop: 0,
    backgroundColor: "rgba(34,211,238,0.12)",
    borderColor: "rgba(34,211,238,0.4)",
  },
  sumPlay: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonCyan,
    marginBottom: Spacing.md,
  },
  sumPlayTxt: { color: "#0b1220", fontSize: 15, fontWeight: "900" },
  sumText: { color: Palette.textMuted, fontSize: 15, lineHeight: 28, textAlign: "right" },
  mmBtn: { marginTop: 8, backgroundColor: "rgba(163,230,53,0.10)", borderColor: "rgba(163,230,53,0.4)" },
  mmCenter: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonViolet,
    maxWidth: "90%",
  },
  mmCenterTxt: { color: "#fff", fontSize: 16, fontWeight: "900", textAlign: "center" },
  mmStem: { alignSelf: "center", width: 2, height: 18, backgroundColor: Palette.glassBorder },
  mmBranch2: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    marginBottom: 10,
    overflow: "hidden",
  },
  mmBranchHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14 },
  mmDot: { width: 10, height: 10, borderRadius: 5 },
  mmBranchLabel: { flex: 1, fontSize: 15, fontWeight: "900", textAlign: "right" },
  mmPointRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 5 },
  mmPointDash: { fontSize: 14, fontWeight: "900", lineHeight: 22 },
  mmPointTxt: { flex: 1, color: Palette.textMuted, fontSize: 14, lineHeight: 22, textAlign: "right" },

  quizMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  quizSheet: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    padding: Spacing.lg,
    maxHeight: "82%",
  },
  quizHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  quizHeaderTxt: { color: Palette.text, fontSize: 15, fontWeight: "900" },
  quizQ: { color: Palette.text, fontSize: 18, fontWeight: "900", textAlign: "right", lineHeight: 30, marginBottom: Spacing.md },
  quizOpt: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    marginBottom: 10,
  },
  quizOptCorrect: { backgroundColor: "rgba(46,204,113,0.18)", borderColor: Palette.success },
  quizOptWrong: { backgroundColor: "rgba(231,76,60,0.16)", borderColor: Palette.danger },
  quizOptTxt: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: "700", textAlign: "right" },
  quizResult: { alignItems: "center", paddingVertical: Spacing.lg, gap: 8 },
  quizScoreBig: { color: Palette.neonCyan, fontSize: 44, fontWeight: "900" },
  quizResultMsg: { color: Palette.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" },
});
