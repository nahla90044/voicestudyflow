// app/generate-study.tsx
// توليد مخصّص: يختار المستخدم الكتاب، والجزء (كامل/نطاق صفحات)، والنوع
// (بطاقات/اختبار/ملخّص)، والعدد — فيولّد ويُحفظ في مركز المذاكرة.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GradientButton } from "../components/brand/gradient-button";
import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { aiAssist, generateFlashcards } from "../lib/ai";
import { getUserId } from "../lib/auth";
import { addCards } from "../lib/flashcards";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { addSavedItem } from "../lib/savedStudy";
import { generateUnitQuiz } from "../lib/syllabus";
import { supabase } from "../lib/supabase";
import { setUnitContent } from "../lib/unitContent";

type Book = { id: string; title: string; pdf_path: string };
type GenType = "cards" | "quiz" | "summary";

const COUNTS = [5, 10, 15, 20];

// نص المصدر لنطاق صفحات (يعيّن عيّنات موزّعة للنطاقات الطويلة، وبحدّ أقصى للحجم)
async function collectRangeText(pdfPath: string, from: number, to: number, maxChars = 10000): Promise<string> {
  const lo = Math.max(1, from);
  const hi = Math.max(lo, to);
  const span = hi - lo + 1;
  const stride = span > 20 ? Math.ceil(span / 20) : 1;
  let out = "";
  for (let p = lo; p <= hi && out.length < maxChars; p += stride) {
    try {
      const res = await extractPdfPageText(pdfPath, p);
      if (res.text?.trim()) out += res.text.trim() + "\n\n";
    } catch {
      // نتجاهل صفحة فاشلة ونكمل
    }
  }
  return out.slice(0, maxChars);
}

