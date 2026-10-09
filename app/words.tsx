// app/words.tsx
// «كلماتي»: كل الكلمات المحفوظة من الكتب بضغطة مطوّلة — بحث، تصفية حسب الكتاب،
// فتح بطاقة الكلمة (المعنى والمرادفات والأضداد والجمل)، وتحويل الكل لبطاقات مراجعة.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PressableScale } from "../components/brand/motion";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { WordSheet } from "../components/brand/word-sheet";
import { Radius } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { getWords, lookupWord, wordsToCards, type SavedWord } from "../lib/words";
import { exportWordsPdf } from "../lib/wordsPdf";

export default function WordsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [q, setQ] = useState("");
  const [book, setBook] = useState<string | null>(null);
  const [open, setOpen] = useState<SavedWord | null>(null);
  const [carded, setCarded] = useState(0);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  // وضع التحديد: يختار الطالب الكلمات التي تدخل الملف/البطاقات بنفسه
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [nameOpen, setNameOpen] = useState(false);
  const [fileName, setFileName] = useState("");

  function togglePick(key: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  // PDF مرتّب: نجهّز معاني الكلمات الناقصة أولًا ثم ننشئ الملف ونفتح الحفظ/المشاركة
  async function makePdf() {
    setNameOpen(false);
    if (pdfBusy || !target.length) return;
    const list = [...target];
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
        title: fileName.trim() || t("words.pdfTitle"),
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
        page: t("glossary.col.page"),
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
  // الهدف: الكلمات المحدّدة (إن وُجد تحديد) وإلا كل المعروض
  const target = selecting && picked.size ? shown.filter((w) => picked.has(w.key)) : shown;
  const ready = target.filter((w) => w.info);

  const shadowTint = pal.dark ? "#000" : "#3C5028";
  const ctaOff = carded > 0 || !ready.length;

  return (
    <SceneScreen>
      <SceneBanner
        title={t("words.title")}
        subtitle={selecting ? t("words.picked", { n: picked.size }) : t("words.count", { n: words.length })}
        height={160}
        left={
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
          >
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          words.length > 0 ? (
            <PressableScale
              onPress={() => {
                setSelecting((v) => !v);
                setPicked(new Set());
                setCarded(0);
              }}
              style={[
                styles.selBtn,
                { flexDirection: dir.row },
                selecting
                  ? { backgroundColor: pal.accent }
                  : { backgroundColor: pal.dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.8)" },
              ]}
            >
              <Ionicons name={selecting ? "checkmark" : "checkbox-outline"} size={16} color={selecting ? pal.onAccent : pal.ink} />
              <Text style={[styles.selTxt, { color: selecting ? pal.onAccent : pal.ink }]}>
                {selecting ? t("words.selectDone") : t("words.select")}
              </Text>
            </PressableScale>
          ) : undefined
        }
      />

      {words.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: pal.soft }]}>
            <Ionicons name="hand-left-outline" size={30} color={pal.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: pal.ink }]}>{t("words.emptyTitle")}</Text>
          <Text style={[styles.emptyBody, { color: pal.dim }]}>{t("words.emptyBody")}</Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(w) => w.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 10, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 6 }}>
              <View
                style={[
                  styles.search,
                  { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: shadowTint },
                ]}
              >
                <Ionicons name="search" size={18} color={pal.dim} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder={t("words.search")}
                  placeholderTextColor={pal.dim}
                  selectionColor={pal.accent}
                  style={[styles.searchInput, { color: pal.ink, textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                />
              </View>
              {selecting && (
                <View style={[styles.filters, { flexDirection: dir.row }]}>
                  <Pressable
                    onPress={() => setPicked(new Set(shown.map((w) => w.key)))}
                    style={[styles.filter, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}
                  >
                    <Text style={[styles.filterTxt, { color: pal.ink }]}>{t("words.selectAll")}</Text>
                  </Pressable>
                  {picked.size > 0 && (
                    <Pressable
                      onPress={() => setPicked(new Set())}
                      style={[styles.filter, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}
                    >
                      <Text style={[styles.filterTxt, { color: pal.ink }]}>{t("words.selectNone")}</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {books.length > 1 && (
                <View style={[styles.filters, { flexDirection: dir.row }]}>
                  <Pressable
                    onPress={() => setBook(null)}
                    style={[styles.filter, !book ? { backgroundColor: pal.accent, borderColor: pal.accent } : { backgroundColor: pal.card, borderColor: pal.cardBorder }]}
                  >
                    <Text style={[styles.filterTxt, { color: !book ? pal.onAccent : pal.dim }, !book && styles.filterTxtOn]}>
                      {t("glossary.k.all")}
                    </Text>
                  </Pressable>
                  {books.map((b) => {
                    const on = book === b;
                    return (
                      <Pressable
                        key={b}
                        onPress={() => setBook(b)}
                        style={[styles.filter, on ? { backgroundColor: pal.accent, borderColor: pal.accent } : { backgroundColor: pal.card, borderColor: pal.cardBorder }]}
                      >
                        <Text style={[styles.filterTxt, { color: on ? pal.onAccent : pal.dim }, on && styles.filterTxtOn]} numberOfLines={1}>
                          {b}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          }
          renderItem={({ item: w }) => {
            const on = selecting && picked.has(w.key);
            return (
              <PressableScale onPress={() => (selecting ? togglePick(w.key) : setOpen(w))}>
                <SceneCard
                  padded={false}
                  style={[
                    styles.row,
                    { flexDirection: dir.row },
                    on && { backgroundColor: pal.soft, borderColor: pal.accent, borderWidth: 1 },
                  ]}
                >
                  {selecting && (
                    <View
                      style={[
                        styles.check,
                        { borderColor: on ? pal.accent : pal.dim + "88" },
                        on && { backgroundColor: pal.accent },
                      ]}
                    >
                      {on && <Ionicons name="checkmark" size={15} color={pal.onAccent} />}
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.word, { color: pal.ink, textAlign: dir.textAlign }]}>{w.word}</Text>
                    <Text style={[styles.meaning, { color: w.info ? pal.ink : pal.dim, textAlign: dir.textAlign }]} numberOfLines={2}>
                      {w.info?.meaning ?? t("words.tapToExplain")}
                    </Text>
                    {!!w.bookTitle && (
                      <Text style={[styles.src, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={1}>
                        {w.bookTitle}
                        {w.page ? ` · ${t("glossary.page", { p: w.page })}` : ""}
                      </Text>
                    )}
                  </View>
                  {!selecting && <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />}
                </SceneCard>
              </PressableScale>
            );
          }}
        />
      )}

      {shown.length > 0 && (
        <View style={[styles.bottom, { flexDirection: dir.row }]}>
          <PressableScale
            onPress={() => {
              if (!fileName) setFileName(book ?? t("words.pdfTitle"));
              setNameOpen(true);
            }}
            disabled={!!pdfBusy || !target.length}
            style={{ flex: 1 }}
          >
            <View
              style={[
                styles.cta,
                styles.ctaShadow,
                { backgroundColor: pal.card, borderWidth: 1, borderColor: pal.cardBorder, shadowColor: shadowTint },
              ]}
            >
              {pdfBusy ? <ActivityIndicator color={pal.accent} /> : <Ionicons name="document-text" size={18} color={pal.accent} />}
              <Text style={[styles.ctaTxt, { color: pal.ink }]} numberOfLines={1}>
                {pdfBusy ?? (selecting && picked.size ? t("words.pdfN", { n: picked.size }) : t("words.pdf"))}
              </Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={async () => {
              const n = await wordsToCards(ready);
              setCarded(n);
            }}
            disabled={ctaOff}
            style={{ flex: 1 }}
          >
            <View style={[styles.cta, styles.ctaShadow, { backgroundColor: pal.accent, shadowColor: shadowTint }, ctaOff && { opacity: 0.55 }]}>
              <Ionicons name={carded ? "checkmark" : "albums"} size={18} color={pal.onAccent} />
              <Text style={[styles.ctaTxt, { color: pal.onAccent }]} numberOfLines={1}>
                {carded
                  ? t("words.carded", { n: carded })
                  : selecting && picked.size
                    ? t("words.toCardsN", { n: ready.length })
                    : t("words.allToCards", { n: ready.length })}
              </Text>
            </View>
          </PressableScale>
        </View>
      )}

      {/* اسم ملف الدراسة قبل إنشائه */}
      <Modal visible={nameOpen} transparent animationType="fade" onRequestClose={() => setNameOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.mask, { backgroundColor: pal.dark ? "rgba(0,0,0,0.6)" : "rgba(31,53,39,0.35)" }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNameOpen(false)} />
          <View style={[styles.nameCard, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
            <Text style={[styles.nameTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("words.fileName")}</Text>
            <Text style={[styles.sub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("words.fileHint", { n: target.length })}</Text>
            <TextInput
              value={fileName}
              onChangeText={setFileName}
              autoFocus
              selectTextOnFocus
              placeholder={t("words.pdfTitle")}
              placeholderTextColor={pal.dim}
              selectionColor={pal.accent}
              style={[
                styles.nameInput,
                { color: pal.ink, backgroundColor: pal.soft, borderColor: pal.cardBorder, textAlign: dir.textAlign, writingDirection: dir.writingDirection },
              ]}
              onSubmitEditing={makePdf}
              returnKeyType="done"
            />
            <PressableScale onPress={makePdf}>
              <View style={[styles.cta, { backgroundColor: pal.accent }]}>
                <Ionicons name="document-text" size={18} color={pal.onAccent} />
                <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>{t("words.create")}</Text>
              </View>
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <WordSheet
        word={open}
        onClose={() => {
          setOpen(null);
          reload();
        }}
        onRemoved={reload}
      />
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 12.5, marginTop: 1, lineHeight: 19 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  emptyBody: { fontSize: 14.5, lineHeight: 24, textAlign: "center" },
  search: {
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  searchInput: { flex: 1, fontSize: 14.5, padding: 0 },
  filters: { flexWrap: "wrap", gap: 6 },
  filter: { maxWidth: 200, paddingHorizontal: 13, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  filterTxt: { fontSize: 12.5, fontWeight: "700" },
  filterTxtOn: { fontWeight: "900" },
  row: { alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 22 },
  word: { fontSize: 17, fontWeight: "900" },
  meaning: { fontSize: 13.5, lineHeight: 21, opacity: 0.85 },
  src: { fontSize: 11.5, fontWeight: "600" },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 26, gap: 8 },
  cta: { height: 54, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  ctaShadow: { shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  ctaTxt: { fontSize: 14.5, fontWeight: "900", flexShrink: 1 },
  selBtn: { alignItems: "center", gap: 5, height: 40, paddingHorizontal: 14, borderRadius: Radius.pill },
  selTxt: { fontSize: 13, fontWeight: "800" },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  mask: { flex: 1, justifyContent: "center", padding: 24 },
  nameCard: { borderRadius: 26, padding: 20, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  nameTitle: { fontSize: 18, fontWeight: "900" },
  nameInput: { height: 50, borderRadius: 16, paddingHorizontal: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
});
