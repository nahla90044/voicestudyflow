// app/question-files.tsx
// «ملفات الأسئلة» (قرار نهلة ٢٥ أكتوبر): يرفع الطالب ملفات أسئلة PDF لكتابه، فتُستخرج أسئلتها وتُحل الناقصة
// من الكتاب (في الخلفية، بإشعار عند الانتهاء)، ثم يبدأ اختبارًا منها: كل الأسئلة أو وحدات محددة، بعدد يختاره.
// الأخطاء تدخل «مراجعة الأخطاء» كأي اختبار.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { confirmCost } from "../lib/costConfirm";
import { useDir, useI18n } from "../lib/i18n";
import { isQFileRunning, listQFiles, pickAndUpload, processQFile, removeQFile, watchQFiles, type QFile, type QFProgress } from "../lib/questionFiles";
import { pickForQuiz } from "../lib/questionFilesCore";
import { useScene } from "../lib/scene";
import { getSyllabus } from "../lib/syllabus";

const COUNTS = [10, 20, 30, 0]; // ٠ = الكل

export default function QuestionFilesScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { book_id, pdf_path, book_title } = useLocalSearchParams<{ book_id?: string; pdf_path?: string; book_title?: string }>();
  const bookId = typeof book_id === "string" ? book_id : "";
  const bookPdf = typeof pdf_path === "string" ? pdf_path : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";

  const [files, setFiles] = useState<QFile[] | null>(null);
  const [units, setUnits] = useState<string[]>([]);
  const [prog, setProg] = useState<Record<string, QFProgress>>({});
  const [adding, setAdding] = useState<"" | "upload" | "check">("");
  const [pickedUnits, setPickedUnits] = useState<number[]>([]); // فارغ = كل الوحدات
  const [count, setCount] = useState(20);

  const load = useCallback(() => {
    listQFiles(bookId)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [bookId]);

  useFocusEffect(load);
  useEffect(() => {
    getSyllabus(bookPdf)
      .then((r) => setUnits((r?.data.units ?? []).map((u) => u.title)))
      .catch(() => {});
  }, [bookPdf]);

  // تقدّم المعالجة الجارية (تستمر بعد مغادرة الشاشة)
  useEffect(
    () =>
      watchQFiles((p) => {
        setProg((m) => ({ ...m, [p.id]: p }));
        if (p.stage === "done" || p.stage === "failed") load();
      }),
    [load]
  );

  const confirm = (n: number) => confirmCost(n, "qfile", t, true, `qfile:${n}`);

  // ملف لم يكتمل (أُغلق التطبيق أثناءه) → يكمل تلقائيًا من حيث توقف
  useEffect(() => {
    for (const f of files ?? []) if ((f.status === "reading" || f.status === "solving") && f.done_chunks + f.questions.length > 0 && !isQFileRunning(f.id)) void processQFile(f, bookPdf, confirm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function onAdd() {
    if (adding) return;
    try {
      const r = await pickAndUpload(bookId, setAdding);
      setAdding("");
      if (!r) return;
      if ("error" in r) {
        Alert.alert(t("qfile.title"), r.error);
        return;
      }
      setFiles((x) => [r, ...(x ?? [])]);
      void processQFile(r, bookPdf, confirm);
    } catch {
      setAdding("");
      Alert.alert(t("qfile.title"), t("qfile.err.generic"));
    }
  }

  function onRemove(f: QFile) {
    Alert.alert(t("qfile.remove"), t("qfile.removeBody", { name: f.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await removeQFile(f).catch(() => {});
          load();
        },
      },
    ]);
  }

  const all = (files ?? []).flatMap((f) => f.questions ?? []);
  const ready = pickForQuiz(all, pickedUnits.length ? pickedUnits : null, null);
  const unitsWith = units.map((title, i) => ({ title, i, n: all.filter((q) => q.unit === i && q.answer >= 0 && q.options.length >= 2).length })).filter((u) => u.n > 0);

  function startQuiz() {
    router.push({
      pathname: "/unit-quiz",
      params: { mode: "qbank", book_id: bookId, pdf_path: bookPdf, book_title: bookTitle, title: t("qfile.title"), units: pickedUnits.length ? pickedUnits.join(",") : "all", count: String(count) },
    });
  }

  const stageText = (f: QFile) => {
    const p = prog[f.id];
    if (p && p.stage !== "done" && p.stage !== "failed")
      return t(`qfile.stage.${p.stage}`, { done: p.stage === "pages" ? p.done : p.done + 1, total: p.total });
    if (f.status === "ready") return t("qfile.ready", { n: f.questions.length, book: f.questions.filter((q) => q.from === "book").length });
    if (f.status === "failed") return t("qfile.failed");
    return isQFileRunning(f.id) ? t("qfile.working") : t("qfile.paused");
  };

  return (
    <SceneScreen>
      <SceneBanner
        title={t("qfile.title")}
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
      {files === null ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: pal.dim, textAlign: dir.textAlign }]}>{t("qfile.intro")}</Text>

          <Pressable
            onPress={onAdd}
            disabled={!!adding}
            style={({ pressed }) => [styles.btn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: pressed || adding ? 0.85 : 1 }]}
          >
            {adding ? <ActivityIndicator color={pal.onAccent} /> : <Ionicons name="document-attach-outline" size={20} color={pal.onAccent} />}
            <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{adding ? t(`qfile.stage.${adding}`) : t("qfile.add")}</Text>
          </Pressable>

          {files.map((f) => {
            const p = prog[f.id];
            const busy = p && p.stage !== "done" && p.stage !== "failed";
            const pct = busy && p.total ? Math.round((p.done / p.total) * 100) : f.status === "ready" ? 100 : 0;
            return (
              <SceneCard key={f.id} style={{ gap: 8 }}>
                <View style={[styles.fileRow, { flexDirection: dir.row }]}>
                  <Ionicons name={f.status === "ready" ? "checkmark-circle" : f.status === "failed" ? "alert-circle" : "time-outline"} size={22} color={f.status === "ready" ? "#15803D" : f.status === "failed" ? "#D97706" : pal.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.fileName, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={2}>
                      {f.name}
                    </Text>
                    <Text style={[styles.fileSub, { color: pal.dim, textAlign: dir.textAlign }]}>{stageText(f)}</Text>
                  </View>
                  {!busy ? (
                    <Pressable onPress={() => onRemove(f)} hitSlop={10} accessibilityLabel={t("qfile.remove")}>
                      <Ionicons name="trash-outline" size={19} color={pal.dim} />
                    </Pressable>
                  ) : null}
                </View>
                {busy ? (
                  <View style={[styles.track, { backgroundColor: pal.track }]}>
                    <View style={[styles.fill, { width: `${Math.max(4, pct)}%`, backgroundColor: pal.accent }]} />
                  </View>
                ) : null}
                {!busy && (f.status === "reading" || f.status === "solving") ? (
                  <Pressable onPress={() => void processQFile(f, bookPdf, confirm)} hitSlop={6}>
                    <Text style={[styles.link, { color: pal.accent, textAlign: dir.textAlign }]}>{t("qfile.resume")}</Text>
                  </Pressable>
                ) : null}
              </SceneCard>
            );
          })}

          {all.length ? (
            <SceneCard style={{ gap: 12 }}>
              <Text style={[styles.h, { color: pal.ink, textAlign: dir.textAlign }]}>{t("qfile.quizTitle")}</Text>
              {unitsWith.length ? (
                <View style={[styles.chips, { flexDirection: dir.row }]}>
                  <Pressable onPress={() => setPickedUnits([])} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: pickedUnits.length ? pal.soft : pal.accent }]}>
                    <Text style={[styles.chipTxt, { color: pickedUnits.length ? pal.ink : pal.onAccent }]}>{t("qfile.allUnits")}</Text>
                  </Pressable>
                  {unitsWith.map((u) => {
                    const on = pickedUnits.includes(u.i);
                    return (
                      <Pressable
                        key={u.i}
                        onPress={() => setPickedUnits((x) => (on ? x.filter((y) => y !== u.i) : [...x, u.i]))}
                        style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: on ? pal.accent : pal.soft }]}
                      >
                        <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]} numberOfLines={1}>
                          {t("qfile.unitN", { n: u.i + 1 })} · {u.n}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                {COUNTS.map((c) => (
                  <Pressable key={c} onPress={() => setCount(c)} style={[styles.chip, { borderColor: pal.cardBorder, backgroundColor: count === c ? pal.accent : pal.soft }]}>
                    <Text style={[styles.chipTxt, { color: count === c ? pal.onAccent : pal.ink }]}>{c ? t("qfile.countN", { n: c }) : t("qfile.countAll", { n: ready.length })}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={startQuiz}
                disabled={!ready.length}
                style={({ pressed }) => [styles.btn, { flexDirection: dir.row, backgroundColor: pal.accent, opacity: !ready.length ? 0.5 : pressed ? 0.85 : 1 }]}
              >
                <Ionicons name="school-outline" size={20} color={pal.onAccent} />
                <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("qfile.start", { n: count ? Math.min(count, ready.length) : ready.length })}</Text>
              </Pressable>
            </SceneCard>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.xl, gap: 12 },
  intro: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  btn: { height: 52, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  btnTxt: { fontSize: 15.5, fontWeight: "900" },
  fileRow: { alignItems: "center", gap: 10 },
  fileName: { fontSize: 15, fontWeight: "800", lineHeight: 22 },
  fileSub: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  track: { height: 7, borderRadius: 4, overflow: "hidden" },
  fill: { height: 7, borderRadius: 4 },
  link: { fontSize: 14, fontWeight: "800" },
  h: { fontSize: 16, fontWeight: "900" },
  chips: { flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipTxt: { fontSize: 13.5, fontWeight: "800" },
});
