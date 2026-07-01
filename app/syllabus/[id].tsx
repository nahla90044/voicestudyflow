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
import { BuzanMindMap } from "../../components/brand/mindmap";
import { aiAssist } from "../../lib/ai";
import { getUnitContent, setUnitContent } from "../../lib/unitContent";
import { DEFAULT_VOICE_ID, speakText, stopSpeaking } from "../../lib/voice";
import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
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

// ألوان درجات صعوبة أسئلة الاختبار (سهل → صعب)
const LEVEL_COLOR: Record<"easy" | "medium" | "hard", string> = {
  easy: "#2ecc71",
  medium: "#f5a623",
  hard: "#ff6b9d",
};

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
  const { t } = useI18n();
  const dir = useDir();
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof id === "string" ? id : "";
  const bookTitle = typeof title === "string" ? title : t("syllabus.title");

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

  // أوقف أي قراءة صوتية عند مغادرة الشاشة (يمنع بقاء الصوت/التعليق بعد الخروج)
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

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
      setErr(e?.message ?? t("syllabus.err.generate"));
    } finally {
      setBusy(false);
    }
  }

  // الدخول للقارئ (الكتاب نفسه) من شاشة المنهج
  function startReading() {
    router.push({
      pathname: "/reader/[id]",
      params: { id: bookId, title: bookTitle, pdf_path: pdfPath },
    });
  }

  async function startMindmap(i: number) {
    if (!syl) return;
    const u = syl.units[i];
    setMmUnit(i);
    setMmLoading(true);
    setMm(null);
    try {
      // مخزَّن مسبقًا لهذه الوحدة؟ اعرضه فورًا بلا استهلاك ذكاء
      const cached = await getUnitContent<MindMap>(pdfPath, i, "mindmap");
      if (cached) {
        setMm(cached);
        return;
      }
      // محتوى الوحدة المختصر = توليد سريع (الوحدات أصلًا مستخرَجة من الكتاب)
      const ctx = `الفكرة المركزية: ${u.title}\nالفروع الرئيسية:\n${u.topics
        .map((t) => "- " + t)
        .join("\n")}`;
      const map = await generateMindmap(ctx);
      if (!map) {
        setMmUnit(null);
        setErr(t("syllabus.err.mindmap"));
      } else {
        setMm(map);
        setUnitContent(pdfPath, i, "mindmap", map);
      }
    } catch {
      setMmUnit(null);
      setErr(t("syllabus.err.mindmap"));
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
      // مخزَّن مسبقًا؟ افتح صفحة الملخّص فورًا بلا استهلاك ذكاء (يقرأ ثم يستمع إن شاء)
      const cached = await getUnitContent<string>(pdfPath, i, "summary");
      if (cached) {
        setSumText(cached);
        return;
      }
      const ctx = `وحدة بعنوان «${u.title}». النقاط الرئيسية: ${u.topics.join("، ")}.${
        u.outcome ? ` الهدف: ${u.outcome}.` : ""
      } اشرح هذه النقاط بإيجاز في فقرة متصلة مناسبة للاستماع.`;
      const text = (await aiAssist("summarize", ctx)).trim();
      if (!text) {
        setSumUnit(null);
        setErr(t("syllabus.err.summary"));
        return;
      }
      setSumText(text);
      setUnitContent(pdfPath, i, "summary", text);
    } catch {
      setSumUnit(null);
      setErr(t("syllabus.err.summary"));
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
      // مخزَّن مسبقًا؟ استخدمه فورًا بلا استهلاك ذكاء
      const cached = await getUnitContent<QuizQ[]>(pdfPath, i, "quiz");
      if (cached && cached.length) {
        setQuiz(cached);
        return;
      }
      const ctx = `الوحدة: ${u.title}\nالمواضيع: ${u.topics.join("، ")}\n${u.outcome ?? ""}`;
      const qs = await generateUnitQuiz(ctx);
      if (qs.length === 0) {
        setErr(t("syllabus.err.quiz"));
        setQuizUnit(null);
      } else {
        setQuiz(qs);
        setUnitContent(pdfPath, i, "quiz", qs);
      }
    } catch {
      setQuizUnit(null);
      setErr(t("syllabus.err.quiz"));
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
          ${sched[i] ? `<p class="when">📅 ${esc(t("syllabus.studyOn"))}: ${esc(fmtRange(sched[i]))}</p>` : ""}
          ${u.topics.length ? `<ul>${u.topics.map((topic) => `<li>${esc(topic)}</li>`).join("")}</ul>` : ""}
          ${u.outcome ? `<p class="out">🎯 ${esc(u.outcome)}</p>` : ""}
        </div>`
      )
      .join("");
    const tips = syl.tips?.length
      ? `<div class="tips"><h2>${esc(t("syllabus.print.tipsHeading"))}</h2><ul>${syl.tips.map((tip) => `<li>${esc(tip)}</li>`).join("")}</ul></div>`
      : "";
    const html = `<!doctype html><html dir="${dir.writingDirection}" lang="ar"><head><meta charset="utf-8"><style>
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
      <p class="sub">${esc(t("syllabus.print.sub", { count: total }))}</p>
      ${units}
      ${tips}
    </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch {}
  }

  // طباعة الخريطة الذهنية كشجرة كاملة مرتّبة (بلا قص أو نقص)
  async function printMindmap() {
    if (!mm) return;
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // كل فرع بطاقة ملوّنة مرتّبة داخل شبكة عمودين — خريطة كاملة بلا قص
    const branches = mm.branches
      .map((b, i) => {
        const c = MM_COLORS[i % MM_COLORS.length];
        const pts = b.points.map((p) => `<li>${esc(p)}</li>`).join("");
        return `<div class="br" style="border-color:${c}">
          <div class="brh" style="background:${c}"><span class="num">${i + 1}</span>${esc(b.label)}</div>
          ${pts ? `<ul>${pts}</ul>` : ""}
        </div>`;
      })
      .join("");
    const html = `<!doctype html><html dir="${dir.writingDirection}" lang="ar"><head><meta charset="utf-8"><style>
      * { font-family: -apple-system, 'SF Arabic', sans-serif; box-sizing: border-box; }
      body { padding: 28px; color: #14233a; }
      h1 { font-size: 20px; margin: 0 0 16px; text-align:center; }
      .center { background:#5b3df5; color:#fff; font-weight:800; font-size:18px; text-align:center; padding:16px 20px; border-radius:16px; margin:0 auto 8px; max-width:460px; }
      .stem { width:2px; height:22px; background:#c7cede; margin:0 auto 14px; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .br { border:2px solid; border-radius:14px; overflow:hidden; page-break-inside: avoid; }
      .brh { font-weight:800; font-size:15px; color:#fff; display:flex; align-items:center; gap:8px; padding:10px 14px; }
      .num { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,0.28); font-size:13px; flex:none; }
      ul { margin:0; padding:10px 20px; }
      li { margin:5px 0; font-size:13.5px; line-height:1.5; }
      @media print { .grid { gap:12px; } }
    </style></head><body>
      <h1>🗺️ ${esc(t("syllabus.mindmap.title"))} — ${esc(bookTitle)}</h1>
      <div class="center">${esc(mm.center)}</div>
      <div class="stem"></div>
      <div class="grid">${branches}</div>
    </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch {}
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* رأس */}
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t("syllabus.title")}
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
            <Text style={styles.emptyTitle}>{t("syllabus.empty.title")}</Text>
            <Text style={styles.emptySub}>
              {t("syllabus.empty.sub")}
            </Text>
            {!!err && <Text style={styles.err}>{err}</Text>}
            <GradientButton
              title={t("syllabus.empty.generate")}
              icon="sparkles"
              onPress={onGenerate}
              loading={busy}
              style={{ marginTop: Spacing.lg, alignSelf: "stretch" }}
            />
            <Pressable onPress={startReading} style={styles.readNowBtn}>
              <Ionicons name="book" size={18} color={Palette.text} />
              <Text style={styles.readNowTxt}>{t("syllabus.readNowFull")}</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* عنوان + تقدّم */}
            <GlassCard contentStyle={styles.progCard} glow={Palette.neonViolet}>
              <Text style={styles.bookTitle} numberOfLines={3}>
                {syl.title ?? bookTitle}
              </Text>
              <View style={[styles.progRow, { flexDirection: dir.row }]}>
                <Text style={styles.progPct}>{pct}%</Text>
                <Text style={styles.progLabel}>
                  {t("syllabus.progress.completed", { completed, total })}
                </Text>
              </View>
              <View style={styles.progTrack}>
                <View style={[styles.progFill, { width: `${pct}%` }]} />
              </View>
              {sched.length === 0 && (
                <Text style={[styles.noPlanHint, { marginTop: 12 }]}>
                  {t("syllabus.noPlanHint")}
                </Text>
              )}
            </GlassCard>

            {/* زر الدخول للقراءة — بارز فوق الوحدات */}
            <Pressable onPress={startReading} style={styles.readNowBtn}>
              <Ionicons name="book" size={18} color={Palette.text} />
              <Text style={styles.readNowTxt}>{t("syllabus.readNow")}</Text>
            </Pressable>

            {/* الوحدات (تشيك ليست) */}
            {syl.units.map((u, i) => {
              const isDone = done[i];
              return (
                <Pressable key={i} onPress={() => toggle(i)} style={styles.unitWrap}>
                  <GlassCard contentStyle={styles.unitCard} glow={isDone ? Palette.neonCyan : undefined}>
                    <View style={[styles.unitHead, { flexDirection: dir.row }]}>
                      <View style={[styles.check, isDone && styles.checkOn]}>
                        {isDone && <Ionicons name="checkmark" size={16} color="#0b1220" />}
                      </View>
                      <Text style={[styles.unitTitle, isDone && styles.unitTitleDone, { textAlign: dir.textAlign }]}>
                        {i + 1}. {u.title}
                      </Text>
                    </View>
                    {sched[i] && (
                      <View style={[styles.schedRow, { flexDirection: dir.row }]}>
                        <Ionicons name="calendar-outline" size={13} color={Palette.neonCyan} />
                        <Text style={styles.schedTxt}>
                          {t("syllabus.studyOn")}: {fmtRange(sched[i])}{"  ·  "}
                          {sched[i].dayTo !== sched[i].dayFrom
                            ? t("syllabus.dayRange", { from: sched[i].dayFrom, to: sched[i].dayTo })
                            : t("syllabus.day", { day: sched[i].dayFrom })}
                        </Text>
                      </View>
                    )}
                    {u.topics.map((topic, k) => (
                      <View key={k} style={[styles.topicRow, { flexDirection: dir.row }]}>
                        <Text style={styles.topicDot}>•</Text>
                        <Text style={[styles.topicTxt, { textAlign: dir.textAlign }]}>{topic}</Text>
                      </View>
                    ))}
                    {!!u.outcome && (
                      <Text style={[styles.outcome, { textAlign: dir.textAlign }]}>🎯 {u.outcome}</Text>
                    )}

                    <View style={[styles.unitActions, { flexDirection: dir.row }]}>
                      <Pressable
                        onPress={() => startSummary(i)}
                        disabled={sumLoading}
                        style={[styles.quizBtn, styles.sumBtn, { flexDirection: dir.row }]}
                      >
                        {sumLoading && sumUnit === i ? (
                          <ActivityIndicator size="small" color={Palette.neonCyan} />
                        ) : (
                          <Ionicons name="headset" size={15} color={Palette.neonCyan} />
                        )}
                        <Text style={[styles.quizBtnTxt, { color: Palette.neonCyan }]}>
                          {sumLoading && sumUnit === i ? "…" : t("syllabus.action.summary")}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => startQuiz(i)}
                        disabled={quizLoading}
                        style={[styles.quizBtn, { flex: 1, marginTop: 0, flexDirection: dir.row }]}
                      >
                        {quizLoading && quizUnit === i ? (
                          <ActivityIndicator size="small" color={Palette.neonViolet} />
                        ) : (
                          <Ionicons name="help-circle" size={15} color={Palette.neonViolet} />
                        )}
                        <Text style={styles.quizBtnTxt}>
                          {quizLoading && quizUnit === i ? "…" : t("syllabus.action.quiz")}
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => startMindmap(i)}
                      disabled={mmLoading}
                      style={[styles.quizBtn, styles.mmBtn, { flexDirection: dir.row }]}
                    >
                      {mmLoading && mmUnit === i ? (
                        <ActivityIndicator size="small" color="#a3e635" />
                      ) : (
                        <Ionicons name="git-network" size={15} color="#a3e635" />
                      )}
                      <Text style={[styles.quizBtnTxt, { color: "#bef264" }]}>
                        {mmLoading && mmUnit === i ? t("syllabus.action.drawing") : t("syllabus.action.mindmap")}
                      </Text>
                    </Pressable>
                  </GlassCard>
                </Pressable>
              );
            })}

            {/* نصائح */}
            {!!syl.tips?.length && (
              <GlassCard contentStyle={styles.tipsCard} glow={Palette.neonCyan}>
                <Text style={[styles.tipsTitle, { textAlign: dir.textAlign }]}>{t("syllabus.tipsTitle")}</Text>
                {syl.tips.map((tip, i) => (
                  <View key={i} style={[styles.topicRow, { flexDirection: dir.row }]}>
                    <Text style={styles.topicDot}>•</Text>
                    <Text style={[styles.topicTxt, { textAlign: dir.textAlign }]}>{tip}</Text>
                  </View>
                ))}
              </GlassCard>
            )}

            {/* دور مستقل عن طابعة الهيدر: إعادة توليد المنهج كاملًا من الكتاب
                (يعيد بناء الوحدات بالفهرس الكامل بدل النسخة القديمة المختصرة). */}
            <GradientButton
              title={t("syllabus.regenerate")}
              icon="refresh"
              variant="ghost"
              onPress={onGenerate}
              loading={busy}
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
              <View style={[styles.quizHeader, { flexDirection: dir.row }]}>
                <Text style={styles.quizHeaderTxt}>
                  {quizDone ? t("syllabus.quiz.result") : t("syllabus.quiz.question", { step: qStep + 1, total: quiz.length })}
                </Text>
                <Pressable onPress={closeQuiz} hitSlop={8}>
                  <Ionicons name="close" size={22} color={Palette.textMuted} />
                </Pressable>
              </View>

              {quizDone ? (
                (() => {
                  const pctScore = Math.round((qScore / Math.max(1, quiz.length)) * 100);
                  const lvl = pctScore >= 85 ? "advanced" : pctScore >= 55 ? "intermediate" : "beginner";
                  const lvlColor = lvl === "advanced" ? Palette.success : lvl === "intermediate" ? Palette.neonCyan : Palette.warn;
                  return (
                    <View style={styles.quizResult}>
                      <Text style={styles.quizScoreBig}>
                        {qScore} / {quiz.length}
                      </Text>
                      {/* مستوى الطالب حسب نتيجته عبر الأسئلة المتدرّجة */}
                      <View style={[styles.levelPill, { borderColor: lvlColor, backgroundColor: lvlColor + "1f" }]}>
                        <Text style={[styles.levelPillTxt, { color: lvlColor }]}>
                          {t("syllabus.quiz.yourLevel")}: {t(`syllabus.quiz.levelResult.${lvl}`)}
                        </Text>
                      </View>
                      <Text style={styles.quizResultMsg}>
                        {qScore === quiz.length
                          ? t("syllabus.quiz.perfect")
                          : qScore >= Math.ceil(quiz.length / 2)
                          ? t("syllabus.quiz.good")
                          : t("syllabus.quiz.review")}
                      </Text>
                      <GradientButton
                        title={t("common.done")}
                        icon="checkmark"
                        onPress={closeQuiz}
                        style={{ alignSelf: "stretch", marginTop: Spacing.md }}
                      />
                    </View>
                  );
                })()
              ) : quiz[qStep] ? (
                <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                  {/* شارة الصعوبة + نقاط التقدّم (تدرّج من الأسهل إلى الأصعب) */}
                  <View style={[styles.diffRow, { flexDirection: dir.row }]}>
                    <View
                      style={[
                        styles.diffBadge,
                        { borderColor: LEVEL_COLOR[quiz[qStep].level], backgroundColor: LEVEL_COLOR[quiz[qStep].level] + "22" },
                      ]}
                    >
                      <Text style={[styles.diffBadgeTxt, { color: LEVEL_COLOR[quiz[qStep].level] }]}>
                        {t(`syllabus.quiz.level.${quiz[qStep].level}`)}
                      </Text>
                    </View>
                    <View style={[styles.dotsRow, { flexDirection: dir.row }]}>
                      {quiz.map((qq, di) => (
                        <View
                          key={di}
                          style={[
                            styles.qDot,
                            { backgroundColor: di <= qStep ? LEVEL_COLOR[qq.level] : Palette.glassBorder },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={[styles.quizQ, { textAlign: dir.textAlign }]}>{quiz[qStep].q}</Text>
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
                          { flexDirection: dir.row },
                          reveal && isCorrect && styles.quizOptCorrect,
                          reveal && picked && !isCorrect && styles.quizOptWrong,
                        ]}
                      >
                        <Text style={[styles.quizOptTxt, { textAlign: dir.textAlign }]}>{opt}</Text>
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
                      title={qStep + 1 >= quiz.length ? t("syllabus.quiz.showResult") : t("syllabus.quiz.nextQuestion")}
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
              <View style={[styles.quizHeader, { flexDirection: dir.row }]}>
                <Text style={styles.quizHeaderTxt} numberOfLines={1}>
                  🎧 {t("syllabus.summary.label")}: {sumUnit !== null ? syl?.units[sumUnit]?.title : ""}
                </Text>
                <Pressable onPress={closeSummary} hitSlop={8}>
                  <Ionicons name="close" size={22} color={Palette.textMuted} />
                </Pressable>
              </View>

              <Pressable onPress={toggleSummaryPlay} style={[styles.sumPlay, { flexDirection: dir.row }]}>
                <Ionicons name={sumPlaying ? "pause" : "play"} size={20} color="#0b1220" />
                <Text style={styles.sumPlayTxt}>{sumPlaying ? t("syllabus.summary.pause") : t("syllabus.summary.listen")}</Text>
              </Pressable>

              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={[styles.sumText, { textAlign: dir.textAlign }]}>{sumText}</Text>
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
              <View style={[styles.quizHeader, { flexDirection: dir.row }]}>
                <Text style={styles.quizHeaderTxt}>🗺️ {t("syllabus.mindmap.title")}</Text>
                <View style={{ flexDirection: dir.row, alignItems: "center", gap: 14 }}>
                  <Pressable onPress={printMindmap} hitSlop={8}>
                    <Ionicons name="print-outline" size={21} color={Palette.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => setMmUnit(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={Palette.textMuted} />
                  </Pressable>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                {/* خريطة شعاعية (توني بوزان) — عرض ثابت داخل حاوية عادية.
                    أزلنا التكبير المتداخل (ScrollView داخل ScrollView) لأنه كان
                    يُوقف الإيماءات ويجمّد الصفحة؛ التفاصيل الكاملة في القائمة بالأسفل. */}
                {mm ? (
                  <View style={[styles.mmCanvasWrap, styles.mmCanvas]}>
                    <BuzanMindMap map={mm} size={320} />
                  </View>
                ) : null}
                <Text style={styles.mmHint}>{t("syllabus.mindmap.hintList")}</Text>

                {/* العقدة المركزية (قائمة) */}
                <View style={styles.mmCenter}>
                  <Text style={styles.mmCenterTxt}>{mm?.center}</Text>
                </View>
                <View style={styles.mmStem} />

                {/* الفروع */}
                {mm?.branches.map((b, bi) => {
                  const c = MM_COLORS[bi % MM_COLORS.length];
                  return (
                    <View key={bi} style={[styles.mmBranch2, { borderColor: c + "66" }]}>
                      <View style={[styles.mmBranchHead, { backgroundColor: c + "22", flexDirection: dir.row }]}>
                        <View style={[styles.mmDot, { backgroundColor: c }]} />
                        <Text style={[styles.mmBranchLabel, { color: c, textAlign: dir.textAlign }]}>{b.label}</Text>
                      </View>
                      {b.points.map((p, pi) => (
                        <View key={pi} style={[styles.mmPointRow, { flexDirection: dir.row }]}>
                          <Text style={[styles.mmPointDash, { color: c }]}>—</Text>
                          <Text style={[styles.mmPointTxt, { textAlign: dir.textAlign }]}>{p}</Text>
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
  readNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    borderColor: Palette.neonCyan + "88",
  },
  readNowTxt: { color: Palette.text, fontSize: 16, fontWeight: "900" },
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
  mmCanvasWrap: {
    backgroundColor: "#0b1220",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    maxHeight: 340,
  },
  mmCanvas: { alignItems: "center", justifyContent: "center", padding: 8 },
  mmHint: { color: Palette.textDim, fontSize: 11.5, textAlign: "center", marginTop: 8, marginBottom: 12 },
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
  quizResult: { alignItems: "center", paddingVertical: Spacing.lg, gap: 10 },
  quizScoreBig: { color: Palette.neonCyan, fontSize: 44, fontWeight: "900" },
  quizResultMsg: { color: Palette.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" },
  levelPill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1.5 },
  levelPillTxt: { fontSize: 15, fontWeight: "900" },
  diffRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  diffBadge: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1.5 },
  diffBadgeTxt: { fontSize: 13, fontWeight: "900" },
  dotsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  qDot: { width: 8, height: 8, borderRadius: 4 },
});
