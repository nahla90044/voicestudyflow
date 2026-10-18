// app/unit-summary.tsx
// صفحة مستقلة لملخّص الوحدة (بدل النافذة) — تُشبه صفحة البطاقات: عنوان الوحدة،
// نص الملخّص في بطاقة، وزر استماع. يُولَّد مرة واحدة ويُخزَّن (بلا استهلاك ذكاء متكرر).
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { SummaryView } from "../components/brand/summary-view";
import { useDir, useI18n } from "../lib/i18n";
import { addSavedItem } from "../lib/savedStudy";
import { addSave, bookIdForPdf, sharePdf } from "../lib/studySaves";
import { summaryHtml, summaryToSpeech, summaryToText, type StudySummary } from "../lib/studySummary";
import { summaryCacheKey, type SummarySource } from "../lib/unitSummary";
import { startSummaryJob, watchSummaryJob } from "../lib/summaryJobs";
import { getUnitContent } from "../lib/unitContent";
import { markSummaryHeard } from "../lib/readiness";
import { useScene } from "../lib/scene";
import { playSummary, saveSummaryAudio, stopSummary, summaryChunks } from "../lib/summaryAudio";

// يزيل رموز الماركداون إن ظهرت (عنوان #، عريض **، خطوط ---، شفرة `) → نص نظيف
function stripMarkdown(s: string): string {
  return String(s || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/`+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function UnitSummaryScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, unit, page, from, to, title, book_title } = useLocalSearchParams<{ pdf_path?: string; unit?: string; page?: string; from?: string; to?: string; title?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const unitIdx = Number(unit ?? 0) || 0;
  const pageNum = Number(page);
  const pageMode = Number.isFinite(pageNum) && pageNum > 0; // من القارئ (صفحة) بدل وحدة منهج
  // نطاق صفحات (وحدة من القارئ بلا منهج): from/to
  const fromN = Number(from);
  const toN = Number(to);
  const rangeMode = !pageMode && fromN > 0 && toN >= fromN;
  const src: SummarySource = pageMode ? { kind: "page", page: pageNum } : rangeMode ? { kind: "range", from: fromN, to: toN } : { kind: "unit", unit: unitIdx };
  const { id: srcId, kind } = summaryCacheKey(src);
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

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
  const docTitle = `${t("syllabus.summary.label")}${unitTitle ? ` — ${unitTitle}` : ""}`;

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
      if (sum) void saveSummaryAudio(sum).catch(() => {});
      Alert.alert(t("save.savedTitle"), t("summary.savedWithAudio"));
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
  useEffect(() => {
    let on = true;
    let unwatch: (() => void) | undefined;
    (async () => {
      const cached = await getUnitContent<StudySummary>(pdfPath, srcId, kind);
      if (!on) return;
      if (cached?.sections?.length) {
        setSum(cached);
        setLoading(false);
        return;
      }
      const params: Record<string, string> = { pdf_path: pdfPath };
      for (const [k, v] of Object.entries({ unit, page, from, to, title, book_title })) if (typeof v === "string") params[k] = v;
      const key = startSummaryJob(pdfPath, src, { title: unitTitle || bookTitle, params });
      setIncomplete(false);
      setErr("");
      unwatch = watchSummaryJob(key, (j) => {
        if (!on) return;
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
        else setErr(t("syllabus.err.summary"));
      });
    })();
    return () => {
      on = false;
      unwatch?.();
      stopSummary();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, srcId, kind, runId]);

  // سجّل العنصر في المحفوظات (يظهر في تبويب البطاقات → ملخّصات) متى توفّر المحتوى
  useEffect(() => {
    if (!text || !pdfPath) return;
    addSavedItem({
      key: `summary|${pdfPath}|${pageMode ? "p" + pageNum : "u" + unitIdx}`,
      kind: "summary",
      pdfPath,
      bookTitle,
      label: unitTitle || (pageMode ? String(pageNum) : ""),
      page: pageMode ? pageNum : undefined,
      unit: pageMode ? undefined : unitIdx,
      savedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function togglePlay() {
    if (playing) {
      stopSummary();
      setPlaying(false);
    } else if (sum) {
      setPlaying(true);
      void markSummaryHeard(pdfPath); // خطوة «ملخص صوتي» في مسار اليوم تُشطب
      // مقطعًا مقطعًا بالترتيب: الملخّص الطويل يُسمع كاملًا (كان يُرسل دفعة واحدة فيُقص بعد ٥٠٠٠ حرف)
      playSummary(summaryChunks(sum), 0, { onDone: () => setPlaying(false) });
    }
  }


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
          // زر السماعة يشغّل الملخّص صوتيًا (كان أيقونة للزينة لا تستجيب فيوحي بزر معطّل)
          <Pressable
            onPress={togglePlay}
            disabled={!sum || streaming}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={playing ? t("syllabus.summary.pause") : t("syllabus.summary.listen")}
            style={{ opacity: !sum || streaming ? 0.45 : 1 }}
          >
            <SceneIconButton>
              <Ionicons name={playing ? "pause" : "headset"} size={20} color={pal.accent} />
            </SceneIconButton>
          </Pressable>
        }
      />

      {loading && !sum ? (
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
          <Pressable
            onPress={togglePlay}
            disabled={streaming}
            style={({ pressed }) => [styles.playBtn, streaming && { opacity: 0.5 }, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name={playing ? "pause" : "play"} size={20} color={pal.onAccent} />
            <Text style={[styles.playTxt, { color: pal.onAccent }]}>{playing ? t("syllabus.summary.pause") : t("syllabus.summary.listen")}</Text>
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

          {sum ? <SummaryView summary={sum} bookTitle={unitTitle || bookTitle} /> : null}
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
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
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
  resumeBtn: { height: 46, paddingHorizontal: 26, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center" },
  saveRow: { gap: 10 },
  saveBtn: { flex: 1, height: 48, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { fontSize: 15, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 30 },
});
