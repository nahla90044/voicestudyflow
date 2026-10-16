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
import { aiAssist } from "../lib/ai";
import { bookPages, getCachedUnitRanges, getUnitRanges } from "../lib/glossary";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { addSavedItem } from "../lib/savedStudy";
import { addSave, bookIdForPdf, sharePdf } from "../lib/studySaves";
import { parseStudySummary, summaryHtml, summaryToSpeech, summaryToText, type StudySummary } from "../lib/studySummary";
import { unitText } from "../lib/unitScope";
import { getSyllabus } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
import { markSummaryHeard } from "../lib/readiness";
import { useScene } from "../lib/scene";
import { DEFAULT_VOICE_ID, speakText, stopSpeaking } from "../lib/voice";

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
  const { pdf_path, unit, page, title, book_title } = useLocalSearchParams<{ pdf_path?: string; unit?: string; page?: string; title?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const unitIdx = Number(unit ?? 0) || 0;
  const pageNum = Number(page);
  const pageMode = Number.isFinite(pageNum) && pageNum > 0; // من القارئ (صفحة) بدل وحدة منهج
  const srcId = pageMode ? pageNum : unitIdx;
  const kind = pageMode ? "pagestudysummary" : "studysummary"; // v2: ملخّص شامل منظّم (JSON)
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

  const [loading, setLoading] = useState(true);
  const [sum, setSum] = useState<StudySummary | null>(null);
  const text = sum ? summaryToText(sum) : "";
  const [err, setErr] = useState("");
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
      Alert.alert(t("save.savedTitle"), t("save.savedBody"));
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
        let ctx = "";
        if (pageMode) {
          ctx = await unitText(pdfPath, pageNum, pageNum);
          if (!ctx.trim()) ctx = ((await extractPdfPageText(pdfPath, pageNum)).text || "").slice(0, 6000);
        } else {
          const r = await getSyllabus(pdfPath);
          const units = r?.data.units ?? [];
          const u = units[unitIdx];
          if (u) {
            const pages = await bookPages(pdfPath).catch(() => []);
            const last = pages.reduce((m, p) => Math.max(m, p.page), 0);
            const ranges = (await getCachedUnitRanges(pdfPath)) ?? (last ? await getUnitRanges(pdfPath, units.map((x) => x.title), last, pages) : []);
            const rg = ranges[unitIdx];
            if (rg) ctx = await unitText(pdfPath, rg.from, rg.to);
            // بلا نص للصفحات بعد → من نقاط المنهج (أفضل من لا شيء)
            if (!ctx.trim()) {
              ctx = `وحدة بعنوان «${u.title}». النقاط الرئيسية: ${u.topics.join("، ")}.${u.outcome ? ` الهدف: ${u.outcome}.` : ""}`;
            } else {
              ctx = `عنوان الوحدة: ${u.title}\n\n${ctx}`;
            }
          }
        }
        if (!ctx.trim()) {
          if (on) setErr(t("syllabus.err.summary"));
          return;
        }
        // ملخّص شامل لوحدة كاملة قد يأخذ دقيقة أو أكثر
        const parsed = parseStudySummary(await aiAssist("studysummary", ctx, undefined, undefined, undefined, 150000));
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
      stopSpeaking();
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
      stopSpeaking();
      setPlaying(false);
    } else if (text) {
      setPlaying(true);
      void markSummaryHeard(pdfPath); // خطوة «ملخص صوتي» في مسار اليوم تُشطب
      speakText(sum ? summaryToSpeech(sum) : text, {
        voiceId: DEFAULT_VOICE_ID,
        onDone: () => setPlaying(false),
        onError: () => setPlaying(false),
      });
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

      {loading ? (
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
            style={({ pressed }) => [styles.playBtn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name={playing ? "pause" : "play"} size={20} color={pal.onAccent} />
            <Text style={[styles.playTxt, { color: pal.onAccent }]}>{playing ? t("syllabus.summary.pause") : t("syllabus.summary.listen")}</Text>
          </Pressable>

          {/* حفظ في «محفوظات الكتاب» + ملف PDF */}
          <View style={[styles.saveRow, { flexDirection: dir.row }]}>
            <Pressable
              onPress={onSave}
              disabled={saveBusy || saved}
              style={({ pressed }) => [styles.saveBtn, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder, opacity: pressed ? 0.8 : 1 }]}
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
              style={({ pressed }) => [styles.saveBtn, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder, opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="document-text-outline" size={18} color={pal.accent} />
              <Text style={[styles.saveTxt, { color: pal.ink }]}>{t("save.pdf")}</Text>
            </Pressable>
          </View>

          {sum ? <SummaryView summary={sum} bookTitle={unitTitle || bookTitle} /> : null}
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
  saveRow: { gap: 10 },
  saveBtn: { flex: 1, height: 48, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { fontSize: 15, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 30 },
});
