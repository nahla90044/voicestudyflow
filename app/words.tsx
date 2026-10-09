// app/words.tsx
// «كلماتي»: كل الكلمات المحفوظة من الكتب بضغطة مطوّلة — بحث، تصفية حسب الكتاب،
// فتح بطاقة الكلمة (المعنى والمرادفات والأضداد والجمل)، وتحويل الكل لبطاقات مراجعة.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PressableScale } from "../components/brand/motion";
import { WordSheet } from "../components/brand/word-sheet";
import { Gradients, Palette, Radius } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { getWords, lookupWord, wordsToCards, type SavedWord } from "../lib/words";
import { exportWordsPdf } from "../lib/wordsPdf";

export default function WordsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [q, setQ] = useState("");
  const [book, setBook] = useState<string | null>(null);
  const [open, setOpen] = useState<SavedWord | null>(null);
  const [carded, setCarded] = useState(0);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  // PDF مرتّب: نجهّز معاني الكلمات الناقصة أولًا ثم ننشئ الملف ونفتح الحفظ/المشاركة
  async function makePdf() {
    if (pdfBusy || !shown.length) return;
    const list = [...shown];
    try {
      for (let i = 0; i < list.length; i++) {
        if (list[i].info) continue;
        setPdfBusy(t("words.pdfPreparing", { done: i + 1, total: list.length }));
        const info = await lookupWord(list[i]).catch(() => null);
        if (info) list[i] = { ...list[i], info };
      }
      setPdfBusy(t("words.pdfBuilding"));
      const d = new Date();
      await exportWordsPdf(list, {
        title: t("words.pdfTitle"),
        subtitle: t("words.pdfSub", { n: list.length, date: d.toLocaleDateString() }),
        meaning: t("words.meaning"),
        usage: t("words.usage"),
        synonyms: t("words.synonyms"),
        antonyms: t("words.antonyms"),
        examples: t("words.examples"),
        verb: t("words.verb"),
        infinitive: t("words.infinitive"),
        noun: t("words.noun"),
        general: t("flashcards.generalCards"),
        rtl: dir.isRTL,
      });
    } finally {
      setPdfBusy(null);
      reload();
    }
  }

  const reload = useCallback(() => {
    getWords().then(setWords);
  }, []);
  useFocusEffect(reload);

  const books = useMemo(() => [...new Set(words.map((w) => w.bookTitle).filter(Boolean))] as string[], [words]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return words.filter(
      (w) =>
        (!book || w.bookTitle === book) &&
        (!s || w.word.toLowerCase().includes(s) || (w.info?.meaning ?? "").toLowerCase().includes(s))
    );
  }, [words, q, book]);
  const ready = shown.filter((w) => w.info);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.ghost}>
          <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} accessibilityLabel={t("common.back")} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("words.title")}</Text>
          <Text style={[styles.sub, { textAlign: dir.textAlign }]}>{t("words.count", { n: words.length })}</Text>
        </View>
      </View>

      {words.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="hand-left-outline" size={30} color="#B9AFFF" />
          </View>
          <Text style={styles.emptyTitle}>{t("words.emptyTitle")}</Text>
          <Text style={styles.emptyBody}>{t("words.emptyBody")}</Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(w) => w.key}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 6 }}>
              <View style={[styles.search, { flexDirection: dir.row }]}>
                <Ionicons name="search" size={17} color={Palette.textDim} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder={t("words.search")}
                  placeholderTextColor={Palette.placeholder}
                  style={[styles.searchInput, { textAlign: dir.textAlign }]}
                />
              </View>
              {books.length > 1 && (
                <View style={[styles.filters, { flexDirection: dir.row }]}>
                  <Pressable onPress={() => setBook(null)} style={[styles.filter, !book && styles.filterOn]}>
                    <Text style={[styles.filterTxt, !book && styles.filterTxtOn]}>{t("glossary.k.all")}</Text>
                  </Pressable>
                  {books.map((b) => (
                    <Pressable key={b} onPress={() => setBook(b)} style={[styles.filter, book === b && styles.filterOn]}>
                      <Text style={[styles.filterTxt, book === b && styles.filterTxtOn]} numberOfLines={1}>
                        {b}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
          renderItem={({ item: w }) => (
            <PressableScale onPress={() => setOpen(w)} style={[styles.row, { flexDirection: dir.row }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.word, { textAlign: dir.textAlign }]}>{w.word}</Text>
                <Text style={[styles.meaning, { textAlign: dir.textAlign }]} numberOfLines={2}>
                  {w.info?.meaning ?? t("words.tapToExplain")}
                </Text>
                {!!w.bookTitle && (
                  <Text style={[styles.src, { textAlign: dir.textAlign }]} numberOfLines={1}>
                    {w.bookTitle}
                    {w.page ? ` · ${t("glossary.page", { p: w.page })}` : ""}
                  </Text>
                )}
              </View>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={Palette.textDim} />
            </PressableScale>
          )}
        />
      )}

      {shown.length > 0 && (
        <View style={[styles.bottom, { flexDirection: dir.row }]}>
          <PressableScale onPress={makePdf} disabled={!!pdfBusy} style={{ flex: 1 }}>
            <View style={[styles.cta, styles.ctaGhost]}>
              {pdfBusy ? <ActivityIndicator color={Palette.text} /> : <Ionicons name="document-text" size={18} color={Palette.text} />}
              <Text style={[styles.ctaTxt, { color: Palette.text }]} numberOfLines={1}>
                {pdfBusy ?? t("words.pdf")}
              </Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={async () => {
              const n = await wordsToCards(ready);
              setCarded(n);
            }}
            disabled={carded > 0 || !ready.length}
            style={{ flex: 1 }}
          >
            <LinearGradient colors={Gradients.neon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, (carded > 0 || !ready.length) && { opacity: 0.55 }]}>
              <Ionicons name={carded ? "checkmark" : "albums"} size={18} color="#fff" />
              <Text style={styles.ctaTxt} numberOfLines={1}>
                {carded ? t("words.carded", { n: carded }) : t("words.allToCards", { n: ready.length })}
              </Text>
            </LinearGradient>
          </PressableScale>
        </View>
      )}

      <WordSheet
        word={open}
        onClose={() => {
          setOpen(null);
          reload();
        }}
        onRemoved={reload}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Palette.bg },
  head: { alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  ghost: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: Palette.text, fontSize: 20, fontWeight: "800" },
  sub: { color: Palette.textDim, fontSize: 12.5, marginTop: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(124,108,255,0.14)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: Palette.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { color: Palette.textDim, fontSize: 14.5, lineHeight: 24, textAlign: "center" },
  search: {
    alignItems: "center",
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: Palette.text, fontSize: 14.5 },
  filters: { flexWrap: "wrap", gap: 6 },
  filter: { maxWidth: 200, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.06)" },
  filterOn: { backgroundColor: "rgba(124,108,255,0.28)" },
  filterTxt: { color: "#C4C9D8", fontSize: 12.5, fontWeight: "600" },
  filterTxtOn: { color: Palette.text, fontWeight: "800" },
  row: {
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  word: { color: "#D9D3FF", fontSize: 17, fontWeight: "800" },
  meaning: { color: "#C4C9D8", fontSize: 13.5, lineHeight: 21 },
  src: { color: "#6F7690", fontSize: 11.5 },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 26, gap: 8 },
  ctaGhost: { backgroundColor: "#1A1D2B", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  cta: { height: 54, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ctaTxt: { color: "#fff", fontSize: 14.5, fontWeight: "800", flexShrink: 1 },
});
