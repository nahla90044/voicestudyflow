// app/study-file.tsx
// «ملف المذاكرة»: ملخّصات وحدات الكتاب كلها بالترتيب في ملف PDF واحد.
// بدل طلب الملخّص صفحة صفحة ثم جمعها يدويًا بأدوات خارجية: تُحدَّد الوحدات المطلوبة (أو كل الناقصة)
// فتُولَّد واحدة بعد الأخرى في الخلفية (تكمل بعد مغادرة الشاشة، وإشعار واحد عند الانتهاء)،
// والجاهزة تُؤخذ من المخزن فورًا بلا تكلفة.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { sharePdf } from "../lib/studySaves";
import { mindmapSvg } from "../components/brand/mindmap";
import { mindmapFromSummary, studyFileHtml, type StudySummary } from "../lib/studySummary";
import { getSyllabus, type MindMap } from "../lib/syllabus";
import { getUnitContent } from "../lib/unitContent";
import { getCachedSummary, summaryRequestCost } from "../lib/unitSummary";
import { isSummaryQueueRunning, isUnitQueued, queueUnitSummaries, summaryJobKey, watchSummaryJob } from "../lib/summaryJobs";
import { confirmCost } from "../lib/costConfirm";
import { getSummaryMode, setSummaryMode } from "../lib/summaryPrefs";

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
  // الوحدات المحددة للتوليد (فارغ = كل الناقصة)
  const [picked, setPicked] = useState<number[]>([]);

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
  }, [load]);

  // متابعة كل وحدة ناقصة (تعمل حتى لو بدأ توليدها قبل فتح الشاشة أو استمر بعد الخروج منها)
  const unitCount = rows?.length ?? 0;
  useEffect(() => {
    if (!unitCount) return;
    setRunning(isSummaryQueueRunning(pdfPath));
    const offs = Array.from({ length: unitCount }, (_, i) =>
      watchSummaryJob(
        summaryJobKey(pdfPath, { kind: "unit", unit: i }),
        (j) => {
          setRows((cur) =>
            cur?.map((r, k) =>
              k !== i || r.state === "ready"
                ? r
                : j.status === "running"
                  ? { ...r, state: "working" }
                  : j.status === "done" && j.result
                    ? { ...r, summary: j.result, state: "ready" }
                    : { ...r, state: "failed" }
            ) ?? cur
          );
          // بعد أن يأخذ الطابور دوره في نفس الحدث (ينتقل للوحدة التالية أو ينتهي) — لا قبله
          setTimeout(() => setRunning(isSummaryQueueRunning(pdfPath)), 0);
        },
        false
      )
    );
    return () => offs.forEach((f) => f());
  }, [pdfPath, unitCount]);

  const missing = rows?.filter((r) => r.state !== "ready").length ?? 0;
  const ready = rows?.filter((r) => r.state === "ready").length ?? 0;

  const togglePick = (i: number) => setPicked((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((x, y) => x - y)));
  const missingIdx = rows?.map((r, i) => (r.state === "ready" ? -1 : i)).filter((i) => i >= 0) ?? [];
  const target = picked.length ? picked : missingIdx;

  async function generate() {
    if (!rows || running || !target.length) return;
    // عدد طلبات الوحدات المطلوبة كلها قبل البدء
    const costs = await Promise.all(target.map((i) => summaryRequestCost(pdfPath, { kind: "unit", unit: i }).then((c) => c.pending).catch(() => 0)));
    if (!(await confirmCost(costs.reduce((a, b) => a + b, 0), "studyfile", t, false, `studyfile:${pdfPath}`))) return;
    const params = (i: number) => ({ pdf_path: pdfPath, unit: String(i), title: rows[i].title, book_title: bookTitle });
    queueUnitSummaries(pdfPath, target, (i) => ({ title: rows[i].title, params: params(i) }), {
      title: `${t("studyFile.title")} — ${bookTitle}`,
      params: params(target[target.length - 1]),
    });
    setPicked([]);
    setRunning(true);
  }

  async function onCreate() {
    if (!target.length) return;
    const go = () => void generate();
    // أسلوب الملخّص لهذا الكتاب (مرة واحدة): الالتزام بالكتاب أو التوسّع
    if (await getSummaryMode(pdfPath)) return go();
    Alert.alert(t("summary.mode.title"), t("summary.mode.body"), [
      { text: t("summary.mode.strict"), onPress: () => void setSummaryMode(pdfPath, "strict").then(go) },
      { text: t("summary.mode.expand"), onPress: () => void setSummaryMode(pdfPath, "expand").then(go) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  async function onPdf() {
    if (!rows || pdfBusy) return;
    if (!rows.some((r) => r.summary)) return;
    setPdfBusy(true);
    try {
      // كل وحدة تبدأ بخريطتها الذهنية: المحفوظة من شاشة المنهج إن وُجدت، وإلا تُبنى من ملخّصها (بلا تكلفة)
      const units: { title: string; summary: StudySummary; mindmapSvg?: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.summary) continue;
        let mm: MindMap | null = await getUnitContent<MindMap>(pdfPath, i, "mindmap").catch(() => null);
        if (!mm?.branches?.length) mm = mindmapFromSummary(r.summary, r.title);
        let svg: string | undefined;
        try {
          svg = mm ? mindmapSvg(mm) : undefined;
        } catch {
          svg = undefined; // الخريطة إضافة: لا تُفشل الملف
        }
        units.push({ title: r.title, summary: r.summary, mindmapSvg: svg });
      }
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
              onPress={running ? undefined : onCreate}
              style={({ pressed }) => [styles.btn, { backgroundColor: running ? pal.soft : pal.accent, opacity: pressed ? 0.85 : 1, flexDirection: dir.row }]}
            >
              {running ? <ActivityIndicator color={pal.ink} /> : <Ionicons name="sparkles" size={18} color={pal.onAccent} />}
              <Text style={[styles.btnTxt, { color: running ? pal.ink : pal.onAccent }]}>
                {running ? t("studyFile.working") : picked.length ? t("studyFile.createPicked", { n: picked.length }) : t("studyFile.create", { n: missing })}
              </Text>
            </Pressable>
          ) : null}
          {/* تحديد الوحدات: الضغط على الدائرة بجانب الوحدة، أو «تحديد الكل» */}
          {missing > 0 && !running ? (
            <View style={[styles.pickRow, { flexDirection: dir.row }]}>
              <Text style={[styles.pickHint, { color: pal.dim, textAlign: dir.textAlign }]}>{t("studyFile.pickHint")}</Text>
              <Pressable onPress={() => setPicked(picked.length === missingIdx.length ? [] : missingIdx)} hitSlop={8}>
                <Text style={[styles.pickAll, { color: pal.accent }]}>{picked.length === missingIdx.length ? t("studyFile.pickNone") : t("studyFile.pickAll")}</Text>
              </Pressable>
            </View>
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
              disabled={r.state === "working" || running}
              onPress={() =>
                r.state === "ready"
                  ? router.push({ pathname: "/unit-summary", params: { pdf_path: pdfPath, unit: String(i), title: r.title, book_title: bookTitle } })
                  : togglePick(i)
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
                ) : r.state === "ready" ? (
                  <Ionicons name="checkmark-circle" size={22} color="#15803D" />
                ) : running && isUnitQueued(pdfPath, i) ? (
                  <Ionicons name="time-outline" size={22} color={pal.accent} accessibilityLabel={t("studyFile.queued")} />
                ) : (
                  <Pressable onPress={() => !running && togglePick(i)} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(i) }}>
                    <Ionicons
                      name={picked.includes(i) ? "checkbox" : r.state === "failed" ? "alert-circle" : "square-outline"}
                      size={24}
                      color={picked.includes(i) ? pal.accent : r.state === "failed" ? "#D97706" : pal.dim}
                    />
                  </Pressable>
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
  pickRow: { alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 4 },
  pickHint: { flex: 1, fontSize: 13, fontWeight: "600" },
  pickAll: { fontSize: 14, fontWeight: "900" },
});
