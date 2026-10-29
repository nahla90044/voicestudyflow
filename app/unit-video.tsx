// app/unit-video.tsx
// «ملخّص الفيديو» للوحدة بأسلوب NotebookLM: مشاهد متحركة بتصميم Gamma + راوٍ يشرح كمعلّم،
// وأسئلة سريعة بين المشاهد (سؤال ← وقفة تفكير ← الجواب)، وخلاصة، ثم «ابدأ الاختبار».
// - التجهيز مهمة خلفية (lib/videoJobs): الرجوع للكتاب لا يوقفه، وإشعار عند الاكتمال.
// - التشغيل يبدأ مع أول مشهد جاهز بينما يُكتب الباقي.
// - السيناريو يُخزَّن، وصوت الراوي يُحفظ على الجهاز أثناء المشاهدة، فالعودة فورية وبلا إنترنت.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { celebrate } from "../components/brand/feedback-host";
import { AmbientSheet, useAmbient } from "../components/brand/ambient-sheet";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { VideoStage } from "../components/brand/video-stage";
import { Radius, Spacing } from "../constants/design";
import { getCurrentLang, useDir, useI18n } from "../lib/i18n";
import { dict } from "../lib/i18n/strings";
import { preloadSlideFonts } from "../lib/slideFonts";
import { useSlideThemePref } from "../lib/slideTheme";
import { sceneRole, THEME_PREFS, THINK_SECONDS, type SlideThemePref } from "../lib/slideThemeCore";
import { markSeen, resetVideoSeen, seenScenes } from "../lib/studyTrack";
import { addSavedItem, removeSavedItem } from "../lib/savedStudy";
import { useScene } from "../lib/scene";
import type { SummarySource } from "../lib/unitSummary";
import { clearVideo, getCachedVideo, saveVideoAudio, sceneSpeech, videoRequestCost, videoSeconds, type VideoScript } from "../lib/videoScript";
import { confirmCost } from "../lib/costConfirm";
import { hasVideoJob, startVideoJob, videoJobKey, watchVideoJob, type VideoJob } from "../lib/videoJobs";
import { DEFAULT_VOICE_ID, prefetchText, speakText, stopSpeaking, VOICE_CATALOG } from "../lib/voice";

const RATES = [1, 1.15, 1.3];
const KEEP_TAG = "vsf-video-play";

// «شكل الشرائح»: معاينة كل اختيار (تدرّج ألوانه + أيقونة) — الترتيب من THEME_PREFS: منوّع، مجلة، بصري، سينمائي
/** لغات شرح الفيديو (قرار نهلة ٢٧ أكتوبر) — كل اسم بلغته */
type VideoLang = "ar" | "en" | "fr";
const VIDEO_LANGS: VideoLang[] = ["ar", "en", "fr"];
const VIDEO_LANG_NAMES: Record<VideoLang, string> = { ar: "العربية", en: "English", fr: "Français" };
const isVideoLang = (v: unknown): v is VideoLang => v === "ar" || v === "en" || v === "fr";
// نوع الفيديو حسب الملخّص الذي يُبنى منه (قرار نهلة ٢٨ أكتوبر): مختصر أو شامل أو موسّع؛ فيديو كل نوع ولغة محفوظ وحده
type VideoLevel = "brief" | "simple" | "strict" | "expand";
const VIDEO_LEVELS: VideoLevel[] = ["brief", "simple", "strict", "expand"];
const isVideoLevel = (v: unknown): v is VideoLevel => v === "brief" || v === "simple" || v === "strict" || v === "expand";

const LOOK_PREVIEW: Record<SlideThemePref, { colors: [string, string]; icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  mixed: { colors: ["#2A2370", "#B4A6FF"], icon: "shuffle", tint: "#FFFFFF" },
  editorial: { colors: ["#0B0E26", "#3A2F14"], icon: "book", tint: "#F6D58A" },
  visual: { colors: ["#1A2160", "#2C8F86"], icon: "git-network", tint: "#FFFFFF" },
  cinematic: { colors: ["#050816", "#151049"], icon: "film", tint: "#F6D58A" },
  classic: { colors: ["#3B82F6", "#6366F1"], icon: "albums", tint: "#FFFFFF" },
};

