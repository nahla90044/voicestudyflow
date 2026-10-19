// app/unit-video.tsx
// «ملخّص الفيديو» للوحدة بأسلوب NotebookLM: مشاهد متحركة بتصميم Gamma + راوٍ يشرح كمعلّم،
// وأسئلة سريعة بين المشاهد (سؤال ← وقفة تفكير ← الجواب)، وخلاصة، ثم «ابدأ الاختبار».
// - التجهيز مهمة خلفية (lib/videoJobs): الرجوع للكتاب لا يوقفه، وإشعار عند الاكتمال.
// - التشغيل يبدأ مع أول مشهد جاهز بينما يُكتب الباقي.
// - السيناريو يُخزَّن، وصوت الراوي يُحفظ على الجهاز أثناء المشاهدة، فالعودة فورية وبلا إنترنت.
import { Ionicons } from "@expo/vector-icons";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { AmbientSheet, useAmbient } from "../components/brand/ambient-sheet";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { SlideView } from "../components/brand/slide-view";
import { UsageChip } from "../components/brand/usage-chip";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { addSavedItem, removeSavedItem } from "../lib/savedStudy";
import { useScene } from "../lib/scene";
import type { SummarySource } from "../lib/unitSummary";
import { clearVideo, getCachedVideo, saveVideoAudio, sceneSpeech, videoSeconds, type VideoScene, type VideoScript } from "../lib/videoScript";
import { startVideoJob, watchVideoJob, type VideoJob } from "../lib/videoJobs";
import { DEFAULT_VOICE_ID, prefetchText, speakText, stopSpeaking } from "../lib/voice";

const THINK_SECONDS = 5;
const RATES = [1, 1.15, 1.3];
const KEEP_TAG = "vsf-video-play";

