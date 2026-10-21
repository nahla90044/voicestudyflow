// app/generate-study.tsx
// توليد مخصّص: يختار المستخدم الكتاب، والجزء (كامل/نطاق صفحات)، والنوع
// (بطاقات/اختبار/ملخّص)، والعدد — فيولّد ويُحفظ في مركز المذاكرة.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { aiAssist, generateFlashcards, CARD_TYPES, type CardChoice } from "../lib/ai";
import { getUserId } from "../lib/auth";
import { addCards } from "../lib/flashcards";
import { useDir, useI18n } from "../lib/i18n";
import { extractPdfPageText } from "../lib/pdfText";
import { addSavedItem } from "../lib/savedStudy";
import { useScene } from "../lib/scene";
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
  const { pal } = useScene();
  // فُتحت من وحدة: الكتاب ونطاق صفحات الوحدة محدّدان مسبقًا
  const preset = useLocalSearchParams<{ book_id?: string; from?: string; to?: string }>();

  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState<string>("");
  const [totalPages, setTotalPages] = useState(0);

  const [whole, setWhole] = useState(true); // الكتاب كامل أم نطاق
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [type, setType] = useState<GenType>("cards");
  const [cardType, setCardType] = useState<CardChoice>("mixed");
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
        const pick = list.find((b) => b.id === preset.book_id) ?? list[0];
        if (pick) await selectBook(pick);
        if (preset.from && preset.to) {
          setWhole(false);
          setFrom(String(preset.from));
          setTo(String(preset.to));
        }
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
        const cards = await generateFlashcards(text, count, cardType);
        if (cards.length === 0) throw new Error("empty");
        // نطاق محدد → البطاقات تُنسب لصفحته الأولى فتُجمَّع مع وحدتها
        const n = await addCards(cards.map((c) => ({ ...c, bookId: book.id, bookTitle: book.title, page: whole ? undefined : f })));
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
    } catch (e) {
      setBusy(false);
      setStatus("");
      // نفاد الطلبات: شاشة الاشتراك تظهر تلقائيًا، فلا نضيف رسالة «تعذّر»
      if ((e as Error).message === "USER_QUOTA") return;
      Alert.alert(t("generate.err.title"), t("generate.err.failed"));
    }
  }

  function done(msg: string) {
    setBusy(false);
    setStatus("");
    Alert.alert(t("generate.done.title"), msg, [{ text: t("common.done"), onPress: () => router.back() }]);
  }

  return (
    <SceneScreen>
      <SceneBanner
        title={t("generate.title")}
        height={150}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      {books.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="library-outline" size={56} color={pal.dim} />
          <Text style={[styles.dim, { color: pal.dim }]}>{t("generate.noBooks")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* الكتاب */}
          <Text style={[styles.section, { color: pal.ink, textAlign: dir.textAlign }]}>{t("generate.book")}</Text>
          {books.map((b) => (
            <Pressable key={b.id} onPress={() => selectBook(b)}>
              <SceneCard
                padded={false}
                style={[styles.row, bookId === b.id && { borderColor: pal.accent, borderWidth: 1.5 }]}
              >
                <Text style={[styles.rowTxt, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>{b.title}</Text>
                {bookId === b.id ? <Ionicons name="checkmark-circle" size={20} color={pal.accent} /> : null}
              </SceneCard>
            </Pressable>
          ))}

          {/* الجزء */}
          <Text style={[styles.section, { color: pal.ink, textAlign: dir.textAlign }]}>{t("generate.scope")}</Text>
          <View style={[styles.chips, { flexDirection: dir.row }]}>
            {[true, false].map((w) => {
              const on = whole === w;
              return (
                <Pressable
                  key={String(w)}
                  onPress={() => setWhole(w)}
                  style={[styles.chip, { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder }]}
                >
                  <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]}>
                    {w ? t("generate.wholeBook") : t("generate.pageRange")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!whole ? (
            <View style={[styles.rangeRow, { flexDirection: dir.row }]}>
              <Text style={[styles.rangeLbl, { color: pal.dim }]}>{t("generate.from")}</Text>
              <TextInput
                value={from}
                onChangeText={setFrom}
                keyboardType="number-pad"
                style={[styles.numInput, { backgroundColor: pal.card, borderColor: pal.cardBorder, color: pal.ink }]}
                placeholderTextColor={pal.dim}
                selectionColor={pal.accent}
              />
              <Text style={[styles.rangeLbl, { color: pal.dim }]}>{t("generate.to")}</Text>
              <TextInput
                value={to}
                onChangeText={setTo}
                keyboardType="number-pad"
                style={[styles.numInput, { backgroundColor: pal.card, borderColor: pal.cardBorder, color: pal.ink }]}
                placeholderTextColor={pal.dim}
                selectionColor={pal.accent}
              />
              {totalPages > 0 ? <Text style={[styles.rangeHint, { color: pal.dim }]}>/ {totalPages}</Text> : null}
            </View>
          ) : null}

          {/* النوع */}
          <Text style={[styles.section, { color: pal.ink, textAlign: dir.textAlign }]}>{t("generate.type")}</Text>
          <View style={[styles.chips, { flexDirection: dir.row }]}>
            {(["cards", "quiz", "summary"] as GenType[]).map((ty) => {
              const on = type === ty;
              return (
                <Pressable
                  key={ty}
                  onPress={() => setType(ty)}
                  style={[styles.chip, { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder }]}
                >
                  <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]}>{t(`generate.type.${ty}`)}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* نوع البطاقات: معاني كلمات، تعاريف، أسئلة وأجوبة، مقارنات */}
          {type === "cards" ? (
            <>
              <Text style={[styles.section, { color: pal.ink, textAlign: dir.textAlign }]}>{t("cards.type.title")}</Text>
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                {CARD_TYPES.map((ct) => {
                  const on = cardType === ct;
                  return (
                    <Pressable
                      key={ct}
                      onPress={() => setCardType(ct)}
                      style={[styles.chip, { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder }]}
                    >
                      <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]}>{t(`cards.type.${ct}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* العدد (لا يظهر للملخّص) */}
          {type !== "summary" ? (
            <>
              <Text style={[styles.section, { color: pal.ink, textAlign: dir.textAlign }]}>{t("generate.count")}</Text>
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                {COUNTS.map((c) => {
                  const on = count === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCount(c)}
                      style={[styles.chip, { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder }]}
                    >
                      <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={pal.accent} />
              <Text style={[styles.dim, { color: pal.dim }]}>{status}</Text>
            </View>
          ) : (
            <Pressable
              onPress={onGenerate}
              style={[styles.cta, { backgroundColor: pal.accent, flexDirection: dir.row }]}
              accessibilityRole="button"
            >
              <Ionicons name="sparkles" size={18} color={pal.onAccent} />
              <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>{t("generate.action")}</Text>
            </Pressable>
          )}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 10 },
  dim: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 8 },
  section: { fontSize: 15, fontWeight: "900", marginTop: Spacing.lg, marginBottom: 2 },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, padding: Spacing.md, borderRadius: Radius.lg },
  rowTxt: { flex: 1, fontSize: 15, fontWeight: "800" },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill, borderWidth: 1 },
  chipTxt: { fontSize: 14, fontWeight: "800" },
  rangeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 4 },
  rangeLbl: { fontSize: 14, fontWeight: "700" },
  numInput: { width: 64, paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.md, borderWidth: 1, fontSize: 15, fontWeight: "800", textAlign: "center" },
  rangeHint: { fontSize: 14, fontWeight: "700" },
  busy: { alignItems: "center", gap: 10, marginTop: Spacing.xl },
  cta: { alignItems: "center", justifyContent: "center", gap: 8, minHeight: 54, borderRadius: Radius.pill, marginTop: Spacing.lg },
  ctaTxt: { fontSize: 16, fontWeight: "900" },
});
