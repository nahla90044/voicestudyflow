// app/unit-summary.tsx
// صفحة مستقلة لملخّص الوحدة (بدل النافذة) — تُشبه صفحة البطاقات: عنوان الوحدة،
// نص الملخّص في بطاقة، وزر استماع. يُولَّد مرة واحدة ويُخزَّن (بلا استهلاك ذكاء متكرر).
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { celebrate } from "../components/brand/feedback-host";
import { SceneBanner, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { SummaryView } from "../components/brand/summary-view";
import { useDir, useI18n } from "../lib/i18n";
import { addSavedItem, removeSavedItem } from "../lib/savedStudy";
import { addSave, bookIdForPdf, sharePdf } from "../lib/studySaves";
import { summaryHtml, summaryToText, type StudySummary } from "../lib/studySummary";
import { clearSummary, getCachedSummary, SUMMARY_LEVELS, summaryCacheKey, summaryRange, summaryRequestCost, type SummaryLevel, type SummarySource } from "../lib/unitSummary";
import { confirmCost } from "../lib/costConfirm";
import { hasSummaryJob, startSummaryJob, summaryJobKey, watchSummaryJob } from "../lib/summaryJobs";
import { getUnitContent } from "../lib/unitContent";
import { markSummaryHeard } from "../lib/readiness";
import { useScene } from "../lib/scene";
import { playSummary, saveSummaryAudio, stopSummary, summaryChunks } from "../lib/summaryAudio";
import { markSeen } from "../lib/studyTrack";
import { AmbientSheet, useAmbient } from "../components/brand/ambient-sheet";

export default function UnitSummaryScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, unit, page, from, to, title, book_title, level } = useLocalSearchParams<{ pdf_path?: string; unit?: string; page?: string; from?: string; to?: string; title?: string; book_title?: string; level?: string }>();
  // مستوى الملخّص: من المعامل، وإلا يُعرض اختيار المستويات الثلاثة (✓ للجاهز منها)
  const [lvl, setLvl] = useState<SummaryLevel | null>(SUMMARY_LEVELS.includes(level as SummaryLevel) ? (level as SummaryLevel) : null);
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const unitIdx = Number(unit ?? 0) || 0;
  const pageNum = Number(page);
  const pageMode = Number.isFinite(pageNum) && pageNum > 0; // من القارئ (صفحة) بدل وحدة منهج
  // نطاق صفحات (وحدة من القارئ بلا منهج): from/to
  const fromN = Number(from);
  const toN = Number(to);
  const rangeMode = !pageMode && fromN > 0 && toN >= fromN;
  const src: SummarySource = { ...(pageMode ? { kind: "page" as const, page: pageNum } : rangeMode ? { kind: "range" as const, from: fromN, to: toN } : { kind: "unit" as const, unit: unitIdx }), level: lvl ?? "strict" };
  // أي المستويات جاهز لهذا المصدر (لعلامة ✓ في الاختيار)
  const [readyLv, setReadyLv] = useState<SummaryLevel[]>([]);
  useEffect(() => {
    if (lvl) return;
    void Promise.all(SUMMARY_LEVELS.map((l) => getCachedSummary(pdfPath, { ...src, level: l }).then((x) => (x ? l : null)))).then((r) => setReadyLv(r.filter(Boolean) as SummaryLevel[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lvl, pdfPath]);
  const savedKey = `summary|${pdfPath}|${pageMode ? "p" + pageNum : "u" + unitIdx}${lvl && lvl !== "strict" ? "|" + lvl : ""}`;
  const { id: srcId, kind } = summaryCacheKey(src);
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;
  /** ملخّص فيديو للوحدة نفسها (يُبنى من هذا الملخّص) */
  function openVideo() {
    const params: Record<string, string> = { pdf_path: pdfPath };
    for (const [k, v] of Object.entries({ unit, page, from, to, title, book_title })) if (typeof v === "string") params[k] = v;
    router.push({ pathname: "/unit-video", params });
  }

  const [loading, setLoading] = useState(true);
  const [sum, setSum] = useState<StudySummary | null>(null);
  const text = sum ? summaryToText(sum) : "";
  const [err, setErr] = useState("");
  const [streaming, setStreaming] = useState(false); // الأقسام تظهر أولًا بأول
  const [prog, setProg] = useState<{ done: number; total: number; etaSec: number | null; waiting: boolean } | null>(null);
  const [incomplete, setIncomplete] = useState(false); // ظهر جزء وما اكتمل الباقي (يُكمَل من الأجزاء المحفوظة)
  const [playing, setPlaying] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fmtEta = (sec: number) => {
    const m = Math.round(sec / 60);
    return sec < 60 ? t("summary.etaLess") : m <= 1 ? t("summary.etaMin", { n: 1 }) : t("summary.etaMins", { n: m });
  };
  const docTitle = `${t("syllabus.summary.label")}${lvl ? ` (${t(`summary.level.${lvl}`)})` : ""}${unitTitle ? ` — ${unitTitle}` : ""}`;

  /** حفظ الملخّص في «محفوظات الكتاب» (تبويب المحفوظات في صفحة الكتاب) */
  async function onSave() {
    if (!text || saveBusy || saved) return;
    setSaveBusy(true);
    try {
      const bookId = await bookIdForPdf(pdfPath);
      if (!bookId) throw new Error("NO_BOOK");
      await addSave({
        book_id: bookId,
        kind: "assistant",
        title: docTitle,
        scope: pageMode ? "page" : "unit",
        page_from: pageMode ? pageNum : null,
        page_to: pageMode ? pageNum : null,
        content: { text, summary: sum ?? undefined },
      });
      setSaved(true);
      // صوت الملخّص يُحفظ على الجهاز معه (في الخلفية) — للاستماع لاحقًا من «المحفوظات» بلا انتظار ولا إنترنت
      if (sum && lvl === "brief") void saveSummaryAudio(sum).catch(() => {});
      Alert.alert(t("save.savedTitle"), lvl === "brief" ? t("summary.savedWithAudio") : t("save.savedBody"));
    } catch {
      Alert.alert(t("save.failedTitle"), t("save.failedBody"));
    } finally {
      setSaveBusy(false);
    }
  }
  async function onPdf() {
    if (!sum) return;
    try {
      if (sum) await sharePdf(summaryHtml({ bookTitle, title: docTitle, summary: sum, rtl: dir.isRTL }), docTitle);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    }
  }

  // التلخيص مهمة خلفية (lib/summaryJobs): الخروج من هنا لا يوقفه، والعودة تتصل بنفس المهمة.
  // كل جزء يُحفظ فور اكتماله، فانقطاع الاتصال (قفل الشاشة) لا يضيّع ما ظهر.
  const [runId, setRunId] = useState(0);
  function pickLevel(l: SummaryLevel) {
    setSum(null);
    setErr("");
    setIncomplete(false);
    setSaved(false);
    setLoading(true);
    setLvl(l);
  }
  // صفحات الكتاب التي يغطيها الملخّص — ليعرف الطالب هل غطّى الدرس كله
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    summaryRange(pdfPath, src).then(setRange).catch(() => setRange(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, srcId, kind]);

  /** إعادة التلخيص: نفس الصفحات، أو صفحات يحددها الطالب (إن كانت حدود الدرس ناقصة) */
  function onRedo() {
    const restart = async () => {
      stopSummary();
      setPlaying(false);
      await clearSummary(pdfPath, src);
      setSum(null);
      setSaved(false);
      setIncomplete(false);
      setErr("");
      setLoading(true);
      setRunId((n) => n + 1);
    };
    Alert.alert(t("summary.redo.title"), t("summary.redo.body"), [
      { text: t("summary.redo.same"), onPress: () => void restart() },
      {
        text: t("summary.level.change"),
        onPress: () => {
          stopSummary();
          setPlaying(false);
          setLvl(null);
        },
      },
      {
        text: t("summary.delete"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("summary.delete"), t("summary.deleteBody"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.delete"),
              style: "destructive",
              onPress: async () => {
                stopSummary();
                await clearSummary(pdfPath, src);
                await removeSavedItem(savedKey);
                router.back();
              },
            },
          ]),
      },
      {
        text: t("summary.redo.pages"),
        onPress: () =>
          Alert.prompt(
            t("summary.redo.pagesTitle"),
            t("summary.redo.pagesBody"),
            async (v) => {
              const m = String(v ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/(\d+)\D+(\d+)/);
              if (!m) return;
              const a = Math.min(Number(m[1]), Number(m[2]));
              const b = Math.max(Number(m[1]), Number(m[2]));
              if (!(a > 0)) return;
              await clearSummary(pdfPath, { kind: "range", from: a, to: b });
              stopSummary();
              router.replace({ pathname: "/unit-summary", params: { pdf_path: pdfPath, from: String(a), to: String(b), title: unitTitle, book_title: bookTitle, level: lvl ?? "strict" } });
            },
            "plain-text",
            range ? `${range.from}-${range.to}` : "",
            "numbers-and-punctuation"
          ),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }
  useEffect(() => {
    let on = true;
    let unwatch: (() => void) | undefined;
    if (!lvl) {
      setLoading(false); // اختيار المستوى أولًا
      return;
    }
    (async () => {
      const cached = await getUnitContent<StudySummary>(pdfPath, srcId, kind);
      if (!on) return;
      if (cached?.sections?.length) {
        setSum(cached);
        setLoading(false);
        return;
      }
      // المتابعة من لحظة فتح الشاشة (أيًّا كان من بدأ التوليد)، ثم عدد الطلبات، ثم البدء
      const jobKey = summaryJobKey(pdfPath, src);
      let sawRunning = false; // نحتفل فقط بتوليد تابعناه الآن (لا عند فتح ملخص جاهز)
      unwatch = watchSummaryJob(jobKey, (j) => {
        if (!on) return;
        if (j.status === "running") sawRunning = true;
        if (j.status === "done" && j.result && sawRunning) {
          sawRunning = false;
          celebrate({
            emoji: "📝",
            title: t("summary.ready.title"),
            subtitle: unitTitle ? `«${unitTitle}»` : undefined,
            body: t("summary.ready.body"),
            primary: { text: `${t("summary.ready.read")} 📖` },
            secondary: { text: t("summary.ready.video"), onPress: () => openVideo() },
          });
        }
        if (j.soFar?.sections.length || j.soFar?.title) {
          setSum(j.soFar);
          setLoading(false);
        }
        setProg(j.status === "running" ? { done: j.done, total: j.total, etaSec: j.etaSec, waiting: j.waiting } : null);
        setStreaming(j.status === "running");
        if (j.status === "running") return;
        setLoading(false);
        if (j.status === "done" && j.result) setSum(j.result);
        else if (j.soFar?.sections.length) setIncomplete(true);
        else setErr(j.status === "quota" ? t("pay.reason.ai") : t("syllabus.err.summary"));
      });
      if (!hasSummaryJob(pdfPath, src)) {
        const cost = await summaryRequestCost(pdfPath, src).catch(() => null);
        if (!on) return;
        if (cost && !(await confirmCost(cost.pending, "summary", t, false, jobKey))) {
          if (on && router.canGoBack()) router.back();
          return;
        }
      }
      if (!on) return;
      const params: Record<string, string> = { pdf_path: pdfPath };
      for (const [k, v] of Object.entries({ unit, page, from, to, title, book_title })) if (typeof v === "string") params[k] = v;
      startSummaryJob(pdfPath, src, { title: unitTitle || bookTitle, params });
      setIncomplete(false);
      setErr("");
    })();
    return () => {
      on = false;
      unwatch?.();
      stopSummary();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, srcId, kind, runId, lvl]);

  // سجّل العنصر في المحفوظات (يظهر في تبويب البطاقات → ملخّصات) متى توفّر المحتوى
  useEffect(() => {
    if (!text || !pdfPath) return;
    addSavedItem({
      key: savedKey,
      kind: "summary",
      level: lvl ?? undefined,
      pdfPath,
      bookTitle,
      label: unitTitle || (pageMode ? String(pageNum) : ""),
      page: pageMode ? pageNum : undefined,
      unit: pageMode ? undefined : unitIdx,
      savedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // الاستماع متاح أثناء كتابة الملخّص: يقرأ الأقسام المكتملة بالترتيب وينتظر الجديد حتى الاكتمال
  const liveRef = useRef<{ sum: StudySummary | null; streaming: boolean }>({ sum: null, streaming: false });
  liveRef.current = { sum, streaming };
  const [listenWait, setListenWait] = useState(false);
  function liveChunks() {
    const { sum: s0, streaming: st } = liveRef.current;
    if (!s0) return { chunks: [], final: !st };
    if (!st) return { chunks: summaryChunks(s0), final: true };
    // آخر قسم ما زال يُكتب → لا يُقرأ بعد، وآخر مقطع قد يكبر → ننتظره أيضًا
    const ready = summaryChunks({ ...s0, sections: s0.sections.slice(0, -1), keypoints: [] });
    return { chunks: ready.slice(0, -1), final: false };
  }

  function togglePlay() {
    if (playing) {
      stopSummary();
      setPlaying(false);
      setListenWait(false);
    } else if (sum) {
      setPlaying(true);
      void markSummaryHeard(pdfPath); // خطوة «ملخص صوتي» في مسار اليوم تُشطب
      // مقطعًا مقطعًا بالترتيب: الملخّص الطويل يُسمع كاملًا (كان يُرسل دفعة واحدة فيُقص بعد ٥٠٠٠ حرف)
      playSummary(liveChunks, 0, {
        // «سُمع»: كل مقطع يُسجَّل لوحدته فيظهر في تقدّم الوحدة
        onIndex: (i) => {
          if (src.kind === "unit") markSeen(pdfPath, unitIdx, "s", i, liveChunks().chunks.length);
        },
        onWaiting: setListenWait,
        onDone: () => {
          setPlaying(false);
          setListenWait(false);
        },
      });
    }
  }

  // 🎧 أصوات الأجواء أثناء المذاكرة (مطر، بحر، موسيقى…) — تُمزج مع صوت الملخّص
  const [ambOpen, setAmbOpen] = useState(false);
  const amb = useAmbient();

  return (
    <SceneScreen>
      <SceneBanner
        title={t("syllabus.summary.label")}
        subtitle={unitTitle || bookTitle || undefined}
        height={170}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          // السماعة: أصوات الأجواء أثناء المذاكرة (كما في النسخة السابقة)
          <Pressable onPress={() => setAmbOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("summary.ambient.title")}>
            <SceneIconButton>
              <Ionicons name={amb.key ? "musical-notes" : "headset"} size={20} color={pal.accent} />
            </SceneIconButton>
          </Pressable>
        }
      />

      {!lvl ? (
        // اختيار المستوى: مختصر (للاستماع) · شامل · موسّع — كل مستوى يُحفظ وحده، و✓ للجاهز
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.modeTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("summary.level.title")}</Text>
          {SUMMARY_LEVELS.map((m) => (
            <Pressable
              key={m}
              onPress={() => pickLevel(m)}
              style={({ pressed }) => [styles.modeCard, { backgroundColor: pal.card, borderColor: readyLv.includes(m) ? "#15803D" : pal.cardBorder, opacity: pressed ? 0.85 : 1, flexDirection: dir.row }]}
            >
              <View style={[styles.modeIcon, { backgroundColor: pal.soft }]}>
                <Ionicons name={m === "brief" ? "headset-outline" : m === "strict" ? "book-outline" : "layers-outline"} size={22} color={pal.accent} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.modeName, { color: pal.ink, textAlign: dir.textAlign }]}>{t(`summary.level.${m}`)}</Text>
                <Text style={[styles.modeDesc, { color: pal.dim, textAlign: dir.textAlign }]}>{t(`summary.level.${m}Desc`)}</Text>
              </View>
              {readyLv.includes(m) ? <Ionicons name="checkmark-circle" size={22} color="#15803D" /> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : loading && !sum ? (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("summary.preparing")}</Text>
          {prog?.etaSec ? <Text style={[styles.eta, { color: pal.ink }]}>{t("summary.eta", { time: fmtEta(prog.etaSec) })}</Text> : null}
          <Text style={[styles.hint, { color: pal.dim }]}>{t("summary.bgHint")}</Text>
        </View>
      ) : err ? (
        <View style={styles.center}>
          <View style={[styles.errIcon, { backgroundColor: pal.soft }]}>
            <Ionicons name="alert-circle-outline" size={34} color={pal.accent} />
          </View>
          <Text style={[styles.dim, { color: pal.dim }]}>{err}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* المستوى الحالي، وتغييره */}
          <Pressable onPress={() => { stopSummary(); setPlaying(false); setLvl(null); }} style={[styles.levelChip, { flexDirection: dir.row, borderColor: pal.cardBorder, backgroundColor: pal.soft }]}>
            <Ionicons name={lvl === "brief" ? "headset-outline" : lvl === "expand" ? "layers-outline" : "book-outline"} size={16} color={pal.accent} />
            <Text style={[styles.levelTxt, { color: pal.ink }]}>{t(`summary.level.${lvl ?? "strict"}`)}</Text>
            <Text style={[styles.levelChange, { color: pal.accent }]}>{t("summary.level.switch")}</Text>
          </Pressable>
          {/* الصوت على «المختصر» فقط (قرار نهلة): الشامل والموسّع للقراءة والطباعة */}
          {lvl === "brief" ? (
            <Pressable
              onPress={togglePlay}
              style={({ pressed }) => [styles.playBtn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name={playing ? "pause" : "play"} size={20} color={pal.onAccent} />
              <Text style={[styles.playTxt, { color: pal.onAccent }]}>
                {playing ? (listenWait ? t("summary.listenWait") : t("syllabus.summary.pause")) : t("syllabus.summary.listen")}
              </Text>
            </Pressable>
          ) : null}

          {/* 🎬 ملخّص فيديو للوحدة نفسها (يُبنى من هذا الملخّص) */}
          <Pressable
            onPress={openVideo}
            style={({ pressed }) => [styles.saveBtn, { flex: 0, flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder, opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="videocam" size={18} color={pal.accent} />
            <Text style={[styles.saveTxt, { color: pal.ink }]}>{t("video.open")}</Text>
          </Pressable>

          {/* حفظ في «محفوظات الكتاب» + ملف PDF */}
          <View style={[styles.saveRow, { flexDirection: dir.row }]}>
            <Pressable
              onPress={onSave}
              disabled={saveBusy || saved || streaming}
              style={({ pressed }) => [styles.saveBtn, streaming && { opacity: 0.5 }, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              {saveBusy ? (
                <ActivityIndicator size="small" color={pal.accent} />
              ) : (
                <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={18} color={pal.accent} />
              )}
              <Text style={[styles.saveTxt, { color: pal.ink }]}>{saved ? t("save.savedTitle") : t("save.save")}</Text>
            </Pressable>
            <Pressable
              onPress={onPdf}
              disabled={streaming}
              style={({ pressed }) => [styles.saveBtn, streaming && { opacity: 0.5 }, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="document-text-outline" size={18} color={pal.accent} />
              <Text style={[styles.saveTxt, { color: pal.ink }]}>{t("save.pdf")}</Text>
            </Pressable>
          </View>

          {range && range.from !== range.to ? (
            <Text style={[styles.dim, { color: pal.dim }]}>{t("summary.coverage", { from: range.from, to: range.to, n: range.to - range.from + 1 })}</Text>
          ) : null}
          {sum ? <SummaryView summary={sum} bookTitle={unitTitle || bookTitle} /> : null}
          {sum && !streaming ? (
            <Pressable
              onPress={onRedo}
              style={({ pressed }) => [styles.saveBtn, { flex: 0, flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="refresh" size={18} color={pal.accent} />
              <Text style={[styles.saveTxt, { color: pal.ink }]}>{t("summary.redo.title")}</Text>
            </Pressable>
          ) : null}
          {streaming ? (
            <View style={[styles.writing, { backgroundColor: pal.soft }]}>
              <View style={{ flexDirection: dir.row, alignItems: "center", gap: 10 }}>
                <ActivityIndicator size="small" color={pal.accent} />
                <Text style={[styles.dim, { color: pal.dim }]}>
                  {prog?.waiting
                    ? t("summary.waiting")
                    : prog && prog.total > 1
                      ? t("summary.writingPart", { n: prog.done, total: prog.total })
                      : t("summary.writingRest")}
                </Text>
              </View>
              {prog?.etaSec != null && prog.etaSec > 0 && !prog.waiting ? (
                <Text style={[styles.eta, { color: pal.ink }]}>{t("summary.eta", { time: fmtEta(prog.etaSec) })}</Text>
              ) : null}
              <Text style={[styles.hint, { color: pal.dim }]}>{t("summary.bgHint")}</Text>
            </View>
          ) : incomplete ? (
            <View style={[styles.writing, { backgroundColor: pal.soft }]}>
              <Text style={[styles.dim, { color: pal.dim }]}>{t("summary.incomplete")}</Text>
              <Pressable onPress={() => setRunId((n) => n + 1)} style={({ pressed }) => [styles.resumeBtn, { backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={[styles.playTxt, { color: pal.onAccent }]}>{t("summary.resume")}</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      <AmbientSheet visible={ambOpen} onClose={() => setAmbOpen(false)} amb={amb} />
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  levelChip: { alignSelf: "flex-start", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  levelTxt: { fontSize: 13.5, fontWeight: "900" },
  levelChange: { fontSize: 13, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 12 },
  errIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  dim: { fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 22 },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: Spacing.lg },
  unitTitle: { fontSize: 18, fontWeight: "900", lineHeight: 28, marginBottom: 10 },
  playBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: Radius.pill,
  },
  playTxt: { fontSize: 16, fontWeight: "900" },
  card: { padding: Spacing.lg },
  writing: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: Radius.lg },
  eta: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  hint: { fontSize: 13, fontWeight: "600", textAlign: "center", lineHeight: 20 },
  modeTitle: { fontSize: 18, fontWeight: "900" },
  modeCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: 16, gap: 14, alignItems: "center" },
  modeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  modeName: { fontSize: 16, fontWeight: "900" },
  modeDesc: { fontSize: 13.5, lineHeight: 21, fontWeight: "600" },
  resumeBtn: { height: 46, paddingHorizontal: 26, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center" },
  saveRow: { gap: 10 },
  saveBtn: { flex: 1, height: 48, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { fontSize: 15, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 30 },
});