/** مشهد «سؤال سريع»: السؤال، ثم عدّ تنازلي للتفكير، ثم الجواب */
function CheckView({ scene, stage, left }: { scene: VideoScene; stage: "ask" | "think" | "reveal"; left: number }) {
  const { t } = useI18n();
  const dir = useDir();
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    reveal.setValue(0);
    if (stage === "reveal") Animated.timing(reveal, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [stage, reveal, scene]);
  return (
    <View style={styles.check}>
      <LinearGradient colors={["#0F766E", "#1D4ED8"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.checkTag, { alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
        <Text style={styles.checkTagTxt}>
          <Ionicons name="help-circle-outline" size={15} color="#FFFFFF" /> {t("video.check")}
        </Text>
      </View>
      <Text style={[styles.checkQ, { textAlign: dir.textAlign }]}>{scene.question}</Text>
      {stage === "think" ? (
        <View style={styles.thinkWrap}>
          <View style={styles.thinkCircle}>
            <Text style={styles.thinkNum}>{left}</Text>
          </View>
          <Text style={styles.thinkTxt}>{t("video.think")}</Text>
        </View>
      ) : stage === "reveal" ? (
        <Animated.View style={[styles.answer, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
          <Text style={[styles.answerHead, { textAlign: dir.textAlign }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#047857" /> {t("video.answer")}
          </Text>
          <Text style={[styles.answerTxt, { textAlign: dir.textAlign }]}>{scene.answer}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function UnitVideoScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { width: winW, height: winH } = useWindowDimensions();
  const { pdf_path, unit, page, from, to, title, book_title } = useLocalSearchParams<{ pdf_path?: string; unit?: string; page?: string; from?: string; to?: string; title?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const unitIdx = Number(unit ?? 0) || 0;
  const pageNum = Number(page);
  const pageMode = Number.isFinite(pageNum) && pageNum > 0;
  const fromN = Number(from);
  const toN = Number(to);
  const rangeMode = !pageMode && fromN > 0 && toN >= fromN;
  const src: SummarySource = pageMode ? { kind: "page", page: pageNum } : rangeMode ? { kind: "range", from: fromN, to: toN } : { kind: "unit", unit: unitIdx };
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

  // —— التجهيز ——
  const [job, setJob] = useState<VideoJob | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [complete, setComplete] = useState(false);
  const [runId, setRunId] = useState(0);
  const scriptRef = useRef<{ script: VideoScript | null; complete: boolean }>({ script: null, complete: false });
  scriptRef.current = { script, complete };

  useEffect(() => {
    let on = true;
    let un: (() => void) | undefined;
    (async () => {
      const cached = await getCachedVideo(pdfPath, src);
      if (!on) return;
      if (cached) {
        setScript(cached);
        setComplete(true);
        return;
      }
      const params: Record<string, string> = { pdf_path: pdfPath };
      for (const [k, v] of Object.entries({ unit, page, from, to, title, book_title })) if (typeof v === "string") params[k] = v;
      const key = startVideoJob(pdfPath, src, unitTitle, { title: unitTitle || bookTitle, params });
      un = watchVideoJob(key, (j) => {
        if (!on) return;
        setJob(j);
        if (j.script?.scenes.length) setScript(j.script);
        if (j.status === "done") setComplete(true);
      });
    })();
    return () => {
      on = false;
      un?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, runId]);

  // اكتمل السيناريو → يظهر في «المحفوظات» (تبويب الملخّصات 🎬) للرجوع إليه
  useEffect(() => {
    if (!complete || !pdfPath) return;
    addSavedItem({
      key: `video|${pdfPath}|${pageMode ? "p" + pageNum : rangeMode ? `r${fromN}-${toN}` : "u" + unitIdx}`,
      kind: "video",
      pdfPath,
      bookTitle,
      label: unitTitle || (pageMode ? String(pageNum) : ""),
      page: pageMode ? pageNum : undefined,
      unit: pageMode || rangeMode ? undefined : unitIdx,
      from: rangeMode ? fromN : undefined,
      to: rangeMode ? toN : undefined,
      savedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // —— التشغيل ——
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stage, setStage] = useState<"ask" | "think" | "reveal">("ask");
  const [thinkLeft, setThinkLeft] = useState(THINK_SECONDS);
  const [waitingMore, setWaitingMore] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rateIdx, setRateIdx] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [ambOpen, setAmbOpen] = useState(false);
  const amb = useAmbient();
  const [audioSave, setAudioSave] = useState<{ done: number; total: number } | "saved" | null>(null);
  const tokenRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rateRef = useRef(RATES[0]);
  rateRef.current = RATES[rateIdx];

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const halt = useCallback(() => {
    tokenRef.current++;
    clearTimers();
    stopSpeaking();
    deactivateKeepAwake(KEEP_TAG);
  }, []);
  useEffect(() => () => halt(), [halt]);

  function say(text: string, my: number, then: () => void) {
    speakText(text, {
      voiceId: DEFAULT_VOICE_ID,
      rate: rateRef.current,
      onDone: () => my === tokenRef.current && then(),
      onError: () => my === tokenRef.current && then(), // مقطع تعذّر → نكمل لا نتوقف
    });
  }

  function playFrom(i: number) {
    const my = ++tokenRef.current;
    clearTimers();
    activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
    setPlaying(true);
    setEnded(false);
    const step = (k: number) => {
      if (my !== tokenRef.current) return;
      const { script: sc, complete: done } = scriptRef.current;
      const scenes = sc?.scenes ?? [];
      if (k >= scenes.length) {
        if (!done) {
          // بقية الفيديو ما زالت تُكتب → ننتظر المشهد التالي
          setWaitingMore(true);
          later(() => step(k), 1500);
          return;
        }
        setWaitingMore(false);
        setPlaying(false);
        setEnded(true);
        deactivateKeepAwake(KEEP_TAG);
        return;
      }
      setWaitingMore(false);
      setIdx(k);
      setStage("ask");
      // المشهدان التاليان يُجهَّزان صوتيًا أثناء الحالي (بلا فجوات)
      for (const j of [k + 1, k + 2]) if (scenes[j]) for (const line of sceneSpeech(scenes[j])) void prefetchText(line, { voiceId: DEFAULT_VOICE_ID });
      const s = scenes[k];
      const next = () => later(() => step(k + 1), 650);
      if (s.kind !== "check") return say(s.narration, my, next);
      say(s.narration, my, () => {
        setStage("think");
        let left = THINK_SECONDS;
        setThinkLeft(left);
        const tick = () => {
          if (my !== tokenRef.current) return;
          left -= 1;
          if (left > 0) {
            setThinkLeft(left);
            later(tick, 1000);
          } else {
            setStage("reveal");
            if (s.answer) say(s.answer, my, () => later(() => step(k + 1), 1200));
            else next();
          }
        };
        later(tick, 1000);
      });
    };
    step(i);
    // حفظ صوت الفيديو كله على الجهاز في الخلفية (مرة واحدة): المشاهدة التالية فورية وبلا إنترنت
    if (!audioSave && scriptRef.current.complete && scriptRef.current.script) {
      setAudioSave({ done: 0, total: 1 });
      void saveVideoAudio(scriptRef.current.script, DEFAULT_VOICE_ID, (d, n) => setAudioSave(d >= n ? "saved" : { done: d, total: n })).catch(() => setAudioSave(null));
    }
  }

  function togglePlay() {
    if (playing) {
      halt();
      setPlaying(false);
      setWaitingMore(false);
    } else playFrom(ended ? 0 : idx);
  }
  function jump(i: number) {
    const n = script?.scenes.length ?? 0;
    if (!n) return;
    const k = Math.max(0, Math.min(n - 1, i));
    if (playing) playFrom(k);
    else {
      setIdx(k);
      setStage("ask");
      setEnded(false);
    }
  }

  // إعادة توليد الفيديو من جديد، أو حذفه — كلاهما بطلب الطالب (ويُحسب من طلباته عند التوليد)
  function onVideoOptions() {
    Alert.alert(t("video.options"), t("video.optionsBody"), [
      {
        text: t("video.regen"),
        onPress: async () => {
          halt();
          setPlaying(false);
          setEnded(false);
          setIdx(0);
          await clearVideo(pdfPath, src);
          setScript(null);
          setComplete(false);
          setJob(null);
          setAudioSave(null);
          setRunId((n) => n + 1);
        },
      },
      {
        text: t("video.delete"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("video.delete"), t("video.deleteBody"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.delete"),
              style: "destructive",
              onPress: async () => {
                halt();
                await clearVideo(pdfPath, src);
                await removeSavedItem(`video|${pdfPath}|${pageMode ? "p" + pageNum : rangeMode ? `r${fromN}-${toN}` : "u" + unitIdx}`);
                router.back();
              },
            },
          ]),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  const scenes = script?.scenes ?? [];
  const cur = scenes[idx];
  const total = Math.max(scenes.length, 1);
  const stageH = Math.min(winH * 0.56, winW * 0.78, 560);
  const fmtEta = (sec: number) => {
    const m = Math.round(sec / 60);
    return sec < 60 ? t("summary.etaLess") : m <= 1 ? t("summary.etaMin", { n: 1 }) : t("summary.etaMins", { n: m });
  };
  const preparing = !scenes.length;
  const totalSecs = videoSeconds(scenes, RATES[rateIdx], 0, THINK_SECONDS);
  const leftSecs = videoSeconds(scenes, RATES[rateIdx], idx, THINK_SECONDS);
  const fmtDur = (sec: number) => {
    const m = Math.round(sec / 60);
    return sec < 60 ? t("video.durSecs", { n: Math.max(1, Math.round(sec / 10) * 10) }) : m <= 1 ? t("summary.etaMin", { n: 1 }) : t("summary.etaMins", { n: m });
  };
  // عدّاد التجهيز: الوقت الماضي كله، والتقدّم داخل المرحلة الحالية (لا يرجع للخلف)
  const prepStart = useRef(Date.now());
  const stageStart = useRef({ stage: "summary" as string, at: Date.now() });
  const maxPct = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!preparing) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - prepStart.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [preparing]);
  const stageNow = job?.stage ?? "summary";
  if (stageStart.current.stage !== stageNow) {
    stageStart.current = { stage: stageNow, at: Date.now() };
    maxPct.current = 0;
  }
  const stageSecs = (Date.now() - stageStart.current.at) / 1000;
  const byTime = job?.etaSec ? stageSecs / (stageSecs + job.etaSec) : 1 - Math.exp(-stageSecs / 70);
  const byParts = job && job.total ? job.done / job.total : 0;
  // مرحلتان: الملخّص ٠–٥٠٪ ثم المشاهد ٥٠–١٠٠٪ (إن كان الملخّص جاهزًا مسبقًا تبدأ المشاهد من ٥٠٪)
  const inStage = Math.min(0.97, Math.max(byTime, byParts));
  maxPct.current = Math.max(maxPct.current, inStage);
  const prepPct = (stageNow === "script" ? 0.5 : 0) + maxPct.current * 0.5;
  const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const failed = job && job.status !== "running" && !complete;
  const quizParams: Record<string, string> = { pdf_path: pdfPath, title: unitTitle, book_title: bookTitle };
  if (pageMode) quizParams.page = String(pageNum);
  else if (rangeMode) quizParams.page = String(fromN);
  else quizParams.unit = String(unitIdx);

  return (
    <SceneScreen>
      <SceneBanner
        title={t("video.title")}
        subtitle={unitTitle || bookTitle || undefined}
        height={150}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          <Pressable onPress={() => setAmbOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("summary.ambient.title")}>
            <SceneIconButton>
              <Ionicons name={amb.key ? "musical-notes" : "headset"} size={20} color={pal.accent} />
            </SceneIconButton>
          </Pressable>
        }
      />

      {preparing ? (
        <View style={styles.center}>
          {failed ? (
            <>
              <Ionicons name="alert-circle-outline" size={36} color={pal.accent} />
              <Text style={[styles.dim, { color: pal.dim }]}>{job?.status === "quota" ? t("video.quota") : t("video.failed")}</Text>
              {job?.status !== "quota" ? (
                <Pressable onPress={() => setRunId((n) => n + 1)} style={[styles.primary, { backgroundColor: pal.accent }]}>
                  <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("summary.resume")}</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <View style={[styles.prepIcon, { backgroundColor: pal.soft }]}>
                <Ionicons name="videocam-outline" size={34} color={pal.accent} />
              </View>
              {/* المراحل: ✓ المكتمل، والحالية بمؤشر */}
              <View style={{ alignSelf: "stretch", gap: 8 }}>
                {(["summary", "script"] as const).map((st, k) => {
                  const doneStage = job?.stage === "script" && st === "summary";
                  const cur = (job?.stage ?? "summary") === st;
                  return (
                    <View key={st} style={[styles.stepRow, { flexDirection: dir.row, opacity: cur || doneStage ? 1 : 0.45 }]}>
                      {doneStage ? (
                        <Ionicons name="checkmark-circle" size={22} color="#15803D" />
                      ) : cur ? (
                        <ActivityIndicator size="small" color={pal.accent} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={22} color={pal.dim} />
                      )}
                      <Text style={[styles.stepTxt, { color: pal.ink, textAlign: dir.textAlign }]}>
                        {k + 1}. {st === "summary" ? t("video.stepSummary") : t("video.stepScript")}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {/* شريط التقدّم + النسبة + الوقت الماضي والمتبقي */}
              <View style={{ alignSelf: "stretch", gap: 8 }}>
                <View style={[styles.track, { backgroundColor: pal.track }]}>
                  <View style={[styles.fill, { backgroundColor: pal.accent, width: `${Math.round(prepPct * 100)}%`, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]} />
                </View>
                <View style={{ flexDirection: dir.row, justifyContent: "space-between" }}>
                  <Text style={[styles.pct, { color: pal.accent }]}>{Math.round(prepPct * 100)}%</Text>
                  <Text style={[styles.clock, { color: pal.dim }]}>{t("video.elapsed", { t: fmtClock(elapsed) })}</Text>
                </View>
              </View>
              {job?.waiting ? (
                <Text style={[styles.dim, { color: pal.dim }]}>{t("summary.waiting")}</Text>
              ) : (
                <Text style={[styles.eta, { color: pal.ink }]}>
                  {job?.etaSec ? t("summary.eta", { time: fmtEta(job.etaSec) }) : t("video.estimating")}
                </Text>
              )}
              {job && job.total > 1 ? (
                <Text style={[styles.dim, { color: pal.dim }]}>{t("video.parts", { n: job.done, total: job.total })}</Text>
              ) : null}
              <UsageChip kind="ai" />
              <Text style={[styles.dim, { color: pal.dim }]}>{t("video.bgHint")}</Text>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* الشاشة */}
          <View style={{ minHeight: stageH, justifyContent: "center" }}>
            {ended ? (
              <View style={[styles.endCard, { minHeight: stageH }]}>
                <LinearGradient colors={["#5B4BF5", "#2A9DF4"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                <Ionicons name="trophy-outline" size={52} color="#FFFFFF" />
                <Text style={styles.endTitle}>{t("video.endTitle")}</Text>
                <Text style={styles.endSub}>{t("video.endSub")}</Text>
                <Pressable onPress={() => router.push({ pathname: "/unit-quiz", params: quizParams })} style={styles.endQuiz}>
                  <Ionicons name="school" size={20} color="#3730A3" />
                  <Text style={styles.endQuizTxt}>{t("video.startQuiz")}</Text>
                </Pressable>
                <Pressable onPress={() => playFrom(0)} hitSlop={8} style={{ flexDirection: dir.row, alignItems: "center", gap: 6 }}>
                  <Ionicons name="refresh" size={17} color="#FFFFFF" />
                  <Text style={styles.endAgain}>{t("video.again")}</Text>
                </Pressable>
              </View>
            ) : cur?.kind === "check" ? (
              <View style={{ minHeight: stageH }}>
                <CheckView scene={cur} stage={stage} left={thinkLeft} />
              </View>
            ) : cur ? (
              <SlideView slide={cur} index={idx} total={complete ? scenes.length : Math.max(scenes.length, idx + 2)} maxBulletsHeight={stageH - 120} />
            ) : null}
          </View>

          {/* ⏱️ مدة الفيديو (كاملة قبل التشغيل، والمتبقي أثناءه) — لضبط وقت المذاكرة */}
          <View style={[styles.durRow, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
            <Ionicons name="time-outline" size={18} color={pal.accent} />
            <Text style={[styles.durTxt, { color: pal.ink }]}>
              {t(complete ? "video.duration" : "video.durationSoFar", { time: fmtDur(totalSecs) })}
            </Text>
            {(playing || idx > 0) && !ended ? (
              <Text style={[styles.durLeft, { color: pal.dim }]}>{t("video.remaining", { time: fmtDur(leftSecs) })}</Text>
            ) : null}
          </View>

          {/* الراوي (نص الشرح) */}
          {captions && cur && !ended ? (
            <View style={[styles.caption, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
              <Text style={[styles.captionTxt, { color: pal.ink, textAlign: dir.textAlign }]}>
                {cur.kind === "check" && stage === "reveal" && cur.answer ? cur.answer : cur.narration}
              </Text>
            </View>
          ) : null}
          {waitingMore ? <Text style={[styles.dim, { color: pal.dim }]}>{t("video.waitingMore")}</Text> : null}

          {/* شريط المشاهد: كل جزء مشهد، والضغط ينتقل إليه */}
          <View style={[styles.segs, { flexDirection: dir.row }]}>
            {scenes.map((s, i) => (
              <Pressable key={i} onPress={() => jump(i)} hitSlop={6} style={{ flex: 1 }}>
                <View style={[styles.seg, { backgroundColor: i < idx || (i === idx && ended) ? pal.accent : i === idx ? pal.accent : pal.track, opacity: i === idx && !ended ? 1 : i < idx ? 0.75 : 1 }, s.kind === "check" && styles.segCheck]} />
              </Pressable>
            ))}
            {!complete ? <ActivityIndicator size="small" color={pal.dim} style={{ marginHorizontal: 4 }} /> : null}
          </View>

          {/* التحكم */}
          <View style={[styles.controls, { flexDirection: dir.row }]}>
            <Pressable onPress={() => setCaptions((v) => !v)} hitSlop={8} style={[styles.small, { backgroundColor: captions ? pal.accent : pal.soft }]} accessibilityLabel={t("video.captions")}>
              <Ionicons name="text" size={18} color={captions ? pal.onAccent : pal.ink} />
            </Pressable>
            <Pressable onPress={() => jump(idx - 1)} hitSlop={8} style={[styles.mid, { backgroundColor: pal.soft }]} accessibilityLabel={t("video.prev")}>
              <Ionicons name={dir.isRTL ? "play-skip-forward" : "play-skip-back"} size={22} color={pal.ink} />
            </Pressable>
            <Pressable onPress={togglePlay} style={[styles.big, { backgroundColor: pal.accent }]} accessibilityLabel={playing ? t("syllabus.summary.pause") : t("video.play")}>
              <Ionicons name={playing ? "pause" : "play"} size={30} color={pal.onAccent} />
            </Pressable>
            <Pressable onPress={() => jump(idx + 1)} hitSlop={8} style={[styles.mid, { backgroundColor: pal.soft }]} accessibilityLabel={t("video.next")}>
              <Ionicons name={dir.isRTL ? "play-skip-back" : "play-skip-forward"} size={22} color={pal.ink} />
            </Pressable>
            <Pressable onPress={() => setRateIdx((r) => (r + 1) % RATES.length)} hitSlop={8} style={[styles.small, { backgroundColor: pal.soft }]} accessibilityLabel={t("reader.tool.speed")}>
              <Text style={[styles.rateTxt, { color: pal.ink }]}>{RATES[rateIdx]}×</Text>
            </Pressable>
          </View>

          {/* حالة التجهيز والحفظ */}
          <SceneCard style={{ gap: 8 }}>
            <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>
              {complete ? t("video.scenes", { n: scenes.length }) : job?.etaSec ? `${t("video.writing")} · ${t("summary.eta", { time: fmtEta(job.etaSec) })}` : t("video.writing")}
            </Text>
            {complete ? (
              <Text style={[styles.statusDim, { color: pal.dim, textAlign: dir.textAlign }]}>
                {audioSave === "saved"
                  ? t("video.offlineSaved")
                  : audioSave
                    ? t("video.offlineSaving", { done: audioSave.done, all: audioSave.total })
                    : t("video.savedHint")}
              </Text>
            ) : (
              <Text style={[styles.statusDim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("video.bgHint")}</Text>
            )}
            {failed && scenes.length ? (
              <Pressable onPress={() => setRunId((n) => n + 1)} style={[styles.primary, { backgroundColor: pal.accent, alignSelf: "center" }]}>
                <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("video.resume")}</Text>
              </Pressable>
            ) : null}
          </SceneCard>

          {complete ? (
            <Pressable onPress={onVideoOptions} style={[styles.primary, { backgroundColor: pal.soft, flexDirection: dir.row }]}>
              <Ionicons name="options-outline" size={18} color={pal.ink} />
              <Text style={[styles.primaryTxt, { color: pal.ink }]}>{t("video.options")}</Text>
            </Pressable>
          ) : null}
          <UsageChip kind="ai" />
          {complete ? (
            <Pressable onPress={() => router.push({ pathname: "/unit-quiz", params: quizParams })} style={[styles.primary, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
              <Ionicons name="school-outline" size={18} color={pal.onAccent} />
              <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("video.startQuiz")}</Text>
            </Pressable>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      <AmbientSheet visible={ambOpen} onClose={() => setAmbOpen(false)} amb={amb} />
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 14 },
  stepRow: { alignItems: "center", gap: 10 },
  durRow: { alignItems: "center", gap: 8, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 9, flexWrap: "wrap" },
  durTxt: { fontSize: 14.5, fontWeight: "900" },
  durLeft: { fontSize: 13.5, fontWeight: "700" },
  stepTxt: { flex: 1, fontSize: 15, fontWeight: "800" },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
  pct: { fontSize: 15, fontWeight: "900" },
  clock: { fontSize: 13.5, fontWeight: "700" },
  prepIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  prepTitle: { fontSize: 17, fontWeight: "900", textAlign: "center" },
  dim: { fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 22 },
  eta: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 14 },
  caption: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  captionTxt: { fontSize: 15, lineHeight: 26, fontWeight: "600" },
  segs: { gap: 3, alignItems: "center" },
  seg: { height: 6, borderRadius: 3 },
  segCheck: { height: 10, borderRadius: 5 },
  controls: { alignItems: "center", justifyContent: "center", gap: 14 },
  small: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  mid: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  big: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  rateTxt: { fontSize: 13, fontWeight: "900" },
  status: { fontSize: 15, fontWeight: "900" },
  statusDim: { fontSize: 13.5, fontWeight: "600", lineHeight: 21 },
  primary: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 26 },
  primaryTxt: { fontSize: 15.5, fontWeight: "900" },
  check: { flex: 1, borderRadius: 28, overflow: "hidden", padding: 24, justifyContent: "center", gap: 18, minHeight: 320 },
  checkTag: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  checkTagTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  checkQ: { color: "#FFFFFF", fontSize: 22, lineHeight: 36, fontWeight: "900" },
  thinkWrap: { alignItems: "center", gap: 8 },
  thinkCircle: { width: 74, height: 74, borderRadius: 37, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  thinkNum: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  thinkTxt: { color: "#E0F2FE", fontSize: 15, fontWeight: "800" },
  answer: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 16, gap: 6 },
  answerHead: { color: "#047857", fontSize: 15, fontWeight: "900" },
  answerTxt: { color: "#0F172A", fontSize: 16.5, lineHeight: 28, fontWeight: "700" },
  endCard: { borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  endEmoji: { fontSize: 52 },
  endTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "900", textAlign: "center" },
  endSub: { color: "#E0E7FF", fontSize: 15, lineHeight: 24, fontWeight: "700", textAlign: "center" },
  endQuiz: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 26, height: 54, marginTop: 6 },
  endQuizTxt: { color: "#3730A3", fontSize: 16.5, fontWeight: "900" },
  endAgain: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "800" },
});
