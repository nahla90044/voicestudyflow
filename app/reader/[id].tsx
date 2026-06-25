import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { cachedPageCount, ingestBook, stopIngest } from "../../lib/ingest";
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
import { extractPdfPageText } from "../../lib/pdfText";
import { splitSentences } from "../../lib/textUtils";
import {
  getLastPage,
  getLastSentence,
  getReadingRate,
  setLastPage,
  setLastSentence,
  setReadingRate,
} from "../../lib/readerPrefs";
import { recordActivity, recordBookCompleted } from "../../lib/stats";
import { supabase } from "../../lib/supabase";
import {
  DEFAULT_VOICE_ID,
  speakText,
  stopSpeaking,
  VOICE_CATALOG,
} from "../../lib/voice";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { focusEvery, getFocusLevel, getUserName } from "../../lib/settings";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
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

export default function ReaderScreen() {
  const router = useRouter();
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
  const [activeWord, setActiveWord] = useState(-1); // الكلمة المقروءة حاليًا داخل الجملة
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
  // وضع التحديد (هايلايتر): لمس السطر يحدّده بلون لجمعه للدراسة
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
  const scrollRef = useRef<ScrollView>(null);
  const pdfScrollRef = useRef<ScrollView>(null);
  const pdfViewH = useRef(0);
  const pdfContentH = useRef(0);
  const offsetsRef = useRef<number[]>([]);
  const resumeIdxRef = useRef(0); // الجملة التي يبدأ منها التشغيل بعد تخطٍّ يدوي
  const prevHeaderRef = useRef(""); // بداية الصفحة السابقة (لكشف الترويسة المتكرّرة)
  const focusNameRef = useRef(""); // اسم المستخدم لوضع التركيز (فارغ = مطفأ)
  const focusEveryRef = useRef(0); // كل كم جملة يُنادى الاسم (0 = أبدًا)
  const focusCountRef = useRef(0); // عدّاد الجُمل لمناداة الاسم دوريًا
  const playStartRef = useRef<number | null>(null);

  // صورة الصفحة الحالية (عالية الدقة، قابلة للتكبير، تتابع القراءة)
  const [pageImg, setPageImg] = useState<string | null>(null);
  const [pageImgAspect, setPageImgAspect] = useState(0.7); // العرض/الارتفاع
  const [pageImgLoading, setPageImgLoading] = useState(false);
  const pageImgForRef = useRef(0); // الصفحة التي تخصّها الصورة المعروضة حاليًا
  useEffect(() => {
    if (viewMode !== "pdf" || !pdfPath) return;
    let active = true;
    // امسح صورة الصفحة السابقة فورًا حتى لا يبقى الغلاف القديم ظاهرًا
    if (pageImgForRef.current !== page) setPageImg(null);
    setPageImgLoading(true);
    (async () => {
      let uri = await getPageImage(pdfPath, page).catch(() => null);
      // إعادة محاولة واحدة (قد لا تكون الصورة وُلِّدت بعد على الخادم)
      if (!uri && active) uri = await getPageImage(pdfPath, page).catch(() => null);
      if (!active) return;
      pageImgForRef.current = page;
      setPageImg(uri);
      setPageImgLoading(false);
      if (uri) {
        Image.getSize(
          uri,
          (w, h) => active && h > 0 && setPageImgAspect(w / h),
          () => {}
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [pdfPath, page, viewMode]);

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
    })();

    return () => {
      playingRef.current = false;
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      stopSpeaking();
      stopIngest();
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
    showToast(was ? `أُزيلت علامة الصفحة ${page}` : `🔖 حُفظت الصفحة ${page} في علاماتك`);
  }

  // ضغطة مطوّلة على جملة في وضع النص → تظليل/إزالة
  async function onSentenceLongPress(text: string) {
    const existing = highlights.find((h) => h.page === page && h.text === text);
    if (existing) {
      setHighlights(await removeHighlight(bookId, existing.id));
      showToast("أُزيل التظليل");
    } else {
      setHighlights(await addHighlight(bookId, { page, text }));
      showToast("🖍️ تم تظليل المقطع وحفظه في ملاحظاتك");
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
        showToast("تعذّر توليد بطاقات من التحديدات");
        return;
      }
      const n = await addCards(
        cards.map((c) => ({
          ...c,
          bookId: typeof id === "string" ? id : undefined,
          bookTitle: typeof title === "string" ? title : undefined,
        }))
      );
      showToast(`🃏 أُضيفت ${n} بطاقة من تحديداتك`);
    } catch {
      showToast("تعذّر توليد البطاقات");
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

  // تمرير تلقائي للجملة المقروءة في وضع النص
  useEffect(() => {
    if (viewMode !== "text" || activeSentence < 0) return;
    const y = offsetsRef.current[activeSentence];
    if (typeof y === "number") {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: true });
    }
  }, [activeSentence, viewMode]);

  // تمرير تلقائي «تيليبرومبتر» لصورة الصفحة في وضع PDF أثناء القراءة
  useEffect(() => {
    if (viewMode !== "pdf" || !speaking || activeSentence < 0 || sentences.length === 0) return;
    const frac = sentences.length > 1 ? activeSentence / (sentences.length - 1) : 0;
    const scrollable = Math.max(0, pdfContentH.current - pdfViewH.current);
    pdfScrollRef.current?.scrollTo({ y: frac * scrollable, animated: true });
  }, [activeSentence, viewMode, speaking, sentences.length]);

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

  // البريزنتيشن: ولّد شرائح الصفحة الحالية عند فتح العرض أو تغيّر الصفحة
  useEffect(() => {
    if (!presentOpen || sentences.length === 0) return;
    const p = page;
    if (slidesCacheRef.current.has(p)) {
      setPageSlides(slidesCacheRef.current.get(p)!);
      return;
    }
    let active = true;
    setSlidesLoading(true);
    setPageSlides([]);
    (async () => {
      try {
        const sl = await generateSlides(sentences.join(" ").slice(0, 4000));
        if (!active) return;
        slidesCacheRef.current.set(p, sl);
        setPageSlides(sl);
      } catch {
        if (active) setPageSlides([]);
      } finally {
        if (active) setSlidesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [presentOpen, page, sentences.length]);

  // الشريحة الحالية تتبع موضع القراءة في الصفحة
  const slideIdx =
    pageSlides.length > 0
      ? Math.min(
          pageSlides.length - 1,
          Math.floor((Math.max(0, activeSentence) / Math.max(1, sentences.length)) * pageSlides.length)
        )
      : 0;

  // وضع التركيز: حمّل الاسم ودرجة المناداة
  useEffect(() => {
    (async () => {
      const [level, name] = await Promise.all([getFocusLevel(), getUserName()]);
      focusEveryRef.current = focusEvery(level);
      focusNameRef.current = focusEveryRef.current > 0 ? name.trim() : "";
    })();
  }, []);

  // يتخطّى الترويسة المتكرّرة (نفس بداية الصفحة السابقة) فتُقرأ مرة واحدة
  function dropRepeatHeader(sents: string[]): string[] {
    if (sents.length === 0) return sents;
    const norm = (s: string) => s.replace(/[ً-ْـ\s\d٠-٩.،,:|]/g, "");
    const firstNorm = norm(sents[0]);
    let out = sents;
    if (firstNorm.length >= 3 && firstNorm === prevHeaderRef.current) {
      out = sents.slice(1);
    }
    prevHeaderRef.current = firstNorm;
    return out;
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
        playFromPage(page, 0, true);
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
      playFromPage(page, 0, true);
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
      playFromPage(page, 0, true);
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
      const sents = dropRepeatHeader(splitSentences(pageText));
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
      speakText(sents[i], {
        voiceId: pickVoice(),
        rate,
        onProgress: (frac) => setActiveWord(wordIndexAtFraction(sents[i], frac)),
        onDone: () => {
          setActiveWord(-1);
          playSentence(sents, i + 1, p, total);
        },
        onFallback: (reason) => setVoiceWarn(reason),
        onError: (e) => {
          setStatus(`تعذّر تشغيل الصوت: ${(e as any)?.message ?? "خطأ"}`);
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
        `معكِ يا ${name}؟`,
        `ركّزي معي يا ${name}.`,
        `منتبهة يا ${name}؟`,
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
  function skipSentence(delta: number) {
    const sents = sentences;
    if (sents.length === 0) return;
    const base = activeSentence >= 0 ? activeSentence : 0;
    const target = base + delta;

    // تجاوز حدود الصفحة → الصفحة المجاورة
    if (target < 0) return goPage(-1);
    if (target >= sents.length) return goPage(1);

    stopSpeaking();
    setActiveWord(-1);
    setActiveSentence(target);
    if (playingRef.current) {
      playSentence(sents, target, page, totalPages || sents.length);
    } else {
      resumeIdxRef.current = target; // عند الضغط على تشغيل يبدأ من هنا
    }
  }

  function togglePlay() {
    if (speaking) {
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
    playFromPage(page, resumeIdxRef.current, true);
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
      setSentences(splitSentences(res.text));
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
        setAiResult("لا يوجد نص في هذه الصفحة.");
        return;
      }
      const out = await aiAssist(action, text, aiQuestion);
      setAiResult(out || "لا توجد نتيجة.");
    } catch {
      setAiResult("تعذّر تنفيذ الطلب. ميزة الذكاء تحتاج تفعيل مفتاح Claude.");
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
        setAiResult("لا يوجد نص في هذه الصفحة.");
        return;
      }
      const cards = await generateFlashcards(text);
      if (cards.length === 0) {
        setAiResult("تعذّر توليد بطاقات من هذه الصفحة.");
        return;
      }
      const bookTitle = typeof title === "string" ? title : undefined;
      const n = await addCards(cards.map((c) => ({ ...c, bookId, bookTitle })));
      setAiResult(`✅ تم حفظ ${n} بطاقة مراجعة. راجعيها من تبويب «البطاقات».`);
    } catch {
      setAiResult("تعذّر تنفيذ الطلب. ميزة الذكاء تحتاج تفعيل مفتاح Claude.");
    } finally {
      setAiBusy(false);
    }
  }

  // لمس كلمة → عرض معناها حسب سياقها
  async function onWordTap(rawWord: string, context: string) {
    const word = rawWord.replace(/[^\p{L}\p{M}]/gu, "").trim();
    if (!word) return;
    setDictWord(word);
    setDictMeaning("");
    setDictLoading(true);
    setDictOpen(true);
    try {
      const m = await defineWord(word, context);
      setDictMeaning(m || "لا يوجد معنى متاح.");
    } catch {
      setDictMeaning("تعذّر جلب المعنى. تأكدي من تفعيل الذكاء (مفتاح Claude).");
    } finally {
      setDictLoading(false);
    }
  }

  // تحميل/تجهيز الكتاب كامل مسبقًا حتى يُقرأ بسلاسة
  async function startIngest() {
    if (ingesting) {
      stopIngest();
      setIngesting(false);
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
    setIngestTotal(total);
    setIngestDone(0);
    setIngesting(true);
    const res = await ingestBook(pdfPath, total, (d, t) => {
      setIngestDone(d);
      setIngestTotal(t);
    });
    setIngesting(false);

    // تحقّق فعلي من عدد الصفحات المخزّنة (نص + علامات فارغة)
    const cached = await cachedPageCount(pdfPath).catch(() => res.succeeded);
    if (res.stopped) {
      showToast(`تم الإيقاف — المحمّل ${cached} من ${total} صفحة`);
    } else if (res.failed === 0 || cached >= total) {
      setFullyLoaded(true);
      showToast(`✅ تم تحميل الكتاب كامل (${total} صفحة) — جاهز للقراءة`);
    } else {
      showToast(
        `تم تحميل ${cached} من ${total}. تعذّر ${res.failed} (غالبًا حد خدمة OCR). اضغطي «تحميل» ثانيةً لإكمالها.`
      );
    }
  }

  function goBack() {
    stop();
    stopIngest();
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
        <Text style={styles.hTitle} numberOfLines={1}>
          {typeof title === "string" && title.trim() ? title : "الكتاب"}
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
          <Text style={styles.modeToggleTxt}>{viewMode === "pdf" ? "نص" : "PDF"}</Text>
        </Pressable>
      </View>
      )}

      {/* العارض: PDF أو نص بتظليل الجملة المقروءة */}
      <View style={[styles.viewer, fullText && styles.viewerFull]}>
        {viewMode === "text" ? (
          <ScrollView ref={scrollRef} style={styles.textScroll} contentContainerStyle={styles.textContent}>
            {/* شريط الهايلايتر للدراسة */}
            <View style={styles.hlBar}>
              <Pressable
                onPress={() => setHighlightMode((m) => !m)}
                style={[styles.hlToggle, highlightMode && styles.hlToggleOn]}
              >
                <Ionicons name="brush" size={15} color={highlightMode ? "#0b1220" : Palette.text} />
                <Text style={[styles.hlToggleTxt, highlightMode && { color: "#0b1220" }]}>
                  {highlightMode ? "وضع التحديد مفعّل — المسي السطر" : "تحديد للدراسة 🖍️"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setNotesOpen(true)} style={styles.hlToggle}>
                <Ionicons name="bookmarks-outline" size={15} color={Palette.text} />
                <Text style={styles.hlToggleTxt}>مقتطفاتي</Text>
              </Pressable>
            </View>

            {sentences.length === 0 ? (
              <Text style={styles.emptyTextSmall}>
                {busy ? "جارٍ تحميل النص…" : "لا يوجد نص لعرضه في هذه الصفحة."}
              </Text>
            ) : (
              sentences.map((s, i) => {
                const hl = isHighlighted(s);
                return (
                  <Pressable
                    key={i}
                    onPress={() => highlightMode && onSentenceLongPress(s)}
                    onLongPress={() => onSentenceLongPress(s)}
                    delayLongPress={300}
                    onLayout={(e) => {
                      offsetsRef.current[i] = e.nativeEvent.layout.y;
                    }}
                    style={
                      i === activeSentence
                        ? styles.sentenceRowActive
                        : hl
                        ? styles.sentenceRowHL
                        : styles.sentenceRow
                    }
                  >
                    <Text
                      selectable
                      selectionColor="rgba(124,92,255,0.45)"
                      style={i === activeSentence ? styles.sentenceActive : styles.sentence}
                    >
                      {(() => {
                        let wc = -1;
                        return s.split(/(\s+)/).map((tok, wi) => {
                          if (!/\S/.test(tok)) return tok;
                          wc++;
                          const isSpoken = i === activeSentence && wc === activeWord;
                          return (
                            <Text
                              key={wi}
                              onPress={() =>
                                highlightMode ? onSentenceLongPress(s) : onWordTap(tok, s)
                              }
                              suppressHighlighting
                              style={isSpoken ? styles.wordSpoken : undefined}
                            >
                              {tok}
                            </Text>
                          );
                        });
                      })()}
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
                <Image
                  source={{ uri: pageImg }}
                  style={{ width: "100%", aspectRatio: pageImgAspect }}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : (
              <View style={styles.empty}>
                {pageImgLoading ? (
                  <>
                    <ActivityIndicator color={Palette.primary} />
                    <Text style={styles.emptyTextSmall}>جارٍ تجهيز الصفحة…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="document-outline" size={36} color={Palette.textDim} />
                    <Text style={styles.emptyTextSmall}>اضغطي تشغيل أو تنقّلي لعرض الصفحة.</Text>
                  </>
                )}
              </View>
            )}
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
          <Text style={styles.voicePickTxt} numberOfLines={1}>
            الصوت: {VOICE_CATALOG.find((v) => v.voiceId === voiceId)?.name ?? "اختاري"}
          </Text>
        </Pressable>

        {/* أدوات القراءة — أزرار متماثلة، يتغيّر لون الزر عند تفعيله */}
        <View style={styles.aidsRow}>
          <Pressable onPress={toggleTashkeel} style={styles.aidWrap}>
            <LinearGradient colors={tashkeelMode ? Gradients.success : Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aidGrad}>
              <Text style={styles.aidGradTxt} numberOfLines={1}>{tashkeelMode ? "النطق مُفعّل" : "نطق دقيق"}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => setTranslateModal(true)} style={styles.aidWrap}>
            <LinearGradient colors={listenArabic ? Gradients.success : Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aidGrad}>
              <Text style={styles.aidGradTxt} numberOfLines={1}>{listenArabic ? "الترجمة مُفعّلة" : "الترجمة"}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => setPresentOpen(true)} style={styles.aidWrap}>
            <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.aidGrad}>
              <Text style={styles.aidGradTxt} numberOfLines={1}>عرض تقديمي</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* التحكم: السابقة — تشغيل — التالية (يمين ← يسار) */}
        <View style={styles.controls}>
          <Pressable onPress={() => goPage(-1)} style={styles.navBtn} disabled={page <= 1} hitSlop={6}>
            <Ionicons name="chevron-forward" size={20} color={page <= 1 ? Palette.textDim : Palette.text} />
            <Text style={[styles.navTxt, page <= 1 && { color: Palette.textDim }]}>الصفحة السابقة</Text>
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
              الصفحة التالية
            </Text>
          </Pressable>
        </View>

        {/* أدوات مدمجة (أيقونة + كلمة توضيحية) */}
        <View style={styles.toolsRow}>
          <View style={styles.tool}>
            <Pressable onPress={() => skipSentence(-1)} style={styles.toolBtn} hitSlop={4}>
              <Ionicons name="play-skip-forward" size={17} color={Palette.text} />
            </Pressable>
            <Text style={styles.toolCap}>مقطع سابق</Text>
          </View>
          <View style={styles.tool}>
            <Pressable onPress={() => skipSentence(1)} style={styles.toolBtn} hitSlop={4}>
              <Ionicons name="play-skip-back" size={17} color={Palette.text} />
            </Pressable>
            <Text style={styles.toolCap}>مقطع تالٍ</Text>
          </View>
          <View style={styles.tool}>
            <Pressable onPress={cycleSpeed} style={styles.toolBtn} hitSlop={4}>
              <Text style={styles.toolTxt}>{rate}x</Text>
            </Pressable>
            <Text style={styles.toolCap}>السرعة</Text>
          </View>
          <View style={styles.tool}>
            <Pressable
              onPress={cycleSleep}
              style={[styles.toolBtn, sleepMin > 0 && styles.toolBtnActive]}
              hitSlop={4}
            >
              <Ionicons name="moon-outline" size={17} color={sleepMin > 0 ? "#fff" : Palette.text} />
            </Pressable>
            <Text style={styles.toolCap}>{sleepMin > 0 ? `${sleepMin}د` : "النوم"}</Text>
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
            <Text style={styles.toolCap}>انتقال</Text>
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
            <Text style={styles.toolCap}>{fullyLoaded ? "محمّل" : "تحميل"}</Text>
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
            الصفحة {page}
            {totalPages ? ` / ${totalPages}` : ""}
            {ingesting ? `  ·  تحميل ${ingestDone}/${ingestTotal}` : ""}
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
          <Text style={styles.warnTxt}>⚠️ تعذّر الصوت البشري: {voiceWarn}</Text>
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
              <Text style={styles.aiTitle}>🔖 علاماتي وملاحظاتي</Text>
              <Pressable onPress={() => setNotesOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {bookmarks.length === 0 && highlights.length === 0 ? (
                <Text style={styles.notesHint}>
                  لا توجد علامات بعد. استخدمي 🔖 لحفظ صفحة، أو اضغطي مطوّلاً على جملة في وضع النص لتظليلها.
                </Text>
              ) : null}

              {bookmarks.length > 0 ? (
                <>
                  <Text style={styles.notesSection}>الصفحات المحفوظة</Text>
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                    {bookmarks.map((p) => (
                      <Pressable key={p} onPress={() => jumpTo(p)} style={styles.bmChip}>
                        <Ionicons name="bookmark" size={13} color={Palette.warn} />
                        <Text style={styles.bmChipTxt}>صفحة {p}</Text>
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
                      {makingCards ? "جارٍ التوليد…" : "🃏 حوّلي تحديداتي إلى بطاقات"}
                    </Text>
                  </Pressable>
                  <Text style={styles.notesSection}>المقاطع المظلّلة</Text>
                </>
              ) : null}
              {highlights.map((h) => (
                <View key={h.id} style={styles.hlCard}>
                  <Pressable onPress={() => jumpTo(h.page)}>
                    <Text style={styles.hlPage}>صفحة {h.page}</Text>
                    <Text style={styles.hlText} numberOfLines={3}>{h.text}</Text>
                  </Pressable>

                  {noteDraft?.id === h.id ? (
                    <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8 }}>
                      <TextInput
                        value={noteDraft.text}
                        onChangeText={(t) => setNoteDraft({ id: h.id, text: t })}
                        placeholder="اكتبي ملاحظة…"
                        placeholderTextColor={Palette.placeholder}
                        style={styles.noteInput}
                        textAlign="right"
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
                      <Text style={styles.hlAction}>{h.note ? "تعديل الملاحظة" : "+ ملاحظة"}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert("حذف", "حذف هذا التظليل؟", [
                          { text: "إلغاء", style: "cancel" },
                          { text: "حذف", style: "destructive", onPress: () => deleteHighlight(h.id) },
                        ])
                      }
                      hitSlop={6}
                    >
                      <Text style={[styles.hlAction, { color: Palette.danger }]}>حذف</Text>
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
              <Text style={styles.aiTitle}>✨ مساعد الذكاء (الصفحة {page})</Text>
              <Pressable onPress={() => setAiOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <View style={styles.aiActions}>
              <Pressable style={styles.aiAction} onPress={() => runAi("summarize")} disabled={aiBusy}>
                <Ionicons name="list" size={18} color={Palette.neonCyan} />
                <Text style={styles.aiActionTxt}>تلخيص</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={() => runAi("quiz")} disabled={aiBusy}>
                <Ionicons name="help-circle" size={18} color={Palette.neonViolet} />
                <Text style={styles.aiActionTxt}>اختبرني</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={makeFlashcards} disabled={aiBusy}>
                <Ionicons name="albums" size={18} color={Palette.neonPink} />
                <Text style={styles.aiActionTxt}>بطاقات</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={() => runAi("translate")} disabled={aiBusy}>
                <Ionicons name="language" size={18} color={Palette.neonBlue} />
                <Text style={styles.aiActionTxt}>ترجمة</Text>
              </Pressable>
            </View>

            <View style={styles.aiAskRow}>
              <TextInput
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder="اسأل عن هذه الصفحة…"
                placeholderTextColor={Palette.placeholder}
                style={styles.aiInput}
                textAlign="right"
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
                  <Text style={styles.aiHint}>جارٍ التفكير…</Text>
                </View>
              ) : aiResult ? (
                <Text style={styles.aiResultTxt}>{aiResult}</Text>
              ) : (
                <Text style={styles.aiHint}>
                  اختر «تلخيص» أو «اختبرني»، أو اكتب سؤالاً عن محتوى الصفحة.
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
              <Text style={styles.driveExitTxt}>خروج من القيادة</Text>
            </Pressable>
          </View>

          <View style={styles.driveTextWrap}>
            <GlassCard glow={Palette.neonViolet} radius={Radius.xl} style={{ width: "100%" }} contentStyle={styles.driveCardInner}>
              {activeSentence >= 0 && sentences[activeSentence] ? (
                <Text style={styles.driveSentence}>
                  {(() => {
                    let wc = -1;
                    return sentences[activeSentence].split(/(\s+)/).map((tok, wi) => {
                      if (!/\S/.test(tok)) return tok;
                      wc++;
                      const spoken = wc === activeWord;
                      return (
                        <Text key={wi} style={spoken ? styles.driveWordSpoken : undefined}>
                          {tok}
                        </Text>
                      );
                    });
                  })()}
                </Text>
              ) : (
                <Text style={styles.driveHint}>اضغطي تشغيل لبدء القراءة 🎧</Text>
              )}
            </GlassCard>
          </View>

          <Text style={styles.drivePage}>
            الصفحة {page}
            {totalPages ? ` من ${totalPages}` : ""}
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
            <Text style={styles.driveSpeedTxt}>السرعة {rate}x</Text>
          </Pressable>
        </View>
      </Modal>

      {/* الانتقال لصفحة محددة */}
      <Modal visible={gotoOpen} transparent animationType="fade" onRequestClose={() => setGotoOpen(false)}>
        <Pressable style={styles.gotoMask} onPress={() => setGotoOpen(false)}>
          <Pressable style={styles.gotoCard} onPress={() => {}}>
            <View style={styles.dictHead}>
              <Text style={styles.dictWord}>الانتقال لصفحة</Text>
              <Pressable onPress={() => setGotoOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.dictHint}>اكتبي رقم الصفحة (١ – {totalPages || "؟"})</Text>
            <TextInput
              value={gotoValue}
              onChangeText={(t) => setGotoValue(t.replace(/[^0-9٠-٩]/g, ""))}
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
              <Text style={styles.gotoBtnTxt}>انتقال للصفحة</Text>
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
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={Palette.primary} />
                <Text style={styles.dictHint}>جارٍ جلب المعنى…</Text>
              </View>
            ) : (
              <Text style={styles.dictMeaning}>{dictMeaning}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* قائمة اختيار الصوت — منظّمة حسب اللغة */}
      <Modal visible={voiceModal} transparent animationType="slide" onRequestClose={() => setVoiceModal(false)}>
        <View style={styles.aiMask}>
          <View style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiTitle}>اختاري الصوت</Text>
              <Pressable onPress={() => setVoiceModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            {/* تبويبات اللغة */}
            <View style={styles.langRow}>
              {([
                { k: "ar", label: "عربي" },
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
              <Text style={styles.aiTitle}>🌐 الاستماع بالعربية</Text>
              <Pressable onPress={() => setTranslateModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Palette.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.notesHint}>
              نترجم الكتاب (الإنجليزي/الفرنسي) إلى العربية ونقرؤه بالصوت العربي الذي تختارينه.
            </Text>

            <Text style={styles.trVoicesLabel}>اختاري الصوت العربي:</Text>
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
                  {listenArabic ? "إيقاف الترجمة" : "تفعيل والاستماع بالعربية"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* عرض البريزنتيشن أثناء القراءة */}
      <Modal visible={presentOpen} animationType="slide" onRequestClose={() => setPresentOpen(false)}>
        <View style={styles.presWrap}>
          {/* شريط علوي */}
          <View style={styles.presTop}>
            <Pressable onPress={() => setPresentOpen(false)} style={styles.presExit} hitSlop={8}>
              <Ionicons name="chevron-down" size={18} color={Palette.text} />
              <Text style={styles.presExitTxt}>خروج</Text>
            </Pressable>
            <Text style={styles.presPage}>صفحة {page}</Text>
          </View>

          {/* الشريحة */}
          <View style={styles.presStage}>
            {slidesLoading ? (
              <View style={styles.presCenter}>
                <ActivityIndicator color={Palette.neonCyan} />
                <Text style={styles.presHint}>جارٍ تجهيز الشرائح…</Text>
              </View>
            ) : pageSlides.length === 0 ? (
              <View style={styles.presCenter}>
                <Ionicons name="easel-outline" size={48} color={Palette.textDim} />
                <Text style={styles.presHint}>
                  شغّلي القراءة لتظهر الشرائح، أو تأكّدي من رصيد الذكاء.
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
                    <Text style={styles.slideEmoji}>{s.emoji}</Text>
                    <Text style={[styles.slideTitle, { color: c }]}>{s.title}</Text>
                    <View style={styles.slideBullets}>
                      {s.bullets.map((b, bi) => (
                        <View key={bi} style={styles.slideBulletRow}>
                          <View style={[styles.slideDot, { backgroundColor: c }]} />
                          <Text style={styles.slideBulletTxt}>{b}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()
            )}
          </View>

          {/* نقاط الشرائح + تشغيل */}
          {pageSlides.length > 0 ? (
            <View style={styles.presDots}>
              {pageSlides.map((_, di) => (
                <View
                  key={di}
                  style={[styles.presDot, di === slideIdx && styles.presDotOn]}
                />
              ))}
            </View>
          ) : null}

          <Pressable onPress={togglePlay} style={styles.presPlay}>
            {busy ? (
              <ActivityIndicator color="#0b1220" />
            ) : (
              <Ionicons name={speaking ? "pause" : "play"} size={30} color="#0b1220" />
            )}
          </Pressable>
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

  pdfImgWrap: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", backgroundColor: "#1a1f2e" },
  pdfImgWrapFull: { paddingBottom: 96 }, // مساحة للأزرار العائمة بالأسفل
  textScroll: { backgroundColor: Palette.bgElevated },
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
  sentenceRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.md },
  sentenceRowHL: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: "rgba(241,196,15,0.14)",
  },
  sentenceRowActive: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Palette.primarySoft,
  },
  sentence: { color: Palette.textMuted, fontSize: 21, lineHeight: 40, textAlign: "right" },
  sentenceActive: { color: Palette.text, fontSize: 21, lineHeight: 40, textAlign: "right", fontWeight: "700" },
  wordSpoken: { color: Palette.neonCyan, fontWeight: "900" },

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
    marginVertical: 8,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.border,
    gap: 9,
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
  slideEmoji: { fontSize: 52, textAlign: "center", marginBottom: 10 },
  slideTitle: { fontSize: 24, fontWeight: "900", textAlign: "center", lineHeight: 36, marginBottom: 18 },
  slideBullets: { gap: 12 },
  slideBulletRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  slideDot: { width: 9, height: 9, borderRadius: 5, marginTop: 9 },
  slideBulletTxt: { flex: 1, color: Palette.text, fontSize: 17, lineHeight: 28, fontWeight: "600", textAlign: "right" },
  presDots: { flexDirection: "row-reverse", justifyContent: "center", gap: 7, marginVertical: 16 },
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

  controls: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 24 },
  navBtn: {
    minWidth: 66,
    paddingVertical: 8,
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
  toolsRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 8, marginTop: 2 },
  tool: { alignItems: "center", gap: 4 },
  toolCap: { color: Palette.textDim, fontSize: 10, fontWeight: "700" },
  toolBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  toolBtnActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  toolTxt: { color: Palette.text, fontSize: 14, fontWeight: "900" },
  playBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
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
