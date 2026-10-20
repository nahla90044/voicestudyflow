// app/unit-cards.tsx
// بطاقات الوحدة (أو الكتاب كله) في شاشتها: تُفتح من الوحدة في المنهج أو من أدوات الكتاب، وتُغلق فترجع
// لنفس المكان بالضبط. فيها: مراجعة البطاقة بالقلب والتقييم، والتنقل، والاستماع، والمفضلة، والحذف،
// وتوليد بطاقات من صفحات الوحدة نفسها، وطباعتها. لا تنقل المستخدم لتبويب «المراجعة».
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { CARD_TYPES, generateFlashcards, type CardType } from "../lib/ai";
import { addCards, getCards, removeCard, reviewCard, setCardFav, type Card, type Rating } from "../lib/flashcards";
import { getCachedUnitRanges, getUnitRanges } from "../lib/glossary";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { cardsHtml, sharePdf } from "../lib/studySaves";
import { supabase } from "../lib/supabase";
import { getSyllabus } from "../lib/syllabus";
import { unitText } from "../lib/unitScope";
import { speakText, stopSpeaking } from "../lib/voice";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function UnitCardsScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const p = useLocalSearchParams<{ book_id?: string; pdf_path?: string; unit?: string; book_title?: string }>();
  const bookId = typeof p.book_id === "string" ? p.book_id : "";
  const pdfPath = typeof p.pdf_path === "string" ? p.pdf_path : "";
  const unit = p.unit != null && p.unit !== "" && Number.isFinite(Number(p.unit)) ? Number(p.unit) : null; // null = الكتاب كله
  const bookTitle = typeof p.book_title === "string" ? p.book_title : "";

  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [unitTitle, setUnitTitle] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    let r: { from: number; to: number } | null = null;
    if (unit !== null) {
      const syl = await getSyllabus(pdfPath).catch(() => null);
      const titles = syl?.data.units.map((u) => u.title) ?? [];
      setUnitTitle(titles[unit] ?? "");
      let rs = await getCachedUnitRanges(pdfPath, titles.length);
      if (!rs && titles.length) {
        const { data } = await supabase.from("books").select("page_count").eq("id", bookId).maybeSingle();
        rs = await getUnitRanges(pdfPath, titles, Number(data?.page_count) || 0).catch(() => null);
      }
      r = rs?.[unit] ?? null;
      setRange(r);
    }
    const all = (await getCards()).filter((c) => c.bookId === bookId && !c.archived);
    const mine = unit === null ? all : r ? all.filter((c) => c.page != null && c.page >= r!.from && c.page <= r!.to) : [];
    // المستحق أولًا ثم البقية
    const today = todayISO();
    mine.sort((a, b) => Number(a.due > today) - Number(b.due > today));
    setCards(mine);
    setIdx((i) => Math.min(i, Math.max(0, mine.length - 1)));
  }, [bookId, pdfPath, unit]);

  useEffect(() => {
    void load();
    return () => void stopSpeaking();
  }, [load]);

  const card = cards?.[idx];
  const title = unit !== null ? unitTitle || t("glossary.unitN", { n: unit + 1 }) : t("flashcards.bookAll");

  function resetFace() {
    flip.setValue(0);
    setFlipped(false);
    if (speaking) {
      void stopSpeaking();
      setSpeaking(false);
    }
  }
  function toggleFlip() {
    Animated.spring(flip, { toValue: flipped ? 0 : 180, useNativeDriver: true, friction: 9, tension: 12 }).start();
    setFlipped((f) => !f);
  }
  function go(d: number) {
    if (!cards?.length) return;
    resetFace();
    setIdx((i) => Math.min(cards.length - 1, Math.max(0, i + d)));
  }
  async function rate(r: Rating) {
    if (!card) return;
    await reviewCard(card.id, r);
    resetFace();
    if (cards && idx < cards.length - 1) setIdx(idx + 1);
    else Alert.alert(t("ucards.doneTitle"), t("ucards.doneBody"));
  }
  async function toggleFav() {
    if (!card) return;
    const fav = !card.fav;
    setCards((cs) => cs?.map((c) => (c.id === card.id ? { ...c, fav } : c)) ?? cs);
    await setCardFav(card.id, fav);
  }
  function listen() {
    if (!card) return;
    if (speaking) {
      void stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const done = () => setSpeaking(false);
    void speakText(flipped ? card.back : card.front, { onDone: done, onError: done }).catch(done);
  }
  function confirmDelete() {
    if (!card) return;
    Alert.alert(t("flashcards.delete.cardTitle"), t("flashcards.delete.cardBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await removeCard(card.id);
          resetFace();
          void load();
        },
      },
    ]);
  }

  function chooseGenerate() {
    if (unit === null || !range) return;
    Alert.alert(t("ucards.genTitle"), t("ucards.genBody", { from: range.from, to: range.to }), [
      ...CARD_TYPES.map((ct) => ({ text: t(`cards.type.${ct}`), onPress: () => void generate(ct) })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }
  async function generate(ct: CardType) {
    if (!range) return;
    setBusy(true);
    try {
      const text = await unitText(pdfPath, range.from, range.to);
      if (!text.trim()) throw new Error("empty");
      const made = await generateFlashcards(text, 12, ct);
      if (!made.length) throw new Error("empty");
      await addCards(made.map((c) => ({ ...c, bookId, bookTitle, kind: ct, page: range.from })));
      setIdx(0);
      resetFace();
      await load();
    } catch (e) {
      Alert.alert(t("ucards.genTitle"), (e as Error)?.message === "USER_QUOTA" ? t("pay.reason.ai") : t("ucards.genFail"));
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    if (!cards?.length) return;
    const name = unit !== null ? `${bookTitle} — ${title}` : bookTitle;
    try {
      await sharePdf(cardsHtml({ bookTitle, title: name, cards: cards.map((c) => ({ front: c.front, back: c.back })), rtl: dir.isRTL }), name);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    }
  }

  const frontStyle = { transform: [{ perspective: 1200 }, { rotateY: flip.interpolate({ inputRange: [0, 180], outputRange: ["0deg", "180deg"] }) }] };
  const backStyle = { transform: [{ perspective: 1200 }, { rotateY: flip.interpolate({ inputRange: [0, 180], outputRange: ["180deg", "360deg"] }) }] };
  const dueCount = useMemo(() => (cards ?? []).filter((c) => c.due <= todayISO()).length, [cards]);

  return (
    <SceneScreen>
      <SceneBanner
        title={title}
        subtitle={[bookTitle, range ? t("glossary.pages", { from: range.from, to: range.to }) : ""].filter(Boolean).join(" · ") || undefined}
        height={150}
        left={
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/book/[id]", params: { id: bookId } }))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
        right={
          cards?.length ? (
            <Pressable onPress={() => void print()} hitSlop={8} accessibilityLabel={t("flashcards.print")}>
              <SceneIconButton>
                <Ionicons name="print" size={20} color={pal.ink} />
              </SceneIconButton>
            </Pressable>
          ) : undefined
        }
      />

      {cards === null ? (
        <ActivityIndicator color={pal.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ملخص سريع + التوليد */}
          <View style={[styles.topRow, { flexDirection: dir.row }]}>
            <Text style={[styles.count, { color: pal.dim, textAlign: dir.textAlign }]}>
              {t("ucards.count", { n: cards.length, due: dueCount })}
            </Text>
            {unit !== null && range ? (
              <Pressable onPress={chooseGenerate} disabled={busy} style={[styles.genBtn, { backgroundColor: pal.soft, borderColor: pal.accent, flexDirection: dir.row }]}>
                {busy ? <ActivityIndicator size="small" color={pal.accent} /> : <Ionicons name="add" size={17} color={pal.accent} />}
                <Text style={[styles.genTxt, { color: pal.ink }]}>{busy ? t("ucards.generating") : t("ucards.generate")}</Text>
              </Pressable>
            ) : null}
          </View>

          {!cards.length ? (
            <SceneCard style={{ padding: Spacing.lg, gap: 8 }}>
              <Text style={[styles.emptyTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("ucards.emptyTitle")}</Text>
              <Text style={[styles.emptyBody, { color: pal.dim, textAlign: dir.textAlign }]}>
                {unit !== null ? t("ucards.emptyUnit") : t("ucards.emptyBook")}
              </Text>
            </SceneCard>
          ) : card ? (
            <>
              {/* البطاقة */}
              <View style={styles.cardArea}>
                <Pressable onPress={toggleFlip} style={{ flex: 1 }}>
                  <Animated.View style={[styles.face, frontStyle, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
                    <Text style={[styles.faceLbl, { color: pal.dim }]}>{t("flashcards.question")}</Text>
                    <ScrollView contentContainerStyle={styles.faceIn} showsVerticalScrollIndicator={false}>
                      <Text style={[styles.faceTxt, { color: pal.ink }]}>{card.front}</Text>
                    </ScrollView>
                    <Text style={[styles.hint, { color: pal.accent }]}>{t("flashcards.tapToFlip")}</Text>
                  </Animated.View>
                  <Animated.View style={[styles.face, backStyle, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
                    <Text style={[styles.faceLbl, { color: pal.accent }]}>{t("flashcards.answer")}</Text>
                    <ScrollView contentContainerStyle={styles.faceIn} showsVerticalScrollIndicator={false}>
                      <Text style={[styles.faceTxt, { color: pal.ink }]}>{card.back}</Text>
                    </ScrollView>
                  </Animated.View>
                </Pressable>
                {/* أدوات البطاقة */}
                <View style={[styles.cardTools, { flexDirection: dir.row }]}>
                  <Pressable onPress={listen} hitSlop={8} style={[styles.round, { backgroundColor: speaking ? pal.accent : pal.card }]} accessibilityLabel={t("ask.listen")}>
                    <Ionicons name={speaking ? "stop" : "volume-high"} size={17} color={speaking ? pal.onAccent : pal.accent} />
                  </Pressable>
                  <Text style={[styles.pos, { color: pal.dim }]}>
                    {idx + 1} / {cards.length}
                  </Text>
                  <Pressable onPress={() => void toggleFav()} hitSlop={8} style={[styles.round, { backgroundColor: card.fav ? "#F6C445" : pal.card }]} accessibilityLabel={t("flashcards.fav")}>
                    <Ionicons name={card.fav ? "star" : "star-outline"} size={17} color={card.fav ? "#3A2A00" : pal.accent} />
                  </Pressable>
                  <Pressable onPress={confirmDelete} hitSlop={8} style={[styles.round, { backgroundColor: pal.card }]} accessibilityLabel={t("common.delete")}>
                    <Ionicons name="trash-outline" size={17} color="#D9485A" />
                  </Pressable>
                </View>
              </View>

              {/* التنقل */}
              <View style={[styles.navRow, { flexDirection: dir.row }]}>
                <Pressable onPress={() => go(-1)} disabled={idx <= 0} style={[styles.navBtn, { backgroundColor: pal.card, borderColor: pal.cardBorder, flexDirection: dir.row, opacity: idx <= 0 ? 0.4 : 1 }]}>
                  <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
                  <Text style={[styles.navTxt, { color: pal.ink }]}>{t("flashcards.prev")}</Text>
                </Pressable>
                <Pressable onPress={() => go(1)} disabled={idx >= cards.length - 1} style={[styles.navBtn, { backgroundColor: pal.card, borderColor: pal.cardBorder, flexDirection: dir.row, opacity: idx >= cards.length - 1 ? 0.4 : 1 }]}>
                  <Text style={[styles.navTxt, { color: pal.ink }]}>{t("flashcards.next")}</Text>
                  <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={20} color={pal.ink} />
                </Pressable>
              </View>

              {/* التقييم بعد إظهار الإجابة */}
              {flipped ? (
                <View style={[styles.navRow, { flexDirection: dir.row }]}>
                  {(
                    [
                      ["again", "#FDE7E1", "#C2502E"],
                      ["good", "#FFF1D6", "#A8680F"],
                      ["easy", pal.accent, pal.onAccent],
                    ] as const
                  ).map(([r, bg, fg]) => (
                    <Pressable key={r} onPress={() => void rate(r)} style={[styles.rateBtn, { backgroundColor: bg }]}>
                      <Text style={[styles.rateTxt, { color: fg }]}>{t(`flashcards.rate.${r}`)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Pressable onPress={toggleFlip} style={[styles.reveal, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
                  <Ionicons name="eye" size={18} color={pal.onAccent} />
                  <Text style={[styles.rateTxt, { color: pal.onAccent }]}>{t("flashcards.revealAnswer")}</Text>
                </Pressable>
              )}
            </>
          ) : null}
        </ScrollView>
      )}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60, gap: 14 },
  topRow: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  count: { flex: 1, fontSize: 13.5, fontWeight: "800" },
  genBtn: { alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: Radius.pill, borderWidth: 1 },
  genTxt: { fontSize: 14, fontWeight: "900" },
  emptyTitle: { fontSize: 16, fontWeight: "900" },
  emptyBody: { fontSize: 14, lineHeight: 22 },
  cardArea: { height: 380, gap: 10 },
  face: { ...StyleSheet.absoluteFillObject, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg, alignItems: "center", backfaceVisibility: "hidden" },
  faceLbl: { fontSize: 12.5, fontWeight: "800" },
  faceIn: { flexGrow: 1, justifyContent: "center" },
  faceTxt: { fontSize: 21, lineHeight: 34, fontWeight: "800", textAlign: "center" },
  hint: { fontSize: 13, fontWeight: "800" },
  cardTools: { alignItems: "center", justifyContent: "center", gap: 14 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  pos: { fontSize: 13, fontWeight: "800", minWidth: 56, textAlign: "center" },
  navRow: { gap: 10 },
  navBtn: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  navTxt: { fontSize: 16, fontWeight: "800" },
  rateBtn: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rateTxt: { fontSize: 15, fontWeight: "900" },
  reveal: { height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 8 },
});
