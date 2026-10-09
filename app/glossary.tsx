// app/glossary.tsx
// قاموس الوحدة: يعرف صفحات الوحدة (من–إلى) ونوع الكتاب، ويجهّز للطالب أهم الكلمات
// والمصطلحات والتعاريف (الكتاب المنهجي)، أو المفردات والتعابير بأمثلتها (كتاب اللغة)،
// أو الشخصيات والأماكن والكلمات الصعبة (الرواية) — بدل أن يكتبها بنفسه.
// كل عنصر: استماع، حفظ كبطاقة، وفتح صفحته في القارئ.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PressableScale } from "../components/brand/motion";
import { Gradients, Palette, Radius } from "../constants/design";
import { getDownloadState, startDownload, subscribeDownload, type DownloadState } from "../lib/downloadManager";
import { addCards } from "../lib/flashcards";
import { getGlossary, setBookKind, type BookKind, type GlossaryItem, type UnitRange } from "../lib/glossary";
import { useDir, useI18n } from "../lib/i18n";
import { setLastPage } from "../lib/readerPrefs";
import { getSyllabus } from "../lib/syllabus";
import { speakText, stopSpeaking } from "../lib/voice";
import { addWord, type SavedWord } from "../lib/words";
import { WordSheet } from "../components/brand/word-sheet";

type Filter = "all" | GlossaryItem["k"];

const KIND_COLOR: Record<GlossaryItem["k"], string> = {
  term: "#B9AFFF",
  def: "#5ED9FF",
  word: "#6CF3C5",
  idiom: "#F79ACB",
  char: "#FFB38A",
  place: "#FBBF24",
};

