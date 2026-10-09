// app/unit-summary.tsx
// صفحة مستقلة لملخّص الوحدة (بدل النافذة) — تُشبه صفحة البطاقات: عنوان الوحدة،
// نص الملخّص في بطاقة، وزر استماع. يُولَّد مرة واحدة ويُخزَّن (بلا استهلاك ذكاء متكرر).
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { aiAssist } from "../lib/ai";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { addSavedItem } from "../lib/savedStudy";
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
  const kind = pageMode ? "pagesummary" : "summary";
  const unitTitle = typeof title === "string" ? title : "";
  const bookTitle = typeof book_title === "string" ? book_title : unitTitle;

  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        // مخزَّن مسبقًا؟ اعرضه فورًا بلا ذكاء
        const cached = await getUnitContent<string>(pdfPath, srcId, kind);
        if (cached) {
          if (on) setText(stripMarkdown(cached));
          return;
        }
        // نصّ المصدر: صفحة القارئ الحالية، أو محتوى وحدة المنهج
        let ctx = "";
        if (pageMode) {
          const res = await extractPdfPageText(pdfPath, pageNum);
          ctx = (res.text || "").slice(0, 4000);
        } else {
          const r = await getSyllabus(pdfPath);
          const u = r?.data.units[unitIdx];
          if (u) {
            ctx = `وحدة بعنوان «${u.title}». النقاط الرئيسية: ${u.topics.join("، ")}.${
              u.outcome ? ` الهدف: ${u.outcome}.` : ""
            } اشرح هذه النقاط بإيجاز في فقرة متصلة مناسبة للاستماع.`;
          }
        }
        if (!ctx.trim()) {
          if (on) setErr(t("syllabus.err.summary"));
          return;
        }
        const out = (await aiAssist("summarize", ctx)).trim();
        if (!out) {
          if (on) setErr(t("syllabus.err.summary"));
          return;
        }
        setUnitContent(pdfPath, srcId, kind, out);
        if (on) setText(stripMarkdown(out));
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
      speakText(text, {
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
          <Text style={[styles.dim, { color: pal.dim }]}>{t("syllabus.action.summary")}…</Text>
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

          <SceneCard style={styles.card}>
            {!!unitTitle && (
              <Text style={[styles.unitTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{unitTitle}</Text>
            )}
            <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{text}</Text>
          </SceneCard>
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
  body: { fontSize: 16, lineHeight: 30 },
});