export default function UnitVideoScreen() {
  const { t, lang: uiLang } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { width: winW, height: winH } = useWindowDimensions();
  const { pdf_path, unit, page, from, to, title, book_title, vlang: vlangParam, vlevel: vlevelParam } = useLocalSearchParams<{ pdf_path?: string; unit?: string; page?: string; from?: string; to?: string; title?: string; book_title?: string; vlang?: string; vlevel?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const unitIdx = Number(unit ?? 0) || 0;
  const pageNum = Number(page);
  const pageMode = Number.isFinite(pageNum) && pageNum > 0;
  const fromN = Number(from);
  const toN = Number(to);
  const rangeMode = !pageMode && fromN > 0 && toN >= fromN;
  const baseSrc: SummarySource = pageMode ? { kind: "page", page: pageNum } : rangeMode ? { kind: "range", from: fromN, to: toN } : { kind: "unit", unit: unitIdx };
  // نوع الفيديو (آخر اختيار لهذا الكتاب، والافتراضي «شامل» كما كان)؛ null حتى يُقرأ
  const levelKey = `vsf:video:level:${pdfPath}`;
  const [vlevel, setVlevel] = useState<VideoLevel | null>(isVideoLevel(vlevelParam) ? vlevelParam : null);
  useEffect(() => {
    if (vlevel) return;
    AsyncStorage.getItem(levelKey)
      .then((v) => setVlevel(isVideoLevel(v) ? v : "strict"))
      .catch(() => setVlevel("strict"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const src: SummarySource = vlevel && vlevel !== "strict" ? { ...baseSrc, level: vlevel } : baseSrc;
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

  // صوت الراوي: يختاره الطالب من أصوات القارئ نفسها (يُحفظ للفيديوهات كلها)
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const voiceRef = useRef(DEFAULT_VOICE_ID);
  voiceRef.current = voiceId;
  const [voiceOpen, setVoiceOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem("vsf:video:voice").then((v) => v && VOICE_CATALOG.some((x) => x.voiceId === v) && setVoiceId(v)).catch(() => {});
  }, []);
  function pickVoice(v: string) {
    setVoiceId(v);
    voiceRef.current = v;
    setVoiceOpen(false);
    AsyncStorage.setItem("vsf:video:voice", v).catch(() => {});
  }

  // لغة الشرح (قرار نهلة ٢٧ أكتوبر): العربية أو الإنجليزية أو الفرنسية لكل كتاب، والافتراضي لغة الواجهة.
  // فيديو كل لغة يُحفظ وحده؛ null حتى تُقرأ (لا يبدأ التجهيز قبلها)
  const langKey = `vsf:video:lang:${pdfPath}`;
  const [vlang, setVlang] = useState<VideoLang | null>(isVideoLang(vlangParam) ? vlangParam : null);
  useEffect(() => {
    if (vlang) return;
    AsyncStorage.getItem(langKey)
      .then((v) => setVlang(isVideoLang(v) ? v : (uiLang as VideoLang)))
      .catch(() => setVlang(uiLang as VideoLang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function pickLang(l: VideoLang) {
    if (l === vlang) return;
    halt();
    setPlaying(false);
    setEnded(false);
    setIdx(0);
    setScript(null);
    setComplete(false);
    setJob(null);
    setAudioSave(null);
    setVlang(l);
    setVoiceOpen(false);
    AsyncStorage.setItem(langKey, l).catch(() => {});
  }
  function pickLevel(l: VideoLevel) {
    if (l === vlevel) return;
    halt();
    setPlaying(false);
    setEnded(false);
    setIdx(0);
    setScript(null);
    setComplete(false);
    setJob(null);
    setAudioSave(null);
    setVlevel(l);
    setVoiceOpen(false);
    AsyncStorage.setItem(levelKey, l).catch(() => {});
  }

  // شكل الشرائح: يُحفظ ويسري على كل الفيديوهات فورًا (عرض فقط — لا يعيد الصوت ولا يطلب شيئًا)
  const [look, setLook] = useSlideThemePref();
  // خطوط الشرائح تُحمَّل عند فتح الشاشة (لا في بداية التطبيق)؛ قبل اكتمالها تُرسم بخط النظام
  useEffect(() => {
    void preloadSlideFonts();
  }, []);

  // دوائر المشاهد: ظاهرة أو مخفية حسب آخر اختيار
  const [showDots, setShowDots] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem("vsf:video:dots").then((v) => v === "0" && setShowDots(false)).catch(() => {});
  }, []);
  function toggleDots() {
    setShowDots((v) => {
      AsyncStorage.setItem("vsf:video:dots", v ? "0" : "1").catch(() => {});
      return !v;
    });
  }

  // —— التجهيز ——
  const [job, setJob] = useState<VideoJob | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [complete, setComplete] = useState(false);
  const [runId, setRunId] = useState(0);
  // لوحة «قبل البدء» (قرار نهلة ٢٨ أكتوبر): لا يبدأ التجهيز تلقائيًا — تُختار اللغة والنوع ثم «البدء»
  const [setup, setSetup] = useState(false);
  const [have, setHave] = useState<Record<string, boolean>>({});
  const scriptRef = useRef<{ script: VideoScript | null; complete: boolean }>({ script: null, complete: false });
  scriptRef.current = { script, complete };

  useEffect(() => {
    let on = true;
    let un: (() => void) | undefined;
    setSetup(false);
    (async () => {
      if (!vlang || !vlevel) return;
      const cached = await getCachedVideo(pdfPath, src, vlang);
      if (!on) return;
      if (cached) {
        setScript(cached);
        setComplete(true);
        return;
      }
      // المتابعة من لحظة فتح الشاشة (أيًّا كان من بدأ التجهيز: هذه الشاشة، أو نسخة أخرى منها، أو الخلفية)
      const key = videoJobKey(pdfPath, src, vlang);
      let sawRunning = false; // نحتفل فقط بتوليد تابعناه الآن (لا عند فتح فيديو جاهز)
      un = watchVideoJob(key, (j) => {
        if (!on) return;
        setJob(j);
        if (j.script?.scenes.length) setScript(j.script);
        if (j.status === "running") sawRunning = true;
        if (j.status === "done") {
          setComplete(true);
          if (sawRunning) {
            sawRunning = false;
            celebrate({
              emoji: "🎬",
              title: t("video.ready.title"),
              subtitle: unitTitle ? `«${unitTitle}»` : undefined,
              body: t("video.ready.body"),
              primary: { text: `${t("video.play")} ▶️`, onPress: () => playFrom(0) },
              secondary: { text: t("addBook.success.later") },
            });
          }
        }
      });
      // لا يبدأ تلقائيًا: لوحة اللغة والنوع (وعلامة ✓ على ما حُفظ من فيديوهات هذه الوحدة)
      if (!hasVideoJob(pdfPath, src, vlang)) {
        const marks: Record<string, boolean> = {};
        await Promise.all(
          VIDEO_LANGS.flatMap((l) =>
            VIDEO_LEVELS.map((lv) =>
              getCachedVideo(pdfPath, lv === "strict" ? baseSrc : { ...baseSrc, level: lv }, l)
                .then((v) => void (marks[`${l}|${lv}`] = !!v))
                .catch(() => {})
            )
          )
        );
        if (!on) return;
        setHave(marks);
        setSetup(true);
      }
    })();
    return () => {
      on = false;
      un?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, runId, vlang, vlevel]);

  /** «البدء» من لوحة الإعداد: عدد الطلبات (كقرار ٢٠ أكتوبر) ثم التجهيز بالخلفية */
  async function startNow() {
    if (!vlang || !vlevel) return;
    const key = videoJobKey(pdfPath, src, vlang);
    const cost = await videoRequestCost(pdfPath, src, unitTitle, vlang).catch(() => null);
    if (cost && !(await confirmCost(cost.pending, "video", t, cost.estimated, key))) return;
    setSetup(false);
    const params: Record<string, string> = { pdf_path: pdfPath };
    for (const [k, v] of Object.entries({ unit, page, from, to, title, book_title })) if (typeof v === "string") params[k] = v;
    params.vlang = vlang;
    params.vlevel = vlevel;
    startVideoJob(pdfPath, src, unitTitle, { title: unitTitle || bookTitle, params }, vlang);
    saveVideoItem(true);
  }

  // اكتمل السيناريو → يظهر في «المحفوظات» (تبويب الملخّصات 🎬) للرجوع إليه
  // في «المحفوظات» من لحظة البدء (قيد التجهيز) ثم مكتملًا — طلب نهلة ٢٨ أكتوبر: «اذا انحفظ القاه في المحفوظات
  // علشان اطمئن ان شغلي محفوظ». لكل لغة ونوع عنصر مستقل (الشامل بالعربية بمفتاحه القديم كما كان)
  const saveVideoItem = (partial: boolean) => {
    if (!pdfPath || !vlang || !vlevel) return;
    const base = `video|${pdfPath}|${pageMode ? "p" + pageNum : rangeMode ? `r${fromN}-${toN}` : "u" + unitIdx}`;
    const plain = vlevel === "strict" && vlang === getCurrentLang();
    addSavedItem({
      key: plain ? base : `${base}|${vlevel}|${vlang}`,
      kind: "video",
      pdfPath,
      bookTitle,
      label: unitTitle || (pageMode ? String(pageNum) : ""),
      page: pageMode ? pageNum : undefined,
      unit: pageMode || rangeMode ? undefined : unitIdx,
      from: rangeMode ? fromN : undefined,
      to: rangeMode ? toN : undefined,
      level: vlevel,
      lang: vlang,
      partial,
      savedAt: Date.now(),
    });
  };
  useEffect(() => {
    if (complete) saveVideoItem(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // —— التشغيل ——
  const [idx, setIdx] = useState(0);
  // المشاهد المشاهَدة سابقًا (من أي جهاز)
  const [seen, setSeen] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (src.kind === "unit") void seenScenes(pdfPath, unitIdx).then(setSeen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, unitIdx]);
  const [playing, setPlaying] = useState(false);
  const [stage, setStage] = useState<"ask" | "think" | "reveal">("ask");
  const [thinkLeft, setThinkLeft] = useState(THINK_SECONDS);
  const [waitingMore, setWaitingMore] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rateIdx, setRateIdx] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [ambOpen, setAmbOpen] = useState(false);
  const amb = useAmbient();
  const [prog, setProg] = useState(0); // تقدّم نطق الراوي في المشهد الحالي (٠..١)
  const [full, setFull] = useState(false); // ملء الشاشة (مع دوران الجهاز)
  const [ctrls, setCtrls] = useState(true); // أزرار ملء الشاشة تختفي وحدها وتظهر بلمسة
  useEffect(() => {
    if (!full) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      return;
    }
    ScreenOrientation.unlockAsync().catch(() => {});
    setCtrls(true);
  }, [full]);
  useEffect(() => {
    if (!full || !ctrls || !playing) return;
    const id = setTimeout(() => setCtrls(false), 3500);
    return () => clearTimeout(id);
  }, [full, ctrls, playing]);
  useEffect(() => () => void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}), []);
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
    setProg(0);
    speakText(text, {
      voiceId: voiceRef.current,
      rate: rateRef.current,
      // تقدّم النطق الفعلي → تظهر النقاط والترجمة لحظة قولها
      onProgress: (f) => my === tokenRef.current && setProg(f),
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
      // «شوهد»: كل مشهد يُسجَّل لوحدته (يتزامن بين الأجهزة) فيظهر في تقدّم الوحدة
      if (src.kind === "unit") {
        markSeen(pdfPath, unitIdx, "v", k, done ? scenes.length : Math.max(scenes.length, k + 2));
        setSeen((s) => (s.has(k) ? s : new Set(s).add(k)));
      }
      // المشهدان التاليان يُجهَّزان صوتيًا أثناء الحالي (بلا فجوات)
      for (const j of [k + 1, k + 2]) if (scenes[j]) for (const line of sceneSpeech(scenes[j])) void prefetchText(line, { voiceId: voiceRef.current });
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
      void saveVideoAudio(scriptRef.current.script, voiceRef.current, (d, n) => setAudioSave(d >= n ? "saved" : { done: d, total: n })).catch(() => setAudioSave(null));
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
          await clearVideo(pdfPath, src, vlang ?? undefined);
          // الفيديو الجديد غير القديم: «شوهد» يبدأ من جديد (كان يبقى سجل القديم فيظهر تقدّم خاطئ)
          if (src.kind === "unit") resetVideoSeen(pdfPath, unitIdx);
          setSeen(new Set());
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
                await clearVideo(pdfPath, src, vlang ?? undefined);
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
  // إطار الفيديو ١٦:٩: يملأ عرض الشاشة (حتى ١١٠٠) — كل شيء ظاهر بلا تمرير
  const stageW = Math.min(winW - Spacing.lg * 2, 1100);
  const fullW = Math.min(winW, winH * (16 / 9));
  // ما ينطقه الراوي الآن (الشرح، أو الجواب بعد الكشف): منه تُحسب الترجمة كلمةً كلمة داخل الإطار
  const speech = playing && captions && cur ? (cur.kind === "check" && stage === "reveal" && cur.answer ? cur.answer : cur.narration) : null;
  const sceneTotal = complete ? scenes.length : Math.max(scenes.length, idx + 2);
  // دور المشهد (افتتاح، شرح، سؤال، خلاصة، «أسئلة الوحدة»، ختامي، تمرين) — يحدد شكله في «منوّع»
  const role = sceneRole(scenes, idx, [dict.ar["video.qTitle"], dict.en["video.qTitle"]], sceneTotal);

  const fmtEta = (sec: number) => {
    const m = Math.round(sec / 60);
    return sec < 60 ? t("summary.etaLess") : m <= 1 ? t("summary.etaMin", { n: 1 }) : t("summary.etaMins", { n: m });
  };
  const preparing = !scenes.length;
  const totalSecs = videoSeconds(scenes, RATES[rateIdx], 0, THINK_SECONDS);
  const leftSecs = videoSeconds(scenes, RATES[rateIdx], idx, THINK_SECONDS);
  const curSecs = cur ? videoSeconds([cur], RATES[rateIdx], 0, THINK_SECONDS) : 0;
  const elapsedSecs = Math.max(0, totalSecs - leftSecs + (cur?.kind === "check" ? 0 : prog * curSecs));
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
  // قبل بدء التجهيز (أثناء سؤال عدد الطلبات) لا تقدّم وهمي
  const prepPct = job ? (stageNow === "script" ? 0.5 : 0) + maxPct.current * 0.5 : 0;
  const fmtClock = (sec: number) => {
    const n = Math.max(0, Math.round(sec));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  };
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
          {setup && vlang && vlevel ? (
            <View style={{ alignSelf: "stretch", gap: 12 }}>
              <View style={[styles.prepIcon, { backgroundColor: pal.soft, alignSelf: "center" }]}>
                <Ionicons name="videocam-outline" size={34} color={pal.accent} />
              </View>
              <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>{t("video.lang")}</Text>
              <View style={[styles.voiceGrid, { flexDirection: dir.row }]}>
                {VIDEO_LANGS.map((l) => {
                  const on = l === vlang;
                  return (
                    <Pressable key={l} onPress={() => pickLang(l)} style={[styles.voiceChip, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}>
                      <Text style={[styles.voiceTxt, { color: on ? pal.onAccent : pal.ink }]}>
                        {VIDEO_LANG_NAMES[l]}
                        {have[`${l}|${vlevel}`] ? " ✓" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>{t("video.kind")}</Text>
              {VIDEO_LEVELS.map((lv) => {
                const on = lv === vlevel;
                return (
                  <Pressable
                    key={lv}
                    onPress={() => pickLevel(lv)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.kindRow, { flexDirection: dir.row, backgroundColor: on ? pal.soft : "transparent", borderColor: on ? pal.accent : pal.cardBorder }]}
                  >
                    <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? pal.accent : pal.dim} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.kindName, { color: pal.ink, textAlign: dir.textAlign }]}>
                        {t(`video.kind.${lv}`)}
                        {have[`${vlang}|${lv}`] ? `  ✓ ${t("video.kind.saved")}` : ""}
                      </Text>
                      <Text style={[styles.kindHint, { color: pal.dim, textAlign: dir.textAlign }]}>{t(`video.kind.${lv}Hint`)}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => void startNow()} style={[styles.primary, { backgroundColor: pal.accent, alignSelf: "stretch", alignItems: "center" }]}>
                <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("video.setup.start")}</Text>
              </Pressable>
            </View>
          ) : failed ? (
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
              <Text style={[styles.dim, { color: pal.dim }]}>{t("video.bgHint")}</Text>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* الشاشة */}
          <View style={{ justifyContent: "center" }}>
            {ended ? (
              <View style={[styles.endCard, { minHeight: Math.max(stageW * (9 / 16), 300) }]}>
                <LinearGradient colors={["#5B4BF5", "#2A9DF4"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                <Ionicons name="trophy-outline" size={52} color="#FFFFFF" />
                <Text style={styles.endTitle}>{t("video.endDone")}</Text>
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
            ) : cur ? (
              <Pressable onPress={() => setFull(true)} accessibilityLabel={t("video.fullscreen")} style={{ alignSelf: "center" }}>
                <VideoStage
                  contentLang={vlang ?? undefined}
                  scene={cur}
                  index={idx}
                  total={sceneTotal}
                  progress={playing ? prog : 1}
                  stage={stage}
                  thinkLeft={thinkLeft}
                  width={stageW}
                  look={look}
                  role={role}
                  speech={speech}
                  playing={playing}
                  unitTitle={script?.title || unitTitle}
                  reserveCorner={52}
                />
                <View style={styles.fsBtn}>
                  <Ionicons name="expand" size={18} color="#FFFFFF" />
                </View>
              </Pressable>
            ) : null}
          </View>

          {/* ⏱️ مدة الفيديو (كاملة قبل التشغيل، والمتبقي أثناءه) — لضبط وقت المذاكرة */}
          <View style={[styles.durRow, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
            <Ionicons name="time-outline" size={18} color={pal.accent} />
            <Text style={[styles.durTxt, { color: pal.ink }]}>
              {t(complete ? "video.duration" : "video.durationSoFar", { time: fmtDur(totalSecs) })}
            </Text>
            {(playing || idx > 0) && !ended ? (
              <Text style={[styles.durLeft, { color: pal.dim }]}>
                {fmtClock(elapsedSecs)} / {fmtClock(totalSecs)}
              </Text>
            ) : null}
          </View>

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
            {/* صوت الراوي وشكل الشرائح (الصف ممتلئ: زر واحد بشارة الشكل) */}
            <Pressable onPress={() => setVoiceOpen(true)} hitSlop={8} style={[styles.small, { backgroundColor: pal.soft }]} accessibilityLabel={t("video.voiceAndLook")}>
              <Ionicons name="mic-outline" size={20} color={pal.ink} />
              <View style={[styles.lookBadge, { backgroundColor: pal.accent, borderColor: pal.bg }]}>
                <Ionicons name="color-palette" size={8} color={pal.onAccent} />
              </View>
            </Pressable>
          </View>
          <Modal visible={voiceOpen} transparent animationType="slide" onRequestClose={() => setVoiceOpen(false)}>
            <Pressable style={styles.voiceMask} onPress={() => setVoiceOpen(false)}>
              <Pressable style={[styles.voiceSheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]} onPress={() => {}}>
                <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
                {/* لغة الشرح: يُكتب الشرح ويُقرأ بها (فيديو كل لغة محفوظ وحده) */}
                <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>{t("video.lang")}</Text>
                <Text style={[styles.statusDim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("video.langHint")}</Text>
                <View style={[styles.voiceGrid, { flexDirection: dir.row }]}>
                  {VIDEO_LANGS.map((l) => {
                    const on = l === vlang;
                    return (
                      <Pressable
                        key={l}
                        onPress={() => pickLang(l)}
                        style={[styles.voiceChip, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}
                      >
                        <Text style={[styles.voiceTxt, { color: on ? pal.onAccent : pal.ink }]}>{VIDEO_LANG_NAMES[l]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>{t("video.kind")}</Text>
                <View style={[styles.voiceGrid, { flexDirection: dir.row }]}>
                  {VIDEO_LEVELS.map((lv) => {
                    const on = lv === vlevel;
                    return (
                      <Pressable key={lv} onPress={() => pickLevel(lv)} style={[styles.voiceChip, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}>
                        <Text style={[styles.voiceTxt, { color: on ? pal.onAccent : pal.ink }]}>{t(`video.kind.${lv}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.sheetSep, { backgroundColor: pal.cardBorder }]} />
                {/* شكل الشرائح: يُطبَّق فورًا دون إغلاق النافذة ودون إعادة الصوت */}
                <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>{t("video.look")}</Text>
                <Text style={[styles.statusDim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("video.lookHint")}</Text>
                <View style={[styles.lookGrid, { flexDirection: dir.row }]}>
                  {THEME_PREFS.map((k) => {
                    const on = look === k;
                    const pv = LOOK_PREVIEW[k];
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setLook(k)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${t(`video.look.${k}`)}، ${t(`video.look.${k}Hint`)}`}
                        style={[styles.lookCard, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: on ? pal.accent : pal.cardBorder }, on && styles.lookCardOn]}
                      >
                        <LinearGradient colors={pv.colors} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.lookPreview}>
                          <Ionicons name={pv.icon} size={22} color={pv.tint} />
                        </LinearGradient>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.lookName, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
                            {t(`video.look.${k}`)}
                          </Text>
                          <Text style={[styles.lookHint, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {t(`video.look.${k}Hint`)}
                          </Text>
                        </View>
                        {on ? (
                          <View style={[styles.lookCheck, { backgroundColor: pal.accent, [dir.isRTL ? "left" : "right"]: 6 }]}>
                            <Ionicons name="checkmark" size={12} color={pal.onAccent} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.sheetSep, { backgroundColor: pal.cardBorder }]} />
                <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>{t("video.voice")}</Text>
                <Text style={[styles.statusDim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("video.voiceHint")}</Text>
                <View style={[styles.voiceGrid, { flexDirection: dir.row }]}>
                  {VOICE_CATALOG.filter((v) => (v.lang ?? "ar") === "ar").map((v) => {
                    const on = v.voiceId === voiceId;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          pickVoice(v.voiceId);
                          void speakText(t("video.voiceSample"), { voiceId: v.voiceId }).catch(() => {});
                        }}
                        style={[styles.voiceChip, { backgroundColor: on ? pal.accent : pal.soft, borderColor: on ? pal.accent : pal.cardBorder }]}
                      >
                        <Ionicons name={v.gender === "female" ? "woman-outline" : "man-outline"} size={15} color={on ? pal.onAccent : pal.dim} />
                        <Text style={[styles.voiceTxt, { color: on ? pal.onAccent : pal.ink }]}>{v.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* حالة التجهيز والحفظ */}
          <SceneCard style={{ gap: 8 }}>
            <Text style={[styles.status, { color: pal.ink, textAlign: dir.textAlign }]}>
              {complete ? t("video.scenes", { n: scenes.length }) : job?.etaSec ? `${t("video.writing")} · ${t("summary.eta", { time: fmtEta(job.etaSec) })}` : t("video.writing")}
            </Text>
            {/* المشاهد: المشاهَد ✓ بلون واضح، والحالي بإطار — الضغط يشغّل من المشهد */}
            {src.kind === "unit" && scenes.length ? (
              <>
                {/* إظهار/إخفاء دوائر المشاهد (طلب نهلة) — يُحفظ الاختيار */}
                <Pressable onPress={toggleDots} hitSlop={8} style={[styles.dotsToggle, { flexDirection: dir.row }]} accessibilityRole="button">
                  <Text style={[styles.statusDim, { color: pal.dim, textAlign: dir.textAlign, flex: 1 }]}>
                    {t("video.seenCount", { n: [...seen].filter((k) => k < scenes.length).length, total: scenes.length })}
                  </Text>
                  <Text style={[styles.dotsToggleTxt, { color: pal.accent }]}>{showDots ? t("video.dotsHide") : t("video.dotsShow")}</Text>
                  <Ionicons name={showDots ? "chevron-up" : "chevron-down"} size={16} color={pal.accent} />
                </Pressable>
                {showDots ? (
                <View style={[styles.seenRow, { flexDirection: dir.row }]}>
                  {scenes.map((_, k) => {
                    const on = seen.has(k);
                    return (
                      <Pressable
                        key={k}
                        onPress={() => playFrom(k)}
                        hitSlop={4}
                        accessibilityLabel={t("video.sceneN", { n: k + 1 })}
                        style={[styles.seenDot, { backgroundColor: on ? pal.accent : pal.track, borderColor: k === idx ? pal.ink : "transparent" }]}
                      >
                        {on ? <Ionicons name="checkmark" size={11} color={pal.onAccent} /> : <Text style={[styles.seenNum, { color: pal.dim }]}>{k + 1}</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                ) : null}
              </>
            ) : null}
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
          {complete ? (
            <Pressable onPress={() => router.push({ pathname: "/unit-quiz", params: quizParams })} style={[styles.primary, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
              <Ionicons name="school-outline" size={18} color={pal.onAccent} />
              <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("video.startQuiz")}</Text>
            </Pressable>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      {/* ملء الشاشة: الإطار بأكبر مقاس يناسب الشاشة (يدعم الدوران)، والأزرار تظهر بلمسة وتختفي وحدها */}
      <Modal visible={full} animationType="fade" supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]} onRequestClose={() => setFull(false)}>
        <Pressable style={styles.fsWrap} onPress={() => setCtrls((v) => !v)}>
          {cur && !ended ? (
            <VideoStage
                  contentLang={vlang ?? undefined}
              scene={cur}
              index={idx}
              total={sceneTotal}
              progress={playing ? prog : 1}
              stage={stage}
              thinkLeft={thinkLeft}
              width={fullW}
              look={look}
              role={role}
              speech={speech}
              playing={playing}
              unitTitle={script?.title || unitTitle}
              reserveCorner={0}
            />
          ) : (
            <Text style={styles.fsEnd}>{t("video.endDone")}</Text>
          )}
          {ctrls ? (
            <View style={styles.fsCtrls} pointerEvents="box-none">
              <Pressable onPress={() => setFull(false)} hitSlop={10} style={[styles.fsClose, { [dir.isRTL ? "left" : "right"]: 20 }]}>
                <Ionicons name="contract" size={22} color="#FFFFFF" />
              </Pressable>
              <View style={[styles.fsBar, { flexDirection: dir.row }]}>
                <Pressable onPress={() => jump(idx - 1)} hitSlop={10}>
                  <Ionicons name={dir.isRTL ? "play-skip-forward" : "play-skip-back"} size={26} color="#FFFFFF" />
                </Pressable>
                <Pressable onPress={togglePlay} hitSlop={10} style={styles.fsPlay}>
                  <Ionicons name={playing ? "pause" : "play"} size={32} color="#0F172A" />
                </Pressable>
                <Pressable onPress={() => jump(idx + 1)} hitSlop={10}>
                  <Ionicons name={dir.isRTL ? "play-skip-back" : "play-skip-forward"} size={26} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.fsTime}>
                  {fmtClock(elapsedSecs)} / {fmtClock(totalSecs)}
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Modal>
      <AmbientSheet visible={ambOpen} onClose={() => setAmbOpen(false)} amb={amb} />
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  kindRow: { alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  kindName: { fontSize: 15, fontWeight: "800" },
  kindHint: { fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
  seenRow: { flexWrap: "wrap", gap: 6 },
  dotsToggle: { alignItems: "center", gap: 6 },
  voiceMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  voiceSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34, gap: 10, borderWidth: StyleSheet.hairlineWidth, maxHeight: "70%", maxWidth: 620, width: "100%", alignSelf: "center" },
  voiceGrid: { flexWrap: "wrap", gap: 8 },
  lookBadge: { position: "absolute", top: 4, right: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  lookGrid: { flexWrap: "wrap", gap: 10 },
  lookCard: { width: "48.4%", height: 84, borderRadius: 18, borderWidth: 1.5, padding: 10, gap: 10, alignItems: "center" },
  lookCardOn: { borderWidth: 2.5 },
  lookPreview: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  lookName: { fontSize: 15, fontWeight: "900" },
  lookHint: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  lookCheck: { position: "absolute", top: 6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sheetSep: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  voiceChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  voiceTxt: { fontSize: 14.5, fontWeight: "800" },
  dotsToggleTxt: { fontSize: 13, fontWeight: "800" },
  seenDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  seenNum: { fontSize: 10.5, fontWeight: "800" },
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
  fsBtn: { position: "absolute", top: 10, left: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  fsWrap: { flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  fsEnd: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  fsCtrls: { ...StyleSheet.absoluteFillObject },
  fsClose: { position: "absolute", top: 40, width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  fsBar: { position: "absolute", bottom: 36, alignSelf: "center", alignItems: "center", gap: 26, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 26, paddingVertical: 12, borderRadius: 999 },
  fsPlay: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  fsTime: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
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
