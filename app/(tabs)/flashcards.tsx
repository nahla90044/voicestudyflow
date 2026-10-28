import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { cachedCardImage, cardImageAvgSecs, cardImagesBlocked, getCardImage } from "../../lib/cardImage";

import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { CardChoices } from "../../components/brand/card-choices";
import { cardLook } from "../../lib/cardLook";
import { CardDeck } from "../../components/brand/card-deck";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../../components/brand/scene-screen";
import { Radius, Spacing } from "../../constants/design";
import { archiveCard, archiveCardsForBook, getCards, removeCard, removeCards, removeCardsForBook, reviewCard, setCardFav, type Card, type Rating } from "../../lib/flashcards";
import { useDir, useI18n } from "../../lib/i18n";
import { getSavedItems, removeSavedItem, updateSavedItem, type SavedItem, type SavedKind } from "../../lib/savedStudy";
import { useScene } from "../../lib/scene";
import { removeUnitContent, type UnitContentKind } from "../../lib/unitContent";
import { getCachedUnitRanges, getUnitRanges, type UnitRange } from "../../lib/glossary";
import { cardsHtml, sharePdf } from "../../lib/studySaves";
import { supabase } from "../../lib/supabase";
import { getSyllabus } from "../../lib/syllabus";
import { prefetchText, speakText, stopSpeaking } from "../../lib/voice";

const ALL = "__all__";
const NONE = "__none__";
const FAV = "__fav__"; // المفضلة: مجموعة خاصة

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type BookGroup = { key: string; title: string; total: number; due: number };
// وحدات كتاب (من منهجه وصفحات وحداته) لتجميع بطاقاته حسب الوحدة
type BookUnits = { pdfPath: string; titles: string[]; ranges: UnitRange[] };
/** وحدة البطاقة من صفحتها (‎-1 = بلا وحدة) — تبقى صحيحة إن أُعيد إنشاء المنهج */
const unitOf = (c: Card, bu: BookUnits | null) => (!bu || !c.page ? -1 : bu.ranges.findIndex((r) => c.page! >= r.from && c.page! <= r.to));

async function loadBookUnits(bookId: string): Promise<BookUnits | null> {
  const { data } = await supabase.from("books").select("pdf_path,page_count").eq("id", bookId).maybeSingle();
  if (!data?.pdf_path) return null;
  const titles = ((await getSyllabus(data.pdf_path).catch(() => null))?.data.units ?? []).map((u) => u.title);
  if (!titles.length) return { pdfPath: data.pdf_path, titles: [], ranges: [] };
  const cached = await getCachedUnitRanges(data.pdf_path, titles.length);
  const ranges = cached?.length === titles.length ? cached : await getUnitRanges(data.pdf_path, titles, Number(data.page_count) || 0).catch(() => []);
  return { pdfPath: data.pdf_path, titles, ranges };
}

type StudyTab = "cards" | "summary" | "quiz";

/** حجم خط البطاقة حسب طول نصها: كان ثابتًا كبيرًا (٢٦) فيضيق عليه وجه البطاقة في الإجابات الطويلة */
function faceSize(text?: string, scale = 1) {
  const n = (text ?? "").length;
  const fontSize = (n <= 40 ? 23 : n <= 90 ? 20 : n <= 160 ? 17.5 : n <= 260 ? 16 : 15) * scale;
  return { fontSize, lineHeight: Math.round(fontSize * 1.65) };
}

// حجم خط البطاقات يختاره المستخدم (A− / A+) ويُحفظ
const FONT_KEY = "vsf:cards:fontScale:v1";
const FONT_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

