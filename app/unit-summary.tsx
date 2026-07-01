// app/unit-summary.tsx
// صفحة مستقلة لملخّص الوحدة (بدل النافذة) — تُشبه صفحة البطاقات: عنوان الوحدة،
// نص الملخّص في بطاقة، وزر استماع. يُولَّد مرة واحدة ويُخزَّن (بلا استهلاك ذكاء متكرر).
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../components/brand/glass-card";
import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { aiAssist } from "../lib/ai";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { addSavedItem } from "../lib/savedStudy";
import { getSyllabus } from "../lib/syllabus";
import { getUnitContent, setUnitContent } from "../lib/unitContent";
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
      speakText(text, {
        voiceId: DEFAULT_VOICE_ID,
        onDone: () => setPlaying(false),
        onError: () => setPlaying(false),
      });
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            🎧 {t("syllabus.summary.label")}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.neonCyan} />
            <Text style={styles.dim}>{t("syllabus.action.summary")}…</Text>
          </View>
        ) : err ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={Palette.warn} />
            <Text style={styles.dim}>{err}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {!!unitTitle && <Text style={[styles.unitTitle, { textAlign: dir.textAlign }]}>{unitTitle}</Text>}

            <Pressable onPress={togglePlay} style={[styles.playBtn, { flexDirection: dir.row }]}>
              <Ionicons name={playing ? "pause" : "play"} size={20} color="#0b1220" />
              <Text style={styles.playTxt}>{playing ? t("syllabus.summary.pause") : t("syllabus.summary.listen")}</Text>
            </Pressable>

            <GlassCard glow={Palette.neonCyan} contentStyle={styles.card}>
              <Text style={[styles.body, { textAlign: dir.textAlign }]}>{text}</Text>
            </GlassCard>
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
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
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.lg },
  unitTitle: { color: Palette.text, fontSize: 18, fontWeight: "900", lineHeight: 28 },
  playBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonCyan,
  },
  playTxt: { color: "#0b1220", fontSize: 16, fontWeight: "900" },
  card: { padding: Spacing.lg },
  body: { color: Palette.text, fontSize: 16, lineHeight: 30, textAlign: "right" },
});