export default function GlossaryScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pdf_path, book_id, book_title, unit, page_count } = useLocalSearchParams<{
    pdf_path?: string;
    book_id?: string;
    book_title?: string;
    unit?: string;
    page_count?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof book_id === "string" ? book_id : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";
  const pageCount = Number(page_count) || 0;

  const [titles, setTitles] = useState<string[]>([]);
  const [idx, setIdx] = useState(Number(unit ?? 0) || 0);
  const [items, setItems] = useState<GlossaryItem[]>([]);
  const [kind, setKind] = useState<BookKind | null>(null);
  const [range, setRange] = useState<UnitRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [dl, setDl] = useState<DownloadState | null>(getDownloadState());
  const [kindOpen, setKindOpen] = useState(false);
  const [wordSheet, setWordSheet] = useState<SavedWord | null>(null);

  async function chooseKind(k: BookKind) {
    setKindOpen(false);
    if (k === kind) return;
    await setBookKind(pdfPath, k, titles.length);
    setKind(k);
    void load(true);
  }

  useEffect(() => subscribeDownload(setDl), []);
  useEffect(() => () => void stopSpeaking(), []);

  useEffect(() => {
    getSyllabus(pdfPath)
      .then((r) => setTitles(r?.data.units.map((u) => u.title) ?? []))
      .catch(() => setTitles([]));
  }, [pdfPath]);

  const load = useCallback(
    async (force = false) => {
      if (!titles.length) return;
      setLoading(true);
      setFailed(false);
      setMissing(false);
      setFilter("all");
      try {
        const r = await getGlossary(pdfPath, idx, titles, pageCount, force);
        setItems(r.items);
        setKind(r.kind);
        setRange(r.range);
        setMissing(r.missingPages);
        if (!r.items.length && !r.missingPages) setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [pdfPath, idx, titles, pageCount]
  );
  useEffect(() => {
    void load();
  }, [load]);

  // بعد اكتمال تحميل الكتاب نعيد المحاولة تلقائيًا
  useEffect(() => {
    if (missing && dl && !dl.running && dl.done > 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dl?.running]);

  const kinds = useMemo(() => [...new Set(items.map((i) => i.k))], [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(
      (i) => (filter === "all" || i.k === filter) && (!s || i.t.toLowerCase().includes(s) || i.m.toLowerCase().includes(s))
    );
  }, [items, filter, q]);

  async function openPage(p: number) {
    if (!bookId) return;
    await setLastPage(bookId, p);
    router.push({ pathname: "/reader/[id]", params: { id: bookId, title: bookTitle, pdf_path: pdfPath } });
  }

  function listen(i: GlossaryItem) {
    if (speaking === i.t) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    setSpeaking(i.t);
    speakText(`${i.t}. ${i.m}${i.ex ? `. ${i.ex}` : ""}`, { onDone: () => setSpeaking(null), onError: () => setSpeaking(null) });
  }

  async function saveCards(list: GlossaryItem[]) {
    const fresh = list.filter((i) => !saved.has(i.t));
    if (!fresh.length) return;
    await addCards(fresh.map((i) => ({ front: i.t, back: i.ex ? `${i.m}\n\n${i.ex}` : i.m, bookId, bookTitle })));
    setSaved((s) => new Set([...s, ...fresh.map((i) => i.t)]));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* الرأس */}
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.ghost}>
          <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Palette.text} accessibilityLabel={t("common.back")} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("glossary.title")}</Text>
          <Text style={[styles.sub, { textAlign: dir.textAlign }]} numberOfLines={1}>
            {bookTitle}
          </Text>
        </View>
        {!loading && items.length > 0 && (
          <PressableScale onPress={() => void load(true)} style={styles.ghost}>
            <Ionicons name="refresh" size={19} color={Palette.text} accessibilityLabel={t("glossary.regenerate")} />
          </PressableScale>
        )}
      </View>

      {/* الوحدات */}
      {titles.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={[styles.units, { flexDirection: dir.row }]}
        >
          {titles.map((u, i) => (
            <Pressable key={i} onPress={() => setIdx(i)} style={[styles.unitChip, i === idx && styles.unitChipOn]}>
              <Text style={[styles.unitChipTxt, i === idx && styles.unitChipTxtOn]} numberOfLines={1}>
                {t("glossary.unitN", { n: i + 1 })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* بطاقة الوحدة: العنوان + صفحاتها + نوع الكتاب */}
        <View style={styles.unitCard}>
          <LinearGradient colors={["rgba(124,108,255,0.22)", "rgba(16,18,27,0)"]} style={StyleSheet.absoluteFill} />
          <Text style={[styles.unitTitle, { textAlign: dir.textAlign }]} numberOfLines={3}>
            {titles[idx] ?? ""}
          </Text>
          <View style={[styles.metaRow, { flexDirection: dir.row }]}>
            {range && (
              <PressableScale onPress={() => openPage(range.from)} style={styles.metaChip}>
                <Ionicons name="document-text-outline" size={13} color="#D9D3FF" />
                <Text style={styles.metaTxt}>
                  {t("glossary.pages", { from: range.from, to: range.to })}
                  {range.found ? "" : " " + t("glossary.approx")}
                </Text>
              </PressableScale>
            )}
            {kind && (
              <PressableScale onPress={() => setKindOpen((v) => !v)} style={[styles.metaChip, { backgroundColor: "rgba(108,243,197,0.10)" }]}>
                <Text style={[styles.metaTxt, { color: "#6CF3C5" }]}>{t(`glossary.kind.${kind}`)}</Text>
                <Ionicons name="chevron-down" size={13} color="#6CF3C5" />
              </PressableScale>
            )}
          </View>
          {kindOpen && (
            <View style={{ gap: 6 }}>
              <Text style={[styles.dim, { textAlign: dir.textAlign, fontSize: 12.5 }]}>{t("glossary.kindPick")}</Text>
              <View style={[styles.metaRow, { flexDirection: dir.row }]}>
                {(["textbook", "language", "novel", "general"] as BookKind[]).map((k) => (
                  <Pressable key={k} onPress={() => chooseKind(k)} style={[styles.filter, k === kind && styles.filterOn]}>
                    <Text style={[styles.filterTxt, k === kind && styles.filterTxtOn]}>{t(`glossary.kind.${k}`)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.neonViolet} />
            <Text style={styles.dim}>{titles.length ? t("glossary.loading") : t("glossary.noSyllabus")}</Text>
            {titles.length > 0 && <Text style={[styles.dim, { fontSize: 12.5 }]}>{t("quiz2.preparingHint")}</Text>}
          </View>
        ) : missing ? (
          <View style={styles.center}>
            <Ionicons name="cloud-download-outline" size={36} color={Palette.neonCyan} />
            <Text style={styles.dim}>{t("glossary.missing")}</Text>
            {dl?.running ? (
              <Text style={styles.dim}>{t("glossary.downloading", { done: dl.done, total: dl.total })}</Text>
            ) : (
              <PressableScale onPress={() => startDownload(pdfPath, bookTitle, pageCount)} style={styles.dlBtn}>
                <Text style={styles.dlTxt}>{t("glossary.download")}</Text>
              </PressableScale>
            )}
          </View>
        ) : failed ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={36} color={Palette.warn} />
            <Text style={styles.dim}>{t("glossary.failed")}</Text>
            <PressableScale onPress={() => void load(true)} style={styles.dlBtn}>
              <Text style={styles.dlTxt}>{t("glossary.retry")}</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            {/* بحث + تصفية */}
            <View style={[styles.search, { flexDirection: dir.row }]}>
              <Ionicons name="search" size={17} color={Palette.textDim} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={t("glossary.search")}
                placeholderTextColor={Palette.placeholder}
                style={[styles.searchInput, { textAlign: dir.textAlign }]}
              />
            </View>
            {kinds.length > 1 && (
              <View style={[styles.filters, { flexDirection: dir.row }]}>
                {(["all", ...kinds] as Filter[]).map((f) => (
                  <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterOn]}>
                    <Text style={[styles.filterTxt, filter === f && styles.filterTxtOn]}>
                      {t(`glossary.k.${f}`)} {f === "all" ? items.length : items.filter((i) => i.k === f).length}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {shown.map((i) => {
              const c = KIND_COLOR[i.k];
              const isSaved = saved.has(i.t);
              return (
                <View key={i.t} style={styles.item}>
                  <View style={[styles.itemHead, { flexDirection: dir.row }]}>
                    <View style={[styles.dot, { backgroundColor: c }]} />
                    <Text
                      style={[styles.term, { textAlign: dir.textAlign }]}
                      onLongPress={async () => {
                        const w = await addWord({ word: i.t, context: i.ex || i.m, bookId, bookTitle, page: i.p });
                        if (w) setWordSheet(w);
                      }}
                    >
                      {i.t}
                    </Text>
                    <Text style={[styles.kindTag, { color: c }]}>{t(`glossary.k.${i.k}`)}</Text>
                  </View>
                  <Text style={[styles.meaning, { textAlign: dir.textAlign }]} selectable>
                    {i.m}
                  </Text>
                  {!!i.ex && <Text style={[styles.example, { textAlign: dir.textAlign }]}>«{i.ex}»</Text>}
                  <View style={[styles.actions, { flexDirection: dir.row }]}>
                    <Pressable onPress={() => listen(i)} hitSlop={6} style={[styles.act, { flexDirection: dir.row }]}>
                      <Ionicons name={speaking === i.t ? "stop-circle" : "volume-medium"} size={16} color="#5ED9FF" />
                      <Text style={[styles.actTxt, { color: "#5ED9FF" }]}>{t("glossary.listen")}</Text>
                    </Pressable>
                    <Pressable onPress={() => saveCards([i])} hitSlop={6} style={[styles.act, { flexDirection: dir.row }]}>
                      <Ionicons name={isSaved ? "checkmark-circle" : "albums-outline"} size={16} color={isSaved ? "#6CF3C5" : "#F79ACB"} />
                      <Text style={[styles.actTxt, { color: isSaved ? "#6CF3C5" : "#F79ACB" }]}>
                        {isSaved ? t("glossary.saved") : t("glossary.saveCard")}
                      </Text>
                    </Pressable>
                    {!!i.p && (
                      <Pressable onPress={() => openPage(i.p as number)} hitSlop={6} style={[styles.act, { flexDirection: dir.row }]}>
                        <Ionicons name="document-text-outline" size={15} color="#B9AFFF" />
                        <Text style={[styles.actTxt, { color: "#B9AFFF" }]}>{t("glossary.page", { p: i.p })}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
            {!shown.length && <Text style={[styles.dim, { marginTop: 20 }]}>{t("glossary.noMatch")}</Text>}
            <View style={{ height: 90 }} />
          </>
        )}
      </ScrollView>

      {!loading && items.length > 0 && (
        <View style={styles.bottom}>
          <PressableScale onPress={() => saveCards(items)} disabled={saved.size >= items.length}>
            <LinearGradient colors={Gradients.neon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.saveAll, saved.size >= items.length && { opacity: 0.5 }]}>
              <Ionicons name="albums" size={18} color="#fff" />
              <Text style={styles.saveAllTxt}>
                {saved.size >= items.length ? t("glossary.allSaved") : t("glossary.saveAll", { n: items.length - saved.size })}
              </Text>
            </LinearGradient>
          </PressableScale>
        </View>
      )}
      <WordSheet word={wordSheet} onClose={() => setWordSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Palette.bg },
  head: { alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  ghost: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: Palette.text, fontSize: 19, fontWeight: "800" },
  sub: { color: Palette.textDim, fontSize: 12.5, marginTop: 1 },
  units: { gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, alignItems: "center" },
  unitChip: { paddingHorizontal: 14, height: 34, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.06)", justifyContent: "center" },
  unitChipOn: { backgroundColor: Palette.text },
  unitChipTxt: { color: "#C4C9D8", fontSize: 12.5, fontWeight: "600" },
  unitChipTxtOn: { color: Palette.bg, fontWeight: "800" },
  body: { padding: 16, gap: 10 },
  unitCard: {
    padding: 16,
    gap: 10,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(124,108,255,0.35)",
  },
  unitTitle: { color: Palette.text, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  metaRow: { flexWrap: "wrap", gap: 6 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, backgroundColor: "rgba(124,108,255,0.16)" },
  metaTxt: { color: "#D9D3FF", fontSize: 12, fontWeight: "700" },
  center: { alignItems: "center", gap: 10, paddingVertical: 40 },
  dim: { color: Palette.textDim, fontSize: 14, textAlign: "center", lineHeight: 22 },
  dlBtn: { paddingHorizontal: 18, height: 42, borderRadius: 14, backgroundColor: Palette.text, justifyContent: "center" },
  dlTxt: { color: Palette.bg, fontWeight: "800", fontSize: 14 },
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
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: "rgba(255,255,255,0.06)" },
  filterOn: { backgroundColor: "rgba(124,108,255,0.28)" },
  filterTxt: { color: "#C4C9D8", fontSize: 12.5, fontWeight: "600" },
  filterTxtOn: { color: Palette.text, fontWeight: "800" },
  item: {
    padding: 14,
    gap: 7,
    borderRadius: 18,
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  itemHead: { alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  term: { flex: 1, color: Palette.text, fontSize: 16, fontWeight: "800" },
  kindTag: { fontSize: 11.5, fontWeight: "700" },
  meaning: { color: "#C4C9D8", fontSize: 14, lineHeight: 23 },
  example: { color: "#8E95AB", fontSize: 13, fontStyle: "italic", lineHeight: 21 },
  actions: { gap: 16, marginTop: 2, flexWrap: "wrap" },
  act: { alignItems: "center", gap: 5 },
  actTxt: { fontSize: 12.5, fontWeight: "700" },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 26 },
  saveAll: { height: 54, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveAllTxt: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
});
