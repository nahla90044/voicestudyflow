// app/mock-exam.tsx
// «الاختبار التجريبي» لكتب الشهادات المهنية (قرار نهلة ٢٧ أكتوبر): عدد أسئلة ووقت كالاختبار الحقيقي،
// والأسئلة موزّعة على الوحدات بنسبة حجم كل وحدة في الكتاب. تُستعمل أسئلة الوحدات المحفوظة أولًا، ولا يُولَّد
// إلا ما ينقص (بسؤال واحد عن عدد الطلبات)، ثم يُفتح الاختبار بعدّاد تنازلي وتقرير لكل وحدة في النهاية.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { confirmCost } from "../lib/costConfirm";
import { useDir, useI18n } from "../lib/i18n";
import { fillMock, mockNeeds, mockUnits, type MockUnit } from "../lib/mockExam";
import { allocate, autoMinutes } from "../lib/mockExamCore";
import { useScene } from "../lib/scene";

const COUNTS = [20, 40, 60, 100];

export default function MockExamScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_id, book_title, exam } = useLocalSearchParams<{ pdf_path?: string; book_id?: string; book_title?: string; exam?: string }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";
  const examName = typeof exam === "string" ? exam : "";

  const [units, setUnits] = useState<MockUnit[] | null>(null);
  const [count, setCount] = useState(40);
  const [timed, setTimed] = useState(true);
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null);

  const load = () =>
    mockUnits(pdfPath)
      .then(setUnits)
      .catch(() => setUnits([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath]);

  const alloc = useMemo(() => (units ? allocate(count, units.map((u) => u.weight)) : []), [units, count]);
  const need = useMemo(() => (units ? mockNeeds(units, count) : []), [units, count]);
  const toPrepare = need.filter((n) => n > 0).length;
  const minutes = autoMinutes(count);

  async function start() {
    if (!units?.length || prep) return;
    if (toPrepare > 0) {
      if (!(await confirmCost(toPrepare, "mock", t, false, `mock:${pdfPath}:${count}`))) return;
      setPrep({ done: 0, total: toPrepare });
      const failed = await fillMock(pdfPath, need, (done, total) => setPrep({ done, total }));
      setPrep(null);
      if (failed) Alert.alert(t("mock.title"), t("mock.someFailed", { n: failed }));
      void load();
    }
    router.push({
      pathname: "/unit-quiz",
      params: { mode: "mock", pdf_path: pdfPath, book_id: typeof book_id === "string" ? book_id : "", book_title: bookTitle, title: examName || t("mock.title"), units: "all", count: String(count), minutes: timed ? String(minutes) : "0" },
    });
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={t("mock.title")}
        subtitle={[examName, bookTitle].filter(Boolean).join(" · ") || undefined}
        height={160}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />
      {units === null ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : !units.length ? (
        <View style={styles.scroll}>
          <SceneCard>
            <Text style={[styles.body, { color: pal.ink, textAlign: dir.textAlign }]}>{t("mock.noSyllabus")}</Text>
          </SceneCard>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("mock.intro")}</Text>

          <SceneCard style={{ gap: 12 }}>
            <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("mock.count")}</Text>
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              {COUNTS.map((c) => (
                <Pressable key={c} onPress={() => setCount(c)} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: count === c ? pal.accent : pal.soft }]}>
                  <Text style={[styles.chipTxt, { color: count === c ? pal.onAccent : pal.ink }]}>{t("qfile.countN", { n: c })}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("mock.time")}</Text>
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              <Pressable onPress={() => setTimed(true)} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: timed ? pal.accent : pal.soft }]}>
                <Text style={[styles.chipTxt, { color: timed ? pal.onAccent : pal.ink }]}>⏱ {t("mock.minutes", { n: minutes })}</Text>
              </Pressable>
              <Pressable onPress={() => setTimed(false)} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: !timed ? pal.accent : pal.soft }]}>
                <Text style={[styles.chipTxt, { color: !timed ? pal.onAccent : pal.ink }]}>{t("mock.noTime")}</Text>
              </Pressable>
            </View>
          </SceneCard>

          <SceneCard style={{ gap: 10 }}>
            <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("mock.split")}</Text>
            {units.map((u, i) => (
              <View key={i} style={[styles.unitRow, { flexDirection: dir.row }]}>
                <Ionicons name={need[i] > 0 ? "ellipse-outline" : "checkmark-circle"} size={18} color={need[i] > 0 ? pal.dim : "#15803D"} />
                <Text style={[styles.unitTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                  {u.title}
                </Text>
                <Text style={[styles.unitN, { color: pal.accent }]}>{t("mock.qN", { n: alloc[i] ?? 0 })}</Text>
              </View>
            ))}
            <Text style={[styles.note, { color: pal.dim, textAlign: dir.textAlign }]}>
              {toPrepare ? t("mock.prepareNote", { n: toPrepare }) : t("mock.readyNote")}
            </Text>
          </SceneCard>

          <Pressable onPress={start} disabled={!!prep} style={({ pressed }) => [styles.btn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: pressed || prep ? 0.85 : 1 }]}>
            {prep ? <ActivityIndicator color={pal.onAccent} /> : <Ionicons name="timer-outline" size={20} color={pal.onAccent} />}
            <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{prep ? t("mock.preparing", { done: prep.done, total: prep.total }) : t("mock.start")}</Text>
          </Pressable>
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  intro: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  h: { fontSize: 15.5, fontWeight: "900" },
  body: { fontSize: 15, fontWeight: "700", lineHeight: 23 },
  chips: { flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipTxt: { fontSize: 13.5, fontWeight: "800" },
  unitRow: { alignItems: "center", gap: 10 },
  unitTitle: { flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  unitN: { fontSize: 13, fontWeight: "900" },
  note: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  btn: { height: 54, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  btnTxt: { fontSize: 16, fontWeight: "900" },
});