export default function FlashcardsScreen() {
  const { t } = useI18n();
  const dir = useDir();
  const router = useRouter();
  const { pal } = useScene();
  // فُتحت من أدوات كتاب: تُفتح بطاقات ذلك الكتاب مباشرة، وزر الرجوع يعيد إلى صفحته
  const params = useLocalSearchParams<{ book_id?: string; from_book?: string; unit?: string }>();
  const fromBook = params.from_book === "1";
  const openBookRef = useRef<string | null>(null);
  // وضع التحديد (حذف متعدد): مفاتيح المجموعات في تبويب البطاقات، ومفاتيح المحفوظات في الملخصات/الاختبارات
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // المجموعة المعروضة في المراجعة (لحذف كل بطاقاتها): الكتاب أو وحدة منه أو المفضلة
  const groupRef = useRef<(c: Card) => boolean>(() => false);
  // الكتاب المفتوح ووحداته، والوحدة المعروضة في المراجعة (undefined = كل الكتاب، "none" = بلا وحدة)
  const [bookKey, setBookKey] = useState<string | null>(null);
  const [bookUnits, setBookUnits] = useState<BookUnits | null>(null);
  const [reviewUnit, setReviewUnit] = useState<number | "none" | undefined>(undefined);
  const unitParamRef = useRef<number | null>(null);
  const [tab, setTab] = useState<StudyTab>("cards");
  const [showArchived, setShowArchived] = useState(false); // عرض المؤرشفة بدل الحالية
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [all, setAll] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"picker" | "book" | "review">("picker");
  const [queue, setQueue] = useState<Card[]>([]);
  const [fontStep, setFontStep] = useState(1);
  useEffect(() => {
    AsyncStorage.getItem(FONT_KEY)
      .then((v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0 && n < FONT_STEPS.length) setFontStep(n);
      })
      .catch(() => {});
  }, []);
  const changeFont = (d: number) =>
    setFontStep((f) => {
      const n = Math.min(FONT_STEPS.length - 1, Math.max(0, f + d));
      AsyncStorage.setItem(FONT_KEY, String(n)).catch(() => {});
      return n;
    });
  const fontScale = FONT_STEPS[fontStep];
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
      setSelecting(false);
      setPicked([]);
      if (typeof params.book_id === "string" && params.book_id) {
        openBookRef.current = params.book_id;
        unitParamRef.current = params.unit != null && params.unit !== "" && Number.isFinite(Number(params.unit)) ? Number(params.unit) : null;
        setTab("cards");
      }
      reload();
      getSavedItems().then(setSaved);
    }, [reload, params.book_id, params.unit])
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

  // حذف ملخّص/اختبار محفوظ: الفهرس + الملف المخزَّن
  async function purgeSaved(it: SavedItem) {
    await removeSavedItem(it.key);
    // الفيديو: يُحذف من الفهرس فقط (سيناريوه يبقى مخزَّنًا فيُفتح فورًا إن طُلب ثانية)
    if (it.kind !== "video") await removeUnitContent(it.pdfPath, it.page ?? it.unit ?? 0, contentKind(it));
  }

  function deleteSaved(it: SavedItem) {
    Alert.alert(t("flashcards.saved.deleteTitle"), t("flashcards.saved.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await purgeSaved(it);
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
      { text: t("study.menu.review"), onPress: () => openBook(b.key, b.title) },
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
    if (it.kind === "summary") params.level = it.level ?? "strict";
    if (it.kind === "video") {
      params.vlevel = it.level ?? "strict";
      if (it.lang) params.vlang = it.lang;
    }
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

  const favCount = useMemo(() => all.filter((c) => c.fav && inView(c)).length, [all, inView]);

  const totalDue = useMemo(() => {
    const today = todayISO();
    return all.filter((c) => !c.archived && c.due <= today).length;
  }, [all]);

  // فُتحت من أدوات كتاب: بعد تحميل البطاقات تُفتح مجموعة ذلك الكتاب (إن كانت له بطاقات)
  useEffect(() => {
    const id = openBookRef.current;
    if (loading || !id) return;
    openBookRef.current = null;
    const g = books.find((b) => b.key === id);
    openBook(id, g?.title ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, books]);

  // ===== التحديد والحذف المتعدد =====
  function stopSelecting() {
    setSelecting(false);
    setPicked([]);
  }
  function togglePick(key: string) {
    setPicked((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));
  }
  const selectableKeys = useMemo(
    () => (tab === "cards" ? books.map((b) => b.key) : savedGroups.flatMap((g) => g.items.map((it) => it.key))),
    [tab, books, savedGroups]
  );

  function confirmDeletePicked() {
    if (!picked.length) return;
    if (tab === "cards") {
      const ids = all.filter((c) => picked.some((k) => inGroup(k)(c))).map((c) => c.id);
      Alert.alert(t("study.delete.manyTitle"), t("study.delete.cardsBody", { n: ids.length }), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("study.select.delete", { n: picked.length }),
          style: "destructive",
          onPress: async () => {
            await removeCards(ids);
            stopSelecting();
            reload();
          },
        },
      ]);
      return;
    }
    const items = saved.filter((it) => picked.includes(it.key));
    Alert.alert(t("study.delete.manyTitle"), t("study.delete.manyBody", { n: items.length }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("study.select.delete", { n: items.length }),
        style: "destructive",
        onPress: async () => {
          for (const it of items) await purgeSaved(it);
          stopSelecting();
          refreshSaved();
        },
      },
    ]);
  }

  // بطاقات مجموعة (كتاب، أو الكل، أو المفضلة) ضمن العرض الحالي
  const inGroup = useCallback(
    (key: string) => (c: Card) => (key === ALL || (key === FAV ? !!c.fav : (c.bookId ?? NONE) === key)) && inView(c),
    [inView]
  );

  // فتح كتاب: بطاقاته مجمّعة حسب وحداته (ومن وحدة محددة: مراجعتها مباشرة)
  function openBook(key: string, title: string) {
    setBookKey(key);
    setBookName(title);
    setBookUnits(null);
    setMode("book");
    if (key === NONE) return;
    void loadBookUnits(key).then((bu) => {
      setBookUnits(bu);
      const u = unitParamRef.current;
      unitParamRef.current = null;
      if (u !== null && bu) startBook(key, title, u, bu);
    });
  }

  /** مراجعة بطاقات مجموعة: الكتاب كله، أو وحدة منه، أو بطاقاته بلا وحدة */
  function startBook(key: string, title: string, unit?: number | "none", bu: BookUnits | null = bookUnits) {
    const today = todayISO();
    const inBook = inGroup(key);
    const inSel = (c: Card) => inBook(c) && (unit === undefined || (unit === "none" ? unitOf(c, bu) === -1 : unitOf(c, bu) === unit));
    if (unit !== undefined && !all.some(inSel)) {
      // وحدة بلا بطاقات بعد: عرض الكتاب، وعرض التوليد من صفحات الوحدة
      setMode("book");
      if (typeof unit === "number" && bu?.ranges[unit]) offerGenerate(key, unit, bu);
      return;
    }
    let q = all.filter((c) => inSel(c) && c.due <= today);
    if (q.length === 0) q = all.filter(inSel); // لا مستحقّ؟ راجعي كل بطاقات المجموعة
    groupRef.current = inSel;
    setReviewUnit(unit);
    setQueue(q);
    setBookName(title);
    setIdx(0);
    setFlipped(false);
    flip.setValue(0);
    setMode("review");
  }

  /** 🔀 خلطة من كل البطاقات: كل الكتب والوحدات، المستحق للمراجعة أولًا ثم الباقي عشوائيًا */
  function startMix() {
    const today = todayISO();
    const pool = all.filter((c) => inView(c));
    if (!pool.length) return;
    const shuffle = (a: Card[]) => {
      const x = [...a];
      for (let i = x.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [x[i], x[j]] = [x[j], x[i]];
      }
      return x;
    };
    const q = [...shuffle(pool.filter((c) => c.due <= today)), ...shuffle(pool.filter((c) => c.due > today))];
    groupRef.current = (c: Card) => inView(c);
    setReviewUnit(undefined);
    setQueue(q);
    setBookName(t("flashcards.mix"));
    setIdx(0);
    setFlipped(false);
    flip.setValue(0);
    setMode("review");
  }

  function offerGenerate(key: string, unit: number, bu: BookUnits) {
    const r = bu.ranges[unit];
    Alert.alert(t("flashcards.unitEmptyTitle"), t("flashcards.unitEmptyBody", { from: r.from, to: r.to }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("flashcards.generate"), onPress: () => router.push({ pathname: "/generate-study", params: { book_id: key, from: String(r.from), to: String(r.to) } }) },
    ]);
  }

  // عدد بطاقات كل وحدة في الكتاب المفتوح (والمستحق منها)
  const unitStats = useMemo(() => {
    if (!bookKey) return null;
    const today = todayISO();
    const inBook = inGroup(bookKey);
    const n = (bookUnits?.titles.length ?? 0) + 1;
    const total = new Array(n).fill(0);
    const due = new Array(n).fill(0);
    let all_ = 0;
    let allDue = 0;
    for (const c of all) {
      if (!inBook(c)) continue;
      const u = unitOf(c, bookUnits);
      const k = u === -1 ? n - 1 : u;
      total[k]++;
      all_++;
      if (c.due <= today) {
        due[k]++;
        allDue++;
      }
    }
    return { total, due, all: all_, allDue, none: n - 1 };
  }, [all, bookKey, bookUnits, inGroup]);

  // طباعة بطاقات (الكتاب كله أو وحدة) — PDF مختوم
  async function printCards(unit?: number | "none") {
    if (!bookKey) return;
    const inBook = inGroup(bookKey);
    const list = all.filter((c) => inBook(c) && (unit === undefined || (unit === "none" ? unitOf(c, bookUnits) === -1 : unitOf(c, bookUnits) === unit)));
    if (!list.length) return;
    const title = typeof unit === "number" ? `${bookName} — ${bookUnits?.titles[unit] ?? ""}` : bookName;
    try {
      await sharePdf(cardsHtml({ bookTitle: bookName, title, cards: list.map((c) => ({ front: c.front, back: c.back })), rtl: dir.isRTL }), title);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    }
  }

  const goBackLevel = () => {
    if (mode === "review" && bookKey && bookKey !== FAV) setMode("book");
    else if (mode === "book" && fromBook) router.back();
    else setMode("picker");
  };

  function toggleFlip() {
    Animated.spring(flip, { toValue: flipped ? 0 : 180, useNativeDriver: true, friction: 9, tension: 12 }).start();
    setFlipped((f) => !f);
  }
  // إجابة بطاقة صح/خطأ أو اختيار من متعدد (تُصفَّر مع كل بطاقة جديدة)
  const [answer, setAnswer] = useState<number | null>(null);
  const [cardH, setCardH] = useState(420); // ارتفاع مساحة البطاقة المقيس (للرصّة)
  useEffect(() => setAnswer(null), [idx, mode]);

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

  // المفضلة: تُحفظ فورًا وتنعكس على البطاقة المعروضة
  async function toggleFav() {
    const c = queue[idx];
    if (!c) return;
    const fav = !c.fav;
    setQueue((q) => q.map((x) => (x.id === c.id ? { ...x, fav } : x)));
    setAll((a) => a.map((x) => (x.id === c.id ? { ...x, fav } : x)));
    await setCardFav(c.id, fav);
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

  // زر الحذف في المراجعة: هذه البطاقة فقط، أو كل بطاقات المجموعة المعروضة
  function deleteMenu() {
    const card = queue[idx];
    const group = all.filter(groupRef.current);
    Alert.alert(t("flashcards.delete.menuTitle"), undefined, [
      ...(card
        ? [
            {
              text: t("flashcards.delete.this"),
              style: "destructive" as const,
              onPress: async () => {
                await removeCard(card.id);
                setQueue((q) => q.filter((c) => c.id !== card.id));
                flip.setValue(0);
                setFlipped(false);
                reload();
              },
            },
          ]
        : []),
      {
        text: t("flashcards.delete.group", { name: bookName, n: group.length }),
        style: "destructive" as const,
        onPress: () =>
          Alert.alert(t("flashcards.delete.menuTitle"), t("flashcards.delete.groupBody", { name: bookName, n: group.length }), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.delete"),
              style: "destructive",
              onPress: async () => {
                await removeCards(group.map((c) => c.id));
                setMode(bookKey && bookKey !== FAV ? "book" : "picker");
                reload();
              },
            },
          ]),
      },
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
    // الصور التوضيحية لبطاقات «معاني الكلمات» فقط (قرار نهلة)
    if (!card || card.kind !== "words") {
      setImg({ url: null, loading: false, secs: 0 });
      return;
    }
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
    if (nx?.kind === "words" && !cardImagesBlocked()) void getCardImage(nx.front, nx.back);
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
    listenModeRef.current = true; // من الآن: صوت وجهي كل بطاقة يُجهَّز مسبقًا فيبدأ فورًا
    void prefetchText(flipped ? c.front : c.back).catch(() => {});
    const done = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    speakText(flipped ? c.back : c.front, { onDone: done, onError: done }).catch(done);
  }

  // وضع الاستماع (بعد أول استماع في الجلسة): صوت البطاقة الحالية والتالية جاهز مسبقًا → الاستماع فوري
  const listenModeRef = useRef(false);
  useEffect(() => {
    if (!listenModeRef.current || mode === "picker") return;
    for (const c of [queue[idx], queue[idx + 1]]) {
      if (!c) continue;
      void prefetchText(c.front).catch(() => {});
      void prefetchText(c.back).catch(() => {});
    }
  }, [idx, queue, mode]);

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
        subtitle={mode !== "picker" ? bookName : t("flashcards.header.subtitle")}
        height={mode === "review" ? 150 : 190}
        left={
          mode !== "picker" || fromBook ? (
            <Pressable
              onPress={() => (mode === "picker" ? router.back() : goBackLevel())}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={mode === "review" ? t("flashcards.backToGroups") : t("common.back")}
            >
              <SceneIconButton>
                <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
              </SceneIconButton>
            </Pressable>
          ) : undefined
        }
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
              <Pressable
                key={seg}
                onPress={() => {
                  setTab(seg);
                  setMode("picker");
                  stopSelecting();
                }}
                style={[styles.segBtn, on && { backgroundColor: pal.accent }]}
              >
                <Text style={[styles.segTxt, { color: on ? pal.onAccent : pal.dim }]} numberOfLines={1}>
                  {t(`flashcards.tab.${seg}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode === "picker" ? (
        <Text style={[styles.longPressHint, { textAlign: dir.textAlign, color: pal.dim }]}>{t("study.longPressHint")}</Text>
      ) : null}

      {/* مبدّل: الحالية / المؤرشفة — لكل التبويبات (خارج وضع المراجعة) */}
      {mode === "picker" ? (
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
          <View style={{ flex: 1 }} />
          {selectableKeys.length > 0 ? (
            <Pressable
              onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
              style={[styles.archToggle, { flexDirection: dir.row, gap: 5, backgroundColor: selecting ? pal.soft : "transparent", borderColor: selecting ? pal.accent : pal.cardBorder }]}
            >
              <Ionicons name={selecting ? "close" : "checkbox-outline"} size={15} color={selecting ? pal.accent : pal.dim} />
              <Text style={[styles.archToggleTxt, { color: selecting ? pal.accent : pal.dim }]}>{selecting ? t("common.cancel") : t("study.select")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {selecting && mode === "picker" ? (
        <Text style={[styles.longPressHint, { textAlign: dir.textAlign, color: pal.dim, paddingTop: 0, paddingBottom: 6 }]}>{t("study.select.hint")}</Text>
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
                  {g.title}
                </Text>
                {g.items.map((it) => (
                  <Pressable
                    key={it.key}
                    onPress={() => (selecting ? togglePick(it.key) : openSaved(it))}
                    onLongPress={selecting ? undefined : () => savedMenu(it)}
                    delayLongPress={300}
                  >
                    <SceneCard style={[styles.bookRow, { flexDirection: dir.row }, selecting && picked.includes(it.key) && { borderColor: DANGER, borderWidth: 2 }]}>
                      {selecting ? <PickBox on={picked.includes(it.key)} border={pal.track} /> : null}
                      {it.studied ? <Ionicons name="checkmark-circle" size={18} color={pal.accent} /> : null}
                      <View style={styles.bookInfo}>
                        <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]} numberOfLines={2}>
                          {it.kind === "video" ? (
                            <>
                              <Ionicons name="videocam-outline" size={15} color={pal.accent} /> {it.label}
                            </>
                          ) : (
                            it.label
                          )}
                        </Text>
                      </View>
                      {selecting ? null : <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={20} color={pal.dim} />}
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
            {!selecting ? (
              <Pressable onPress={startMix}>
                <SceneCard style={[styles.bookRow, { flexDirection: dir.row, backgroundColor: pal.accent + "1A", borderColor: pal.accent + "66" }]}>
                  <Ionicons name="shuffle" size={22} color={pal.accent} />
                  <View style={styles.bookInfo}>
                    <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]}>{t("flashcards.mix")}</Text>
                    <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>{t("flashcards.mixSub")}</Text>
                  </View>
                </SceneCard>
              </Pressable>
            ) : null}
            {favCount > 0 && !selecting ? (
              <Pressable onPress={() => startBook(FAV, t("flashcards.favorites"))}>
                <SceneCard style={[styles.bookRow, { flexDirection: dir.row, backgroundColor: "#F6C44522", borderColor: "#F6C44577" }]}>
                  <Ionicons name="star" size={20} color="#E0A800" />
                  <View style={styles.bookInfo}>
                    <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]}>{t("flashcards.favorites")}</Text>
                    <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>{t("flashcards.cardsCount", { count: favCount })}</Text>
                  </View>
                </SceneCard>
              </Pressable>
            ) : null}
            {books.map((b, index) => (
              <Pressable
                key={b.key}
                {...(index === 0 ? coach.bind("deck") : null)}
                onPress={() => (selecting ? togglePick(b.key) : openBook(b.key, b.title))}
                onLongPress={selecting ? undefined : () => bookMenu(b)}
                delayLongPress={300}
              >
                <SceneCard style={[styles.bookRow, { flexDirection: dir.row }, selecting && picked.includes(b.key) && { borderColor: DANGER, borderWidth: 2 }]}>
                  {selecting ? <PickBox on={picked.includes(b.key)} border={pal.track} /> : null}
                  <View style={styles.bookInfo}>
                    <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]} numberOfLines={1}>
                      {b.title}
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
      ) : mode === "book" ? (
        /* ====== كتاب: بطاقاته حسب الوحدات ====== */
        <ScrollView contentContainerStyle={styles.pickerWrap} showsVerticalScrollIndicator={false}>
          {/* التنقل بين الكتب */}
          {books.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipsRow, { flexDirection: dir.row }]}>
              {books.map((b) => {
                const on = b.key === bookKey;
                return (
                  <Pressable key={b.key} onPress={() => openBook(b.key, b.title)} style={[styles.chipBtn, { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder }]}>
                    <Text style={[styles.chipBtnTxt, { color: on ? pal.onAccent : pal.ink }]} numberOfLines={1}>
                      {b.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* كل بطاقات الكتاب + طباعتها */}
          <Pressable onPress={() => unitStats?.all && bookKey && startBook(bookKey, bookName)}>
            <SceneCard style={[styles.bookRow, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
              <Ionicons name="albums" size={20} color={pal.accent} />
              <View style={styles.bookInfo}>
                <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink }]}>{t("flashcards.bookAll")}</Text>
                <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>{t("flashcards.bookStats", { total: unitStats?.all ?? 0, due: unitStats?.allDue ?? 0 })}</Text>
              </View>
              {unitStats?.all ? (
                <Pressable onPress={() => void printCards()} hitSlop={8} style={[styles.printBtn, { borderColor: pal.cardBorder, backgroundColor: pal.card }]} accessibilityLabel={t("flashcards.print")}>
                  <Ionicons name="print-outline" size={18} color={pal.ink} />
                </Pressable>
              ) : null}
            </SceneCard>
          </Pressable>

          {bookUnits === null && bookKey !== NONE ? (
            <ActivityIndicator color={pal.accent} style={{ marginTop: 16 }} />
          ) : !bookUnits?.titles.length ? (
            <Text style={[styles.dim, { color: pal.dim, textAlign: dir.textAlign }]}>{t("flashcards.noUnits")}</Text>
          ) : (
            bookUnits.titles.map((title, i) => {
              const total = unitStats?.total[i] ?? 0;
              const due = unitStats?.due[i] ?? 0;
              const r = bookUnits.ranges[i];
              return (
                <Pressable key={i} onPress={() => bookKey && startBook(bookKey, bookName, i)}>
                  <SceneCard style={[styles.bookRow, { flexDirection: dir.row }]}>
                    <View style={[styles.unitNum, { borderColor: total ? pal.accent : pal.track }]}>
                      <Text style={[styles.unitNumTxt, { color: total ? pal.accent : pal.dim }]}>{i + 1}</Text>
                    </View>
                    <View style={styles.bookInfo}>
                      <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink, fontSize: 15 }]}>{title}</Text>
                      <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>
                        {r ? `${t("glossary.pages", { from: r.from, to: r.to })} · ` : ""}
                        {total ? t("flashcards.bookStats", { total, due }) : t("flashcards.unitNone")}
                      </Text>
                    </View>
                    {total ? (
                      <Pressable onPress={() => void printCards(i)} hitSlop={8} style={[styles.printBtn, { borderColor: pal.cardBorder, backgroundColor: pal.card }]} accessibilityLabel={t("flashcards.print")}>
                        <Ionicons name="print-outline" size={17} color={pal.ink} />
                      </Pressable>
                    ) : (
                      <Ionicons name="add-circle-outline" size={22} color={pal.accent} />
                    )}
                  </SceneCard>
                </Pressable>
              );
            })
          )}
          {unitStats && unitStats.total[unitStats.none] > 0 && bookUnits?.titles.length ? (
            <Pressable onPress={() => bookKey && startBook(bookKey, bookName, "none")}>
              <SceneCard style={[styles.bookRow, { flexDirection: dir.row }]}>
                <Ionicons name="file-tray-outline" size={20} color={pal.dim} />
                <View style={styles.bookInfo}>
                  <Text style={[styles.bookTitle, { textAlign: dir.textAlign, color: pal.ink, fontSize: 15 }]}>{t("flashcards.unassigned")}</Text>
                  <Text style={[styles.bookSub, { textAlign: dir.textAlign, color: pal.dim }]}>
                    {t("flashcards.bookStats", { total: unitStats.total[unitStats.none], due: unitStats.due[unitStats.none] })}
                  </Text>
                </View>
              </SceneCard>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : reviewDone ? (
        /* ====== انتهت المراجعة ====== */
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: pal.soft }]}>
            <Ionicons name="checkmark-done-circle" size={52} color={pal.accent} />
          </View>
          <Text style={[styles.doneTitle, { color: pal.ink }]}>{t("flashcards.reviewDone", { book: bookName })}</Text>
          <Pressable
            onPress={goBackLevel}
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
              onPress={deleteMenu}
              hitSlop={8}
              accessibilityLabel={t("flashcards.delete.menuTitle")}
              style={[styles.backChip, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: DANGER }]}
            >
              <Ionicons name="trash-outline" size={16} color={DANGER} />
              <Text style={[styles.backChipTxt, { color: DANGER }]}>{t("common.delete")}</Text>
            </Pressable>
            <View style={[styles.fontRow, { flexDirection: dir.row }]}>
              <Pressable onPress={() => changeFont(-1)} disabled={fontStep <= 0} hitSlop={6} style={[styles.fontBtn, { backgroundColor: pal.card, borderColor: pal.cardBorder }, fontStep <= 0 && { opacity: 0.4 }]} accessibilityLabel={t("flashcards.fontSmaller")}>
                <Text style={[styles.fontTxt, { color: pal.ink, fontSize: 14 }]}>A−</Text>
              </Pressable>
              <Pressable onPress={() => changeFont(1)} disabled={fontStep >= FONT_STEPS.length - 1} hitSlop={6} style={[styles.fontBtn, { backgroundColor: pal.card, borderColor: pal.cardBorder }, fontStep >= FONT_STEPS.length - 1 && { opacity: 0.4 }]} accessibilityLabel={t("flashcards.fontBigger")}>
                <Text style={[styles.fontTxt, { color: pal.ink, fontSize: 18 }]}>A+</Text>
              </Pressable>
              <Text style={[styles.counter, { color: pal.dim }]}>
                {idx + 1} / {queue.length}
              </Text>
            </View>
          </View>

          {/* التنقل بين وحدات الكتاب أثناء المراجعة */}
          {bookKey && bookKey !== FAV && bookUnits?.titles.length && unitStats ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.chipsRow, { flexDirection: dir.row }]}>
              {([undefined, ...bookUnits.titles.map((_, i) => i), ...(unitStats.total[unitStats.none] ? (["none"] as const) : [])] as (number | "none" | undefined)[])
                .filter((u) => u === undefined || (u === "none" ? true : (unitStats.total[u] ?? 0) > 0))
                .map((u) => {
                  const on = reviewUnit === u;
                  const label = u === undefined ? t("flashcards.allShort") : u === "none" ? t("flashcards.unassignedShort") : t("glossary.unitN", { n: u + 1 });
                  return (
                    <Pressable key={String(u)} onPress={() => startBook(bookKey, bookName, u)} style={[styles.chipBtn, { backgroundColor: on ? pal.accent : pal.card, borderColor: on ? pal.accent : pal.cardBorder }]}>
                      <Text style={[styles.chipBtnTxt, { color: on ? pal.onAccent : pal.ink }]}>{label}</Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          ) : null}

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

          <View style={styles.cardArea} onLayout={(e) => setCardH(Math.max(260, e.nativeEvent.layout.height))}>

            {/* رصّة البطاقات: تميل مع الإصبع وتطير عند الإفلات، والتي خلفها تصعد */}
            <CardDeck
              cardKey={card?.id ?? String(idx)}
              canPrev={idx > 0}
              canNext={idx < queue.length - 1}
              onMove={(d) => goCard(d)}
              isRTL={dir.isRTL}
              height={cardH}
              backColor={pal.soft}
              borderColor={pal.cardBorder}
            >
            <Pressable {...studyCoach.bind("card")} onPress={card?.opts && !flipped ? undefined : toggleFlip} onLongPress={cardMenu} delayLongPress={450} style={{ flex: 1 }}>
              <Animated.View
                pointerEvents={flipped ? "none" : "box-none"}
                style={[styles.face, frontStyle, { backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: cardShadow }]}
              >
                <View style={[styles.kindStrip, { backgroundColor: cardLook(card?.kind).color }]} />
                <View style={styles.faceInner}>
                  <View style={[styles.kindRow, { flexDirection: dir.row }]}>
                    <View style={[styles.chip, { flexDirection: dir.row, gap: 5, backgroundColor: cardLook(card?.kind).color + "1A" }]}>
                      <Ionicons name={cardLook(card?.kind).icon} size={13} color={cardLook(card?.kind).color} />
                      <Text style={[styles.chipTxt, { color: cardLook(card?.kind).color }]} numberOfLines={1}>
                        {t(cardLook(card?.kind).label)}
                      </Text>
                    </View>
                    <Text style={[styles.chipTxt, { color: pal.dim, flexShrink: 1 }]} numberOfLines={1}>
                      {card?.bookTitle || bookName}
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
                      <Text style={[styles.faceText, faceSize(card?.front, fontScale), { color: pal.ink }]}>{card?.front}</Text>
                    </ScrollView>
                    {card?.opts && card.ans !== undefined ? (
                      <CardChoices
                        opts={card.opts}
                        ans={card.ans}
                        picked={answer}
                        row={card.kind === "tf"}
                        onPick={(i) => {
                          setAnswer(i);
                          setTimeout(() => !flipped && toggleFlip(), 900);
                        }}
                      />
                    ) : null}

                  </View>
                  <View style={[styles.tapHintRow, { flexDirection: dir.row }]}>
                    <Ionicons name="sync" size={13} color={pal.accent} />
                    <Text style={[styles.tapHint, { color: pal.accent }]}>{t("flashcards.tapToFlip")}</Text>
                  </View>
                </View>
              </Animated.View>
              <Animated.View
                pointerEvents={flipped ? "box-none" : "none"}
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
                      <Text style={[styles.faceText, faceSize(card?.back, fontScale), { color: pal.ink }]}>{card?.back}</Text>
                    </ScrollView>
                  </View>
                  <View style={{ height: 18 }} />
                </View>
              </Animated.View>
            </Pressable>
            </CardDeck>

            {/* المفضلة: نجمة في الزاوية المقابلة */}
            {card ? (
              <Pressable
                onPress={() => void toggleFav()}
                hitSlop={8}
                accessibilityLabel={card.fav ? t("flashcards.unfav") : t("flashcards.fav")}
                style={[styles.listenBtn, dir.isRTL ? { right: 14 } : { left: 14 }, { backgroundColor: card.fav ? "#F6C445" : pal.soft }]}
              >
                <Ionicons name={card.fav ? "star" : "star-outline"} size={17} color={card.fav ? "#3A2A00" : pal.accent} />
              </Pressable>
            ) : null}
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

          {/* التنقل بين البطاقات: تحت البطاقة وبحجم واضح */}
          <View style={[styles.navRow, { flexDirection: dir.row }]}>
            <Pressable
              onPress={() => goCard(-1)}
              disabled={idx <= 0}
              style={[styles.navBig, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }, idx <= 0 && { opacity: 0.4 }]}
              accessibilityLabel={t("flashcards.prev")}
            >
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={22} color={pal.ink} />
              <Text style={[styles.navBigTxt, { color: pal.ink }]}>{t("flashcards.prev")}</Text>
            </Pressable>
            <Pressable
              onPress={() => goCard(1)}
              disabled={idx >= queue.length - 1}
              style={[styles.navBig, { flexDirection: dir.row, backgroundColor: pal.card, borderColor: pal.cardBorder }, idx >= queue.length - 1 && { opacity: 0.4 }]}
              accessibilityLabel={t("flashcards.next")}
            >
              <Text style={[styles.navBigTxt, { color: pal.ink }]}>{t("flashcards.next")}</Text>
              <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={22} color={pal.ink} />
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
      {/* شريط الحذف المتعدد */}
      {selecting && mode === "picker" ? (
        <View style={[styles.selectBar, { backgroundColor: pal.card, borderColor: pal.cardBorder, flexDirection: dir.row }]}>
          <Pressable onPress={() => setPicked(picked.length === selectableKeys.length ? [] : selectableKeys)} hitSlop={8}>
            <Text style={[styles.selectLink, { color: pal.accent }]}>
              {picked.length === selectableKeys.length ? t("study.select.none") : t("study.select.all")}
            </Text>
          </Pressable>
          <Pressable
            onPress={confirmDeletePicked}
            disabled={!picked.length}
            style={({ pressed }) => [styles.selectBtn, { backgroundColor: DANGER, flexDirection: dir.row, opacity: !picked.length ? 0.4 : pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.selectBtnTxt}>{t("study.select.delete", { n: picked.length })}</Text>
          </Pressable>
        </View>
      ) : null}

      {mode === "picker" && !selecting ? (
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

// أحمر الحذف المُصمت (نص أبيض واضح عليه في المشهدين)
const DANGER = "#D9485A";

/** مربع التحديد في وضع الحذف المتعدد */
function PickBox({ on, border }: { on: boolean; border: string }) {
  return (
    <View style={[styles.pickBox, { borderColor: on ? DANGER : border }, on && { backgroundColor: DANGER }]}>
      {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
    </View>
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
  navRow: { gap: 12, marginTop: 14 },
  fontRow: { alignItems: "center", gap: 8 },
  fontBtn: { minWidth: 44, height: 36, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  fontTxt: { fontWeight: "900" },
  navBig: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  navBigTxt: { fontSize: 16, fontWeight: "800" },
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
  chipsRow: { gap: 8, paddingVertical: 2 },
  chipBtn: { paddingHorizontal: 14, height: 36, borderRadius: Radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", maxWidth: 240 },
  chipBtnTxt: { fontSize: 13.5, fontWeight: "800" },
  printBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  unitNum: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  unitNumTxt: { fontSize: 13, fontWeight: "900" },
  pickBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  selectBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectLink: { fontSize: 14.5, fontWeight: "900" },
  selectBtn: { flex: 1, maxWidth: 260, height: 50, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", gap: 8 },
  selectBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "900" },

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
  kindStrip: { position: "absolute", top: 0, left: 0, right: 0, height: 7, borderTopLeftRadius: 28, borderTopRightRadius: 28, zIndex: 2 },
  kindRow: { alignSelf: "stretch", alignItems: "center", justifyContent: "space-between", gap: 8 },
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
