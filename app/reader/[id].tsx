import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";
import { aiAssist, defineWord, generateFlashcards, generateSlides, type AiAction, type Slide } from "../../lib/ai";
import { cachedPageCount } from "../../lib/ingest";
import { getDownloadState, startDownload, stopDownload, subscribeDownload } from "../../lib/downloadManager";
import { addCards } from "../../lib/flashcards";
import {
  addHighlight,
  getBookmarks,
  getHighlights,
  removeHighlight,
  setHighlightNote,
  toggleBookmark,
  type Highlight,
} from "../../lib/annotations";
import { GlassCard } from "../../components/brand/glass-card";
import { getPageImage } from "../../lib/pageImage";
import { extractPdfPageText, getPageWords, type WordBox } from "../../lib/pdfText";
import { splitForReading, splitSentences } from "../../lib/textUtils";
import {
  getLastPage,
  getLastSentence,
  getReadingRate,
  setLastPage,
  setLastSentence,
  setReadingRate,
} from "../../lib/readerPrefs";
import { MUSIC_OPTIONS, startAmbient, stopAmbient } from "../../lib/sfx";
import { recordActivity, recordBookCompleted } from "../../lib/stats";
import { supabase } from "../../lib/supabase";
import {
  DEFAULT_VOICE_ID,
  prefetchText,
  speakText,
  stopSpeaking,
  VOICE_CATALOG,
  warmNext,
} from "../../lib/voice";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { focusEvery, getFocusLevel, getUserName } from "../../lib/settings";
import { useDir, useI18n } from "../../lib/i18n";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const SLEEP_OPTIONS = [0, 5, 15, 30] as const; // 0 = مطفأ (بالدقائق)

// أي كلمة (حسب ترتيبها في الجملة) تُقرأ عند نسبة تقدّم frac (0..1)،
// بتوزيع زمني تقريبي مرجّح بطول الكلمة.
function wordIndexAtFraction(sentence: string, frac: number): number {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length === 0) return -1;
  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let k = 0; k < words.length; k++) {
    acc += weights[k];
    if (frac <= acc / total) return k;
  }
  return words.length - 1;
}

// يقسّم الشرائح ذات النقاط الكثيرة على شرائح متتابعة (لئلا يُقصّ المحتوى في شريحة)
function splitLongSlides(slides: Slide[], maxBullets = 3): Slide[] {
  const out: Slide[] = [];
  for (const s of slides) {
    if (s.bullets.length <= maxBullets) {
      out.push(s);
      continue;
    }
    for (let i = 0; i < s.bullets.length; i += maxBullets) {
      out.push({
        emoji: s.emoji,
        title: i === 0 ? s.title : `${s.title} (تكملة)`,
        bullets: s.bullets.slice(i, i + maxBullets),
      });
    }
  }
  return out;
}

