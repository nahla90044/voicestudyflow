// app/glossary.tsx
// قاموس الوحدة: يعرف صفحات الوحدة (من–إلى) ونوع الكتاب، ويجهّز للطالب أهم الكلمات
// والمصطلحات والتعاريف (الكتاب المنهجي)، أو المفردات والتعابير بأمثلتها (كتاب اللغة)،
// أو الشخصيات والأماكن والكلمات الصعبة (الرواية) — بدل أن يكتبها بنفسه.
// كل عنصر: استماع، حفظ كبطاقة، وفتح صفحته في القارئ.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CoachHelpButton, useCoachTour } from "../components/brand/coach-mark";
import { PressableScale } from "../components/brand/motion";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius } from "../constants/design";
import { getDownloadState, startDownload, subscribeDownload, type DownloadState } from "../lib/downloadManager";
import { addCards } from "../lib/flashcards";
import { getGlossary, setBookKind, type BookKind, type GlossaryItem, type UnitRange } from "../lib/glossary";
import { requestPaywall } from "../lib/plan";
import { useDir, useI18n } from "../lib/i18n";
import { setLastPage } from "../lib/readerPrefs";
import { useScene, type ScenePalette } from "../lib/scene";
import { getSyllabus } from "../lib/syllabus";
import { speakText, stopSpeaking } from "../lib/voice";
import { addWord, type SavedWord } from "../lib/words";
import { exportGlossaryPdf } from "../lib/wordsPdf";
import { WordSheet } from "../components/brand/word-sheet";

type Filter = "all" | GlossaryItem["k"];

// لون كل نوع: نسخة فاتحة للمشاهد الداكنة وأخرى أغمق تُقرأ على مشهد الحديقة الفاتح
const KIND_COLOR: Record<GlossaryItem["k"], { dark: string; light: string }> = {
  term: { dark: "#B9AFFF", light: "#5A4DB8" },
  def: { dark: "#5ED9FF", light: "#1D6F8E" },
  word: { dark: "#6CF3C5", light: "#22683A" },
  idiom: { dark: "#F79ACB", light: "#A8396F" },
  char: { dark: "#FFB38A", light: "#A2501E" },
  place: { dark: "#FBBF24", light: "#8F6206" },
};
function kindColor(k: GlossaryItem["k"], pal: ScenePalette) {
  return pal.dark ? KIND_COLOR[k].dark : KIND_COLOR[k].light;
}

