// app/study-file.tsx
// «ملف المذاكرة»: ملخّصات وحدات الكتاب كلها بالترتيب في ملف PDF واحد.
// بدل طلب الملخّص صفحة صفحة ثم جمعها يدويًا بأدوات خارجية: تُولَّد ملخّصات الوحدات الناقصة
// واحدة بعد الأخرى (مع التقدّم)، والجاهزة تُؤخذ من المخزن فورًا بلا تكلفة.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { sharePdf } from "../lib/studySaves";
import { studyFileHtml, type StudySummary } from "../lib/studySummary";
import { getSyllabus } from "../lib/syllabus";
import { getCachedSummary, getOrMakeSummary } from "../lib/unitSummary";

type UnitRow = { title: string; summary: StudySummary | null; state: "ready" | "missing" | "working" | "failed" };

export default function StudyFileScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_title } = useLocalSearchParams<{ pdf_path?: string; book_title?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";

  const [rows, setRows] = useState<UnitRow[] | null>(null);
  const [noSyllabus, setNoSyllabus] = useState(false);
  const [running, setRunning] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    const syl = await getSyllabus(pdfPath).catch(() => null);
    const units = syl?.data.units ?? [];
    if (!units.length) {
      setNoSyllabus(true);
      setRows([]);
      return;
    }
    const out: UnitRow[] = [];
    for (let i = 0; i < units.length; i++) {
      const s = await getCachedSummary(pdfPath, { kind: "unit", unit: i });
      out.push({ title: units[i].title, summary: s, state: s ? "ready" : "missing" });
    }
    setRows(out);
  }, [pdfPath]);

  useEffect(() => {
    void load();
    return () => {
      stopRef.current = true;
    };
  }, [load]);

  const missing = rows?.filter((r) => r.state !== "ready").length ?? 0;
  const ready = rows?.filter((r) => r.state === "ready").length ?? 0;

  async function generateMissing() {
    if (!rows || running) return;
    stopRef.current = false;
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      if (stopRef.current) break;
      if (rows[i].state === "ready") continue;
      setRows((cur) => cur?.map((r, k) => (k === i ? { ...r, state: "working" } : r)) ?? cur);
      try {
        const s = await getOrMakeSummary(pdfPath, { kind: "unit", unit: i });
        setRows((cur) => cur?.map((r, k) => (k === i ? { ...r, summary: s, state: s ? "ready" : "failed" } : r)) ?? cur);
      } catch (e) {
        setRows((cur) => cur?.map((r, k) => (k === i ? { ...r, state: "failed" } : r)) ?? cur);
        if ((e as Error).message === "USER_QUOTA") break; // انتهت الحصة: صفحة الاشتراك تظهر
      }
    }
    setRunning(false);
  }

  function onCreate() {
    if (!missing) return;
    Alert.alert(t("studyFile.confirmTitle"), t("studyFile.confirmBody", { n: missing }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("studyFile.confirmGo"), onPress: () => void generateMissing() },
    ]);
  }

  async function onPdf() {
    if (!rows || pdfBusy) return;
    const units = rows.filter((r) => r.summary).map((r) => ({ title: r.title, summary: r.summary! }));
    if (!units.length) return;
    setPdfBusy(true);
    try {
      await sharePdf(studyFileHtml({ bookTitle, units, rtl: dir.isRTL }), `${t("studyFile.title")} — ${bookTitle}`);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={t("studyFile.title")}
        subtitle={bookTitle || undefined}
        height={160}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      {rows === null ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : noSyllabus ? (
        <View style={styles.center}>
          <Ionicons name="list-outline" size={36} color={pal.accent} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("studyFile.noSyllabus")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("studyFile.intro")}</Text>

          {/* التقدّم */}
          <SceneCard style={{ gap: 10 }}>
            <Text style={[styles.count, { color: pal.ink, textAlign: dir.textAlign }]}>
              {t("studyFile.progress", { ready, total: rows.length })}
            </Text>
            <View style={[styles.track, { backgroundColor: pal.track }]}>
              <View style={[styles.fill, { backgroundColor: pal.accent, width: `${rows.length ? (ready / rows.length) * 100 : 0}%`, alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]} />
            </View>
          </SceneCard>

          {/* الأزرار */}
          {missing > 0 ? (
            <Pressable
              onPress={running ? () => (stopRef.current = true) : onCreate}
              style={({ pressed }) => [styles.btn, { backgroundColor: running ? pal.soft : pal.accent, opacity: pressed ? 0.85 : 1, flexDirection: dir.row }]}
            >
              {running ? <ActivityIndicator color={pal.ink} /> : <Ionicons name="sparkles" size={18} color={pal.onAccent} />}
              <Text style={[styles.btnTxt, { color: running ? pal.ink : pal.onAccent }]}>
                {running ? t("studyFile.stop") : t("studyFile.create", { n: missing })}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onPdf}
            disabled={!ready || pdfBusy || running}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: missing === 0 ? pal.accent : pal.soft, borderColor: pal.cardBorder, opacity: !ready || running ? 0.5 : pressed ? 0.85 : 1, flexDirection: dir.row },
            ]}
          >
            {pdfBusy ? <ActivityIndicator color={pal.ink} /> : <Ionicons name="document-text-outline" size={18} color={missing === 0 ? pal.onAccent : pal.ink} />}
            <Text style={[styles.btnTxt, { color: missing === 0 ? pal.onAccent : pal.ink }]}>
              {missing === 0 ? t("studyFile.pdf") : t("studyFile.pdfPartial", { n: ready })}
            </Text>
          </Pressable>

          {/* الوحدات بالترتيب */}
          {rows.map((r, i) => (
            <Pressable
              key={i}
              disabled={r.state !== "ready"}
              onPress={() =>
                router.push({ pathname: "/unit-summary", params: { pdf_path: pdfPath, unit: String(i), title: r.title, book_title: bookTitle } })
              }
            >
              <SceneCard style={[styles.row, { flexDirection: dir.row }]}>
                <View style={[styles.num, { backgroundColor: r.state === "ready" ? pal.accent : pal.soft }]}>
                  <Text style={[styles.numTxt, { color: r.state === "ready" ? pal.onAccent : pal.dim }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.unitTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                  {r.title}
                </Text>
                {r.state === "working" ? (
                  <ActivityIndicator size="small" color={pal.accent} />
                ) : (
                  <Ionicons
                    name={r.state === "ready" ? "checkmark-circle" : r.state === "failed" ? "alert-circle" : "ellipse-outline"}
                    size={22}
                    color={r.state === "ready" ? "#15803D" : r.state === "failed" ? "#D97706" : pal.dim}
                  />
                )}
              </SceneCard>
            </Pressable>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 12 },
  dim: { fontSize: 14.5, fontWeight: "600", textAlign: "center", lineHeight: 24 },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  intro: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  count: { fontSize: 15.5, fontWeight: "900" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  btn: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent" },
  btnTxt: { fontSize: 15.5, fontWeight: "900" },
  row: { alignItems: "center", gap: 12, paddingVertical: 12 },
  num: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  numTxt: { fontSize: 14, fontWeight: "900" },
  unitTitle: { flex: 1, fontSize: 15, lineHeight: 23, fontWeight: "800" },
});
