import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { cachedCardImage, cardImageAvgSecs, cardImagesBlocked, getCardImage } from "../../lib/cardImage";

import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { Radius, Spacing } from "../../constants/design";
import { archiveCard, archiveCardsForBook, getCards, removeCard, removeCardsForBook, reviewCard, type Card, type Rating } from "../../lib/flashcards";
import { useDir, useI18n } from "../../lib/i18n";
import { getSavedItems, removeSavedItem, updateSavedItem, type SavedItem, type SavedKind } from "../../lib/savedStudy";
import { useScene } from "../../lib/scene";
import { removeUnitContent, type UnitContentKind } from "../../lib/unitContent";
import { speakText, stopSpeaking } from "../../lib/voice";

const ALL = "__all__";
const NONE = "__none__";

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type BookGroup = { key: string; title: string; total: number; due: number };

type StudyTab = "cards" | "summary" | "quiz";

/** حجم خط البطاقة حسب طول نصها: كان ثابتًا كبيرًا (٢٦) فيضيق عليه وجه البطاقة في الإجابات الطويلة */
function faceSize(text?: string) {
  const n = (text ?? "").length;
  const fontSize = n <= 40 ? 23 : n <= 90 ? 20 : n <= 160 ? 17.5 : n <= 260 ? 16 : 15;
  return { fontSize, lineHeight: Math.round(fontSize * 1.65) };
}