export default function GenerateStudyScreen() {
  const { t } = useI18n();
  const dir = useDir();

  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState<string>("");
  const [totalPages, setTotalPages] = useState(0);

  const [whole, setWhole] = useState(true); // الكتاب كامل أم نطاق
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [type, setType] = useState<GenType>("cards");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const book = books.find((b) => b.id === bookId);

  useEffect(() => {
    (async () => {
      try {
        const uid = await getUserId();
        const { data } = await supabase
          .from("books")
          .select("id,title,pdf_path")
          .eq("user_id", uid)
          .not("is_archived", "is", true)
          .order("created_at", { ascending: false });
        const list = (data ?? []) as Book[];
        setBooks(list);
        if (list[0]) selectBook(list[0]);
      } catch {
        setBooks([]);
      }
    })();
  }, []);

  async function selectBook(b: Book) {
    setBookId(b.id);
    setTotalPages(0);
    try {
      const res = await extractPdfPageText(b.pdf_path, 1);
      const tp = res.totalPages ?? 0;
      setTotalPages(tp);
      setTo(String(tp || 1));
    } catch {
      setTo("1");
    }
  }

  async function onGenerate() {
    if (!book) return;
    const tp = totalPages || 9999;
    const f = whole ? 1 : Math.max(1, Math.min(tp, Number(from) || 1));
    const tt = whole ? tp : Math.max(f, Math.min(tp, Number(to) || f));
    setBusy(true);
    setStatus(t("generate.status.reading"));
    try {
      const text = await collectRangeText(book.pdf_path, f, tt);
      if (!text.trim()) {
        setBusy(false);
        Alert.alert(t("generate.err.title"), t("generate.err.noText"));
        return;
      }
      setStatus(t("generate.status.generating"));
      const label = whole ? t("generate.label.whole") : t("generate.label.range", { from: f, to: tt });

      if (type === "cards") {
        const cards = await generateFlashcards(text, count);
        if (cards.length === 0) throw new Error("empty");
        const n = await addCards(cards.map((c) => ({ ...c, bookId: book.id, bookTitle: book.title })));
        done(t("generate.done.cards", { count: n }));
      } else if (type === "quiz") {
        const qs = await generateUnitQuiz(text, count);
        if (qs.length === 0) throw new Error("empty");
        const srcId = f * 100000 + tt;
        await setUnitContent(book.pdf_path, srcId, "pagequiz", qs);
        await addSavedItem({
          key: `quiz|${book.pdf_path}|${srcId}`,
          kind: "quiz", pdfPath: book.pdf_path, bookTitle: book.title,
          label, page: srcId, savedAt: Date.now(),
        });
        done(t("generate.done.quiz"));
      } else {
        const out = (await aiAssist("summarize", text)).trim();
        if (!out) throw new Error("empty");
        const srcId = f * 100000 + tt;
        await setUnitContent(book.pdf_path, srcId, "pagesummary", out);
        await addSavedItem({
          key: `summary|${book.pdf_path}|${srcId}`,
          kind: "summary", pdfPath: book.pdf_path, bookTitle: book.title,
          label, page: srcId, savedAt: Date.now(),
        });
        done(t("generate.done.summary"));
      }
    } catch {
      setBusy(false);
      setStatus("");
      Alert.alert(t("generate.err.title"), t("generate.err.failed"));
    }
  }

  function done(msg: string) {
    setBusy(false);
    setStatus("");
    Alert.alert(t("generate.done.title"), msg, [{ text: t("common.done"), onPress: () => router.back() }]);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={[styles.header, { flexDirection: dir.row }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("generate.title")}</Text>
          <View style={styles.iconBtn} />
        </View>

        {books.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="library-outline" size={56} color={Palette.textDim} />
            <Text style={styles.dim}>{t("generate.noBooks")}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* الكتاب */}
            <Text style={[styles.section, { textAlign: dir.textAlign }]}>{t("generate.book")}</Text>
            {books.map((b) => (
              <Pressable key={b.id} onPress={() => selectBook(b)} style={[styles.row, bookId === b.id && styles.rowOn]}>
                <Text style={[styles.rowTxt, { textAlign: dir.textAlign }]} numberOfLines={1}>📖 {b.title}</Text>
                {bookId === b.id ? <Ionicons name="checkmark-circle" size={20} color={Palette.neonCyan} /> : null}
              </Pressable>
            ))}

            {/* الجزء */}
            <Text style={[styles.section, { textAlign: dir.textAlign }]}>{t("generate.scope")}</Text>
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              <Pressable onPress={() => setWhole(true)} style={[styles.chip, whole && styles.chipOn]}>
                <Text style={[styles.chipTxt, whole && styles.chipTxtOn]}>{t("generate.wholeBook")}</Text>
              </Pressable>
              <Pressable onPress={() => setWhole(false)} style={[styles.chip, !whole && styles.chipOn]}>
                <Text style={[styles.chipTxt, !whole && styles.chipTxtOn]}>{t("generate.pageRange")}</Text>
              </Pressable>
            </View>
            {!whole ? (
              <View style={[styles.rangeRow, { flexDirection: dir.row }]}>
                <Text style={styles.rangeLbl}>{t("generate.from")}</Text>
                <TextInput value={from} onChangeText={setFrom} keyboardType="number-pad" style={styles.numInput} placeholderTextColor={Palette.placeholder} />
                <Text style={styles.rangeLbl}>{t("generate.to")}</Text>
                <TextInput value={to} onChangeText={setTo} keyboardType="number-pad" style={styles.numInput} placeholderTextColor={Palette.placeholder} />
                {totalPages > 0 ? <Text style={styles.rangeHint}>/ {totalPages}</Text> : null}
              </View>
            ) : null}

            {/* النوع */}
            <Text style={[styles.section, { textAlign: dir.textAlign }]}>{t("generate.type")}</Text>
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              {(["cards", "quiz", "summary"] as GenType[]).map((ty) => (
                <Pressable key={ty} onPress={() => setType(ty)} style={[styles.chip, type === ty && styles.chipOn]}>
                  <Text style={[styles.chipTxt, type === ty && styles.chipTxtOn]}>{t(`generate.type.${ty}`)}</Text>
                </Pressable>
              ))}
            </View>

            {/* العدد (لا يظهر للملخّص) */}
            {type !== "summary" ? (
              <>
                <Text style={[styles.section, { textAlign: dir.textAlign }]}>{t("generate.count")}</Text>
                <View style={[styles.chips, { flexDirection: dir.row }]}>
                  {COUNTS.map((c) => (
                    <Pressable key={c} onPress={() => setCount(c)} style={[styles.chip, count === c && styles.chipOn]}>
                      <Text style={[styles.chipTxt, count === c && styles.chipTxtOn]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator color={Palette.neonViolet} />
                <Text style={styles.dim}>{status}</Text>
              </View>
            ) : (
              <GradientButton title={t("generate.action")} icon="sparkles" onPress={onGenerate} style={{ marginTop: Spacing.lg }} />
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { flex: 1, textAlign: "center", color: Palette.text, fontSize: 18, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 10 },
  dim: { color: Palette.textDim, fontSize: 14, textAlign: "center", lineHeight: 22 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 8 },
  section: { color: Palette.text, fontSize: 15, fontWeight: "900", marginTop: Spacing.lg, marginBottom: 2 },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  rowOn: { borderColor: Palette.neonCyan },
  rowTxt: { flex: 1, color: Palette.text, fontSize: 15, fontWeight: "800" },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  chipOn: { backgroundColor: Palette.neonViolet, borderColor: Palette.neonViolet },
  chipTxt: { color: Palette.text, fontSize: 14, fontWeight: "800" },
  chipTxtOn: { color: "#fff" },
  rangeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 4 },
  rangeLbl: { color: Palette.textMuted, fontSize: 14, fontWeight: "700" },
  numInput: { width: 64, paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.md, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder, color: Palette.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
  rangeHint: { color: Palette.textDim, fontSize: 14, fontWeight: "700" },
  busy: { alignItems: "center", gap: 10, marginTop: Spacing.xl },
});