export default function GlossaryScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const { pdf_path, book_id, book_title, unit, page_count, only_unit } = useLocalSearchParams<{
    only_unit?: string;
    pdf_path?: string;
    book_id?: string;
    book_title?: string;
    unit?: string;
    page_count?: string;
  }>();
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";
  const bookId = typeof book_id === "string" ? book_id : "";
  const bookTitle = typeof book_title === "string" ? book_title : "";
  // عدد صفحات الكتاب: من المعامل، وإلا من سجل الكتاب (عند الفتح من المنهج)
  const [pageCount, setPageCount] = useState(Number(page_count) || 0);
  useEffect(() => {
    if (pageCount || typeof book_id !== "string" || !book_id) return;
    supabase.from("books").select("page_count").eq("id", book_id).maybeSingle().then(({ data }) => {
      if (Number(data?.page_count)) setPageCount(Number(data!.page_count));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book_id]);

  const [titles, setTitles] = useState<string[]>([]);
  const [idx, setIdx] = useState(Number(unit ?? 0) || 0);
  const [items, setItems] = useState<GlossaryItem[]>([]);
  const [kind, setKind] = useState<BookKind | null>(null);
  const [range, setRange] = useState<UnitRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quota, setQuota] = useState(false); // انتهت الطلبات الذكية: لا معنى لإعادة المحاولة
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [dl, setDl] = useState<DownloadState | null>(getDownloadState());
  const [kindOpen, setKindOpen] = useState(false);
  const [wordSheet, setWordSheet] = useState<SavedWord | null>(null);
  const [printing, setPrinting] = useState(false);

  // جولة الإرشاد: تبدأ بعد تجهيز عناصر الوحدة
  const coach = useCoachTour(
    "glossary_v1",
    [
      { id: "units", title: t("coach.gl.units.title"), body: t("coach.gl.units.body"), shape: "rect" },
      { id: "range", title: t("coach.gl.range.title"), body: t("coach.gl.range.body"), shape: "rect" },
      { id: "filter", title: t("coach.gl.filter.title"), body: t("coach.gl.filter.body"), shape: "rect" },
      {
        id: "item",
        title: t("coach.gl.item.title"),
        body: t("coach.gl.item.body"),
        shape: "rect",
        rows: [
          { icon: "volume-medium", text: t("coach.gl.item.listen") },
          { icon: "albums-outline", text: t("coach.gl.item.card") },
          { icon: "document-text-outline", text: t("coach.gl.item.page") },
          { icon: "hand-left-outline", text: t("coach.gl.item.hold") },
        ],
      },
      { id: "print", title: t("coach.gl.print.title"), body: t("coach.gl.print.body") },
      { id: "all", title: t("coach.gl.all.title"), body: t("coach.gl.all.body"), shape: "rect" },
    ],
    { ready: !loading && items.length > 0 }
  );

  // ملف دراسة مطبوع للوحدة: جدول ملوّن (المصطلح · المعنى والمثال · الصفحة)
  async function printGlossary() {
    if (printing || !items.length) return;
    setPrinting(true);
    try {
      const unitTitle = [t("glossary.unitN", { n: idx + 1 }), titles[idx]].filter(Boolean).join(" · ");
      const pages = range ? t("glossary.pages", { from: range.from, to: range.to }) : "";
      await exportGlossaryPdf(
        filter === "all" ? items : items.filter((i) => i.k === filter),
        {
          title: bookTitle || t("glossary.title"),
          subtitle: [t("glossary.title"), pages, new Date().toLocaleDateString()].filter(Boolean).join(" · "),
          unitTitle,
          term: t("glossary.col.term"),
          meaning: t("glossary.col.meaning"),
          example: t("glossary.col.example"),
          page: t("glossary.col.page"),
          kindName: (k) => t(`glossary.k.${k}`),
          rtl: dir.isRTL,
        },
        idx
      );
    } finally {
      setPrinting(false);
    }
  }

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
      setQuota(false);
      setMissing(false);
      setFilter("all");
      try {
        const r = await getGlossary(pdfPath, idx, titles, pageCount, force);
        setItems(r.items);
        setKind(r.kind);
        setRange(r.range);
        setMissing(r.missingPages);
        if (!r.items.length && !r.missingPages) setFailed(true);
      } catch (e) {
        if ((e as Error).message === "USER_QUOTA") setQuota(true);
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
    speakText(`${i.t}${i.tr ? `. ${i.tr}` : ""}. ${i.m}${i.ex ? `. ${i.ex}` : ""}`, { onDone: () => setSpeaking(null), onError: () => setSpeaking(null) });
  }

  async function saveCards(list: GlossaryItem[]) {
    const fresh = list.filter((i) => !saved.has(i.t));
    if (!fresh.length) return;
    await addCards(fresh.map((i) => ({ front: i.tr ? `${i.t} ⇄ ${i.tr}` : i.t, back: i.ex ? `${i.m}\n\n${i.ex}` : i.m, bookId, bookTitle, page: i.p })));
    setSaved((s) => new Set([...s, ...fresh.map((i) => i.t)]));
  }

  const shadowTint = pal.dark ? "#000" : "#3C5028";
  const savedTint = pal.dark ? "#7FE8C4" : "#22683A";
  const chipOff = { backgroundColor: pal.card, borderColor: pal.cardBorder };
  const chipOn = { backgroundColor: pal.accent, borderColor: pal.accent };
  const allSaved = saved.size >= items.length;

  return (
    <SceneScreen>
      {/* الرأس */}
      <SceneBanner
        title={t("glossary.title")}
        subtitle={bookTitle}
        height={150}
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
          !loading && items.length > 0 ? (
            <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8 }}>
              <CoachHelpButton onPress={coach.replay} />
              <PressableScale {...coach.bind("print")} onPress={printGlossary} disabled={printing}>
                <SceneIconButton>
                  {printing ? (
                    <ActivityIndicator size="small" color={pal.ink} />
                  ) : (
                    <Ionicons name="print-outline" size={19} color={pal.ink} accessibilityLabel={t("glossary.print")} />
                  )}
                </SceneIconButton>
              </PressableScale>
              <PressableScale onPress={() => void load(true)}>
                <SceneIconButton>
                  <Ionicons name="refresh" size={19} color={pal.ink} accessibilityLabel={t("glossary.regenerate")} />
                </SceneIconButton>
              </PressableScale>
            </View>
          ) : undefined
        }
      />

      {/* الوحدات */}
      {/* من وحدة في المنهج: قاموسها هي فقط (بلا التنقل بين الوحدات) */}
      {titles.length > 1 && only_unit !== "1" && (
        <View {...coach.bind("units")} style={{ flexGrow: 0, flexShrink: 0 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={[styles.units, { flexDirection: dir.row }]}
          >
            {titles.map((u, i) => {
              const on = i === idx;
              return (
                <Pressable key={i} onPress={() => setIdx(i)} style={[styles.unitChip, on ? chipOn : chipOff]}>
                  <Text style={[styles.unitChipTxt, { color: on ? pal.onAccent : pal.dim }, on && styles.unitChipTxtOn]} numberOfLines={1}>
                    {t("glossary.unitN", { n: i + 1 })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* بطاقة الوحدة: العنوان + صفحاتها + نوع الكتاب */}
        <SceneCard style={[styles.unitCard, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
          <Text style={[styles.unitTitle, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={3}>
            {titles[idx] ?? ""}
          </Text>
          <View style={[styles.metaRow, { flexDirection: dir.row }]}>
            {range && (
              <PressableScale {...coach.bind("range")} onPress={() => openPage(range.from)} style={[styles.metaChip, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
                <Ionicons name="document-text-outline" size={13} color={pal.accent} />
                <Text style={[styles.metaTxt, { color: pal.ink }]}>
                  {t("glossary.pages", { from: range.from, to: range.to })}
                  {range.found ? "" : " " + t("glossary.approx")}
                </Text>
              </PressableScale>
            )}
            {kind && (
              <PressableScale
                onPress={() => setKindOpen((v) => !v)}
                style={[styles.metaChip, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.accent + "66" }]}
              >
                <Text style={[styles.metaTxt, { color: pal.accent }]}>{t(`glossary.kind.${kind}`)}</Text>
                <Ionicons name={kindOpen ? "chevron-up" : "chevron-down"} size={13} color={pal.accent} />
              </PressableScale>
            )}
          </View>
          {kindOpen && (
            <View style={{ gap: 6 }}>
              <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign, fontSize: 12.5 }]}>{t("glossary.kindPick")}</Text>
              <View style={[styles.metaRow, { flexDirection: dir.row }]}>
                {(["textbook", "language", "novel", "general"] as BookKind[]).map((k) => {
                  const on = k === kind;
                  return (
                    <Pressable key={k} onPress={() => chooseKind(k)} style={[styles.filter, on ? chipOn : chipOff]}>
                      <Text style={[styles.filterTxt, { color: on ? pal.onAccent : pal.dim }, on && styles.filterTxtOn]}>
                        {t(`glossary.kind.${k}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </SceneCard>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={pal.accent} />
            <Text style={[styles.dim, { color: pal.dim }]}>{titles.length ? t("glossary.loading") : t("glossary.noSyllabus")}</Text>
            {titles.length > 0 && <Text style={[styles.dim, { color: pal.dim, fontSize: 12.5 }]}>{t("quiz2.preparingHint")}</Text>}
          </View>
        ) : missing ? (
          <View style={styles.center}>
            <View style={[styles.stateIcon, { backgroundColor: pal.soft }]}>
              <Ionicons name="cloud-download-outline" size={32} color={pal.accent} />
            </View>
            <Text style={[styles.dim, { color: pal.dim }]}>{t("glossary.missing")}</Text>
            {dl?.running ? (
              <Text style={[styles.dim, { color: pal.dim }]}>{t("glossary.downloading", { done: dl.done, total: dl.total })}</Text>
            ) : (
              <PressableScale onPress={() => startDownload(pdfPath, bookTitle, pageCount)} style={[styles.dlBtn, { backgroundColor: pal.accent }]}>
                <Text style={[styles.dlTxt, { color: pal.onAccent }]}>{t("glossary.download")}</Text>
              </PressableScale>
            )}
          </View>
        ) : failed ? (
          <View style={styles.center}>
            <View style={[styles.stateIcon, { backgroundColor: pal.soft }]}>
              <Ionicons name="alert-circle-outline" size={32} color={pal.dark ? "#FFBE9A" : "#A2501E"} />
            </View>
            <Text style={[styles.dim, { color: pal.dim }]}>{quota ? t("pay.reason.ai") : t("glossary.failed")}</Text>
            <PressableScale
              onPress={() => (quota ? requestPaywall("ai", true) : void load(true))}
              style={[styles.dlBtn, { backgroundColor: pal.accent }]}
            >
              <Text style={[styles.dlTxt, { color: pal.onAccent }]}>{quota ? t("sub.upgrade") : t("glossary.retry")}</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            {/* بحث + تصفية */}
            <View style={[styles.search, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: shadowTint }]}>
              <Ionicons name="search" size={18} color={pal.dim} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={t("glossary.search")}
                placeholderTextColor={pal.dim}
                selectionColor={pal.accent}
                style={[styles.searchInput, { color: pal.ink, textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
              />
            </View>
            {kinds.length > 1 && (
              <View {...coach.bind("filter")} style={[styles.filters, { flexDirection: dir.row }]}>
                {(["all", ...kinds] as Filter[]).map((f) => {
                  const on = filter === f;
                  return (
                    <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, { flexDirection: dir.row }, on ? chipOn : chipOff]}>
                      {f !== "all" && <View style={[styles.dot, { backgroundColor: on ? pal.onAccent : kindColor(f, pal) }]} />}
                      <Text style={[styles.filterTxt, { color: on ? pal.onAccent : pal.dim }, on && styles.filterTxtOn]}>
                        {t(`glossary.k.${f}`)} {f === "all" ? items.length : items.filter((i) => i.k === f).length}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {shown.map((i, index) => {
              const c = kindColor(i.k, pal);
              const isSaved = saved.has(i.t);
              return (
                <SceneCard key={i.t} padded={false} style={styles.item}>
                  <View style={[styles.itemHead, { flexDirection: dir.row }]}>
                    <View style={[styles.dot, { backgroundColor: c }]} />
                    <Text
                      style={[styles.term, { color: pal.ink, textAlign: dir.textAlign }]}
                      onLongPress={async () => {
                        const w = await addWord({ word: i.t, context: i.ex || i.m, bookId, bookTitle, page: i.p });
                        if (w) setWordSheet(w);
                      }}
                    >
                      {i.t}
                    </Text>
                    <View style={[styles.kindPill, { backgroundColor: c + (pal.dark ? "22" : "18") }]}>
                      <Text style={[styles.kindTag, { color: c }]}>{t(`glossary.k.${i.k}`)}</Text>
                    </View>
                  </View>
                  {/* المقابل باللغة الأخرى (كتب الشهادات) */}
                  {!!i.tr && (
                    <Text style={[styles.trTxt, { color: pal.accent, textAlign: dir.textAlign }]} selectable>
                      ⇄ {i.tr}
                    </Text>
                  )}
                  <Text style={[styles.meaning, { color: pal.ink, textAlign: dir.textAlign }]} selectable>
                    {i.m}
                  </Text>
                  {!!i.ex && <Text style={[styles.example, { color: pal.dim, textAlign: dir.textAlign }]}>«{i.ex}»</Text>}
                  <View {...(index === 0 ? coach.bind("item") : null)} style={[styles.actions, { flexDirection: dir.row, borderTopColor: pal.track }]}>
                    <Pressable onPress={() => listen(i)} hitSlop={6} style={[styles.act, { flexDirection: dir.row, backgroundColor: speaking === i.t ? pal.accent : pal.soft }]}>
                      <Ionicons name={speaking === i.t ? "stop-circle" : "volume-medium"} size={16} color={speaking === i.t ? pal.onAccent : pal.accent} />
                      <Text style={[styles.actTxt, { color: speaking === i.t ? pal.onAccent : pal.ink }]}>{t("glossary.listen")}</Text>
                    </Pressable>
                    <Pressable onPress={() => saveCards([i])} hitSlop={6} style={[styles.act, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
                      <Ionicons name={isSaved ? "checkmark-circle" : "albums-outline"} size={16} color={isSaved ? savedTint : pal.accent} />
                      <Text style={[styles.actTxt, { color: isSaved ? savedTint : pal.ink }]}>
                        {isSaved ? t("glossary.saved") : t("glossary.saveCard")}
                      </Text>
                    </Pressable>
                    {!!i.p && (
                      <Pressable onPress={() => openPage(i.p as number)} hitSlop={6} style={[styles.act, { flexDirection: dir.row, backgroundColor: pal.soft }]}>
                        <Ionicons name="document-text-outline" size={15} color={pal.accent} />
                        <Text style={[styles.actTxt, { color: pal.ink }]}>{t("glossary.page", { p: i.p })}</Text>
                      </Pressable>
                    )}
                  </View>
                </SceneCard>
              );
            })}
            {!shown.length && <Text style={[styles.dim, { color: pal.dim, marginTop: 20 }]}>{t("glossary.noMatch")}</Text>}
            <View style={{ height: 90 }} />
          </>
        )}
      </ScrollView>

      {!loading && items.length > 0 && (
        <View style={styles.bottom}>
          <PressableScale {...coach.bind("all")} onPress={() => saveCards(items)} disabled={allSaved}>
            <View style={[styles.saveAll, { backgroundColor: pal.accent, shadowColor: shadowTint }, allSaved && { opacity: 0.5 }]}>
              <Ionicons name={allSaved ? "checkmark" : "albums"} size={18} color={pal.onAccent} />
              <Text style={[styles.saveAllTxt, { color: pal.onAccent }]}>
                {allSaved ? t("glossary.allSaved") : t("glossary.saveAll", { n: items.length - saved.size })}
              </Text>
            </View>
          </PressableScale>
        </View>
      )}
      <WordSheet word={wordSheet} onClose={() => setWordSheet(null)} />
      {coach.overlay}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  units: { gap: 6, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4, alignItems: "center" },
  unitChip: { paddingHorizontal: 14, height: 34, borderRadius: Radius.pill, justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  unitChipTxt: { fontSize: 12.5, fontWeight: "700" },
  unitChipTxtOn: { fontWeight: "900" },
  body: { padding: 16, gap: 10 },
  unitCard: { gap: 10, borderRadius: 24 },
  unitTitle: { fontSize: 17, fontWeight: "900", lineHeight: 26 },
  metaRow: { flexWrap: "wrap", gap: 6 },
  metaChip: { alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  metaTxt: { fontSize: 12, fontWeight: "800" },
  center: { alignItems: "center", gap: 10, paddingVertical: 40 },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  dim: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  dlBtn: { paddingHorizontal: 20, height: 44, borderRadius: 22, justifyContent: "center" },
  dlTxt: { fontWeight: "900", fontSize: 14 },
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
  filter: { alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  filterTxt: { fontSize: 12.5, fontWeight: "700" },
  filterTxtOn: { fontWeight: "900" },
  item: { padding: 16, gap: 8, borderRadius: 22 },
  itemHead: { alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  term: { flex: 1, fontSize: 16.5, fontWeight: "900" },
  kindPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.pill },
  kindTag: { fontSize: 11.5, fontWeight: "800" },
  meaning: { fontSize: 14, lineHeight: 23, opacity: 0.9 },
  example: { fontSize: 13, fontStyle: "italic", lineHeight: 21 },
  actions: { gap: 8, marginTop: 4, paddingTop: 10, flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth },
  act: { alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: Radius.pill },
  actTxt: { fontSize: 12.5, fontWeight: "800" },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 26 },
  saveAll: {
    height: 54,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  saveAllTxt: { fontSize: 15.5, fontWeight: "900" },
  trTxt: { fontSize: 15, fontWeight: "800", marginTop: -2 },
});