export default function FlashcardsScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const router = useRouter();
  const { pal } = useScene();
  const [tab, setTab] = useState<StudyTab>("cards");
  const [showArchived, setShowArchived] = useState(false); // عرض المؤرشفة بدل الحالية
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [all, setAll] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"picker" | "review">("picker");
  const [queue, setQueue] = useState<Card[]>([]);
  const [bookName, setBookName] = useState("");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const [speaking, setSpeaking] = useState(false); // زر الاستماع للوجه الظاهر من البطاقة
  const speakingRef = useRef(false);

  // جولة الإرشاد: شاشة الاختيار، ثم جولة ثانية عند أول دخول لوضع المراجعة
  const coach = useCoachTour("flashcards_v1", [
    { id: "seg", title: t("coach.fc.seg.title"), body: t("coach.fc.seg.body"), shape: "rect" },
    { id: "all", title: t("coach.fc.all.title"), body: t("coach.fc.all.body"), shape: "rect" },
    { id: "deck", title: t("coach.fc.deck.title"), body: t("coach.fc.deck.body"), shape: "rect" },
    { id: "words", title: t("coach.fc.words.title"), body: t("coach.fc.words.body") },
    { id: "gen", title: t("coach.fc.gen.title"), body: t("coach.fc.gen.body"), shape: "rect" },
  ]);
  const studyCoach = useCoachTour(
    "flashcards_study_v1",
    [
      { id: "card", title: t("coach.fc.card.title"), body: t("coach.fc.card.body"), shape: "rect" },
      { id: "listen", title: t("coach.fc.listen.title"), body: t("coach.fc.listen.body") },
      { id: "reveal", title: t("coach.fc.reveal.title"), body: t("coach.fc.reveal.body"), shape: "rect" },
      { id: "rate", title: t("coach.fc.rate.title"), body: t("coach.fc.rate.body"), shape: "rect" },
    ],
    { delay: 900, ready: mode === "review" }
  );

  const reload = useCallback(() => {
    setLoading(true);
    getCards().then((c) => {
      setAll(c);
      setLoading(false);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setMode("picker");
      reload();
      getSavedItems().then(setSaved);
    }, [reload])
  );

  // عناصر المحفوظات (ملخّصات/اختبارات) مجمَّعة حسب الكتاب للتبويب الحالي
  const savedGroups = useMemo(() => {
    const kind: SavedKind = tab === "quiz" ? "quiz" : "summary";
    // تبويب الملخّصات يضم ملخّصات الفيديو أيضًا (🎬)
    const sameTab = (k: SavedKind) => k === kind || (kind === "summary" && k === "video");
    // نعرض إمّا الحالية أو المؤرشفة (حسب الزر) — فلا تختلط ولا تختفي
    const items = saved
      .filter((s) => sameTab(s.kind) && (showArchived ? !!s.archived : !s.archived))
      .sort((a, b) => b.savedAt - a.savedAt);
    const map = new Map<string, { title: string; items: SavedItem[] }>();
    for (const it of items) {
      const g = map.get(it.pdfPath) ?? { title: it.bookTitle || it.label, items: [] };
      g.items.push(it);
      map.set(it.pdfPath, g);
    }
    return [...map.values()];
  }, [saved, tab, showArchived]);

  // عدد المؤرشفة للتبويب الحالي (لعرضه على زر الأرشيف)
  const archivedCount = useMemo(() => {
    if (tab === "cards") return all.filter((c) => c.archived).length;
    const kind: SavedKind = tab === "quiz" ? "quiz" : "summary";
    return saved.filter((s) => (s.kind === kind || (kind === "summary" && s.kind === "video")) && s.archived).length;
  }, [saved, all, tab]);

  // نوع التخزين في unitContent حسب المصدر (صفحة قارئ أم وحدة منهج)
  function contentKind(it: SavedItem): UnitContentKind {
    if (it.kind === "quiz") return it.page != null ? "pagequiz" : "quiz";
    return it.page != null ? "pagesummary" : "summary";
  }

  // حذف ملخّص/اختبار محفوظ (الفهرس + الملف المخزَّن) بعد تأكيد
  function deleteSaved(it: SavedItem) {
    Alert.alert(t("flashcards.saved.deleteTitle"), t("flashcards.saved.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await removeSavedItem(it.key);
          // الفيديو: يُحذف من الفهرس فقط (سيناريوه يبقى مخزَّنًا فيُفتح فورًا إن طُلب ثانية)
          if (it.kind !== "video") await removeUnitContent(it.pdfPath, it.page ?? it.unit ?? 0, contentKind(it));
          getSavedItems().then(setSaved);
        },
      },
    ]);
  }

  const refreshSaved = () => getSavedItems().then(setSaved);

  // قائمة خيارات العنصر المحفوظ (بالضغط المطوَّل) — بديل أنيق لأيقونة الحذف
  function savedMenu(it: SavedItem) {
    Alert.alert(it.label, undefined, [
      { text: t("study.menu.open"), onPress: () => openSaved(it) },
      { text: t("study.menu.rename"), onPress: () => renameSaved(it) },
      {
        text: it.studied ? t("study.menu.unstudied") : t("study.menu.studied"),
        onPress: () => updateSavedItem(it.key, { studied: !it.studied }).then(refreshSaved),
      },
      {
        text: it.archived ? t("study.menu.unarchive") : t("study.menu.archive"),
        onPress: () => updateSavedItem(it.key, { archived: !it.archived }).then(refreshSaved),
      },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteSaved(it) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  function renameSaved(it: SavedItem) {
    Alert.prompt?.(
      t("study.rename.title"),
      undefined,
      (txt?: string) => {
        const v = (txt || "").trim();
        if (v) updateSavedItem(it.key, { label: v }).then(refreshSaved);
      },
      "plain-text",
      it.label
    );
  }

  // قائمة خيارات كتاب البطاقات (بالضغط المطوَّل)
  function bookMenu(b: BookGroup) {
    Alert.alert(b.title, undefined, [
      { text: t("study.menu.review"), onPress: () => startBook(b.key, b.title) },
      {
        text: showArchived ? t("study.menu.unarchive") : t("study.menu.archive"),
        onPress: () => archiveCardsForBook(b.key === NONE ? undefined : b.key, !showArchived).then(reload),
      },
      { text: t("study.menu.deleteAll"), style: "destructive", onPress: () => deleteBookCards(b.key, b.title) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  function openSaved(it: SavedItem) {
    const params: Record<string, string> = {
      pdf_path: it.pdfPath,
      title: it.label,
      book_title: it.bookTitle,
    };
    if (it.page != null) params.page = String(it.page);
    if (it.unit != null) params.unit = String(it.unit);
    if (it.from != null && it.to != null) {
      params.from = String(it.from);
      params.to = String(it.to);
    }
    router.push({ pathname: it.kind === "quiz" ? "/unit-quiz" : it.kind === "video" ? "/unit-video" : "/unit-summary", params });
  }

  // البطاقات ضمن العرض الحالي (الحالية أو المؤرشفة حسب المبدّل)
  const inView = useCallback((c: Card) => (showArchived ? !!c.archived : !c.archived), [showArchived]);

  const books = useMemo<BookGroup[]>(() => {
    const today = todayISO();
    const map = new Map<string, BookGroup>();
    for (const c of all) {
      if (!inView(c)) continue;
      const key = c.bookId ?? NONE;
      const g = map.get(key) ?? { key, title: c.bookTitle || t("flashcards.generalCards"), total: 0, due: 0 };
      g.total += 1;
      if (c.due <= today) g.due += 1;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.due - a.due);
  }, [all, t, inView]);

  const totalDue = useMemo(() => {
    const today = todayISO();
    return all.filter((c) => !c.archived && c.due <= today).length;
  }, [all]);

  function startBook(key: string, title: string) {
    const today = todayISO();
    const inBook = (c: Card) => (key === ALL || (c.bookId ?? NONE) === key) && inView(c);
    let q = all.filter((c) => inBook(c) && c.due <= today);
    if (q.length === 0) q = all.filter(inBook); // لا مستحقّ؟ راجعي كل بطاقات الكتاب
    setQueue(q);
    setBookName(title);
    setIdx(0);
    setFlipped(false);
    flip.setValue(0);
    setMode("review");
  }

  function toggleFlip() {
    Animated.spring(flip, { toValue: flipped ? 0 : 180, useNativeDriver: true, friction: 9, tension: 12 }).start();
    setFlipped((f) => !f);
  }

  async function rate(r: Rating) {
    const card = queue[idx];
    if (card) await reviewCard(card.id, r);
    flip.setValue(0);
    setFlipped(false);
    setIdx((i) => i + 1);
  }

  // تنقّل حرّ بين البطاقات (بلا تقييم) — للأمام/الخلف
  function goCard(delta: number) {
    flip.setValue(0);
    setFlipped(false);
    setIdx((i) => Math.min(Math.max(0, i + delta), Math.max(0, queue.length - 1)));
  }

  // حذف البطاقة الحالية (بعد تأكيد) ثم المتابعة للتالية
  function deleteCurrentCard() {
    const card = queue[idx];
    if (!card) return;
    Alert.alert(t("flashcards.delete.cardTitle"), t("flashcards.delete.cardBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await removeCard(card.id);
          setQueue((q) => q.filter((c) => c.id !== card.id));
          flip.setValue(0);
          setFlipped(false);
          reload();
        },
      },
    ]);
  }

  // قائمة البطاقة الحالية (ضغط مطوّل): أرشفة أو حذف
  function cardMenu() {
    const card = queue[idx];
    if (!card) return;
    Alert.alert(card.front, undefined, [
      {
        text: card.archived ? t("study.menu.unarchive") : t("study.menu.archive"),
        onPress: async () => {
          await archiveCard(card.id, !card.archived);
          setQueue((q) => q.filter((c) => c.id !== card.id));
          flip.setValue(0);
          setFlipped(false);
          reload();
        },
      },
      { text: t("common.delete"), style: "destructive", onPress: deleteCurrentCard },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  // حذف كل بطاقات كتاب (من القائمة) بعد تأكيد
  function deleteBookCards(key: string, title: string) {
    Alert.alert(t("flashcards.delete.bookTitle"), t("flashcards.delete.bookBody", { book: title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await removeCardsForBook(key === NONE ? undefined : key);
          reload();
        },
      },
    ]);
  }

  const card = queue[idx];
  const [img, setImg] = useState<{ url: string | null; loading: boolean; secs: number }>({ url: null, loading: false, secs: 0 });
  useEffect(() => {
    if (!card) return;
    let on = true;
    let tick: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const c = await cachedCardImage(card.front, card.back);
      if (!on) return;
      if (c !== undefined || cardImagesBlocked()) return setImg({ url: c ?? null, loading: false, secs: 0 });
      const t0 = Date.now();
      setImg({ url: null, loading: true, secs: 0 });
      tick = setInterval(() => on && setImg((x) => (x.loading ? { ...x, secs: Math.round((Date.now() - t0) / 1000) } : x)), 1000);
      const url = await getCardImage(card.front, card.back);
      if (on) setImg({ url, loading: false, secs: 0 });
    })();
    // البطاقة التالية تُجهَّز صورتها في الخلفية → تظهر فورًا عند الوصول إليها
    const nx = queue[idx + 1];
    if (nx && !cardImagesBlocked()) void getCardImage(nx.front, nx.back);
    return () => {
      on = false;
      if (tick) clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);
  const reviewDone = mode === "review" && idx >= queue.length;

  const frontStyle = {
    transform: [
      { perspective: 1200 },
      { rotateY: flip.interpolate({ inputRange: [0, 180], outputRange: ["0deg", "180deg"] }) },
    ],
  };
  const backStyle = {
    transform: [
      { perspective: 1200 },
      { rotateY: flip.interpolate({ inputRange: [0, 180], outputRange: ["180deg", "360deg"] }) },
    ],
  };

  // الاستماع للوجه الظاهر (سؤال أو إجابة) — ضغطة ثانية توقفه
  function listenCard() {
    const c = queue[idx];
    if (!c) return;
    if (speakingRef.current) {
      speakingRef.current = false;
      setSpeaking(false);
      void stopSpeaking();
      return;
    }
    speakingRef.current = true;
    setSpeaking(true);
    const done = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    speakText(flipped ? c.back : c.front, { onDone: done, onError: done }).catch(done);
  }

  // تغيّرت البطاقة/وجهها أو خرجنا من المراجعة → أوقف الصوت إن كان يعمل
  useEffect(() => {
    if (!speakingRef.current) return;
    speakingRef.current = false;
    setSpeaking(false);
    void stopSpeaking();
  }, [idx, flipped, mode]);

  // ألوان أزرار التقييم: صعب (أحمر هادئ) · جيد (كهرماني) · سهل (اللون المميّز)
  const hardTint = pal.dark ? { bg: "rgba(255,107,129,0.16)", fg: "#FF8A9B" } : { bg: "#FDE7E1", fg: "#C2502E" };
  const goodTint = pal.dark ? { bg: "rgba(246,197,95,0.16)", fg: "#F6C56A" } : { bg: "#FFF1D6", fg: "#A8680F" };
  const cardShadow = pal.dark ? "#000" : "#3C5028";

  // شرطات التقدّم: نعرضها شرطات حين يكون العدد معقولًا، وإلا شريطًا واحدًا
  const dashCount = Math.min(queue.length, 24);
  const useDashes = queue.length > 0 && queue.length <= 24;

  return (
    <SceneScreen>
      <SceneBanner
        title={t("flashcards.header.title")}
        subtitle={mode === "review" ? bookName : t("flashcards.header.subtitle")}
        height={mode === "review" ? 150 : 190}
        right={
          <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8 }}>
            <CoachHelpButton onPress={mode === "review" ? studyCoach.replay : coach.replay} />
            <Pressable {...coach.bind("words")} onPress={() => router.push("/words")} hitSlop={6} accessibilityLabel={t("words.title")}>
              <SceneIconButton>
                <Ionicons name="bookmarks" size={19} color={pal.ink} />
              </SceneIconButton>
            </Pressable>
          </View>
        }
      />

      {/* شريط التبويبات: بطاقات / ملخّصات / اختبارات (مركز مراجعة موحّد) */}
      <View style={[styles.segRow, { flexDirection: dir.row }]}>
        <View {...coach.bind("seg")} style={[styles.segWrap, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
          {(["cards", "summary", "quiz"] as StudyTab[]).map((seg) => {
            const on = tab === seg;
            return (
              <Pressable key={seg} onPress={() => setTab(seg)} style={[styles.segBtn, on && { backgroundColor: pal.accent }]}>
                <Text style={[styles.segTxt, { color: on ? pal.onAccent : pal.dim }]} numberOfLines={1}>
                  {t(`flashcards.tab.${seg}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode !== "review" ? (
        <Text style={[styles.longPressHint, { textAlign: dir.textAlign, color: pal.dim }]}>{t("study.longPressHint")}</Text>
      ) : null}

      {/* مبدّل: الحالية / المؤرشفة — لكل التبويبات (خارج وضع المراجعة) */}
      {mode !== "review" ? (
        <View style={[styles.archToggleRow, { flexDirection: dir.row }]}>
          {[false, true].map((arch) => {
            const on = showArchived === arch;
            return (
              <Pressable
                key={String(arch)}
                onPress={() => setShowArchived(arch)}
                style={[
                  styles.archToggle,
                  { backgroundColor: on ? pal.soft : "transparent", borderColor: on ? pal.accent : pal.cardBorder },
                ]}
              >
                <Text style={[styles.archToggleTxt, { color: on ? pal.accent : pal.dim }]}>
                  {arch
                    ? `${t("study.filter.archived")}${archivedCount > 0 ? ` (${archivedCount})` : ""}`
                    : t("study.filter.current")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {tab !== "cards" ? (
        savedGroups.length === 0 ? (
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: pal.soft }]}>
              <Ionicons name={tab === "quiz" ? "help-circle-outline" : "list-outline"} size={44} color={pal.accent} />
            </View>
            <Text style={[styles.doneTitle, { color: pal.ink }]}>
              {showArchived ? t("study.archived.emptyTitle") : t("flashcards.saved.emptyTitle")}
            </Text>
            <Text style={[styles.dim, { color: pal.dim }]}>
              {showArchived ? t("study.archived.emptyBody") : t("flashcards.saved.emptyBody")}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pickerWrap} showsVerticalScrollIndicator={false}>
            {savedGroups.map((g) => (
              <View key={g.items[0]?.pdfPath ?? g.title} style={{ gap: 8, marginBottom: 6 }}>
                <Text style={[styles.savedBook, { textAlign: dir.textAlign, color: pal.ink }]} numberOfLines={1}>
                  📖 {g.title}
                </Text>
                {g.items.map((it) => (
                  <Pressable key={it.key} onPress={() => openSaved(it)} onLongPress={() => savedMenu(it)} delayLongPress={300}>
                    <SceneCard style={[styles.bookRow, { flexDirection: dir.row }]}>
                      {it.studied ? <Ionicons name="checkmark-circle" size={18} color={pal.accent} /> : null}
                      <View style={styles.bookInfo}>
                        <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]} numberOfLines={2}>
                          {it.kind === "video" ? `🎬 ${it.label}` : it.label}
                        </Text>
                      </View>
                      <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={20} color={pal.dim} />
                    </SceneCard>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        )
      ) : mode === "picker" ? (
        loading ? (
          <View style={styles.center}>
            <Text style={[styles.dim, { color: pal.dim }]}>{t("common.loading")}</Text>
          </View>
        ) : books.length === 0 ? (
          <View style={styles.center}>
            <View style={[styles.emptyIcon, { backgroundColor: pal.soft }]}>
              <Ionicons name="albums-outline" size={44} color={pal.accent} />
            </View>
            <Text style={[styles.doneTitle, { color: pal.ink }]}>{t("flashcards.empty.title")}</Text>
            <Text style={[styles.dim, { color: pal.dim }]}>{t("flashcards.empty.body")}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pickerWrap} showsVerticalScrollIndicator={false}>
            {books.length > 1 ? (
              <Pressable {...coach.bind("all")} onPress={() => startBook(ALL, t("flashcards.allBooks"))}>
                <SceneCard style={[styles.bookRow, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
                  <View style={styles.bookInfo}>
                    <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]}>📚 {t("flashcards.allBooks")}</Text>
                    <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>
                      {t("flashcards.cardsCount", { count: all.length })}
                    </Text>
                  </View>
                  <View style={[styles.dueBadge, { backgroundColor: totalDue === 0 ? pal.track : pal.accent }]}>
                    <Text style={[styles.dueBadgeTxt, { color: totalDue === 0 ? pal.dim : pal.onAccent }]}>{totalDue}</Text>
                  </View>
                </SceneCard>
              </Pressable>
            ) : null}

            {books.map((b, index) => (
              <Pressable key={b.key} {...(index === 0 ? coach.bind("deck") : null)} onPress={() => startBook(b.key, b.title)} onLongPress={() => bookMenu(b)} delayLongPress={300}>
                <SceneCard style={[styles.bookRow, { flexDirection: dir.row }]}>
                  <View style={styles.bookInfo}>
                    <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]} numberOfLines={1}>
                      📖 {b.title}
                    </Text>
                    <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>
                      {t("flashcards.bookStats", { total: b.total, due: b.due })}
                    </Text>
                  </View>
                  <View style={[styles.dueBadge, { backgroundColor: b.due === 0 ? pal.track : pal.accent }]}>
                    <Text style={[styles.dueBadgeTxt, { color: b.due === 0 ? pal.dim : pal.onAccent }]}>{b.due}</Text>
                  </View>
                </SceneCard>
              </Pressable>
            ))}
          </ScrollView>
        )
      ) : reviewDone ? (
        /* ====== انتهت المراجعة ====== */
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: pal.soft }]}>
            <Ionicons name="checkmark-done-circle" size={52} color={pal.accent} />
          </View>
          <Text style={[styles.doneTitle, { color: pal.ink }]}>{t("flashcards.reviewDone", { book: bookName })}</Text>
          <Pressable
            onPress={() => setMode("picker")}
            style={[styles.primaryBtn, { backgroundColor: pal.accent, flexDirection: dir.row, alignSelf: "stretch", marginTop: Spacing.lg }]}
          >
            <Ionicons name={dir.isRTL ? "arrow-forward" : "arrow-back"} size={18} color={pal.onAccent} />
            <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("flashcards.backToBooks")}</Text>
          </Pressable>
        </View>
      ) : (
        /* ====== المراجعة ====== */
        <View style={styles.body}>
          <View style={[styles.reviewTop, { flexDirection: dir.row }]}>
            <Pressable
              onPress={() => setMode("picker")}
              hitSlop={8}
              style={[styles.backChip, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }]}
            >
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={16} color={pal.ink} />
              <Text style={[styles.backChipTxt, { color: pal.ink }]}>{t("flashcards.books")}</Text>
            </Pressable>
            <View style={[styles.reviewTopRight, { flexDirection: dir.row }]}>
              <Pressable
                onPress={() => goCard(-1)}
                disabled={idx <= 0}
                hitSlop={8}
                style={[styles.navChip, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}
              >
                <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={18} color={idx <= 0 ? pal.track : pal.ink} />
              </Pressable>
              <Text style={[styles.counter, { color: pal.dim }]}>
                {idx + 1} / {queue.length}
              </Text>
              <Pressable
                onPress={() => goCard(1)}
                disabled={idx >= queue.length - 1}
                hitSlop={8}
                style={[styles.navChip, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}
              >
                <Ionicons
                  name={dir.isRTL ? "chevron-back" : "chevron-forward"}
                  size={18}
                  color={idx >= queue.length - 1 ? pal.track : pal.ink}
                />
              </Pressable>
            </View>
          </View>

          {/* شرطات التقدّم: المنجز باللون المميّز والباقي بلون المسار */}
          {useDashes ? (
            <View style={[styles.dashRow, { flexDirection: dir.row }]}>
              {Array.from({ length: dashCount }).map((_, i) => (
                <View key={i} style={[styles.dash, { backgroundColor: i < idx ? pal.accent : i === idx ? pal.accent + "66" : pal.track }]} />
              ))}
            </View>
          ) : (
            <View style={[styles.barTrack, { backgroundColor: pal.track, flexDirection: dir.row }]}>
              <View style={[styles.barFill, { backgroundColor: pal.accent, width: `${queue.length ? (idx / queue.length) * 100 : 0}%` }]} />
            </View>
          )}

          <View style={styles.cardArea}>
            {/* بطاقتان خلف البطاقة الحالية توحيان بالرزمة */}
            <View style={[styles.deck, styles.deck2, { backgroundColor: pal.track, borderColor: pal.cardBorder }]} />
            <View style={[styles.deck, styles.deck1, { backgroundColor: pal.soft, borderColor: pal.cardBorder, shadowColor: cardShadow }]} />

            <Pressable {...studyCoach.bind("card")} onPress={toggleFlip} onLongPress={cardMenu} delayLongPress={450} style={styles.press}>
              <Animated.View
                style={[styles.face, frontStyle, { backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: cardShadow }]}
              >
                <View style={styles.faceInner}>
                  <View style={[styles.chip, { backgroundColor: pal.soft }]}>
                    <Text style={[styles.chipTxt, { color: pal.accent }]} numberOfLines={1}>
                      {card?.bookTitle || bookName || t("flashcards.question")}
                    </Text>
                  </View>
                  {/* صورة توضيحية للبطاقة (تسهيل الحفظ) — أول مرة تُجهَّز مع عدّاد ووقت متوقَّع */}
                  {img.url ? (
                    <Image source={{ uri: img.url }} style={styles.cardImg} contentFit="contain" transition={250} />
                  ) : img.loading ? (
                    <View style={[styles.cardImg, styles.cardImgWait, { backgroundColor: pal.soft }]}>
                      <ActivityIndicator color={pal.accent} />
                      <Text style={[styles.cardImgTxt, { color: pal.dim }]}>
                        {t("flashcards.img.loading", { s: img.secs })}
                      </Text>
                      <Text style={[styles.cardImgSub, { color: pal.dim }]}>{t("flashcards.img.usual", { n: cardImageAvgSecs() })}</Text>
                    </View>
                  ) : null}
                  <View style={styles.faceMid}>
                    <Text style={[styles.faceLabel, { color: pal.dim }]}>{t("flashcards.question")}</Text>
                    <ScrollView style={styles.faceScroll} contentContainerStyle={styles.faceScrollIn} showsVerticalScrollIndicator={false}>
                      <Text style={[styles.faceText, faceSize(card?.front), { color: pal.ink }]}>{card?.front}</Text>
                    </ScrollView>
                  </View>
                  <View style={[styles.tapHintRow, { flexDirection: dir.row }]}>
                    <Ionicons name="sync" size={13} color={pal.accent} />
                    <Text style={[styles.tapHint, { color: pal.accent }]}>{t("flashcards.tapToFlip")}</Text>
                  </View>
                </View>
              </Animated.View>
              <Animated.View
                style={[styles.face, backStyle, { backgroundColor: pal.card, borderColor: pal.accent + "55", shadowColor: cardShadow }]}
              >
                <View style={[styles.faceInner, { backgroundColor: pal.soft }]}>
                  <View style={[styles.chip, { backgroundColor: pal.card }]}>
                    <Text style={[styles.chipTxt, { color: pal.accent }]} numberOfLines={1}>
                      {t("flashcards.answer")}
                    </Text>
                  </View>
                  <View style={styles.faceMid}>
                    <Ionicons name="bulb-outline" size={22} color={pal.accent} />
                    <ScrollView style={styles.faceScroll} contentContainerStyle={styles.faceScrollIn} showsVerticalScrollIndicator={false}>
                      <Text style={[styles.faceText, faceSize(card?.back), { color: pal.ink }]}>{card?.back}</Text>
                    </ScrollView>
                  </View>
                  <View style={{ height: 18 }} />
                </View>
              </Animated.View>
            </Pressable>

            {/* زر استماع صغير في الزاوية (للوجه الظاهر) */}
            <Pressable
              {...studyCoach.bind("listen")}
              onPress={listenCard}
              hitSlop={8}
              accessibilityLabel={t("ask.listen")}
              style={[
                styles.listenBtn,
                dir.isRTL ? { left: 14 } : { right: 14 },
                { backgroundColor: speaking ? pal.accent : pal.soft },
              ]}
            >
              <Ionicons name={speaking ? "stop" : "volume-high"} size={17} color={speaking ? pal.onAccent : pal.accent} />
            </Pressable>
          </View>

          {flipped ? (
            <View {...studyCoach.bind("rate")} style={[styles.ratings, { flexDirection: dir.row }]}>
              <Pressable onPress={() => rate("again")} style={[styles.rateBtn, { backgroundColor: hardTint.bg }]}>
                <Text style={[styles.rateTxt, { color: hardTint.fg }]}>{t("flashcards.rate.again")}</Text>
              </Pressable>
              <Pressable onPress={() => rate("good")} style={[styles.rateBtn, { backgroundColor: goodTint.bg }]}>
                <Text style={[styles.rateTxt, { color: goodTint.fg }]}>{t("flashcards.rate.good")}</Text>
              </Pressable>
              <Pressable onPress={() => rate("easy")} style={[styles.rateBtn, { backgroundColor: pal.accent }]}>
                <Text style={[styles.rateTxt, { color: pal.onAccent }]}>{t("flashcards.rate.easy")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable {...studyCoach.bind("reveal")} onPress={toggleFlip} style={[styles.primaryBtn, { backgroundColor: pal.accent, flexDirection: dir.row }]}>
              <Ionicons name="eye" size={18} color={pal.onAccent} />
              <Text style={[styles.primaryTxt, { color: pal.onAccent }]}>{t("flashcards.revealAnswer")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* زر عائم: توليد مخصّص (اختيار الجزء/النوع/العدد) — يظهر خارج وضع المراجعة */}
      {mode !== "review" ? (
        <Pressable
          {...coach.bind("gen")}
          onPress={() => router.push("/generate-study")}
          style={[styles.fab, { flexDirection: dir.row, backgroundColor: pal.accent, shadowColor: pal.dark ? "#000" : pal.accent }]}
        >
          <Ionicons name="sparkles" size={20} color={pal.onAccent} />
          <Text style={[styles.fabTxt, { color: pal.onAccent }]}>{t("generate.fab")}</Text>
        </Pressable>
      ) : null}
      {coach.overlay}
      {studyCoach.overlay}
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 10 },
  dim: { fontSize: 14, textAlign: "center", lineHeight: 22, fontWeight: "600" },
  doneTitle: { fontSize: 17, fontWeight: "900", textAlign: "center", marginTop: 8 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },

  segRow: { paddingHorizontal: Spacing.xl, paddingBottom: 6 },
  segWrap: { flex: 1, padding: 4, gap: 4, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  segBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: Radius.pill },
  segTxt: { fontSize: 14, fontWeight: "800" },
  savedBook: { fontSize: 15, fontWeight: "900", marginTop: 6 },

  pickerWrap: { paddingHorizontal: Spacing.xl, paddingTop: 4, paddingBottom: 100, gap: 10 },
  bookRow: { alignItems: "center", gap: 12, borderRadius: 22, paddingVertical: 14 },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 16, fontWeight: "900" },
  bookSub: { fontSize: 12, fontWeight: "700", marginTop: 3 },
  dueBadge: { minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dueBadgeTxt: { fontWeight: "900", fontSize: 15 },

  body: { flex: 1, paddingHorizontal: Spacing.xl, paddingTop: 4, paddingBottom: 100, gap: 14 },
  reviewTop: { alignItems: "center", justifyContent: "space-between" },
  backChip: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backChipTxt: { fontSize: 13, fontWeight: "800" },
  counter: { fontSize: 13, fontWeight: "800" },
  reviewTopRight: { alignItems: "center", gap: 10 },
  navChip: { padding: 6, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  longPressHint: { fontSize: 12, fontWeight: "700", paddingHorizontal: Spacing.xl, paddingTop: 6 },
  archToggleRow: { gap: 8, paddingHorizontal: Spacing.xl, paddingTop: 10, paddingBottom: 10 },
  archToggle: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1 },
  archToggleTxt: { fontSize: 13, fontWeight: "800" },
  fab: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: Radius.pill,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabTxt: { fontSize: 15, fontWeight: "900" },

  dashRow: { gap: 4 },
  dash: { flex: 1, height: 5, borderRadius: 3 },
  barTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 5, borderRadius: 3 },

  cardArea: { flex: 1, marginBottom: 14 },
  deck: { position: "absolute", borderRadius: 28, borderWidth: StyleSheet.hairlineWidth },
  deck1: {
    top: 10,
    bottom: -8,
    left: 10,
    right: 10,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  deck2: { top: 20, bottom: -16, left: 22, right: 22 },
  press: { flex: 1 },
  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    backfaceVisibility: "hidden",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  faceInner: { flex: 1, borderRadius: 28, overflow: "hidden", alignItems: "center", padding: Spacing.lg, paddingTop: 16 },
  faceMid: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 2 },
  chip: { maxWidth: "70%", paddingVertical: 5, paddingHorizontal: 12, borderRadius: Radius.pill },
  chipTxt: { fontSize: 12, fontWeight: "800" },
  faceLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  faceText: { fontWeight: "800", textAlign: "center" },
  faceScroll: { flexGrow: 0, alignSelf: "stretch" },
  cardImg: { alignSelf: "stretch", height: "34%", marginTop: 10, borderRadius: 18 },
  cardImgWait: { alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12 },
  cardImgTxt: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  cardImgSub: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  faceScrollIn: { flexGrow: 1, justifyContent: "center" },
  tapHintRow: { alignItems: "center", gap: 6 },
  tapHint: { fontSize: 13, fontWeight: "800" },
  listenBtn: { position: "absolute", top: 14, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  ratings: { gap: 8 },
  rateBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 18 },
  rateTxt: { fontSize: 15, fontWeight: "900" },
  primaryBtn: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 18 },
  primaryTxt: { fontSize: 15, fontWeight: "900" },
});
