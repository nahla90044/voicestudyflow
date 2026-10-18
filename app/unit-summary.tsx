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
import { aiAssist, aiAssistStream } from "../lib/ai";
import { useDir, useI18n } from "../lib/i18n";
import { addSavedItem } from "../lib/savedStudy";
import { addSave, bookIdForPdf, sharePdf } from "../lib/studySaves";
import { parsePartialSummary, parseStudySummary, summaryHtml, summaryToSpeech, summaryToText, type StudySummary } from "../lib/studySummary";
import { getOrMakeSummary, summaryCacheKey, summaryParts, type SummarySource } from "../lib/unitSummary";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
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
  const [partInfo, setPartInfo] = useState<{ done: number; total: number } | null>(null); // وحدة طويلة: الجزء الحالي
  const [playing, setPlaying] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(false);
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

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        // مخزَّن مسبقًا؟ اعرضه فورًا بلا ذكاء
        const cached = await getUnitContent<StudySummary>(pdfPath, srcId, kind);
        if (cached?.sections?.length) {
          if (on) setSum(cached);
          return;
        }
        // نصّ المصدر الحقيقي: الصفحة الحالية، أو كل صفحات الوحدة (من نطاقها في المنهج)
        const parts = await summaryParts(pdfPath, src);
        if (!parts.length) {
          if (on) setErr(t("syllabus.err.summary"));
          return;
        }
        // وحدة طويلة: أجزاؤها تُلخَّص معًا ببثّ (لا قصّ لآخرها) وتظهر بالترتيب أولًا بأول
        if (parts.length > 1) {
          if (on) {
            setStreaming(true);
            setPartInfo({ done: 0, total: parts.length });
          }
          try {
            const merged = await getOrMakeSummary(pdfPath, src, (done, total, soFar) => {
              if (!on) return;
              setPartInfo({ done, total });
              if (soFar) {
                setSum(soFar);
                setLoading(false);
              }
            });
            if (!merged) {
              if (on) setErr(t("syllabus.err.summary"));
              return;
            }
            if (on) setSum(merged);
          } finally {
            if (on) {
              setStreaming(false);
              setPartInfo(null);
            }
          }
          return;
        }
        const ctx = parts[0];
        // بثّ مباشر: يظهر العنوان ثم كل قسم فور اكتماله (خلال ثوانٍ) بينما يُكتب الباقي
        let raw = "";
        let lastPaint = 0;
        if (on) setStreaming(true);
        try {
          raw = await aiAssistStream("studysummary", ctx, (soFar) => {
            const now = Date.now();
            if (!on || now - lastPaint < 250) return;
            lastPaint = now;
            const part = parsePartialSummary(soFar);
            if (part && (part.sections.length || part.title)) {
              setSum(part);
              setLoading(false);
            }
          });
        } catch (e) {
          if ((e as Error).message === "USER_QUOTA") throw e;
          // تعذّر البثّ ولم يظهر شيء → طلب عادي كاحتياط
          if (!raw) raw = await aiAssist("studysummary", ctx, undefined, undefined, undefined, 150000);
        } finally {
          if (on) setStreaming(false);
        }
        const parsed = parseStudySummary(raw);
        if (!parsed) {
          if (on) setErr(t("syllabus.err.summary"));
          return;
        }
        setUnitContent(pdfPath, srcId, kind, parsed);
        if (on) setSum(parsed);
      } catch {
        if (on) setErr(t("syllabus.err.summary"));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
      stopSummary();
    };
  }, [pdfPath, srcId, kind, pageMode, pageNum, unitIdx, t]);

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
          <SceneIconButton>
            <Ionicons name="headset" size={20} color={pal.accent} />
          </SceneIconButton>
        }
      />

      {loading && !sum ? (
        <View style={styles.center}>
          <ActivityIndicator color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("summary.preparing")}</Text>
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
            <View style={[styles.writing, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
              <ActivityIndicator size="small" color={pal.accent} />
              <Text style={[styles.dim, { color: pal.dim }]}>
                {partInfo ? t("summary.writingPart", { n: partInfo.done, total: partInfo.total }) : t("summary.writingRest")}
              </Text>
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
  writing: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: Radius.lg },
  saveRow: { gap: 10 },
  saveBtn: { flex: 1, height: 48, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { fontSize: 15, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 30 },
});