export default function ReaderScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();

  const bookId = typeof id === "string" ? id : undefined;
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";

  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [voiceLang, setVoiceLang] = useState<"ar" | "en" | "fr">("ar"); // فلتر لغة الأصوات
  const [voiceModal, setVoiceModal] = useState(false); // قائمة اختيار الصوت
  const [rate, setRate] = useState(1);
  const [sleepMin, setSleepMin] = useState(0);
  const [viewMode, setViewMode] = useState<"pdf" | "text">("pdf");
  const [sentences, setSentences] = useState<string[]>([]);
  const [activeSentence, setActiveSentence] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1); // الكلمة المنطوقة داخل المقطع (كاراوكي)
  const [skipMult, setSkipMult] = useState(1); // مضاعف سرعة التخطّي الحالي (×2 ×3…)
  const [skipDir, setSkipDir] = useState(1); // اتجاه آخر تخطّي (لإظهار الشارة على الزر الصحيح)
  const [status, setStatus] = useState(""); // رسالة حالة ظاهرة للمستخدم
  const [voiceWarn, setVoiceWarn] = useState(""); // سبب فشل الصوت البشري (يبقى ظاهرًا)

  // قاموس: معنى الكلمة عند لمسها
  const [dictOpen, setDictOpen] = useState(false);
  const [dictWord, setDictWord] = useState("");
  const [dictMeaning, setDictMeaning] = useState("");
  const [dictLoading, setDictLoading] = useState(false);

  // وضع القيادة (واجهة كبيرة مبسّطة)
  const [drivingMode, setDrivingMode] = useState(false);
  // وضع ملء الشاشة للقراءة (إخفاء الأزرار وتكبير النص)
  const [fullText, setFullText] = useState(false);
  // الانتقال لصفحة محددة
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState("");
  // وضع التحديد (للدراسة): لمس السطر يحدّده بلون لجمعه للمقتطفات
  const [highlightMode, setHighlightMode] = useState(false);
  // رسالة تأكيد عابرة (toast)
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  // تحميل الكتاب كامل (تجهيز كل الصفحات مسبقًا)
  const [ingesting, setIngesting] = useState(false);
  const [ingestDone, setIngestDone] = useState(0);
  const [ingestTotal, setIngestTotal] = useState(0);
  const [fullyLoaded, setFullyLoaded] = useState(false); // الكتاب محمّل بالكامل
  const fullyLoadedRef = useRef(false);
  // بوّابة التحميل: صفحتان مجانيتان ثم نشجّع تحميل الكتاب كاملًا (قراءة بلا تقطيع)
  const sessionPagesRef = useRef<Set<number>>(new Set());
  const pendingPageRef = useRef<number | null>(null);
  const gateDismissedRef = useRef(false);
  const [downloadGate, setDownloadGate] = useState(false);

  // علامات + تظليل + ملاحظات
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [makingCards, setMakingCards] = useState(false);
  // الاستماع بالعربية: ترجمة الصفحة ثم قراءتها بصوت عربي (لكتب اللغات)
  const [listenArabic, setListenArabic] = useState(false);
  const listenArabicRef = useRef(false);
  const arTransRef = useRef<Map<number, string>>(new Map());
  // لوحة الترجمة: اختيار صوت عربي للترجمة في مكان واحد
  const [translateModal, setTranslateModal] = useState(false);
  const [translateVoiceId, setTranslateVoiceId] = useState(DEFAULT_VOICE_ID);
  const translateVoiceIdRef = useRef(DEFAULT_VOICE_ID);
  // النطق الدقيق: تشكيل النص قبل القراءة (لكتب الدين والقانون والفصحى)
  const [tashkeelMode, setTashkeelMode] = useState(false);
  const tashkeelRef = useRef(false);
  const tashkeelCacheRef = useRef<Map<number, string>>(new Map());
  // عرض البريزنتيشن: شرائح مولّدة من الصفحة تتنقّل مع الصوت
  const [presentOpen, setPresentOpen] = useState(false);
  const [pageSlides, setPageSlides] = useState<Slide[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const slidesCacheRef = useRef<Map<number, Slide[]>>(new Map());
  // سرد العرض التقديمي بصوت ElevenLabs (شريحة بشريحة)
  const [presNarrating, setPresNarrating] = useState(false);
  const [presSlide, setPresSlide] = useState(0);
  const presNarratingRef = useRef(false);
  const presUsedRef = useRef(false); // فُتح العرض مرة → جهّز الشرائح مسبقًا للصفحات التالية
  const [presMusicKey, setPresMusicKey] = useState<string | null>(null); // موسيقى مختارة (null = بدون)
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);

  // مساعد الذكاء الاصطناعي
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");

  // مراجع
  const playingRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsLoadedRef = useRef(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false); // اكتمل استرجاع الصفحة المحفوظة
  const scrollRef = useRef<ScrollView>(null);
  const pdfScrollRef = useRef<ScrollView>(null);
  const pdfViewH = useRef(0);
  const pdfContentH = useRef(0);
  const textViewH = useRef(0);
  const textContentH = useRef(0);
  const offsetsRef = useRef<number[]>([]);
  const resumeIdxRef = useRef(0); // الجملة التي يبدأ منها التشغيل بعد تخطٍّ يدوي
  // ترويسات رُئيت (عناوين الكتاب/الوحدات) — تُقرأ أول مرة ثم تُحذف من القراءة
  const seenHeadersRef = useRef<Set<string>>(new Set());
  // مقاطع كل صفحة بعد المعالجة (تخزين لتطابق العرض والصوت وعدم تكرار المعالجة)
  const processedRef = useRef<Map<number, string[]>>(new Map());
  const focusNameRef = useRef(""); // اسم المستخدم لوضع التركيز (فارغ = مطفأ)
  const focusEveryRef = useRef(0); // كل كم جملة يُنادى الاسم (0 = أبدًا)
  const focusCountRef = useRef(0); // عدّاد الجُمل لمناداة الاسم دوريًا
  const playStartRef = useRef<number | null>(null);

  // صورة الصفحة الحالية (عالية الدقة، قابلة للتكبير، تتابع القراءة)
  const [pageImg, setPageImg] = useState<string | null>(null);
  const [pageImgAspect, setPageImgAspect] = useState(0.7); // العرض/الارتفاع
  const [pageImgLoading, setPageImgLoading] = useState(false);
  const pageImgForRef = useRef(0); // الصفحة التي تخصّها الصورة المعروضة حاليًا
  const imgReqRef = useRef(0); // رقم الطلب — يضمن أن آخر صفحة مطلوبة هي التي تُعرض

  // العدسة المكبّرة (وضع منفصل ملء الشاشة — لا يؤثّر على القراءة العادية)
  const [lensOpen, setLensOpen] = useState(false);
  const [pageWords, setPageWords] = useState<WordBox[]>([]); // صناديق كلمات الصفحة
  const wordsCacheRef = useRef<Map<number, WordBox[]>>(new Map());
  const [readProgress, setReadProgress] = useState(0); // تقدّم القراءة 0..1 عبر الصفحة
  const [lensW, setLensW] = useState(0); // عرض نافذة العدسة المقاس
  const [lensH, setLensH] = useState(0); // ارتفاع نافذة العدسة المقاس
  const lensX = useRef(new Animated.Value(0)).current;
  const lensY = useRef(new Animated.Value(0)).current;
  const lensOpenRef = useRef(false);
  const pdfFollowRef = useRef(false); // نتتبّع موضع القراءة (للهايلايتر/العدسة) في وضع PDF أو العدسة
  const [pdfImgW2, setPdfImgW2] = useState(0); // عرض صورة الصفحة المعروضة (لتظليل الكلمة)
  useEffect(() => {
    // نحمّل صورة الصفحة في وضع PDF أو عند فتح العدسة (تحتاج الصورة)
    if ((viewMode !== "pdf" && !lensOpen) || !pdfPath || !prefsLoaded) return;
    const target = page;
    const myReq = ++imgReqRef.current;
    // امسح صورة الصفحة السابقة فورًا إن اختلفت الصفحة (لا يبقى الغلاف القديم)
    if (pageImgForRef.current !== target) setPageImg(null);
    setPageImgLoading(true);
    (async () => {
      let uri = await getPageImage(pdfPath, target).catch(() => null);
      // إعادة محاولة (قد لا تكون الصورة وُلِّدت بعد على الخادم)
      if (!uri && myReq === imgReqRef.current) uri = await getPageImage(pdfPath, target).catch(() => null);
      if (myReq !== imgReqRef.current) return; // وصل طلب أحدث لصفحة أخرى → تجاهل هذا
      pageImgForRef.current = target;
      setPageImg(uri);
      setPageImgLoading(false);
      if (uri) {
        Image.getSize(
          uri,
          (w, h) => myReq === imgReqRef.current && h > 0 && setPageImgAspect(w / h),
          () => {}
        );
      }
    })();
  }, [pdfPath, page, viewMode, prefsLoaded, lensOpen]);

  // تحميل التفضيلات: آخر صفحة + السرعة
  useEffect(() => {
    (async () => {
      const [savedPage, savedRate, savedSent] = await Promise.all([
        getLastPage(bookId),
        getReadingRate(),
        getLastSentence(bookId),
      ]);
      setPage(savedPage);
      setRate(savedRate);
      resumeIdxRef.current = savedSent; // يستأنف من نفس الجملة بالضبط
      prefsLoadedRef.current = true;
      setPrefsLoaded(true); // الآن page = الصفحة المحفوظة → حمّل صورتها (لا الغلاف)
    })();

    return () => {
      playingRef.current = false;
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      stopSpeaking();
      stopAmbient(); // أوقف موسيقى الخلفية عند مغادرة الكتاب
      // ملاحظة: لا نوقف تحميل الكتاب عند الخروج — يكمل في الخلفية عبر المدير العام
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // حفظ آخر صفحة عند تغيّرها (بعد تحميل التفضيلات لتفادي الكتابة فوق المحفوظ)
  useEffect(() => {
    if (prefsLoadedRef.current && bookId && page >= 1) setLastPage(bookId, page);
  }, [bookId, page]);

  // حفظ آخر جملة مقروءة لاستئناف دقيق (لا نكتب -1 عند الإيقاف)
  useEffect(() => {
    if (prefsLoadedRef.current && bookId && activeSentence >= 0) {
      setLastSentence(bookId, activeSentence);
    }
  }, [bookId, activeSentence]);

  // تحميل العلامات والتظليلات
  useEffect(() => {
    (async () => {
      const [bm, hl] = await Promise.all([getBookmarks(bookId), getHighlights(bookId)]);
      setBookmarks(bm);
      setHighlights(hl);
    })();
  }, [bookId]);

  // عند معرفة عدد الصفحات: تحقّق إن كان الكتاب محمّلًا بالكامل مسبقًا
  useEffect(() => {
    if (!pdfPath || totalPages <= 0) return;
    let active = true;
    cachedPageCount(pdfPath)
      .then((c) => {
        if (active && c >= totalPages) setFullyLoaded(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pdfPath, totalPages]);

  const isBookmarked = bookmarks.includes(page);

  async function onToggleBookmark() {
    const was = bookmarks.includes(page);
    setBookmarks(await toggleBookmark(bookId, page));
    showToast(was ? t("reader.toast.bookmarkRemoved", { page }) : t("reader.toast.bookmarkSaved", { page }));
  }

  // ضغطة مطوّلة على جملة في وضع النص → تظليل/إزالة
  async function onSentenceLongPress(text: string) {
    const existing = highlights.find((h) => h.page === page && h.text === text);
    if (existing) {
      setHighlights(await removeHighlight(bookId, existing.id));
      showToast(t("reader.toast.highlightRemoved"));
    } else {
      setHighlights(await addHighlight(bookId, { page, text }));
      showToast(t("reader.toast.highlightSaved"));
    }
  }

  function isHighlighted(text: string) {
    return highlights.some((h) => h.page === page && h.text === text);
  }

  async function saveNoteDraft() {
    if (!noteDraft) return;
    setHighlights(await setHighlightNote(bookId, noteDraft.id, noteDraft.text.trim()));
    setNoteDraft(null);
  }

  async function deleteHighlight(id: string) {
    setHighlights(await removeHighlight(bookId, id));
  }

  function jumpTo(p: number) {
    setNotesOpen(false);
    stop();
    setPage(p);
    if (viewMode === "text") loadSentences(p);
  }

  // يحوّل المقاطع المظلّلة إلى بطاقات مراجعة (بالذكاء)
  async function makeCardsFromHighlights() {
    if (highlights.length === 0 || makingCards) return;
    setMakingCards(true);
    try {
      const text = highlights.map((h) => h.text).join("\n");
      const cards = await generateFlashcards(text);
      if (cards.length === 0) {
        showToast(t("reader.toast.cardsFromHighlightsFailed"));
        return;
      }
      const n = await addCards(
        cards.map((c) => ({
          ...c,
          bookId: typeof id === "string" ? id : undefined,
          bookTitle: typeof title === "string" ? title : undefined,
        }))
      );
      showToast(t("reader.toast.cardsAdded", { count: n }));
    } catch {
      showToast(t("reader.toast.cardsFailed"));
    } finally {
      setMakingCards(false);
    }
  }

  function stop() {
    playingRef.current = false;
    stopSpeaking();
    setSpeaking(false);
    setActiveSentence(-1);
    setActiveWord(-1);

    // سجّل دقائق الاستماع لهذه الجلسة + حدّث السلسلة
    if (playStartRef.current) {
      const mins = (Date.now() - playStartRef.current) / 60000;
      playStartRef.current = null;
      recordActivity({ minutes: mins });
    }
  }

  // تمرير تلقائي لوضع النص — يُبقي الجملة الجاري قراءتها قرب وسط الشاشة
  // تمرير «تيليبرومبتر» يُبقي المقطع المقروء واضحًا في الوسط — حتى عند العودة لشاشة
  // النص (متوقفة) يقفز إليه فورًا فلا تضيع وين القراءة.
  useEffect(() => {
    if (viewMode !== "text" || activeSentence < 0) return;
    const scrollToActive = () => {
      const y0 = offsetsRef.current[activeSentence];
      if (typeof y0 !== "number") return;
      // موضع داخل المقطع حسب الكلمة المنطوقة → تمرير ينزل مع الهايلايت بسلاسة
      const y1 = offsetsRef.current[activeSentence + 1];
      const curWords = (sentences[activeSentence]?.match(/\S+/g) || []).length || 1;
      const within = activeWord >= 0 ? Math.min(1, activeWord / curWords) : 0;
      const target = typeof y1 === "number" ? y0 + (y1 - y0) * within : y0;
      const viewH = textViewH.current || 400;
      // داخل المقطع (مع الكلمة) نمرّر فوريًا بخطوات صغيرة = انسيابي؛ وعند تغيّر
      // المقطع نمرّر بحركة. (animated مع كل نبضة يتقطّع لأن كل حركة تقطع السابقة)
      scrollRef.current?.scrollTo({ y: Math.max(0, target - viewH * 0.4), animated: activeWord < 0 });
    };
    scrollToActive();
    // عند العودة للشاشة قد لا تكون المواضع جاهزة بعد → أعد المحاولة بعد التخطيط
    const t = setTimeout(scrollToActive, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSentence, activeWord, viewMode]);

  // تمرير تلقائي «تيليبرومبتر» لصورة الصفحة في وضع PDF أثناء القراءة
  useEffect(() => {
    if (viewMode !== "pdf" || !speaking || activeSentence < 0 || sentences.length === 0) return;
    const frac = sentences.length > 1 ? activeSentence / (sentences.length - 1) : 0;
    const scrollable = Math.max(0, pdfContentH.current - pdfViewH.current);
    pdfScrollRef.current?.scrollTo({ y: frac * scrollable, animated: true });
  }, [activeSentence, viewMode, speaking, sentences.length]);

  // عند فتح الكتاب: حمّل نص صفحة الاستئناف فورًا (حتى في وضع PDF) → يجهّز أول
  // جملة صوتيًا فيبدأ التشغيل سريعًا بلا دوران طويل.
  useEffect(() => {
    if (!prefsLoaded || speaking || sentences.length > 0) return;
    loadSentences(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded]);

  // جهّز أول جملة مسبقًا عند تحميل نص الصفحة (وهي متوقفة) → زر التشغيل يبدأ فورًا بلا انتظار
  useEffect(() => {
    if (sentences.length === 0 || speaking) return;
    const idx = Math.max(0, Math.min(resumeIdxRef.current || 0, sentences.length - 1));
    prefetchText(sentences[idx], { voiceId: pickVoice() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences]);

  function cycleSpeed() {
    const idx = SPEEDS.indexOf(rate as (typeof SPEEDS)[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setRate(next);
    setReadingRate(next);
  }

  function cycleSleep() {
    const idx = SLEEP_OPTIONS.indexOf(sleepMin as (typeof SLEEP_OPTIONS)[number]);
    const next = SLEEP_OPTIONS[(idx + 1) % SLEEP_OPTIONS.length];
    setSleepMin(next);

    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (next > 0) {
      sleepTimerRef.current = setTimeout(() => {
        stop();
        setSleepMin(0);
        sleepTimerRef.current = null;
      }, next * 60 * 1000);
    }
  }

  // البريزنتيشن: ولّد شرائح الصفحة. بعد أول فتح للعرض نجهّزها مسبقًا في الخلفية
  // لكل صفحة (presUsedRef) فتكون فورية. ونقسّم الشرائح الطويلة على شرائح تالية.
  useEffect(() => {
    if ((!presentOpen && !presUsedRef.current) || sentences.length === 0) return;
    const p = page;
    if (slidesCacheRef.current.has(p)) {
      setPageSlides(slidesCacheRef.current.get(p)!);
      return;
    }
    let active = true;
    if (presentOpen) {
      setSlidesLoading(true);
      setPageSlides([]);
    }
    (async () => {
      try {
        const sl = splitLongSlides(await generateSlides(sentences.join(" ").slice(0, 4000)));
        if (!active) return;
        slidesCacheRef.current.set(p, sl);
        if (presentOpen) setPageSlides(sl);
      } catch {
        if (active && presentOpen) setPageSlides([]);
      } finally {
        if (active && presentOpen) setSlidesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [presentOpen, page, sentences.length]);

  // الشريحة المعروضة = اختيار المستخدم/السرد (تنقّل يدوي حر)
  const slideIdx = pageSlides.length > 0 ? Math.min(Math.max(0, presSlide), pageSlides.length - 1) : 0;
  // التنقّل اليدوي بين الشرائح (بلا صوت)
  function goSlide(delta: number) {
    setPresSlide((s) => Math.min(Math.max(0, s + delta), Math.max(0, pageSlides.length - 1)));
  }
  function jumpSlide(di: number) {
    setPresSlide(di);
  }
  // شرائح صفحة جديدة → ابدأ من الأولى
  useEffect(() => {
    setPresSlide(0);
  }, [pageSlides]);

  // نصّ الشريحة للسرد الصوتي: العنوان ثم النقاط
  function slideSpeech(s: Slide): string {
    return `${s.title}. ${s.bullets.join("، ")}.`;
  }

  // سرد العرض شريحة بشريحة بصوت ElevenLabs (مع موسيقى خلفية ومؤثّر انتقال)
  function narrateSlidesFrom(idx: number) {
    if (!presNarratingRef.current) return;
    if (idx >= pageSlides.length) {
      presNarratingRef.current = false;
      setPresNarrating(false);
      return; // الموسيقى تستمر في الخلفية (لا نوقفها)
    }
    setPresSlide(idx);
    speakText(slideSpeech(pageSlides[idx]), {
      voiceId: pickVoice(),
      rate,
      expressive: true, // صوت أدفأ وأكثر تعبيرًا للعرض التقديمي
      onDone: () => narrateSlidesFrom(idx + 1),
      onError: () => narrateSlidesFrom(idx + 1),
    });
  }

  function togglePresentNarrate() {
    if (presNarrating) {
      presNarratingRef.current = false;
      setPresNarrating(false);
      stopSpeaking(); // الموسيقى تستمر
    } else if (pageSlides.length > 0) {
      stop(); // أوقف قراءة الصفحة إن كانت تعمل
      presNarratingRef.current = true;
      setPresNarrating(true);
      narrateSlidesFrom(0);
    }
  }

  // وضع التركيز: حمّل الاسم ودرجة المناداة
  useEffect(() => {
    (async () => {
      const [level, name] = await Promise.all([getFocusLevel(), getUserName()]);
      focusEveryRef.current = focusEvery(level);
      focusNameRef.current = focusEveryRef.current > 0 ? name.trim() : "";
    })();
  }, []);

  // يتخطّى الترويسة المتكرّرة (نفس بداية الصفحة السابقة) فتُقرأ مرة واحدة
  // يجهّز مقاطع الصفحة للقراءة/العرض (مرة واحدة لكل صفحة) مع معالجة الترويسة المتكرّرة:
  // عنوان الوحدة ورقم الصفحة يُقرآن أول مرة فقط، ثم يُحذفان من الصفحات التالية للوحدة.
  function getReadingSentences(pageText: string, p: number): string[] {
    const cached = processedRef.current.get(p);
    if (cached) return cached;
    const { chunks, headerLines } = splitForReading(pageText, {
      seenHeaders: seenHeadersRef.current,
      page: p,
    });
    headerLines.forEach((h) => seenHeadersRef.current.add(h));
    processedRef.current.set(p, chunks);
    return chunks;
  }

  // الصوت المستخدم للقراءة: عند الترجمة نستخدم الصوت العربي المختار في لوحة الترجمة
  function pickVoice(): string {
    return listenArabicRef.current ? translateVoiceIdRef.current : voiceId;
  }

  // تفعيل/إيقاف الترجمة بصوت عربي مختار (من لوحة الترجمة)
  function applyTranslate(on: boolean, vId: string) {
    translateVoiceIdRef.current = vId;
    setTranslateVoiceId(vId);
    setTranslateModal(false);
    if (on === listenArabicRef.current && on) {
      // مفعّلة أصلًا وغيّرت الصوت فقط → أعد التشغيل بالصوت الجديد
      if (playingRef.current) {
        stop();
        playingRef.current = true;
        setSpeaking(true);
        playStartRef.current = Date.now();
        recordActivity({});
        playFromPage(page, Math.max(0, activeSentence), false); // يكمل من نفس الموضع
      }
      return;
    }
    if (on !== listenArabicRef.current) toggleListenArabic();
  }

  // تبديل وضع الاستماع بالعربية (يعيد التشغيل من الصفحة الحالية إن كانت القراءة جارية)
  function toggleListenArabic() {
    const next = !listenArabic;
    setListenArabic(next);
    listenArabicRef.current = next;
    const wasPlaying = playingRef.current;
    stop();
    if (wasPlaying) {
      playingRef.current = true;
      setSpeaking(true);
      playStartRef.current = Date.now();
      recordActivity({});
      playFromPage(page, Math.max(0, activeSentence), false); // يكمل من نفس الموضع
    }
  }

  // تبديل وضع النطق الدقيق (تشكيل) — يعيد التشغيل من الصفحة الحالية إن كان يقرأ
  function toggleTashkeel() {
    const next = !tashkeelMode;
    setTashkeelMode(next);
    tashkeelRef.current = next;
    const wasPlaying = playingRef.current;
    stop();
    if (wasPlaying) {
      playingRef.current = true;
      setSpeaking(true);
      playStartRef.current = Date.now();
      recordActivity({});
      playFromPage(page, Math.max(0, activeSentence), false); // يكمل من نفس الموضع
    }
  }

  // يشكّل نص الصفحة (مع تخزين مؤقت) لنطق صحيح
  async function tashkeelPage(p: number, text: string): Promise<string> {
    if (tashkeelCacheRef.current.has(p)) return tashkeelCacheRef.current.get(p)!;
    try {
      const out = (await aiAssist("tashkeel", text)).trim() || text;
      tashkeelCacheRef.current.set(p, out);
      return out;
    } catch {
      return text;
    }
  }

  // يترجم نص الصفحة إلى العربية (مع تخزين مؤقت)
  async function translatePageToArabic(p: number, text: string): Promise<string> {
    if (arTransRef.current.has(p)) return arTransRef.current.get(p)!;
    try {
      const ar = (await aiAssist("translate", text)).trim();
      const out = ar || text;
      arTransRef.current.set(p, out);
      return out;
    } catch {
      return text;
    }
  }

  // يقرأ صفحة جملة-بجملة، وعند انتهائها ينتقل تلقائيًا للتالية.
  // announce: يذكر رقم الصفحة مرة واحدة (عند بدء القراءة/الانتقال اليدوي فقط)
  async function playFromPage(p: number, startIdx = 0, announce = false) {
    if (!pdfPath) return;

    // بوّابة التحميل: بعد صفحتين مجانيتين، شجّعي تحميل الكتاب كامل قبل المتابعة
    const seen = sessionPagesRef.current;
    if (
      !gateDismissedRef.current &&
      !fullyLoadedRef.current &&
      !getDownloadState()?.running &&
      !seen.has(p) &&
      seen.size >= 2
    ) {
      pendingPageRef.current = p;
      playingRef.current = false;
      setSpeaking(false);
      setBusy(false);
      setStatus("");
      setDownloadGate(true);
      return;
    }
    seen.add(p);

    setBusy(true);
    setStatus(
      listenArabicRef.current
        ? `جارٍ ترجمة الصفحة ${p}…`
        : tashkeelRef.current
        ? `جارٍ تشكيل الصفحة ${p}…`
        : `جارٍ تحضير نص الصفحة ${p}…`
    );
    try {
      const res = await extractPdfPageText(pdfPath, p);
      if (res.totalPages) setTotalPages(res.totalPages);
      setPage(res.page);

      let pageText = res.text;
      if (listenArabicRef.current && pageText.trim()) {
        pageText = await translatePageToArabic(res.page, pageText);
      } else if (tashkeelRef.current && pageText.trim()) {
        pageText = await tashkeelPage(res.page, pageText);
      }
      if (!playingRef.current) return;
      // الترجمة/التشكيل تغيّر النص → تقسيم بسيط؛ وإلا معالجة الترويسة (عنوان+صفحة مرة واحدة)
      const sents =
        listenArabicRef.current || tashkeelRef.current
          ? splitSentences(pageText)
          : getReadingSentences(pageText, res.page);
      setSentences(sents);
      offsetsRef.current = [];

      if (!playingRef.current) return; // أُوقف أثناء التحميل

      if (sents.length === 0) {
        // صفحة بدون نص (قد تكون صورة ممسوحة) → جرّب التالية أو أوقف
        if (res.page < res.totalPages) {
          setStatus(`الصفحة ${res.page} بدون نص — أتنقّل للتالية…`);
          return playFromPage(res.page + 1);
        }
        setStatus("لا يوجد نص قابل للقراءة في هذا الكتاب.");
        stop();
        return;
      }

      setBusy(false);
      setStatus("");
      const start = Math.min(Math.max(0, startIdx), sents.length - 1);
      if (announce && start === 0) {
        // أعلن رقم الصفحة مرة واحدة ثم اقرأ المحتوى
        speakText(`الصفحة رقم ${res.page}.`, {
          voiceId: pickVoice(),
          rate,
          onDone: () => playSentence(sents, 0, res.page, res.totalPages),
          onError: () => playSentence(sents, 0, res.page, res.totalPages),
        });
      } else {
        playSentence(sents, start, res.page, res.totalPages);
      }
    } catch (e: any) {
      setBusy(false);
      setStatus(`تعذّر تحميل النص: ${e?.message ?? "تحقّقي من الاتصال"}`);
      stop();
    }
  }

  // يقرأ جملة واحدة ثم ينتقل للتالية (أو للصفحة التالية)
  function playSentence(sents: string[], i: number, p: number, total: number) {
    if (!playingRef.current) return;

    if (i >= sents.length) {
      recordActivity({ pages: 1 }); // أنهى صفحة
      if (p < total) {
        playFromPage(p + 1);
      } else {
        recordBookCompleted(); // أنهى الكتاب
        stop();
      }
      return;
    }

    setActiveSentence(i);
    setActiveWord(-1);
    setStatus(`🎙️ يقرأ الآن — جملة ${i + 1} من ${sents.length}`);

    const speakCurrent = () => {
      if (!playingRef.current) return;
      // تجهيز الجمل التالية مسبقًا (صوتها) لقراءة سلسة بلا تقطيع — جملتان قدّام
      const vId = pickVoice();
      // المقطع التالي: نحمّل مشغّله مسبقًا (warm) ليبدأ فورًا بلا فجوة بين المقاطع
      if (i + 1 < sents.length) warmNext(sents[i + 1], { voiceId: vId });
      if (i + 2 < sents.length) prefetchText(sents[i + 2], { voiceId: vId });
      // قرب نهاية الصفحة: جهّز نص الصفحة التالية مسبقًا لتنقّل سلس
      if (i >= sents.length - 2 && p < total) {
        extractPdfPageText(pdfPath, p + 1).catch(() => {});
      }
      // لموضع العدسة: كم مقطعًا/كلمات قبل هذا المقطع وإجماليها
      let wordsBefore = 0;
      for (let k = 0; k < i; k++) wordsBefore += (sents[k].match(/\S+/g) || []).length;
      const curWords = (sents[i].match(/\S+/g) || []).length || 1;
      const totalWords = sents.reduce((a, s) => a + (s.match(/\S+/g) || []).length, 0) || 1;
      speakText(sents[i], {
        voiceId: pickVoice(),
        rate,
        // هايلايت كلمة-بكلمة: التقدّم من توقيت ElevenLabs الحقيقي → الكلمة المنطوقة
        onProgress: (frac) => {
          // frac الآن دقيق (من توقيت الحروف الحقيقي بعد محاذاته بالنص المعروض)
          setActiveWord(wordIndexAtFraction(sents[i], frac));
          // تقدّم القراءة (لتظليل الكلمة على الـPDF/العدسة) — في وضع PDF أو العدسة فقط
          if (pdfFollowRef.current) {
            setReadProgress(Math.min(1, Math.max(0, (wordsBefore + frac * curWords) / totalWords)));
          }
        },
        onDone: () => {
          setActiveWord(-1);
          playSentence(sents, i + 1, p, total);
        },
        onFallback: (reason) => setVoiceWarn(reason),
        onError: (e) => {
          const msg = (e as any)?.message ?? "خطأ";
          if (msg === "QUOTA") {
            setVoiceWarn("");
            setStatus("⏸️ نفد رصيد الصوت الطبيعي — جدّدي باقة الصوت لمواصلة الاستماع.");
          } else {
            setStatus(`تعذّر تشغيل الصوت: ${msg}`);
          }
          stop();
        },
      });
    };

    // وضع التركيز: ناديها باسمها كل عدّة جُمل قبل قراءة الجملة
    focusCountRef.current += 1;
    const name = focusNameRef.current;
    const every = focusEveryRef.current;
    if (name && every > 0 && focusCountRef.current % every === 0) {
      const phrases = [
        `معاي يا ${name}؟`,
        `فاهمة عليّ يا ${name}؟`,
        `منتبهة معاي يا ${name}؟`,
        `أحسنتِ يا ${name}، نكمل.`,
      ];
      const phrase = phrases[Math.floor(focusCountRef.current / every) % phrases.length];
      speakText(phrase, { voiceId, rate, onDone: speakCurrent, onError: speakCurrent });
    } else {
      speakCurrent();
    }
  }

  // يحوّل نص الرقم (عربي ١٢٣ أو إنجليزي 123) إلى عدد
  function toPageNum(s: string): number {
    const western = s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    return parseInt(western || "0", 10);
  }

  // الانتقال لصفحة محددة. إن كانت القراءة شغّالة تكمل منها، وإلا تنتقل للعرض فقط.
  function gotoPage(n: number) {
    const target = Math.max(1, totalPages ? Math.min(totalPages, n) : n);
    setGotoOpen(false);
    const wasPlaying = playingRef.current;
    stop();
    resumeIdxRef.current = 0;
    setPage(target);
    if (wasPlaying) {
      playingRef.current = true;
      setSpeaking(true);
      playStartRef.current = Date.now();
      recordActivity({});
      playFromPage(target, 0, true);
    } else {
      loadSentences(target);
    }
  }

  // تمرير على صورة الصفحة ثم رفع الإصبع: إن تجاوزتِ الحافة قليلًا → صفحة واحدة فقط.
  // يُستدعى مرة واحدة لكل سحبة (دقيق، ما يقفز). مثبّت أثناء القراءة وعند التكبير.
  function onPdfSwipeEnd(e: { nativeEvent: any }) {
    if (speaking) return;
    const ne = e.nativeEvent;
    if (ne.zoomScale && ne.zoomScale > 1.05) return;
    const y = ne.contentOffset?.y ?? 0;
    const viewH = ne.layoutMeasurement?.height ?? 0;
    const contentH = ne.contentSize?.height ?? 0;
    const OVER = 55;
    if (y < -OVER) goPage(-1);
    else if (viewH > 0 && contentH > 0 && y + viewH > contentH + OVER) goPage(1);
  }

  // التقدّم/التأخّر بين المقاطع (الجُمل) داخل الصفحة الحالية
  // تسريع التخطّي: كل ضغطة سريعة بنفس الاتجاه تتخطّى مقاطع أكثر (×1، ×2، ×3…)
  const skipAccelRef = useRef<{ t: number; dir: number; mult: number }>({ t: 0, dir: 0, mult: 1 });
  const skipBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function skipSentence(deltaDir: number) {
    const sents = sentences;
    if (sents.length === 0) return;
    const dir = deltaDir > 0 ? 1 : -1;
    const now = Date.now();
    const a = skipAccelRef.current;
    a.mult = a.dir === dir && now - a.t < 800 ? Math.min(a.mult + 1, 5) : 1;
    a.dir = dir;
    a.t = now;
    // أظهر مضاعف السرعة (×2 ×3…) كشارة على الزر، وتختفي بعد توقّف الضغط
    setSkipMult(a.mult);
    setSkipDir(dir);
    if (skipBadgeTimer.current) clearTimeout(skipBadgeTimer.current);
    skipBadgeTimer.current = setTimeout(() => setSkipMult(1), 900);

    const base = activeSentence >= 0 ? activeSentence : 0;
    const target = base + dir * a.mult;

    // تجاوز حدود الصفحة → الصفحة المجاورة
    if (target < 0) return goPage(-1);
    if (target >= sents.length) return goPage(1);

    stopSpeaking();
    setActiveSentence(target);
    if (playingRef.current) {
      playSentence(sents, target, page, totalPages || sents.length);
    } else {
      resumeIdxRef.current = target; // عند الضغط على تشغيل يبدأ من هنا
    }
  }

  function togglePlay() {
    if (speaking) {
      // احفظ الموضع الحالي عند الإيقاف ليُستأنف من نفس الجملة (لا من البداية)
      resumeIdxRef.current = Math.max(0, activeSentence);
      stop();
      setStatus("");
      return;
    }
    setStatus("");
    setVoiceWarn("");
    // نحترم وضع العرض الحالي: في «نص» يتحرّك التظليل، وفي «PDF» تتابع الصفحات القراءة
    playingRef.current = true;
    setSpeaking(true);
    playStartRef.current = Date.now();
    recordActivity({}); // علّم اليوم نشطًا (السلسلة)
    playFromPage(page, resumeIdxRef.current, false); // يكمل من موضعه دون إعادة إعلان الصفحة
    resumeIdxRef.current = 0;
  }

  // تنقّل بين الصفحات: يحمّل نص الصفحة الجديدة، ويكمل القراءة إن كانت شغّالة
  function goPage(delta: number) {
    const next = Math.max(1, totalPages ? Math.min(totalPages, page + delta) : page + delta);
    if (next === page) return;
    const wasPlaying = playingRef.current;
    stop();
    resumeIdxRef.current = 0;
    setPage(next);
    if (wasPlaying) {
      playingRef.current = true;
      setSpeaking(true);
      playStartRef.current = Date.now();
      playFromPage(next, 0, true);
    } else {
      loadSentences(next);
    }
  }

  // تحميل نص الصفحة للعرض فقط (بدون قراءة)
  async function loadSentences(p: number) {
    if (!pdfPath) return;
    setBusy(true);
    try {
      const res = await extractPdfPageText(pdfPath, p);
      if (res.totalPages) setTotalPages(res.totalPages);
      setPage(res.page);
      setSentences(getReadingSentences(res.text, res.page));
      offsetsRef.current = [];
    } catch {
      // تجاهل
    } finally {
      setBusy(false);
    }
  }

  function toggleViewMode() {
    const next = viewMode === "pdf" ? "text" : "pdf";
    setViewMode(next);
    if (next === "text" && sentences.length === 0 && !speaking) {
      loadSentences(page);
    }
  }

  // يضمن وجود نص الصفحة الحالية (يجلبه إن لزم) ويُرجعه كنص واحد
  async function ensurePageText(): Promise<string> {
    if (sentences.length > 0) return sentences.join(" ");
    if (!pdfPath) return "";
    const res = await extractPdfPageText(pdfPath, page);
    if (res.totalPages) setTotalPages(res.totalPages);
    const sents = splitSentences(res.text);
    setSentences(sents);
    return sents.join(" ");
  }

  async function runAi(action: AiAction) {
    setAiBusy(true);
    setAiResult("");
    try {
      const text = await ensurePageText();
      if (!text.trim()) {
        setAiResult(t("reader.ai.noPageText"));
        return;
      }
      const out = await aiAssist(action, text, aiQuestion);
      setAiResult(out || t("reader.ai.noResult"));
    } catch {
      setAiResult(t("reader.ai.requestFailed"));
    } finally {
      setAiBusy(false);
    }
  }

  async function makeFlashcards() {
    setAiBusy(true);
    setAiResult("");
    try {
      const text = await ensurePageText();
      if (!text.trim()) {
        setAiResult(t("reader.ai.noPageText"));
        return;
      }
      const cards = await generateFlashcards(text);
      if (cards.length === 0) {
        setAiResult(t("reader.ai.cardsFailed"));
        return;
      }
      const bookTitle = typeof title === "string" ? title : undefined;
      const n = await addCards(cards.map((c) => ({ ...c, bookId, bookTitle })));
      setAiResult(t("reader.ai.cardsSaved", { count: n }));
    } catch {
      setAiResult(t("reader.ai.requestFailed"));
    } finally {
      setAiBusy(false);
    }
  }

  // لمس كلمة → عرض معناها حسب سياقها
  // يبدأ القراءة من جملة محددة في الصفحة الحالية
  function readFromSentence(i: number) {
    stop();
    setActiveSentence(i);
    playingRef.current = true;
    setSpeaking(true);
    playStartRef.current = Date.now();
    recordActivity({});
    playSentence(sentences, i, page, totalPages || sentences.length);
  }

  // كلمة: ضغطة = معنى/تحديد، ضغطتان سريعتان = اقرأ من هنا
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onWordPress(i: number, tok: string, s: string) {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      readFromSentence(i); // ضغطتان → القراءة من هذه الجملة
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      if (highlightMode) onSentenceLongPress(s);
      else onWordTap(tok, s); // ضغطة واحدة → المعنى
    }, 280);
  }

  async function onWordTap(rawWord: string, context: string) {
    const word = rawWord.replace(/[^\p{L}\p{M}]/gu, "").trim();
    if (!word) return;
    setDictWord(word);
    setDictMeaning("");
    setDictLoading(true);
    setDictOpen(true);
    try {
      const m = await defineWord(word, context);
      setDictMeaning(m || t("reader.dict.noMeaning"));
    } catch {
      setDictMeaning(t("reader.dict.meaningFailed"));
    } finally {
      setDictLoading(false);
    }
  }

  // تحميل/تجهيز الكتاب كامل في الخلفية — يستمر حتى لو خرجتِ من الكتاب
  async function startIngest() {
    if (ingesting) {
      stopDownload();
      showToast(t("reader.toast.downloadStopped"));
      return;
    }
    let total = totalPages;
    if (!total) {
      const res = await extractPdfPageText(pdfPath, page);
      total = res.totalPages || 0;
      if (res.totalPages) setTotalPages(res.totalPages);
    }
    if (!total) {
      setStatus("تعذّر معرفة عدد الصفحات.");
      return;
    }
    const bookTitle = typeof title === "string" ? title : "الكتاب";
    await startDownload(pdfPath, bookTitle, total);
    showToast(t("reader.toast.downloadingBackground"));
  }

  useEffect(() => {
    fullyLoadedRef.current = fullyLoaded;
  }, [fullyLoaded]);

  /* ---------------- العدسة المكبّرة (شريط عائم وسط الصفحة) ---------------- */
  useEffect(() => {
    lensOpenRef.current = lensOpen;
  }, [lensOpen]);

  // وضع العرض (landscape) للعدسة: عند فتحها **نسمح** بالدوران فتقلب الجهاز بنفسك
  // أفقيًا فتتّسع العدسة ويكبر الخط (دوران الجهاز يلتفّ كاملًا بشكل سليم، بعكس فرض
  // الاتجاه برمجيًا الذي يلوي المحتوى فقط). عند إغلاقها نقفل العمودي فيرجع تلقائيًا.
  useEffect(() => {
    if (lensOpen) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [lensOpen]);

  // أمان: عند مغادرة القارئ نضمن الرجوع للوضع العمودي حتى لو كانت العدسة مفتوحة.
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // نتتبّع موضع القراءة (لتظليل الكلمة على الـPDF/العدسة) في وضع PDF أو عند فتح العدسة
  useEffect(() => {
    pdfFollowRef.current = lensOpen || viewMode === "pdf";
  }, [lensOpen, viewMode]);

  // صفحة جديدة → ابدأ تقدّم القراءة (والعدسة) من الأعلى
  useEffect(() => {
    setReadProgress(0);
  }, [page]);

  // جلب صناديق كلمات الصفحة (مصدرها Vision الثقيل) — فقط عند فتح العدسة
  // حتى لا نثقّل القراءة العادية بطلبات OCR لكل صفحة
  useEffect(() => {
    if (!lensOpen || !pdfPath) return;
    const p = page;
    const cached = wordsCacheRef.current.get(p);
    if (cached) {
      setPageWords(cached);
      return;
    }
    let on = true;
    getPageWords(pdfPath, p).then((ws) => {
      const clean = ws.filter((w) => {
        const t = (w.t || "").trim();
        if (!t) return false;
        if (/:{3,}/.test(t)) return false;
        if (/restricted|confidential/i.test(t)) return false;
        if (/^[\d٠-٩.\-|]+$/.test(t)) return false;
        if (/^(مقيّ?د|سرّي|مقيد)$/.test(t)) return false;
        return true;
      });
      wordsCacheRef.current.set(p, clean);
      if (on) setPageWords(clean);
    });
    return () => {
      on = false;
    };
  }, [lensOpen, pdfPath, page]);

  // اجمع الكلمات في أسطر (حسب الإحداثي العمودي) لتحديد السطر كاملًا
  type Line = { x: number; y: number; w: number; h: number; start: number; end: number };
  const lines = useMemo<Line[]>(() => {
    const ls: Line[] = [];
    let cur: { minX: number; maxX: number; minY: number; maxY: number; start: number; end: number; cy: number } | null = null;
    const push = () => {
      if (cur) ls.push({ x: cur.minX, y: cur.minY, w: cur.maxX - cur.minX, h: cur.maxY - cur.minY, start: cur.start, end: cur.end });
    };
    pageWords.forEach((w, idx) => {
      const cy = w.y + w.h / 2;
      if (cur && Math.abs(cy - cur.cy) < w.h * 0.9) {
        cur.minX = Math.min(cur.minX, w.x);
        cur.maxX = Math.max(cur.maxX, w.x + w.w);
        cur.minY = Math.min(cur.minY, w.y);
        cur.maxY = Math.max(cur.maxY, w.y + w.h);
        cur.end = idx;
      } else {
        push();
        cur = { minX: w.x, maxX: w.x + w.w, minY: w.y, maxY: w.y + w.h, start: idx, end: idx, cy };
      }
    });
    push();
    return ls;
  }, [pageWords]);

  // نقطة القراءة المتصلة — تتحرك يمين→يسار داخل السطر ثم تنزل (كحركة العين)
  const readPoint = useMemo<{ cx: number; cy: number; idx: number } | null>(() => {
    if (pageWords.length === 0) return null;
    const f = Math.min(pageWords.length - 1, Math.max(0, readProgress * (pageWords.length - 1)));
    const i0 = Math.floor(f);
    const i1 = Math.min(pageWords.length - 1, i0 + 1);
    const t = f - i0;
    const a = pageWords[i0];
    const b = pageWords[i1];
    return {
      cx: (a.x + a.w / 2) * (1 - t) + (b.x + b.w / 2) * t,
      cy: (a.y + a.h / 2) * (1 - t) + (b.y + b.h / 2) * t,
      idx: Math.round(f),
    };
  }, [readProgress, pageWords]);

  // السطر المقروء حاليًا — نظلّل السطر كامل (أنعم وأدق من كلمة مفردة)
  const lineBox = useMemo<WordBox | null>(() => {
    if (!readPoint || lines.length === 0) return null;
    const ln = lines.find((l) => readPoint.idx >= l.start && readPoint.idx <= l.end) ?? null;
    return ln ? { t: "", x: ln.x, y: ln.y, w: ln.w, h: ln.h } : null;
  }, [readPoint, lines]);

  // عمود النص الفعلي للصفحة (أقصى يمين/يسار للكلمات) — لحصر العدسة داخله
  // فلا تعرض هوامش الصفحة الفاضية إطلاقًا.
  // مقاوم للشواذ: نأخذ مئوية حواف **الأسطر** (لا حواف الكلمات) فيتجاهل العناصر
  // الشاردة كالترويسات/الزخارف على الطرفين (مثبَّت ببيانات حقيقية).
  const textCol = useMemo<{ L: number; R: number }>(() => {
    if (lines.length === 0) return { L: 0, R: 1 };
    const pct = (arr: number[], p: number): number => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
    };
    const L = pct(lines.map((l) => l.x), 0.1);
    const R = pct(lines.map((l) => l.x + l.w), 0.9);
    return { L: Math.max(0, L), R: Math.min(1, Math.max(L + 0.2, R)) };
  }, [lines]);

  // العمود الذي **يجب أن يسعه** التكبير: أوسع امتداد لأسطر النص الفعلية (نتجاهل
  // القصيرة جدًا كأرقام الصفحات/الترويسات). نأخذ الحد الأقصى الحقيقي فلا يُقصّ أعرض سطر.
  const fitCol = useMemo<{ L: number; R: number }>(() => {
    const body = lines.filter((l) => l.w > 0.3);
    if (body.length === 0) return textCol;
    let L = 1;
    let R = 0;
    for (const l of body) {
      L = Math.min(L, l.x);
      R = Math.max(R, l.x + l.w);
    }
    return { L: Math.max(0, L), R: Math.min(1, Math.max(L + 0.2, R)) };
  }, [lines, textCol]);

  // الكلمة المقروءة حاليًا (صندوقها) — لتظليل متحرّك يمين→يسار عبر السطر الظاهر
  const wordBox = useMemo<WordBox | null>(() => {
    if (!readPoint || pageWords.length === 0) return null;
    const w = pageWords[Math.min(pageWords.length - 1, Math.max(0, readPoint.idx))];
    return w ? { t: "", x: w.x, y: w.y, w: w.w, h: w.h } : null;
  }, [readPoint, pageWords]);

  // العدسة مغناطيس **متحرّك** يكبّر جزءًا من السطر ثم ينزلق مع القراءة فيغطّي السطر
  // كاملًا يمينًا→يسارًا (وليست لقطة ثابتة للسطر كله). 1.7x = تكبير واضح ومريح.
  const lensScale = 1.7;

  // العدسة تمسح السطر الحالي **كاملًا** مع تقدّم القراءة، محصورةً دائمًا داخل حدود
  // السطر/عمود النص (فلا تُظهر هامش الصفحة الفاضي أبدًا)، وتصل لطرف السطر مضمونًا:
  //   • النص العربي (RTL): تبدأ يمين السطر وتنتهي عند أقصى يساره.
  //   • النص الأجنبي (LTR): تبدأ يسار السطر وتنتهي عند أقصى يمينه.
  // وعموديًا تتمركز على السطر فتنزل سطرًا بسطر. الاتجاه يُضبط تلقائيًا (pageRTL).
  useEffect(() => {
    if (!lensOpen || lensW <= 0 || lensH <= 0 || !readPoint) return;
    const imgH = lensW / (pageImgAspect || 0.7);
    const scaledW = lensW * lensScale; // عرض الصورة المكبّرة
    const scaledH = imgH * lensScale; // ارتفاع الصورة المكبّرة
    const minX = Math.min(0, lensW - scaledW);
    const minY = Math.min(0, lensH - scaledH);
    const win = 1 / lensScale; // عرض النافذة المرئية (بنسبة عرض الصفحة)

    const colL = fitCol.L;
    const colR = fitCol.R;
    const colW = colR - colL;

    // a = الحافة اليسرى للنافذة المرئية (نسبة من عرض الصفحة).
    let tX: number;
    if (colW <= win) {
      // عمود النص أضيق من النافذة (نص ضيّق) → وسّطه وثبّته داخل حدود الصورة.
      const a = colL - (win - colW) / 2;
      tX = Math.min(0, Math.max(minX, -a * scaledW));
    } else {
      // المغناطيس يضع **الكلمة المقروءة في منتصف العدسة دائمًا** وينزلق معها بحرية:
      // يمين→يسار في العربي و يسار→يمين في الأجنبي تلقائيًا (cx يتبع موضع الكلمة).
      // لا نحصره بحواف النص، فعند طرفَي السطر يظهر **هامش أبيض نظيف متساوٍ** (خلفية
      // العدسة) بدل التصاق الكلمة بالحافة أو قصّها. الهامش داخل العدسة فقط لا في الكتاب.
      const a = readPoint.cx - win / 2;
      tX = -a * scaledW;
    }

    // ── عموديًا: تمركز على السطر الحالي فتنزل مع كل سطر ──
    const lineCY = lineBox ? lineBox.y + lineBox.h / 2 : readPoint.cy;
    const tY = Math.min(0, Math.max(minY, lensH / 2 - lineCY * scaledH));

    Animated.timing(lensX, { toValue: tX, duration: 150, useNativeDriver: true }).start();
    Animated.timing(lensY, { toValue: tY, duration: 150, useNativeDriver: true }).start();
  }, [lensOpen, lensW, lensH, readPoint, fitCol, lineBox, lensScale, pageImgAspect, lensX, lensY]);

  // إجراءات بوّابة التحميل
  function gateDownloadNow() {
    setDownloadGate(false);
    startIngest(); // يبدأ التحميل بالخلفية
    const p = pendingPageRef.current;
    if (p != null) {
      gateDismissedRef.current = true; // التحميل جارٍ → لا نوقف القراءة بعد الآن
      playingRef.current = true;
      setSpeaking(true);
      playFromPage(p, 0, false);
    }
  }
  function gateContinueWithout() {
    setDownloadGate(false);
    gateDismissedRef.current = true; // اختارت المتابعة → لا تكرار للبوّابة هذه الجلسة
    const p = pendingPageRef.current;
    if (p != null) {
      playingRef.current = true;
      setSpeaking(true);
      playFromPage(p, 0, false);
    }
  }

  // اعكس حالة المدير العام للتحميل في واجهة هذا الكتاب
  useEffect(() => {
    const unsub = subscribeDownload((s) => {
      if (s && s.pdfPath === pdfPath) {
        setIngesting(s.running);
        setIngestDone(s.done);
        setIngestTotal(s.total);
        if (!s.running && s.total > 0 && s.done >= s.total && s.failed === 0) setFullyLoaded(true);
      } else {
        setIngesting(false);
      }
    });
    return unsub;
  }, [pdfPath]);

  // عند الفتح: إن كان الكتاب مخزّنًا بالكامل مسبقًا → علّمه «محمّل»
  useEffect(() => {
    if (!pdfPath || !totalPages) return;
    let on = true;
    cachedPageCount(pdfPath)
      .then((c) => {
        if (on && c >= totalPages) setFullyLoaded(true);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [pdfPath, totalPages]);

  function goBack() {
    stop();
    // التحميل يكمل في الخلفية — لا نوقفه عند الرجوع
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* الهيدر */}
      {!fullText && (
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={Palette.textMuted} />
        </Pressable>
        <Text style={[styles.hTitle, { textAlign: dir.textAlign }]} numberOfLines={1}>
          {typeof title === "string" && title.trim() ? title : t("reader.book")}
        </Text>

        <Pressable onPress={() => setFullText(true)} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="expand" size={18} color={Palette.text} />
        </Pressable>

        <Pressable onPress={() => setDrivingMode(true)} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="car-sport" size={18} color={Palette.neonCyan} />
        </Pressable>

        <Pressable onPress={onToggleBookmark} style={styles.iconBtn} hitSlop={8}>
          <Ionicons
            name={isBookmarked ? "bookmark" : "bookmark-outline"}
            size={18}
            color={isBookmarked ? Palette.warn : Palette.text}
          />
        </Pressable>

        <Pressable onPress={() => setNotesOpen(true)} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="list" size={18} color={Palette.text} />
          {bookmarks.length + highlights.length > 0 ? (
            <View style={styles.countDot}>
              <Text style={styles.countDotTxt}>{bookmarks.length + highlights.length}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable onPress={() => setAiOpen(true)} style={styles.aiBtn} hitSlop={8}>
          <Ionicons name="sparkles" size={15} color="#fff" />
        </Pressable>

        <Pressable onPress={toggleViewMode} style={styles.modeToggle} hitSlop={8}>
          <Ionicons
            name={viewMode === "pdf" ? "text" : "document"}
            size={16}
            color={Palette.text}
          />
          <Text style={styles.modeToggleTxt}>{viewMode === "pdf" ? t("reader.viewToggle.text") : "PDF"}</Text>
        </Pressable>
      </View>
      )}

      {/* العارض: PDF أو نص بتظليل الجملة المقروءة */}
      <View style={[styles.viewer, fullText && styles.viewerFull]}>
        {viewMode === "text" ? (
          <ScrollView
            ref={scrollRef}
            style={styles.textScroll}
            contentContainerStyle={styles.textContent}
            onLayout={(e) => (textViewH.current = e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => (textContentH.current = h)}
            scrollEventThrottle={16}
          >
            {/* شريط الهايلايتر للدراسة */}
            <View style={styles.hlBar}>
              <Pressable
                onPress={() => setHighlightMode((m) => !m)}
                style={[styles.hlToggle, highlightMode && styles.hlToggleOn]}
              >
                <Ionicons name="brush" size={15} color={highlightMode ? "#0b1220" : Palette.text} />
                <Text style={[styles.hlToggleTxt, highlightMode && { color: "#0b1220" }]}>
                  {highlightMode ? t("reader.highlight.modeOn") : t("reader.highlight.modeOff")}
                </Text>
              </Pressable>
              <Pressable onPress={() => setNotesOpen(true)} style={styles.hlToggle}>
                <Ionicons name="bookmarks-outline" size={15} color={Palette.text} />
                <Text style={styles.hlToggleTxt}>{t("reader.highlight.myExcerpts")}</Text>
              </Pressable>
            </View>

            {sentences.length === 0 ? (
              <Text style={styles.emptyTextSmall}>
                {busy ? t("reader.text.loading") : t("reader.text.empty")}
              </Text>
            ) : (
              sentences.map((s, i) => {
                const hl = isHighlighted(s);
                const active = i === activeSentence;
                return (
                  <Pressable
                    key={i}
                    onPress={() => highlightMode && onSentenceLongPress(s)}
                    onLongPress={() => onSentenceLongPress(s)}
                    delayLongPress={300}
                    onLayout={(e) => {
                      offsetsRef.current[i] = e.nativeEvent.layout.y;
                    }}
                    style={active ? styles.sentenceRowActive : hl ? styles.sentenceRowHL : styles.sentenceRow}
                  >
                    <Text
                      selectable
                      selectionColor="rgba(124,92,255,0.45)"
                      style={active ? styles.sentenceActive : styles.sentence}
                    >
                      {/* فقط المقطع الجاري يُقسَّم كلمات للكاراوكي؛ الباقي نص عادي = أخفّ بكثير */}
                      {active
                        ? (() => {
                            let wc = -1;
                            return s.split(/(\s+)/).map((tok, wi) => {
                              if (!/\S/.test(tok)) return tok;
                              wc++;
                              const spoken = wc === activeWord;
                              return (
                                <Text
                                  key={wi}
                                  onPress={() => onWordPress(i, tok, s)}
                                  suppressHighlighting
                                  style={spoken ? styles.wordSpoken : undefined}
                                >
                                  {tok}
                                </Text>
                              );
                            });
                          })()
                        : s}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {pageImg ? (
              <ScrollView
                ref={pdfScrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={[styles.pdfImgWrap, fullText && styles.pdfImgWrapFull]}
                maximumZoomScale={6}
                minimumZoomScale={1}
                centerContent
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                alwaysBounceVertical
                onLayout={(e) => (pdfViewH.current = e.nativeEvent.layout.height)}
                onContentSizeChange={(_w, h) => (pdfContentH.current = h)}
                onScrollEndDrag={onPdfSwipeEnd}
              >
                <View onLayout={(e) => setPdfImgW2(e.nativeEvent.layout.width)}>
                  <Image
                    source={{ uri: pageImg }}
                    style={{ width: "100%", aspectRatio: pageImgAspect }}
                    resizeMode="contain"
                  />
                  {/* تظليل الكلمة المقروءة على صورة الصفحة */}
                  {lineBox && speaking && pdfImgW2 > 0 ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.wordHL,
                        {
                          left: lineBox.x * pdfImgW2,
                          top: lineBox.y * (pdfImgW2 / (pageImgAspect || 0.7)),
                          width: lineBox.w * pdfImgW2,
                          height: lineBox.h * (pdfImgW2 / (pageImgAspect || 0.7)),
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.empty}>
                {pageImgLoading ? (
                  <>
                    <ActivityIndicator color={Palette.primary} />
                    <Text style={styles.emptyTextSmall}>{t("reader.page.preparing")}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="document-outline" size={36} color={Palette.textDim} />
                    <Text style={styles.emptyTextSmall}>{t("reader.page.tapPlayOrNavigate")}</Text>
                  </>
                )}
              </View>
            )}
            {/* العدسة: شريط مكبّر عائم وسط الصفحة يتابع القراءة (الصفحة تبان فوقه وتحته) */}
            {lensOpen && pageImg ? (
              <View pointerEvents="box-none" style={styles.lensBandWrap}>
                <View
                  style={styles.lensBand}
                  onLayout={(e) => {
                    setLensW(e.nativeEvent.layout.width);
                    setLensH(e.nativeEvent.layout.height);
                  }}
                >
                  {lensW > 0 ? (
                    <Animated.View
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: lensW * lensScale,
                        height: (lensW / (pageImgAspect || 0.7)) * lensScale,
                        transform: [{ translateX: lensX }, { translateY: lensY }],
                      }}
                    >
                      <Image source={{ uri: pageImg }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                      {/* تظليل السطر (خفيف) */}
                      {lineBox && speaking ? (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.lensLineHL,
                            {
                              left: lineBox.x * lensW * lensScale,
                              top: lineBox.y * (lensW / (pageImgAspect || 0.7)) * lensScale,
                              width: lineBox.w * lensW * lensScale,
                              height: lineBox.h * (lensW / (pageImgAspect || 0.7)) * lensScale,
                            },
                          ]}
                        />
                      ) : null}
                      {/* تظليل الكلمة المقروءة — يتحرّك يمين→يسار عبر السطر الظاهر */}
                      {wordBox && speaking ? (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.wordHL,
                            {
                              left: wordBox.x * lensW * lensScale,
                              top: wordBox.y * (lensW / (pageImgAspect || 0.7)) * lensScale,
                              width: wordBox.w * lensW * lensScale,
                              height: wordBox.h * (lensW / (pageImgAspect || 0.7)) * lensScale,
                            },
                          ]}
                        />
                      ) : null}
                    </Animated.View>
                  ) : null}
                  <Pressable onPress={() => setLensOpen(false)} style={styles.lensCloseBtn} hitSlop={8}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* شريط علامة مثل Apple Books — اضغطيه لحفظ/إزالة الصفحة */}
            <Pressable onPress={onToggleBookmark} style={styles.ribbon} hitSlop={10}>
              <Ionicons
                name={isBookmarked ? "bookmark" : "bookmark-outline"}
                size={46}
                color={isBookmarked ? Palette.danger : "rgba(255,255,255,0.6)"}
              />
            </Pressable>
          </View>
        )}

        {/* شريط تحكّم عائم في وضع ملء الشاشة */}
        {fullText && (
          <View style={styles.floatBar}>
            <Pressable onPress={() => setFullText(false)} style={styles.floatBtn} hitSlop={8}>
              <Ionicons name="contract" size={20} color={Palette.text} />
            </Pressable>
            {viewMode === "pdf" && (
              <Pressable onPress={() => setLensOpen(true)} style={styles.floatBtn} hitSlop={8}>
                <Ionicons name="search" size={20} color={Palette.neonViolet} />
              </Pressable>
            )}
            <Pressable onPress={() => goPage(-1)} style={styles.floatBtn} hitSlop={8} disabled={page <= 1}>
              <Ionicons name="chevron-forward" size={22} color={page <= 1 ? Palette.textDim : Palette.text} />
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.floatPlay}>
              {busy ? (
                <ActivityIndicator color="#0b1220" />
              ) : (
                <Ionicons name={speaking ? "pause" : "play"} size={28} color="#0b1220" />
              )}
            </Pressable>
            <Pressable onPress={() => goPage(1)} style={styles.floatBtn} hitSlop={8} disabled={!!totalPages && page >= totalPages}>
              <Ionicons name="chevron-back" size={22} color={!!totalPages && page >= totalPages ? Palette.textDim : Palette.text} />
            </Pressable>
            <Pressable onPress={cycleSpeed} style={styles.floatBtn} hitSlop={8}>
              <Text style={styles.floatSpeed}>{rate}x</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* لوحة التحكم بالصوت */}
      {!fullText && (
      <View style={styles.player}>
        {/* زر واحد لاختيار الصوت */}
        <Pressable onPress={() => setVoiceModal(true)} style={styles.voicePickBtn}>
          <Ionicons name="chevron-down" size={16} color={Palette.textMuted} />
          <Text style={[styles.voicePickTxt, { textAlign: dir.textAlign }]} numberOfLines={1}>
            {t("reader.voice.label", { name: VOICE_CATALOG.find((v) => v.voiceId === voiceId)?.name ?? t("reader.voice.choose") })}
          </Text>
        </Pressable>

        {/* موسيقى خلفية هادئة (للقصص والروايات) — تستمر أثناء القراءة */}
        <Pressable
          onPress={() => setShowMusicPicker((v) => !v)}
          style={[styles.voicePickBtn, !!presMusicKey && { borderColor: Palette.neonCyan }]}
        >
          <Ionicons
            name={presMusicKey ? "musical-notes" : "musical-notes-outline"}
            size={16}
            color={presMusicKey ? Palette.neonCyan : Palette.textMuted}
          />
          <Text style={[styles.voicePickTxt, { textAlign: dir.textAlign }]} numberOfLines={1}>
            {presMusicKey
              ? t("reader.music.label", { name: MUSIC_OPTIONS.find((m) => m.key === presMusicKey)?.name ?? "" })
              : t("reader.music.background")}
          </Text>
        </Pressable>
        {showMusicPicker ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.musicRow}>
            <Pressable
              onPress={() => {
                setPresMusicKey(null);
                stopAmbient();
              }}
              style={[styles.musicChip, !presMusicKey && styles.musicChipOn]}
            >
              <Text style={[styles.musicChipTxt, !presMusicKey && styles.musicChipTxtOn]}>{t("reader.music.none")}</Text>
            </Pressable>
            {MUSIC_OPTIONS.map((m) => {
              const on = presMusicKey === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    setPresMusicKey(m.key);
                    startAmbient(m.key);
                  }}
                  style={[styles.musicChip, on && styles.musicChipOn]}
                >
                  <Text style={[styles.musicChipTxt, on && styles.musicChipTxtOn]}>🎵 {m.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* أدوات القراءة — أزرار متماثلة، يتغيّر لون الزر عند تفعيله */}
        <View style={styles.aidsRow}>
          <Pressable onPress={toggleTashkeel} style={styles.aidWrap}>
            <LinearGradient colors={tashkeelMode ? Gradients.success : Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aidGrad}>
              <Text style={styles.aidGradTxt} numberOfLines={1}>{tashkeelMode ? t("reader.aids.tashkeelOn") : t("reader.aids.tashkeelOff")}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => setTranslateModal(true)} style={styles.aidWrap}>
            <LinearGradient colors={listenArabic ? Gradients.success : Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aidGrad}>
              <Text style={styles.aidGradTxt} numberOfLines={1}>{listenArabic ? t("reader.aids.translateOn") : t("reader.aids.translateOff")}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => {
              presUsedRef.current = true;
              setPresentOpen(true);
            }}
            style={styles.aidWrap}
          >
            <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aidGrad}>
              <Text style={styles.aidGradTxt} numberOfLines={1}>{t("reader.aids.present")}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* التحكم: السابقة — تشغيل — التالية (يمين ← يسار) */}
        <View style={styles.controls}>
          <Pressable onPress={() => goPage(-1)} style={styles.navBtn} disabled={page <= 1} hitSlop={6}>
            <Ionicons name="chevron-forward" size={20} color={page <= 1 ? Palette.textDim : Palette.text} />
            <Text style={[styles.navTxt, page <= 1 && { color: Palette.textDim }]}>{t("reader.nav.prevPage")}</Text>
          </Pressable>

          <Pressable onPress={togglePlay} style={styles.playBtn}>
            {busy ? (
              <ActivityIndicator color="#0b1220" />
            ) : (
              <Ionicons name={speaking ? "pause" : "play"} size={28} color="#0b1220" />
            )}
          </Pressable>

          <Pressable
            onPress={() => goPage(1)}
            style={styles.navBtn}
            disabled={!!totalPages && page >= totalPages}
            hitSlop={6}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={!!totalPages && page >= totalPages ? Palette.textDim : Palette.text}
            />
            <Text style={[styles.navTxt, !!totalPages && page >= totalPages && { color: Palette.textDim }]}>
              {t("reader.nav.nextPage")}
            </Text>
          </Pressable>
        </View>

        {/* أدوات مدمجة (أيقونة + كلمة توضيحية) */}
        <View style={styles.toolsRow}>
          <View style={styles.tool}>
            <Pressable onPress={() => skipSentence(-1)} style={styles.toolBtn} hitSlop={4}>
              <Ionicons name="play-skip-forward" size={17} color={Palette.text} />
              {skipMult > 1 && skipDir < 0 ? (
                <View style={styles.skipBadge}>
                  <Text style={styles.skipBadgeTxt}>×{skipMult}</Text>
                </View>
              ) : null}
            </Pressable>
            <Text style={styles.toolCap}>{t("reader.tool.prevSegment")}</Text>
          </View>
          <View style={styles.tool}>
            <Pressable onPress={() => skipSentence(1)} style={styles.toolBtn} hitSlop={4}>
              <Ionicons name="play-skip-back" size={17} color={Palette.text} />
              {skipMult > 1 && skipDir > 0 ? (
                <View style={styles.skipBadge}>
                  <Text style={styles.skipBadgeTxt}>×{skipMult}</Text>
                </View>
              ) : null}
            </Pressable>
            <Text style={styles.toolCap}>{t("reader.tool.nextSegment")}</Text>
          </View>
          <View style={styles.tool}>
            <Pressable onPress={cycleSpeed} style={styles.toolBtn} hitSlop={4}>
              <Text style={styles.toolTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{rate}x</Text>
            </Pressable>
            <Text style={styles.toolCap}>{t("reader.tool.speed")}</Text>
          </View>
          <View style={styles.tool}>
            <Pressable
              onPress={cycleSleep}
              style={[styles.toolBtn, sleepMin > 0 && styles.toolBtnActive]}
              hitSlop={4}
            >
              <Ionicons name="moon-outline" size={17} color={sleepMin > 0 ? "#fff" : Palette.text} />
            </Pressable>
            <Text style={styles.toolCap}>{sleepMin > 0 ? t("reader.tool.sleepMinutes", { minutes: sleepMin }) : t("reader.tool.sleep")}</Text>
          </View>
          <View style={styles.tool}>
            <Pressable
              onPress={() => {
                setGotoValue(String(page));
                setGotoOpen(true);
              }}
              style={styles.toolBtn}
              hitSlop={4}
            >
              <Ionicons name="keypad-outline" size={17} color={Palette.text} />
            </Pressable>
            <Text style={styles.toolCap}>{t("reader.tool.goto")}</Text>
          </View>
          <View style={styles.tool}>
            <Pressable
              onPress={startIngest}
              style={styles.toolBtn}
              disabled={fullyLoaded && !ingesting}
              hitSlop={4}
            >
              <Ionicons
                name={
                  fullyLoaded && !ingesting
                    ? "checkmark-circle"
                    : ingesting
                    ? "stop-circle"
                    : "cloud-download-outline"
                }
                size={18}
                color={fullyLoaded && !ingesting ? Palette.success : Palette.text}
              />
            </Pressable>
            <Text style={styles.toolCap}>{fullyLoaded ? t("reader.tool.loaded") : t("reader.tool.download")}</Text>
          </View>
        </View>

        {/* سطر الحالة: الصفحة (قابل للانتقال) + تقدّم التحميل */}
        <Pressable
          onPress={() => {
            setGotoValue(String(page));
            setGotoOpen(true);
          }}
          hitSlop={6}
        >
          <Text style={styles.pageInfo}>
            {t("reader.pageInfo.page", { page })}
            {totalPages ? ` / ${totalPages}` : ""}
            {ingesting ? t("reader.pageInfo.loading", { done: ingestDone, total: ingestTotal }) : ""}
          </Text>
        </Pressable>
        {ingesting && ingestTotal > 0 ? (
          <View style={styles.ingestBarBg}>
            <View
              style={[styles.ingestBarFill, { width: `${Math.round((ingestDone / ingestTotal) * 100)}%` }]}
            />
          </View>
        ) : null}
        {voiceWarn ? (
          <Text style={styles.warnTxt}>{t("reader.voice.humanFailed", { reason: voiceWarn })}</Text>
        ) : null}
      </View>
      )}

      {/* رسالة تأكيد عابرة */}
      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      ) : null}

      {/* مودال الملاحظات والعلامات */}
      <Modal visible={notesOpen} transparent animationType="slide" onRequestClose={() => setNotesOpen(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>{t("reader.notes.title")}</Text>
              <Pressable onPress={() => setNotesOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {bookmarks.length === 0 && highlights.length === 0 ? (
                <Text style={[styles.notesHint, { textAlign: dir.textAlign }]}>
                  {t("reader.notes.empty")}
                </Text>
              ) : null}

              {bookmarks.length > 0 ? (
                <>
                  <Text style={[styles.notesSection, { textAlign: dir.textAlign }]}>{t("reader.notes.savedPages")}</Text>
                  <View style={{ flexDirection: dir.row, flexWrap: "wrap", gap: 8 }}>
                    {bookmarks.map((p) => (
                      <Pressable key={p} onPress={() => jumpTo(p)} style={styles.bmChip}>
                        <Ionicons name="bookmark" size={13} color={Palette.warn} />
                        <Text style={styles.bmChipTxt}>{t("reader.notes.pageChip", { page: p })}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {highlights.length > 0 ? (
                <>
                  <Pressable
                    onPress={makeCardsFromHighlights}
                    disabled={makingCards}
                    style={styles.makeCardsBtn}
                  >
                    {makingCards ? (
                      <ActivityIndicator size="small" color="#0b1220" />
                    ) : (
                      <Ionicons name="albums" size={16} color="#0b1220" />
                    )}
                    <Text style={styles.makeCardsTxt}>
                      {makingCards ? t("reader.notes.generating") : t("reader.notes.makeCards")}
                    </Text>
                  </Pressable>
                  <Text style={[styles.notesSection, { textAlign: dir.textAlign }]}>{t("reader.notes.highlightsSection")}</Text>
                </>
              ) : null}
              {highlights.map((h) => (
                <View key={h.id} style={styles.hlCard}>
                  <Pressable onPress={() => jumpTo(h.page)}>
                    <Text style={[styles.hlPage, { textAlign: dir.textAlign }]}>{t("reader.notes.pageLabel", { page: h.page })}</Text>
                    <Text style={[styles.hlText, { textAlign: dir.textAlign }]} numberOfLines={3}>{h.text}</Text>
                  </Pressable>

                  {noteDraft?.id === h.id ? (
                    <View style={{ flexDirection: dir.row, gap: 8, marginTop: 8 }}>
                      <TextInput
                        value={noteDraft.text}
                        onChangeText={(txt) => setNoteDraft({ id: h.id, text: txt })}
                        placeholder={t("reader.notes.notePlaceholder")}
                        placeholderTextColor={Palette.placeholder}
                        style={[styles.noteInput, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                        autoFocus
                      />
                      <Pressable onPress={saveNoteDraft} style={styles.noteSave}>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </Pressable>
                    </View>
                  ) : h.note ? (
                    <Pressable onPress={() => setNoteDraft({ id: h.id, text: h.note ?? "" })}>
                      <Text style={styles.hlNote}>📝 {h.note}</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.hlActions}>
                    <Pressable onPress={() => setNoteDraft({ id: h.id, text: h.note ?? "" })} hitSlop={6}>
                      <Text style={styles.hlAction}>{h.note ? t("reader.notes.editNote") : t("reader.notes.addNote")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert(t("common.delete"), t("reader.notes.deleteHighlightConfirm"), [
                          { text: t("common.cancel"), style: "cancel" },
                          { text: t("common.delete"), style: "destructive", onPress: () => deleteHighlight(h.id) },
                        ])
                      }
                      hitSlop={6}
                    >
                      <Text style={[styles.hlAction, { color: Palette.danger }]}>{t("common.delete")}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* مودال الذكاء الاصطناعي */}
      <Modal visible={aiOpen} transparent animationType="slide" onRequestClose={() => setAiOpen(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>{t("reader.ai.title", { page })}</Text>
              <Pressable onPress={() => setAiOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <View style={styles.aiActions}>
              <Pressable style={styles.aiAction} onPress={() => runAi("summarize")} disabled={aiBusy}>
                <Ionicons name="list" size={18} color={Palette.neonCyan} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.summarize")}</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={() => runAi("quiz")} disabled={aiBusy}>
                <Ionicons name="help-circle" size={18} color={Palette.neonViolet} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.quiz")}</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={makeFlashcards} disabled={aiBusy}>
                <Ionicons name="albums" size={18} color={Palette.neonPink} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.cards")}</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={() => runAi("translate")} disabled={aiBusy}>
                <Ionicons name="language" size={18} color={Palette.neonBlue} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.translate")}</Text>
              </Pressable>
            </View>

            <View style={styles.aiAskRow}>
              <TextInput
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder={t("reader.ai.askPlaceholder")}
                placeholderTextColor={Palette.placeholder}
                style={[styles.aiInput, { textAlign: dir.textAlign, writingDirection: dir.writingDirection }]}
                editable={!aiBusy}
              />
              <Pressable style={styles.aiSend} onPress={() => runAi("ask")} disabled={aiBusy || !aiQuestion.trim()}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>

            <ScrollView style={styles.aiResultBox} contentContainerStyle={{ padding: 14 }}>
              {aiBusy ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <ActivityIndicator color={Palette.primary} />
                  <Text style={styles.aiHint}>{t("reader.ai.thinking")}</Text>
                </View>
              ) : aiResult ? (
                <Text style={[styles.aiResultTxt, { textAlign: dir.textAlign }]}>{aiResult}</Text>
              ) : (
                <Text style={styles.aiHint}>
                  {t("reader.ai.placeholder")}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* وضع القيادة: واجهة كبيرة مبسّطة للقراءة بدون نظر */}
      <Modal visible={drivingMode} animationType="slide" onRequestClose={() => setDrivingMode(false)}>
        <View style={styles.driveWrap}>
          {/* شريط علوي: خروج واضح */}
          <View style={styles.driveTop}>
            <Pressable onPress={() => setDrivingMode(false)} style={styles.driveExit} hitSlop={8}>
              <Ionicons name="chevron-down" size={18} color={Palette.text} />
              <Text style={styles.driveExitTxt}>{t("reader.drive.exit")}</Text>
            </Pressable>
          </View>

          <View style={styles.driveTextWrap}>
            <GlassCard glow={Palette.neonViolet} radius={Radius.xl} style={{ width: "100%" }} contentStyle={styles.driveCardInner}>
              {activeSentence >= 0 && sentences[activeSentence] ? (
                <Text style={styles.driveSentence}>{sentences[activeSentence]}</Text>
              ) : (
                <Text style={styles.driveHint}>{t("reader.drive.tapPlay")}</Text>
              )}
            </GlassCard>
          </View>

          <Text style={styles.drivePage}>
            {t("reader.pageInfo.page", { page })}
            {totalPages ? t("reader.pageInfo.ofTotal", { total: totalPages }) : ""}
          </Text>

          <View style={styles.driveControls}>
            <Pressable onPress={() => goPage(-1)} style={styles.driveNav} disabled={page <= 1}>
              <Ionicons name="play-forward" size={36} color={page <= 1 ? Palette.textDim : Palette.text} />
            </Pressable>

            <Pressable onPress={togglePlay} style={styles.drivePlay}>
              {busy ? (
                <ActivityIndicator size="large" color="#0b1220" />
              ) : (
                <Ionicons name={speaking ? "pause" : "play"} size={64} color="#0b1220" />
              )}
            </Pressable>

            <Pressable
              onPress={() => goPage(1)}
              style={styles.driveNav}
              disabled={!!totalPages && page >= totalPages}
            >
              <Ionicons name="play-back" size={36} color={!!totalPages && page >= totalPages ? Palette.textDim : Palette.text} />
            </Pressable>
          </View>

          <Pressable onPress={cycleSpeed} style={styles.driveSpeed}>
            <Text style={styles.driveSpeedTxt}>{t("reader.drive.speed", { rate })}</Text>
          </Pressable>
        </View>
      </Modal>

      {/* الانتقال لصفحة محددة */}
      <Modal visible={gotoOpen} transparent animationType="fade" onRequestClose={() => setGotoOpen(false)}>
        <Pressable style={styles.gotoMask} onPress={() => setGotoOpen(false)}>
          <Pressable style={styles.gotoCard} onPress={() => {}}>
            <View style={styles.dictHead}>
              <Text style={[styles.dictWord, { textAlign: dir.textAlign }]}>{t("reader.goto.title")}</Text>
              <Pressable onPress={() => setGotoOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.dictHint, { textAlign: dir.textAlign }]}>{t("reader.goto.hint", { total: totalPages || "؟" })}</Text>
            <TextInput
              value={gotoValue}
              onChangeText={(txt) => setGotoValue(txt.replace(/[^0-9٠-٩]/g, ""))}
              keyboardType="number-pad"
              placeholder={`${page}`}
              placeholderTextColor={Palette.placeholder}
              style={styles.gotoInput}
              textAlign="center"
              autoFocus
              onSubmitEditing={() => {
                const n = toPageNum(gotoValue);
                if (n > 0) gotoPage(n);
              }}
            />
            <Pressable
              onPress={() => {
                const n = toPageNum(gotoValue);
                if (n > 0) gotoPage(n);
              }}
              style={styles.gotoBtn}
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
              <Text style={styles.gotoBtnTxt}>{t("reader.goto.cta")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* قاموس: معنى الكلمة الملموسة */}
      <Modal visible={dictOpen} transparent animationType="fade" onRequestClose={() => setDictOpen(false)}>
        <Pressable style={styles.dictMask} onPress={() => setDictOpen(false)}>
          <Pressable style={styles.dictCard} onPress={() => {}}>
            <View style={styles.dictHead}>
              <Text style={styles.dictWord}>{dictWord}</Text>
              <Pressable onPress={() => setDictOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={Palette.textMuted} />
              </Pressable>
            </View>
            {dictLoading ? (
              <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={Palette.primary} />
                <Text style={[styles.dictHint, { textAlign: dir.textAlign }]}>{t("reader.dict.loading")}</Text>
              </View>
            ) : (
              <Text style={[styles.dictMeaning, { textAlign: dir.textAlign }]}>{dictMeaning}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* قائمة اختيار الصوت — منظّمة حسب اللغة */}
      <Modal visible={voiceModal} transparent animationType="slide" onRequestClose={() => setVoiceModal(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>{t("reader.voice.chooseTitle")}</Text>
              <Pressable onPress={() => setVoiceModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            {/* تبويبات اللغة */}
            <View style={styles.langRow}>
              {([
                { k: "ar", label: t("reader.voice.tabArabic") },
                { k: "en", label: "English" },
                { k: "fr", label: "Français" },
              ] as const).map((l) => {
                const on = voiceLang === l.k;
                return (
                  <Pressable key={l.k} onPress={() => setVoiceLang(l.k)} style={[styles.langChip, on && styles.langChipOn]}>
                    <Text style={[styles.langChipTxt, on && styles.langChipTxtOn]}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
              {VOICE_CATALOG.filter((v) => (v.lang ?? "ar") === voiceLang).map((v) => {
                const active = v.voiceId === voiceId;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => {
                      setVoiceId(v.voiceId);
                      setVoiceModal(false);
                    }}
                    style={[styles.voiceRowItem, active && styles.voiceRowItemOn]}
                  >
                    <Text style={[styles.voiceRowTxt, active && { color: Palette.neonCyan }]}>{v.name}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={Palette.neonCyan} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* لوحة الترجمة: تفعيل + اختيار الصوت العربي في مكان واحد */}
      <Modal visible={translateModal} transparent animationType="slide" onRequestClose={() => setTranslateModal(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>{t("reader.translate.title")}</Text>
              <Pressable onPress={() => setTranslateModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.notesHint, { textAlign: dir.textAlign }]}>
              {t("reader.translate.desc")}
            </Text>

            <Text style={[styles.trVoicesLabel, { textAlign: dir.textAlign }]}>{t("reader.translate.chooseVoice")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceRow}>
              {VOICE_CATALOG.filter((v) => !v.lang || v.lang === "ar").map((v) => {
                const sel = v.voiceId === translateVoiceId;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => {
                      setTranslateVoiceId(v.voiceId);
                      translateVoiceIdRef.current = v.voiceId;
                    }}
                    style={[styles.voiceChip, sel && styles.voiceChipActive]}
                  >
                    <Text style={[styles.voiceChipTxt, sel && styles.voiceChipTxtActive]}>{v.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => applyTranslate(!listenArabic, translateVoiceId)}
              style={styles.trApplyWrap}
            >
              <LinearGradient
                colors={listenArabic ? ["#ff5d6c", "#ff8a5c"] : Gradients.success}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.trApply}
              >
                <Text style={styles.trApplyTxt}>
                  {listenArabic ? t("reader.translate.stop") : t("reader.translate.enable")}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* عرض البريزنتيشن أثناء القراءة */}
      <Modal
        visible={presentOpen}
        animationType="slide"
        onRequestClose={() => {
          presNarratingRef.current = false;
          setPresNarrating(false);
          stopSpeaking();
          setPresentOpen(false);
        }}
      >
        <View style={styles.presWrap}>
          {/* شريط علوي */}
          <View style={styles.presTop}>
            <Pressable
              onPress={() => {
                presNarratingRef.current = false;
          setPresNarrating(false);
          stopSpeaking();
          setPresentOpen(false);
              }}
              style={styles.presExit}
              hitSlop={8}
            >
              <Ionicons name="chevron-down" size={18} color={Palette.text} />
              <Text style={styles.presExitTxt}>{t("reader.present.exit")}</Text>
            </Pressable>
            <Text style={styles.presPage}>{t("reader.notes.pageChip", { page })}</Text>
            {/* زر الموسيقى — يفتح اختيارات هادئة (للروايات/القصص) */}
            <Pressable
              onPress={() => setShowMusicPicker((v) => !v)}
              style={[styles.presMusicBtn, !!presMusicKey && styles.presMusicBtnOn]}
              hitSlop={8}
            >
              <Ionicons
                name={presMusicKey ? "musical-notes" : "musical-notes-outline"}
                size={18}
                color={presMusicKey ? "#0b1220" : Palette.text}
              />
            </Pressable>
          </View>

          {/* اختيارات الموسيقى الهادئة */}
          {showMusicPicker ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.musicRow}
            >
              <Pressable
                onPress={() => {
                  setPresMusicKey(null);
                  stopAmbient();
                }}
                style={[styles.musicChip, !presMusicKey && styles.musicChipOn]}
              >
                <Text style={[styles.musicChipTxt, !presMusicKey && styles.musicChipTxtOn]}>{t("reader.music.none")}</Text>
              </Pressable>
              {MUSIC_OPTIONS.map((m) => {
                const on = presMusicKey === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => {
                      setPresMusicKey(m.key);
                      startAmbient(m.key); // معاينة فورية + تشغيل
                    }}
                    style={[styles.musicChip, on && styles.musicChipOn]}
                  >
                    <Text style={[styles.musicChipTxt, on && styles.musicChipTxtOn]}>🎵 {m.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* الشريحة */}
          <View style={styles.presStage}>
            {slidesLoading ? (
              <View style={styles.presCenter}>
                <ActivityIndicator color={Palette.neonCyan} />
                <Text style={styles.presHint}>{t("reader.present.preparingSlides")}</Text>
              </View>
            ) : pageSlides.length === 0 ? (
              <View style={styles.presCenter}>
                <Ionicons name="easel-outline" size={48} color={Palette.textDim} />
                <Text style={styles.presHint}>
                  {t("reader.present.emptySlides")}
                </Text>
              </View>
            ) : (
              (() => {
                const s = pageSlides[slideIdx];
                const c = MM_PRES_COLORS[slideIdx % MM_PRES_COLORS.length];
                return (
                  <View style={[styles.slideCard, { borderColor: c + "66", shadowColor: c }]}>
                    <LinearGradient
                      colors={[c + "26", "transparent"]}
                      start={{ x: 1, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.slideBadge, { backgroundColor: c + "22", borderColor: c + "66" }]}>
                      <Text style={styles.slideEmoji}>{s.emoji}</Text>
                    </View>
                    <Text style={[styles.slideTitle, { color: c }]}>{s.title}</Text>
                    <View style={[styles.slideDivider, { backgroundColor: c }]} />
                    <ScrollView style={styles.slideBulletsScroll} contentContainerStyle={styles.slideBullets}>
                      {s.bullets.map((b, bi) => (
                        <View key={bi} style={styles.slideBulletRow}>
                          <View style={[styles.slideDot, { backgroundColor: c }]} />
                          <Text style={styles.slideBulletTxt}>{b}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              })()
            )}
          </View>

          {/* تنقّل يدوي بين الشرائح: أسهم + نقاط قابلة للضغط */}
          {pageSlides.length > 0 ? (
            <View style={styles.presNav}>
              {/* اليمين = السابق (سهم لليمين) */}
              <Pressable onPress={() => goSlide(-1)} style={styles.presArrow} hitSlop={8} disabled={slideIdx <= 0}>
                <Ionicons name="chevron-forward" size={26} color={slideIdx <= 0 ? Palette.textDim : Palette.text} />
              </Pressable>
              <View style={styles.presDots}>
                {pageSlides.map((_, di) => (
                  <Pressable key={di} onPress={() => jumpSlide(di)} hitSlop={6}>
                    <View style={[styles.presDot, di === slideIdx && styles.presDotOn]} />
                  </Pressable>
                ))}
              </View>
              {/* اليسار = التالي (سهم لليسار) */}
              <Pressable onPress={() => goSlide(1)} style={styles.presArrow} hitSlop={8} disabled={slideIdx >= pageSlides.length - 1}>
                <Ionicons name="chevron-back" size={26} color={slideIdx >= pageSlides.length - 1 ? Palette.textDim : Palette.text} />
              </Pressable>
            </View>
          ) : null}

          <Pressable onPress={togglePresentNarrate} style={styles.presPlay}>
            {busy && presNarrating ? (
              <ActivityIndicator color="#0b1220" />
            ) : (
              <Ionicons name={presNarrating ? "pause" : "play"} size={30} color="#0b1220" />
            )}
          </Pressable>
          {pageSlides.length > 0 ? (
            <Text style={styles.presNarrateHint}>
              {presNarrating ? t("reader.present.narrating") : t("reader.present.narrateHint")}
            </Text>
          ) : null}
        </View>
      </Modal>

      {/* بوّابة التحميل: بعد صفحتين مجانيتين */}
      <Modal visible={downloadGate} transparent animationType="fade" onRequestClose={() => setDownloadGate(false)}>
        <View style={styles.gateMask}>
          <View style={styles.gateCard}>
            <View style={styles.gateIcon}>
              <Ionicons name="cloud-download" size={34} color={Palette.neonCyan} />
            </View>
            <Text style={styles.gateTitle}>{t("reader.gate.title")}</Text>
            <Text style={styles.gateBody}>
              {t("reader.gate.body")}
            </Text>
            <Pressable onPress={gateDownloadNow} style={styles.gatePrimary}>
              <Ionicons name="cloud-download" size={18} color="#0b1220" />
              <Text style={styles.gatePrimaryTxt}>{t("reader.gate.downloadNow")}</Text>
            </Pressable>
            <Pressable onPress={gateContinueWithout} style={styles.gateSecondary} hitSlop={6}>
              <Text style={styles.gateSecondaryTxt}>{t("reader.gate.continueWithout")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const MM_PRES_COLORS = ["#7c5cff", "#22d3ee", "#2ecc71", "#f5a623", "#ff6b9d", "#4f8cff"];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Palette.bg },
  header: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
  },
  hTitle: { flex: 1, color: Palette.text, fontSize: 16, fontWeight: "900", textAlign: "right" },

  modeToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  modeToggleTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },

  aiBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.accent,
  },
  aiBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
  },
  countDot: {
    position: "absolute",
    top: -4,
    left: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countDotTxt: { color: "#fff", fontSize: 10, fontWeight: "900" },

  notesHint: { color: Palette.textDim, fontSize: 13, lineHeight: 20, textAlign: "right" },
  notesSection: { color: Palette.textMuted, fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 4 },
  makeCardsBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Palette.neonCyan,
  },
  makeCardsTxt: { color: "#0b1220", fontSize: 14, fontWeight: "900" },
  bmChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  bmChipTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },
  hlCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    borderRadius: Radius.md,
    padding: 12,
  },
  hlPage: { color: Palette.warn, fontSize: 12, fontWeight: "800", textAlign: "right" },
  hlText: { color: Palette.textMuted, fontSize: 14, lineHeight: 22, textAlign: "right", marginTop: 4 },
  hlNote: { color: Palette.neonCyan, fontSize: 13, textAlign: "right", marginTop: 8 },
  hlActions: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 8 },
  hlAction: { color: Palette.primary, fontSize: 13, fontWeight: "800" },
  noteInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    color: Palette.text,
  },
  noteSave: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.primary,
  },

  aiMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  aiSheet: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.lg,
    gap: 12,
    maxHeight: "80%",
  },
  aiHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  aiTitle: { color: Palette.text, fontSize: 16, fontWeight: "900" },
  aiActions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  aiAction: {
    width: "47.5%",
    flexGrow: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  aiActionTxt: { color: Palette.text, fontWeight: "800", fontSize: 14 },
  aiAskRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  aiInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    color: Palette.text,
  },
  aiSend: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.primary,
  },
  aiResultBox: {
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    minHeight: 120,
  },
  aiResultTxt: { color: Palette.textMuted, fontSize: 15, lineHeight: 26, textAlign: "right" },
  aiHint: { color: Palette.textDim, fontSize: 13, textAlign: "center", marginTop: 8 },

  // العدسة = شريط مكبّر عائم وسط الصفحة (الصفحة تبان فوقه وتحته)
  lensBandWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "stretch",
  },
  lensBand: {
    height: "42%",
    marginHorizontal: 8,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: Palette.neonCyan,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  lensCloseBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  lensLineHL: {
    position: "absolute",
    borderRadius: 4,
    backgroundColor: "rgba(124,92,255,0.14)", // تظليل السطر خفيف
  },
  pdfImgWrap: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", backgroundColor: "#1a1f2e" },
  pdfImgWrapFull: { paddingBottom: 96 }, // مساحة للأزرار العائمة بالأسفل
  textScroll: { flex: 1, backgroundColor: Palette.bgElevated },
  hlBar: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  hlToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  hlToggleOn: { backgroundColor: Palette.warn, borderColor: Palette.warn },
  hlToggleTxt: { color: Palette.text, fontSize: 12, fontWeight: "800" },
  textContent: { paddingHorizontal: 22, paddingVertical: 22, gap: 4 },
  // ثبات التخطيط: نفس الحشو والحدود دائمًا (لون الحد فقط يتغيّر) فلا تتزحزح المواضع
  sentenceRow: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderRightWidth: 4,
    borderRightColor: "transparent",
  },
  sentenceRowHL: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderRightWidth: 4,
    borderRightColor: "transparent",
    backgroundColor: "rgba(241,196,15,0.14)",
  },
  sentenceRowActive: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.primarySoft,
    borderRightWidth: 4,
    borderRightColor: Palette.neonCyan,
  },
  sentence: { color: Palette.textDim, fontSize: 21, lineHeight: 40, textAlign: "right" },
  sentenceActive: { color: Palette.text, fontSize: 22, lineHeight: 42, textAlign: "right", fontWeight: "700" },
  wordSpoken: { color: "#0b1220", backgroundColor: Palette.neonCyan, fontWeight: "900" },

  ingestBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8 },
  ingestTxt: { color: Palette.neonCyan, fontSize: 12, fontWeight: "800" },
  ingestBarBg: { height: 6, borderRadius: 3, backgroundColor: Palette.surfaceStrong, overflow: "hidden" },
  ingestBarFill: { height: 6, borderRadius: 3, backgroundColor: Palette.neonCyan },

  dictMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  dictCard: {
    backgroundColor: Palette.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.lg,
    gap: 12,
  },
  dictHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  dictWord: { color: Palette.primary, fontSize: 22, fontWeight: "900", textAlign: "right" },
  dictHint: { color: Palette.textDim, fontSize: 14 },
  dictMeaning: { color: Palette.text, fontSize: 17, lineHeight: 28, textAlign: "right" },

  gotoMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 28, paddingBottom: 220 },
  gotoCard: {
    backgroundColor: Palette.bgElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: Spacing.lg,
    gap: 14,
  },
  gotoInput: {
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    color: Palette.text,
    fontSize: 22,
    fontWeight: "900",
  },
  gotoBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Palette.primary,
  },
  gotoBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },

  driveWrap: { flex: 1, backgroundColor: Palette.bg, paddingHorizontal: Spacing.xl, paddingTop: 56, paddingBottom: Spacing.xl, alignItems: "center" },
  driveTop: { width: "100%", alignItems: "center", marginBottom: 8 },
  driveExit: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  driveExitTxt: { color: Palette.text, fontSize: 14, fontWeight: "800" },
  driveTextWrap: { flex: 1, justifyContent: "center", alignItems: "center", width: "100%" },
  driveCardInner: { paddingVertical: 26, paddingHorizontal: 22 },
  driveSentence: { color: Palette.textMuted, fontSize: 20, lineHeight: 38, textAlign: "center", fontWeight: "700" },
  driveWordSpoken: { color: Palette.neonCyan, fontWeight: "900" },
  driveHint: { color: Palette.textDim, fontSize: 17, textAlign: "center", fontWeight: "700" },
  drivePage: { color: Palette.textDim, fontSize: 15, fontWeight: "800", marginTop: 18, marginBottom: 18 },
  driveControls: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 36, marginBottom: 24 },
  driveNav: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: Palette.surface },
  drivePlay: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", backgroundColor: Palette.success },
  driveSpeed: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: Radius.pill, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  driveSpeedTxt: { color: Palette.text, fontSize: 18, fontWeight: "800" },

  viewerFull: { marginHorizontal: 0, marginTop: 0, borderRadius: 0, borderWidth: 0 },
  floatBar: {
    position: "absolute",
    bottom: 26,
    alignSelf: "center",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  floatBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: Palette.surface },
  floatBtnOn: { backgroundColor: Palette.neonCyan },
  wordHL: {
    position: "absolute",
    zIndex: 5,
    borderRadius: 4,
    backgroundColor: "rgba(245,200,66,0.38)", // هايلايتر أصفر شفّاف على الكلمة
    borderWidth: 1,
    borderColor: "rgba(245,200,66,0.75)",
  },
  lensTag: {
    position: "absolute",
    top: 6,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.neonCyan,
    alignItems: "center",
    justifyContent: "center",
  },
  floatPlay: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: Palette.success },
  floatSpeed: { color: Palette.text, fontSize: 15, fontWeight: "900" },

  toast: {
    position: "absolute",
    top: 70,
    alignSelf: "center",
    maxWidth: "88%",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: Palette.primary,
  },
  toastTxt: { color: "#fff", fontSize: 14, fontWeight: "800", textAlign: "center" },

  ribbon: {
    position: "absolute",
    top: -4,
    right: 18,
    width: 46,
    alignItems: "center",
    justifyContent: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },

  viewer: {
    flex: 1,
    marginHorizontal: 10,
    marginTop: 6,
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: Palette.border,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, gap: 8 },
  emptyText: { color: Palette.textDim, fontWeight: "800" },
  emptyTextSmall: {
    color: "rgba(159,179,200,0.85)",
    textAlign: "center",
    lineHeight: 18,
    fontSize: 12,
  },

  player: {
    marginHorizontal: 10,
    marginVertical: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.xl,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.border,
    gap: 7,
  },
  voicePickBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  voicePickTxt: { flex: 1, color: Palette.text, fontSize: 14, fontWeight: "800", textAlign: "right", marginStart: 8 },
  voiceRowItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  voiceRowItemOn: { borderColor: Palette.neonCyan },
  voiceRowTxt: { color: Palette.text, fontSize: 15, fontWeight: "800" },
  langRow: { flexDirection: "row-reverse", gap: 8 },
  langChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  langChipOn: { backgroundColor: Palette.neonBlue, borderColor: Palette.neonBlue },
  langChipTxt: { color: Palette.textMuted, fontSize: 12.5, fontWeight: "800" },
  langChipTxtOn: { color: "#fff" },
  voiceRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 2 },
  arToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(79,140,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(79,140,255,0.4)",
  },
  arToggleOn: { backgroundColor: Palette.neonBlue, borderColor: Palette.neonBlue },
  arToggleTxt: { color: Palette.neonBlue, fontSize: 12.5, fontWeight: "800" },
  modeSeg: {
    flexDirection: "row-reverse",
    gap: 6,
    marginTop: 10,
    backgroundColor: Palette.surface,
    borderRadius: 14,
    padding: 5,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  modeSegBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeSegBtnOn: { backgroundColor: Palette.neonCyan },
  modeSegTxt: { color: Palette.text, fontSize: 13.5, fontWeight: "900" },
  modeSegTxtOn: { color: "#0b1220" },
  aidsRow: { flexDirection: "row-reverse", gap: 8, marginTop: 8 },
  aidWrap: {
    flex: 1,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  aidGrad: { paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  aidGradTxt: { color: "#fff", fontSize: 12.5, fontWeight: "900" },
  trVoicesLabel: { color: Palette.textMuted, fontSize: 13, fontWeight: "800", textAlign: "right", marginTop: 12, marginBottom: 8 },
  trApplyWrap: { borderRadius: Radius.lg, overflow: "hidden", marginTop: 16 },
  trApply: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  trApplyTxt: { color: "#0b1220", fontSize: 15, fontWeight: "900" },

  presWrap: { flex: 1, backgroundColor: Palette.bg, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 24 },
  presTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  presExit: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  presExitTxt: { color: Palette.text, fontSize: 13, fontWeight: "800" },
  presPage: { color: Palette.textDim, fontSize: 13, fontWeight: "800" },
  presMusicBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  presMusicBtnOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  musicRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 4, paddingVertical: 10 },
  musicChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  musicChipOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  musicChipTxt: { color: Palette.text, fontSize: 13, fontWeight: "800" },
  musicChipTxtOn: { color: "#0b1220" },
  slideBulletsScroll: { alignSelf: "stretch", maxHeight: 320, flexGrow: 0 },
  presStage: { flex: 1, justifyContent: "center" },
  presCenter: { alignItems: "center", gap: 12 },
  presHint: { color: Palette.textDim, fontSize: 14, textAlign: "center", lineHeight: 22, paddingHorizontal: 24 },
  slideCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: Palette.bgElevated,
    padding: 26,
    overflow: "hidden",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    minHeight: 320,
    justifyContent: "center",
  },
  slideBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  slideEmoji: { fontSize: 46, textAlign: "center" },
  slideTitle: { fontSize: 24, fontWeight: "900", textAlign: "center", lineHeight: 36, marginBottom: 12 },
  slideDivider: { width: 54, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  slideBullets: { gap: 10 },
  slideBulletRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  slideDot: { width: 9, height: 9, borderRadius: 5, marginTop: 9 },
  slideBulletTxt: { flex: 1, color: Palette.text, fontSize: 16.5, lineHeight: 27, fontWeight: "600", textAlign: "right" },
  presNav: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 14, marginVertical: 14 },
  presArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  presDots: { flexDirection: "row-reverse", justifyContent: "center", gap: 7 },
  presDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.surfaceStrong ?? "rgba(255,255,255,0.18)" },
  presDotOn: { backgroundColor: Palette.neonCyan, width: 22 },
  presPlay: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.neonCyan,
    alignItems: "center",
    justifyContent: "center",
  },
  presNarrateHint: {
    color: Palette.textDim,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  voiceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  voiceChipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  voiceChipTxt: { color: Palette.textDim, fontWeight: "800", fontSize: 13 },
  voiceChipTxtActive: { color: "#fff" },

  controls: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 18 },
  navBtn: {
    minWidth: 60,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Palette.surface,
  },
  navTxt: { color: Palette.text, fontSize: 10.5, fontWeight: "800" },
  segRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 10 },
  segBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  segTxt: { color: Palette.text, fontWeight: "800", fontSize: 12 },
  toolsRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 6, marginTop: 2 },
  tool: { alignItems: "center", gap: 3 },
  toolCap: { color: Palette.textDim, fontSize: 9.5, fontWeight: "700" },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  toolBtnActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  skipBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: Palette.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Palette.bg,
  },
  skipBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },
  gateMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.66)", alignItems: "center", justifyContent: "center", padding: 24 },
  gateCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Palette.bgElevated,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 24,
    alignItems: "center",
  },
  gateIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Palette.neonCyan + "22",
    borderWidth: 1,
    borderColor: Palette.neonCyan + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  gateTitle: { color: Palette.text, fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 16 },
  gateBody: { color: Palette.textMuted, fontSize: 14, lineHeight: 25, textAlign: "center", marginTop: 10 },
  gatePrimary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: Palette.neonCyan,
  },
  gatePrimaryTxt: { color: "#0b1220", fontSize: 16, fontWeight: "900" },
  gateSecondary: { marginTop: 14, padding: 6 },
  gateSecondaryTxt: { color: Palette.textDim, fontSize: 14, fontWeight: "700" },
  toolTxt: { color: Palette.text, fontSize: 11, fontWeight: "900", paddingHorizontal: 2 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.success,
  },

  extraRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  chipActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipTxt: { color: Palette.text, fontWeight: "800", fontSize: 13 },
  chipTxtActive: { color: "#fff" },

  pageInfo: { color: Palette.textMuted, textAlign: "center", fontWeight: "800", fontSize: 13 },
  statusTxt: { color: Palette.neonCyan, textAlign: "center", fontWeight: "700", fontSize: 12, marginTop: 2 },
  warnTxt: { color: Palette.warn, textAlign: "center", fontWeight: "700", fontSize: 12, marginTop: 4 },
});
