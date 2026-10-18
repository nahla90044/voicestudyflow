import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import { InkLayer, InkToolbar, INK_COLORS } from "../../components/reader/ink-layer";
import { hasMarginInk, loadInk, saveInk, type InkTool, type Stroke } from "../../lib/ink";

import { LinearGradient } from "expo-linear-gradient";
import { SlideView } from "../../components/brand/slide-view";
import { BuzanMindMap, mindmapPrintHtml } from "../../components/brand/mindmap";
import * as Print from "expo-print";
import { getUnitContent, setUnitContent } from "../../lib/unitContent";
import { generateMindmap, getSyllabus, type MindMap } from "../../lib/syllabus";
import { StatusBar } from "expo-status-bar";
import { getPlan } from "../../lib/plan";
import { aiAssist, CARD_TYPES, defineWord, generateFlashcards, type CardType, generateSlides, generateUnitSlides, type AiAction, type Slide } from "../../lib/ai";
import { addSave, cardsHtml, sharePdf, slidesHtml, textHtml } from "../../lib/studySaves";
import { unitForPage, unitText, type UnitScope } from "../../lib/unitScope";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { inferOffset, printedNumber } from "../../lib/pageLabelCore";
import { extractPdfPageText, getPageWords, getPageWordsFromText, getPreciseText, type WordBox } from "../../lib/pdfText";
import { splitForReading, splitSentences } from "../../lib/textUtils";
import {
  getLastPage,
  setLastOpenedBook,
  getLastSentence,
  getReadingRate,
  getToolsHidden,
  setToolsHidden,
  getReaderFontScale,
  getReaderPaper,
  setReaderFontScale,
  setReaderPaper,
  setLastPage,
  setLastSentence,
  setReadingRate,
} from "../../lib/readerPrefs";
import { MUSIC_EMOJI, MUSIC_OPTIONS, startAmbient, stopAmbient, warmAllMusic } from "../../lib/sfx";
import { recordActivity, recordBookCompleted } from "../../lib/stats";
import { FREE_BOOKS_UNLOCKED, markBookCompleted } from "../../lib/perks";
import { askForReviewOnce } from "../../lib/review";
import { UnlockModal } from "../../components/brand/unlock-modal";
import { CoachHelpButton, useCoachTour } from "../../components/brand/coach-mark";
import { PageScrubber } from "../../components/brand/page-scrubber";
import { alignSpokenToBoxes, boxIndexAtProgress, sentenceRects } from "../../lib/alignWords";
import { getSpokenName, isOwner } from "../../lib/auth";
import {
  DEFAULT_VOICE_ID,
  prefetchText,
  holdAudioSession,
  isNarrating,
  isPremiumVoice,
  onPremiumExhausted,
  standardVoiceFor,
  setLivePlaybackRate,
  resumeIfPausedExternally,
  setNowPlaying,
  speakText,
  stopSpeaking,
  VOICE_CATALOG,
  READ_STYLES,
  getReadStyle,
  setReadStyle,
  type ReadStyle,
  voiceLangOf,
  warmNext,
  setRecordingAudioMode,
} from "../../lib/voice";
import { closeReadingCard, onReadingAction, setOpenReaderBook, syncReadingCard } from "../../lib/readingCard";
import { Gradients as BaseGradients, Palette as BasePalette, Radius, Spacing } from "../../constants/design";
import { SCENE_PALETTE } from "../../lib/sceneCore";

// القارئ يلبس دائمًا ألوان «سماء المعرفة» الليلية (كحلي + ذهبي): كروم هادئ داكن
// يريح العين في جلسات الاستماع الطويلة، بدل تدرّجات النيون البنفسجية/السماوية.
// نعيد تعريف Palette/Gradients محليًا فيتلوّن كل الكروم مرة واحدة بلا تغيير في البنية.
const SKY = SCENE_PALETTE.sky;
const GOLD_SOFT = "rgba(246,213,138,0.14)";
const Palette = {
  ...BasePalette,
  bg: SKY.bg,
  bgElevated: SKY.card,
  surface: "rgba(255,255,255,0.06)",
  surfaceStrong: "rgba(255,255,255,0.10)",
  border: SKY.cardBorder,
  text: SKY.ink,
  textMuted: "#D4D0EC",
  textDim: SKY.dim,
  placeholder: SKY.navIdle,
  primary: SKY.accent,
  primaryDark: "#E3BE6C",
  accent: SKY.accent,
  primarySoft: GOLD_SOFT,
  accentSoft: GOLD_SOFT,
  neonCyan: SKY.accent,
  neonViolet: SKY.accent,
  neonBlue: SKY.accent,
  neonPink: SKY.accent,
  glass: SKY.card,
  glassBorder: SKY.cardBorder,
  glassHighlight: "rgba(255,255,255,0.05)",
} as const;
// أزرار «مميّزة» = ذهبي مُصمت (تدرّج بلونين متطابقين = لون واحد) — بلا نيون
const GOLD_SOLID = [SKY.accent, SKY.accent] as const;
const Gradients = {
  ...BaseGradients,
  bg: [SKY.bg, SKY.bg, SKY.bg] as const,
  hero: [SKY.card, SKY.bg] as const,
  brand: GOLD_SOLID,
  neon: GOLD_SOLID,
  neonBlue: GOLD_SOLID,
  neonViolet: GOLD_SOLID,
  brandSoft: [GOLD_SOFT, "rgba(246,213,138,0.06)"] as const,
} as const;
import { focusEvery, getFocusLevel } from "../../lib/settings";
import { handoff, takeOver } from "../../lib/player";
import { useDictation } from "../../lib/stt";
import { addWord, type SavedWord } from "../../lib/words";
import { WordSheet } from "../../components/brand/word-sheet";
import { parseWalkCommand, type WalkCommand } from "../../lib/voiceIntents";
import { useDir, useI18n } from "../../lib/i18n";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
// دقائق مؤقّت النوم. 0 = مطفأ، و-1 = «حتى نهاية الكتاب» (بلا توقيت).
// أُضيف 10 لأنه أكثر مدة يطلبها من يستمع قبل النوم، و-1 لمن يريد إكمال الكتاب.
const SLEEP_OPTIONS = [0, 5, 10, 15, 30, -1] as const;
const SLEEP_UNTIL_END = -1;

// أي كلمة (حسب ترتيبها في الجملة) تُقرأ عند نسبة تقدّم frac (0..1)،
// بتوزيع زمني تقريبي مرجّح بطول الكلمة.
/** لغة النص الغالبة: عربي أو إنجليزي، أو null إن لم يكفِ النص للحكم. */
function textLang(text: string): "ar" | "en" | null {
  const sample = text.slice(0, 600);
  const ar = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  if (ar + latin < 4) return null;
  // حسم واضح فقط: صفحة عربية فيها مصطلحات/مراجع إنجليزية كثيرة لا تبدّل القارئة
  if (ar >= latin) return "ar";
  if (latin > ar * 3) return "en";
  return null;
}

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
// لغات الترجمة المتاحة (يختارها المستخدم عند الضغط على «الترجمة»)
const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "tr", label: "Türkçe" },
  { code: "ur", label: "اردو" },
  { code: "id", label: "Indonesia" },
];

// رمز تعبيري لكل نوع موسيقى (لبطاقات اختيار الموسيقى في العرض التقديمي)


function splitLongSlides(slides: Slide[]): Slide[] {
  const out: Slide[] = [];
  for (const s of slides) {
    // حدّ النقاط حسب التخطيط (البطاقات ٢×٢ والخطوات تتسع لأربع)؛ المقارنة لا تُقسم
    const max = s.layout === "cards" || s.layout === "steps" || s.layout === "summary" ? 4 : s.layout === "cover" ? 5 : 3;
    if (s.layout === "compare" || s.bullets.length <= max) {
      out.push(s);
      continue;
    }
    for (let i = 0; i < s.bullets.length; i += max) {
      out.push({
        ...s,
        title: i === 0 ? s.title : `${s.title} (تكملة)`,
        bullets: s.bullets.slice(i, i + max),
        // الرقم/الاقتباس يبقى في الجزء الأول فقط
        ...(i > 0 && (s.layout === "stat" || s.layout === "quote") ? { layout: "list" as const, highlight: undefined } : {}),
      });
    }
  }
  return out;
}

// ألوان المظهر الورقي للقارئ
const PAPER = "#F6F1E7";
const INK = "#2A2622";

/**
 * زر التشغيل بألوان القارئ (سماء الليل): دائرة ذهبية مُصمتة بأيقونة كحلية وتوهّج ذهبي ناعم.
 * نفس سلوك PlayButton المشترك (لمسة اهتزاز، نبضة تلميح قبل أول تشغيل، نفس التسميات)
 * لكن بلا تدرّج النيون — حتى يبقى كروم القارئ موحّدًا.
 */
function GoldPlayButton({
  playing,
  busy = false,
  onPress,
  size = 60,
  hint = false,
}: {
  playing: boolean;
  busy?: boolean;
  onPress: () => void;
  size?: number;
  hint?: boolean;
}) {
  const { t } = useI18n();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!hint || playing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [hint, playing, pulse]);
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: SKY.accent,
          opacity: pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
        }}
      />
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={playing ? t("reader.play.pause") : t("reader.play.listen")}
        hitSlop={8}
        style={({ pressed }) => [styles.goldPlay, { width: size, height: size, borderRadius: r, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        {busy ? (
          <ActivityIndicator color={SKY.onAccent} />
        ) : (
          <Ionicons
            name={playing ? "pause" : "play"}
            size={Math.round(size * 0.42)}
            color={SKY.onAccent}
            style={playing ? undefined : { marginLeft: Math.round(size * 0.04) }}
          />
        )}
      </Pressable>
    </View>
  );
}

/** أداة في لوحة القارئ الداخلية: أيقونة (أو نص) + تسمية، وتتلوّن عند التفعيل */
function InTool({
  icon,
  text,
  label,
  onPress,
  on,
  disabled,
  badge,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  text?: string;
  label: string;
  onPress: () => void;
  on?: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.inTool, on && styles.inToolOn, disabled && { opacity: 0.45 }]} accessibilityLabel={label}>
      <View>
        {icon ? (
          <Ionicons name={icon} size={19} color={on ? SKY.onAccent : Palette.text} />
        ) : (
          <Text style={[styles.qChipTxt, on && { color: SKY.onAccent }]}>{text}</Text>
        )}
        {badge ? (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeTxt}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.inToolLbl, on && { color: SKY.onAccent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </Pressable>
  );
}

/** اختيار داخل صف الخيارات (السرعات، مؤقّت النوم، الموسيقى، حجم الخط) */
function OptChip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.optChip, on && styles.optChipOn]}>
      <Text style={[styles.optChipTxt, on && { color: SKY.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export default function ReaderScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const dir = useDir();
  // اللغة الافتراضية للصوت/الترجمة تتبع لغة الواجهة (إنجليزي → صوت إنجليزي… إلخ)
  const uiVoiceLang: "ar" | "en" | "fr" = lang === "en" || lang === "fr" ? lang : "ar";
  const uiVoiceId = VOICE_CATALOG.find((v) => (v.lang ?? "ar") === uiVoiceLang)?.voiceId ?? DEFAULT_VOICE_ID;
  const { id, title, pdf_path } = useLocalSearchParams<{
    id?: string;
    title?: string;
    pdf_path?: string;
  }>();

  // تخمين أولي من عنوان الكتاب (عنوان عربي → صوت عربي) إلى أن يصل نص الصفحة
  const titleLang = textLang(typeof title === "string" ? title : "");
  const initialVoiceLang = titleLang ?? uiVoiceLang;
  const initialVoiceId = VOICE_CATALOG.find((v) => (v.lang ?? "ar") === initialVoiceLang)?.voiceId ?? uiVoiceId;

  const bookId = typeof id === "string" ? id : undefined;
  const pdfPath = typeof pdf_path === "string" ? pdf_path : "";

  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [voiceId, setVoiceId] = useState(initialVoiceId);
  const [readStyle, setReadStyleState] = useState<ReadStyle>(getReadStyle());
  const [, setVoiceLang] = useState<"ar" | "en" | "fr">(initialVoiceLang); // فلتر لغة الأصوات (افتراضه لغة الواجهة)
  const [voiceModal, setVoiceModal] = useState(false); // قائمة اختيار الصوت
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1); // أحدث سرعة (لتقرأها الجملة التالية بلا إغلاق قديم)
  const [sleepMin, setSleepMin] = useState(0);
  const [viewMode, setViewMode] = useState<"pdf" | "text">("pdf");
  const [sentences, setSentences] = useState<string[]>([]);
  const [activeSentence, setActiveSentence] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1); // الكلمة المنطوقة داخل المقطع (كاراوكي)
  const [skipMult, setSkipMult] = useState(1); // مضاعف سرعة التخطّي الحالي (×2 ×3…)
  const [skipDir, setSkipDir] = useState(1); // اتجاه آخر تخطّي (لإظهار الشارة على الزر الصحيح)
  const [, setStatus] = useState(""); // رسالة حالة داخلية (تُحدَّث أثناء التشغيل)
  const [voiceWarn, setVoiceWarn] = useState(""); // سبب فشل الصوت البشري (يبقى ظاهرًا)

  // مكافأة إنهاء أول كتاب (ترفع الحد المجاني إلى ١٠ كتب)
  const [unlockOpen, setUnlockOpen] = useState(false);
  const finishedRef = useRef(false); // لا نسجّل الإنهاء مرتين في نفس الجلسة

  // هل شُغّل الصوت مرة في هذه الجلسة؟ (تنبض أيقونة التشغيل قبلها فقط)
  const [everPlayed, setEverPlayed] = useState(false);

  // أحدث صوت مختار — تقرأه pickVoice فورًا بلا انتظار إعادة الرسم
  const voiceIdRef = useRef(initialVoiceId);
  // هل اختار المستخدم الصوت صراحةً؟ عندها نكفّ عن مطابقته بلغة الكتاب تلقائيًا
  const voiceChosenRef = useRef(false);

  // تصميم 2.0: مظهر ورقي/ليلي + حجم خط النص + لوحة «أدوات القراءة»
  const [paper, setPaper] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [toolTab, setToolTab] = useState<"listen" | "study" | "view">("listen");
  const safeInsets = useSafeAreaInsets();
  // جولة القارئ (مرة أولى، وتعود بزر «؟»)
  const coach = useCoachTour("reader_v1", [
    { id: "page", title: t("coach.reader.page.title"), body: t("coach.reader.page.body"), shape: "rect",
      rows: [
        { icon: "hand-left-outline", text: t("coach.reader.page.double") },
        { icon: "swap-horizontal", text: t("coach.reader.page.swipe") },
        { icon: "bookmark-outline", text: t("coach.reader.page.hold") },
      ] },
    { id: "nav", title: t("coach.reader.nav.title"), body: t("coach.reader.nav.body"), shape: "rect" },
    { id: "capsule", title: t("coach.reader.capsule.title"), body: t("coach.reader.capsule.body"), shape: "rect" },
    { id: "tabs", title: t("coach.reader.tabs.title"), body: t("coach.reader.tabs.body"), shape: "rect" },
    { id: "toggle", title: t("coach.reader.toggle.title"), body: t("coach.reader.toggle.body") },
  ], { delay: 2200 });
  const [toolsHidden, setToolsHiddenState] = useState(false); // إخفاء لوحة الأدوات لمساحة قراءة أكبر
  useEffect(() => {
    void getToolsHidden().then(setToolsHiddenState).catch(() => {});
  }, []);
  function toggleToolsHidden() {
    setToolsHiddenState((h) => {
      void setToolsHidden(!h);
      return !h;
    });
    setToolOpt(null);
  }
  const [toolOpt, setToolOpt] = useState<"speed" | "sleep" | "music" | "font" | null>(null);
  // نداء التركيز التفاعلي: بطاقة تظهر مع النداء الصوتي وتنتظر لمسة (معك / إعادة / شرح أبسط)
  type CheckIn = { phase: "ask" | "done" | "explaining" | "explained"; title: string; body?: string };
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const checkInTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explainAtRef = useRef(0);
  // وضع المشي: استماع مستمر لأوامر قصيرة أثناء القراءة (بلا لمس للشاشة)
  const [walkMode, setWalkMode] = useState(false);
  const walkModeRef = useRef(false);
  const [walkHeard, setWalkHeard] = useState("");
  const walkHandledRef = useRef(0); // طول النص الذي عولج — حتى لا يُنفَّذ الأمر مرتين
  const walkStartAtRef = useRef(0); // متى بدأت جلسة الاستماع الحالية
  const walkQuickFailsRef = useRef(0); // جلسات انتهت فور بدئها (ميكروفون معطّل) — نوقف بعد ٣ // الجملة التي طُلب شرحها — نكمل بعدها (stop يصفّر الموضع الحي)

  // قاموس: معنى الكلمة عند لمسها
  const [dictOpen, setDictOpen] = useState(false);
  const [dictWord, setDictWord] = useState("");
  const [dictMeaning, setDictMeaning] = useState("");
  const [dictLoading, setDictLoading] = useState(false);
  const [wordSheet, setWordSheet] = useState<SavedWord | null>(null); // «كلماتي»: بطاقة الكلمة المحفوظة
  const dictContextRef = useRef("");

  // وضع القيادة (واجهة كبيرة مبسّطة)
  const [drivingMode, setDrivingMode] = useState(false);
  // وضع ملء الشاشة للقراءة (إخفاء الأزرار وتكبير النص)
  const [fullText, setFullText] = useState(false); // تفتح بواجهة القراءة الكاملة (النص + الأزرار)؛ زر التكبير للملء
  // الانتقال لصفحة محددة
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState("");
  // ترقيم الكتاب المطبوع: الفرق بين رقم الصفحة في الملف ورقمها المطبوع (يُستنتج تلقائيًا)
  const [pageOffset, setPageOffset] = useState<number | null>(null);
  const [gotoMode, setGotoMode] = useState<"book" | "file">("book");
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

  // انتهت صفحات الصوت الفاخر هذا الشهر: speakText يعيد الجملة بالصوت الأساسي،
  // وهنا نثبّت الاختيار على الأساسي (لا نعود للفاخر في الجملة التالية) وننبّه مرة.
  useEffect(() => {
    return onPremiumExhausted(() => {
      let switched = false;
      if (isPremiumVoice(voiceIdRef.current)) {
        const std = standardVoiceFor(voiceIdRef.current);
        voiceIdRef.current = std;
        voiceChosenRef.current = true;
        setVoiceId(std);
        switched = true;
      }
      if (isPremiumVoice(translateVoiceIdRef.current)) {
        const std = standardVoiceFor(translateVoiceIdRef.current);
        translateVoiceIdRef.current = std;
        setTranslateVoiceId(std);
        switched = true;
      }
      if (switched) showToast(t("reader.toast.premiumOver"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const arTransRef = useRef<Map<string, string>>(new Map());
  // لوحة الترجمة: اختيار صوت بلغة الواجهة للاستماع المترجَم
  const [translateModal, setTranslateModal] = useState(false);
  const [translateVoiceId, setTranslateVoiceId] = useState(uiVoiceId);
  const translateVoiceIdRef = useRef(uiVoiceId);
  // النطق الدقيق: تشكيل النص قبل القراءة (لكتب الدين والقانون والفصحى)
  const [tashkeelMode, setTashkeelMode] = useState(false);
  const tashkeelRef = useRef(false);
  const tashkeelCacheRef = useRef<Map<number, string>>(new Map());
  // نص الصفحات القادمة مجهّز مسبقًا → الانتقال بين الصفحات بلا انتظار (حتى والجوال مقفل)
  const pageTextCacheRef = useRef<Map<number, Awaited<ReturnType<typeof extractPdfPageText>>>>(new Map());
  const pageRetryRef = useRef<Set<number>>(new Set());
  // عرض البريزنتيشن: شرائح مولّدة من الصفحة تتنقّل مع الصوت
  const [presentOpen, setPresentOpen] = useState(false);
  const [pageSlides, setPageSlides] = useState<Slide[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const slidesCacheRef = useRef<Map<string, Slide[]>>(new Map()); // المفتاح: «اللغة:الصفحة»
  // نطاق العرض: هذه الصفحة، أو الوحدة كاملة (لفهم الفكرة بتسلسلها)
  const [presScope, setPresScope] = useState<"page" | "unit">("page");
  const [unitScope, setUnitScope] = useState<UnitScope | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  // سرد العرض التقديمي بصوت ElevenLabs (شريحة بشريحة)
  const [presNarrating, setPresNarrating] = useState(false);
  const [presSlide, setPresSlide] = useState(0);
  const presNarratingRef = useRef(false);
  const presUsedRef = useRef(false); // فُتح العرض مرة → جهّز الشرائح مسبقًا للصفحات التالية
  const [presMusicKey, setPresMusicKey] = useState<string | null>(null); // موسيقى مختارة (null = بدون)
  const [musicLoading, setMusicLoading] = useState<string | null>(null); // مقطوعة قيد التحميل/التوليد

  // اختيار موسيقى مع مؤشّر تحميل فوري (تظهر «قيد التحميل» لحين جهوز المقطوعة)
  async function selectMusic(key: string) {
    setPresMusicKey(key);
    setMusicLoading(key);
    try {
      await startAmbient(key);
    } finally {
      setMusicLoading((k) => (k === key ? null : k));
    }
  }
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);

  // مساعد الذكاء الاصطناعي
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  // البطاقات المولَّدة للتو: تُعرض تحت الرسالة وتُطبع PDF بطاقاتٍ (كان الـPDF يطبع جملة «تم حفظ…» فقط)
  const [aiCards, setAiCards] = useState<{ front: string; back: string }[] | null>(null);
  // الخريطة الذهنية لوحدة الصفحة الحالية — تُفتح فوق القراءة (الصوت يستمر) للمراجعة أثناء المذاكرة
  const [mmOpen, setMmOpen] = useState(false);
  const [mmMap, setMmMap] = useState<MindMap | null>(null);
  const [mmTitle, setMmTitle] = useState("");
  const [mmBusy, setMmBusy] = useState(false);
  const [mmFailed, setMmFailed] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  // خانة «اسأل عن الصفحة» تُعرض لحساب المالك فقط (تفتح مجالًا لاستخدامات أخرى)
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    isOwner().then(setOwner).catch(() => setOwner(false));
  }, []);

  // مراجع
  const playingRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsLoadedRef = useRef(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false); // اكتمل استرجاع الصفحة المحفوظة
  const scrollRef = useRef<ScrollView>(null);
  const pdfScrollRef = useRef<ScrollView>(null);
  // كتابة قلم الآيباد على الصفحة والهامش (الآيباد فقط)
  const isPad = Platform.OS === "ios" && Platform.isPad;
  const [penOn, setPenOn] = useState(false);
  const [inkTool, setInkTool] = useState<InkTool>("pen");
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [inkStrokes, setInkStrokes] = useState<Stroke[]>([]);
  const inkHistory = useRef<Stroke[][]>([]); // للتراجع
  const [pageAreaW, setPageAreaW] = useState(0);
  useEffect(() => {
    if (!isPad || !bookId) return;
    let on = true;
    inkHistory.current = [];
    setInkStrokes([]);
    void loadInk(bookId, page, (remote) => on && setInkStrokes(remote)).then((s0) => on && setInkStrokes(s0));
    return () => {
      on = false;
    };
  }, [isPad, bookId, page]);
  function changeInk(next: Stroke[]) {
    if (!bookId) return;
    inkHistory.current = [...inkHistory.current.slice(-30), inkStrokes];
    setInkStrokes(next);
    saveInk(bookId, page, next);
  }
  function undoInk() {
    const prev = inkHistory.current.pop();
    if (prev && bookId) {
      setInkStrokes(prev);
      saveInk(bookId, page, prev);
    }
  }
  // الهوامش تظهر في وضع القلم، أو إن كانت فيها كتابة سابقة
  const showMargins = isPad && (penOn || hasMarginInk(inkStrokes));
  const marginPx = showMargins && pageAreaW > 0 ? Math.round(pageAreaW * 0.11) : 0;
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
  // نسخ حيّة للموضع — دالة التنظيف عند المغادرة ترى القيم الأولى فقط بدونها
  const livePageRef = useRef(1);
  const liveSentRef = useRef(-1);
  const liveTotalRef = useRef(0);
  // الرجوع من الشريط العائم والصوت شغّال → نكمل القراءة هنا تلقائيًا من نفس الجملة
  const autoResumeRef = useRef(false);

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
  const prefetchedRef = useRef(new Set<number>()); // صفحات حُمّلت صورها مسبقًا
  const imgUriRef = useRef(new Map<number, string>()); // صور الصفحات المحمّلة (للتقليب بالسحب)
  const [nbr, setNbr] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });
  const pagerX = useRef(new Animated.Value(0)).current; // إزاحة الصفحة أثناء السحب
  const totalPagesRef = useRef(0);
  const pdfZoomRef = useRef(1); // تكبير الصفحة الحالي (السحب للتقليب يعمل بلا تكبير فقط)
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  // متابعة القارئ: لو سحب المستخدم الصفحة بنفسه أثناء القراءة نوقف التمرير التلقائي
  // ٥ ثوانٍ ونُظهر زر «تابع القارئ» (نفس سلوك «حاكي»)
  const detachedAtRef = useRef(0);
  const [detached, setDetached] = useState(false);
  const [lensZoom, setLensZoom] = useState(2); // تكبير العدسة
  const wordsSrcRef = useRef(new Map<number, "text" | "vision">()); // مصدر كلمات كل صفحة
  useEffect(() => {
    // نحمّل صورة الصفحة في وضع PDF أو عند فتح العدسة (تحتاج الصورة)
    if ((viewMode !== "pdf" && !lensOpen) || !pdfPath || !prefsLoaded) return;
    const target = page;
    const myReq = ++imgReqRef.current;
    // امسح صورة الصفحة السابقة فورًا إن اختلفت الصفحة (لا يبقى الغلاف القديم)
    if (pageImgForRef.current !== target) setPageImg(null);
    setPageImgLoading(true);
    // المجاورتان من الذاكرة فورًا (لا تظهر مجاورتا الصفحة السابقة أثناء السحب)
    setNbr({ prev: imgUriRef.current.get(target - 1) ?? null, next: imgUriRef.current.get(target + 1) ?? null });
    (async () => {
      let uri = await getPageImage(pdfPath, target).catch(() => null);
      // إعادة محاولة (قد لا تكون الصورة وُلِّدت بعد على الخادم)
      if (!uri && myReq === imgReqRef.current) uri = await getPageImage(pdfPath, target).catch(() => null);
      if (myReq !== imgReqRef.current) return; // وصل طلب أحدث لصفحة أخرى → تجاهل هذا
      pageImgForRef.current = target;
      setPageImg(uri);
      setPageImgLoading(false);
      if (uri) imgUriRef.current.set(target, uri);
      // تحميل مسبق للصفحات المجاورة بالخلفية (التالية مرتين والسابقة) → التقليب يصبح فوريًا.
      // وتجهيز نص التالية أيضًا حتى يبدأ صوتها بلا انتظار.
      void (async () => {
        for (const n of [target + 1, target - 1, target + 2]) {
          if (n < 1 || (totalPagesRef.current && n > totalPagesRef.current)) continue;
          if (imgUriRef.current.has(n)) continue;
          prefetchedRef.current.add(n);
          const u = await getPageImage(pdfPath, n).catch(() => null);
          if (u) imgUriRef.current.set(n, u);
        }
        // الصفحتان المجاورتان جاهزتان → تظهران تحت الإصبع أثناء السحب
        if (myReq === imgReqRef.current) {
          setNbr({ prev: imgUriRef.current.get(target - 1) ?? null, next: imgUriRef.current.get(target + 1) ?? null });
        }
        void extractPdfPageText(pdfPath, target + 1).catch(() => null);
      })();
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
    // المشغّل العام كان يقرأ هذا الكتاب؟ يتوقف هو، ونكمل نحن من موضعه المحفوظ
    autoResumeRef.current = takeOver(bookId).wasPlaying;
    if (!autoResumeRef.current) closeReadingCard(); // بطاقة قديمة متوقفة من المشغّل العام
    (async () => {
      const [savedPage, savedRate, savedSent] = await Promise.all([
        getLastPage(bookId),
        getReadingRate(),
        getLastSentence(bookId),
      ]);
      setPage(savedPage);
      setRate(savedRate);
      if (bookId) {
        setLastOpenedBook({ id: bookId, title: typeof title === "string" ? title : "", pdf_path: pdfPath }).catch(() => {});
      }
      rateRef.current = savedRate;
      resumeIdxRef.current = savedSent; // يستأنف من نفس الجملة بالضبط
      prefsLoadedRef.current = true;
      setPrefsLoaded(true); // الآن page = الصفحة المحفوظة → حمّل صورتها (لا الغلاف)
    })();

    return () => {
      // تصميم 2.0: المغادرة والصوت شغّال لا توقف القراءة — نسلّم الموضع للمشغّل العام
      // فيظهر الشريط العائم ويكمل. (وضع «الاستماع بالعربية» يحتاج الترجمة الكاملة → يتوقف.)
      const keepPlaying = playingRef.current && !listenArabicRef.current && !!pdfPath && !!bookId;
      playingRef.current = false;
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      stopSpeaking();
      if (playStartRef.current) {
        recordActivity({ minutes: (Date.now() - playStartRef.current) / 60000 });
        playStartRef.current = null;
      }
      if (keepPlaying && bookId) {
        handoff({
          bookId,
          title: typeof title === "string" && title.trim() ? title : "VoiceStudyFlow",
          pdfPath,
          page: livePageRef.current,
          totalPages: liveTotalRef.current,
          idx: Math.max(0, liveSentRef.current),
          voiceId: pickVoice(),
          rate: rateRef.current,
          precise: tashkeelRef.current,
        });
      }
      if (!keepPlaying) closeReadingCard(); // وإلا يستلمها المشغّل العام ويحدّثها
      // موسيقى الخلفية تكمل مع الشريط العائم إن استمر السرد، وإلا تتوقف بمغادرة الكتاب
      if (!keepPlaying) stopAmbient();
      // ملاحظة: لا نوقف تحميل الكتاب عند الخروج — يكمل في الخلفية عبر المدير العام
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // قفل الجوال أو الخروج للخلفية لا يوقف موسيقى الخلفية (حتى لو السرد متوقف):
  // من يختار موسيقى يريدها تكمل والشاشة مقفلة. تتوقف فقط بإيقافها أو بمغادرة الكتاب.

  // حفظ آخر صفحة عند تغيّرها (بعد تحميل التفضيلات لتفادي الكتابة فوق المحفوظ)
  useEffect(() => {
    if (prefsLoadedRef.current && bookId && page >= 1) setLastPage(bookId, page);
  }, [bookId, page]);

  // بلوغ الصفحة الأخيرة = إنهاء الكتاب أيضًا — حتى يستحق المكافأةَ من يقرأ
  // بعينه لا بالاستماع فقط (المسار الآخر داخل playSentence عند نهاية النص).
  useEffect(() => {
    if (!prefsLoadedRef.current || !bookId) return;
    if (totalPages > 0 && page >= totalPages) void onBookFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, page, totalPages]);

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
  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

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
    prefetchText(sentences[idx], { voiceId: pickVoice(), page: pdfPath ? { book: pdfPath, page } : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences]);

  function cycleSpeed() {
    const idx = SPEEDS.indexOf(rate as (typeof SPEEDS)[number]);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  }

  function setSpeed(next: number) {
    setRate(next);
    rateRef.current = next; // الجملة التالية تأخذ السرعة الجديدة
    setLivePlaybackRate(next); // والصوت الجاري يتغيّر فورًا دون إيقاف/تشغيل
    setReadingRate(next);
  }

  // بطاقة الجزيرة العائمة وشاشة القفل: اسم الكتاب + الصفحة + السرعة + حالة التشغيل.
  // تبقى بعد الإيقاف (متوقفة) ليُكمل الاستماع من شاشة القفل مباشرة.
  useEffect(() => {
    if (!bookId || (!everPlayed && !speaking)) return;
    syncReadingCard({
      bookId,
      title: typeof title === "string" ? title : "",
      page,
      totalPages,
      rate,
      playing: speaking,
    });
  }, [bookId, title, page, totalPages, rate, speaking, everPlayed]);

  // أزرار البطاقة: الإيقاف/الإكمال والتسريع (أحدث نسخة من الدوال عبر مرجع)
  const cardCtlRef = useRef({ toggle: () => {}, speed: () => {} });
  cardCtlRef.current = { toggle: () => togglePlay(), speed: () => cycleSpeed() };
  useEffect(() => onReadingAction((a) => (a === "toggle" ? cardCtlRef.current.toggle() : cardCtlRef.current.speed())), []);
  useEffect(() => {
    setOpenReaderBook(bookId || null);
    return () => setOpenReaderBook(null);
  }, [bookId]);

  function setSleep(next: number) {
    setSleepMin(next);

    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    // «حتى نهاية الكتاب» لا يحتاج مؤقّتًا — القراءة تتوقّف بانتهاء آخر صفحة
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
    if (presScope === "unit") return; // عرض الوحدة له مساره الخاص (أدناه)
    if ((!presentOpen && !presUsedRef.current) || sentences.length === 0) return;
    const p = page;
    // المفتاح يتضمّن لغة الواجهة → الشرائح تتبع اللغة، وتبديلها يعيد التوليد لا يعرض القديم
    const key = `${uiVoiceLang}:${p}`;
    if (slidesCacheRef.current.has(key)) {
      setPageSlides(slidesCacheRef.current.get(key)!);
      return;
    }
    let active = true;
    if (presentOpen) {
      setSlidesLoading(true);
      setPageSlides([]);
    }
    (async () => {
      try {
        const sl = splitLongSlides(await generateSlides(sentences.join(" ").slice(0, 4000), uiVoiceLang));
        if (!active) return;
        slidesCacheRef.current.set(key, sl);
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
  }, [presentOpen, page, sentences.length, uiVoiceLang, presScope]);

  // عرض الوحدة كاملة: نحدّد وحدة الصفحة الحالية (من المنهج) ونولّد شرائح تغطيها كلها
  useEffect(() => {
    if (!presentOpen || presScope !== "unit" || !pdfPath) return;
    let active = true;
    setSlidesLoading(true);
    setPageSlides([]);
    (async () => {
      try {
        const sc = await unitForPage(pdfPath, page, totalPages);
        if (!active) return;
        setUnitScope(sc);
        const key = `${uiVoiceLang}:unit:${sc.from}-${sc.to}`;
        let sl = slidesCacheRef.current.get(key);
        if (!sl) {
          const txt = await unitText(pdfPath, sc.from, sc.to);
          if (!active) return;
          sl = txt.trim() ? splitLongSlides(await generateUnitSlides(txt, uiVoiceLang)) : [];
          if (sl.length) slidesCacheRef.current.set(key, sl);
        }
        if (active) setPageSlides(sl);
      } catch {
        if (active) setPageSlides([]);
      } finally {
        if (active) setSlidesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // الوحدة لا تتغيّر بتقليب صفحة داخلها → نعتمد على النطاق لا رقم الصفحة فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentOpen, presScope, pdfPath, uiVoiceLang]);

  const bookTitleStr = typeof title === "string" ? title : "";
  const presTitle =
    presScope === "unit" && unitScope
      ? unitScope.title ?? t("reader.present.pagesRange", { from: unitScope.from, to: unitScope.to })
      : t("reader.present.pageTitle", { page });

  /** حفظ العرض الحالي في «محفوظات الكتاب» */
  async function savePresentation() {
    if (!bookId || !pageSlides.length || saveBusy) return;
    setSaveBusy(true);
    try {
      const unit = presScope === "unit" && unitScope;
      await addSave({
        book_id: bookId,
        kind: "slides",
        title: presTitle,
        scope: presScope,
        page_from: unit ? unitScope!.from : page,
        page_to: unit ? unitScope!.to : page,
        content: { slides: pageSlides },
      });
      Alert.alert(t("save.savedTitle"), t("save.savedBody"));
    } catch {
      Alert.alert(t("save.failedTitle"), t("save.failedBody"));
    } finally {
      setSaveBusy(false);
    }
  }
  async function presentationPdf() {
    if (!pageSlides.length) return;
    try {
      await sharePdf(slidesHtml({ bookTitle: bookTitleStr, title: presTitle, slides: pageSlides, rtl: dir.isRTL }), presTitle);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    }
  }
  /** حفظ إجابة المساعد الحالية */
  async function saveAssistant() {
    if (!bookId || !aiResult.trim() || saveBusy) return;
    setSaveBusy(true);
    try {
      const cardsText = aiCards ? aiCards.map((c, i) => `${i + 1}. ${c.front}\n${c.back}`).join("\n\n") : "";
      await addSave({
        book_id: bookId,
        kind: "assistant",
        title: aiCards ? t("reader.ai.cardsTitle", { page }) : t("reader.ai.saveTitle", { page }),
        scope: "page",
        page_from: page,
        page_to: page,
        content: aiCards ? { text: cardsText, cards: aiCards } : { text: aiResult, question: aiQuestion.trim() || undefined },
      });
      Alert.alert(t("save.savedTitle"), t("save.savedBody"));
    } catch {
      Alert.alert(t("save.failedTitle"), t("save.failedBody"));
    } finally {
      setSaveBusy(false);
    }
  }
  async function assistantPdf() {
    if (!aiResult.trim()) return;
    const ttl = aiCards ? t("reader.ai.cardsTitle", { page }) : t("reader.ai.saveTitle", { page });
    try {
      if (aiCards) {
        await sharePdf(cardsHtml({ bookTitle: bookTitleStr, title: ttl, cards: aiCards, rtl: dir.isRTL }), ttl);
        return;
      }
      await sharePdf(textHtml({ bookTitle: bookTitleStr, title: ttl, text: aiResult, question: aiQuestion.trim() || undefined, rtl: dir.isRTL }), ttl);
    } catch {
      Alert.alert(t("save.pdfFailedTitle"), t("save.pdfFailedBody"));
    }
  }

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
    const cols = (s.columns ?? []).map((c) => `${c.title}: ${c.bullets.join("، ")}`).join(". ");
    const pts = s.bullets.map((b) => b.replace(/[:：]/, "، ")).join("، ");
    return [s.title, s.highlight, cols, pts].filter((x) => x && x.trim()).join(". ") + ".";
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
      rate: rateRef.current,
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

  useEffect(() => {
    getReaderPaper().then(setPaper).catch(() => {});
    getReaderFontScale().then(setFontScale).catch(() => {});
  }, []);

  function togglePaper() {
    setPaper((v) => {
      void setReaderPaper(!v);
      return !v;
    });
  }

  // ===== نداء التركيز التفاعلي =====
  function hideCheckInLater(ms: number) {
    if (checkInTimer.current) clearTimeout(checkInTimer.current);
    checkInTimer.current = setTimeout(() => setCheckIn(null), ms);
  }

  /** يعيد التشغيل من جملة معيّنة في الصفحة الحالية */
  function restartAt(idx: number) {
    stop();
    setEverPlayed(true);
    playingRef.current = true;
    setSpeaking(true);
    playStartRef.current = Date.now();
    playFromPage(livePageRef.current, Math.max(0, idx), false);
  }

  function checkInWith() {
    const name = focusNameRef.current;
    setCheckIn({ phase: "done", title: name ? t("reader.check.great", { name }) : t("reader.check.greatNoName") });
    hideCheckInLater(1800);
  }

  function checkInRepeat() {
    const back = Math.max(0, liveSentRef.current - Math.max(1, focusEveryRef.current));
    setCheckIn({ phase: "done", title: t("reader.check.repeating") });
    hideCheckInLater(1800);
    restartAt(back);
  }

  async function checkInExplain() {
    if (checkInTimer.current) clearTimeout(checkInTimer.current);
    const at = Math.max(0, liveSentRef.current);
    explainAtRef.current = at;
    const from = Math.max(0, at - Math.max(1, focusEveryRef.current));
    const passage = sentences.slice(from, at + 1).join(" ");
    stop();
    setCheckIn({ phase: "explaining", title: t("reader.check.explaining") });
    try {
      const out = await aiAssist(
        "ask",
        passage,
        "اشرح هذه الفقرة بأبسط عبارة ممكنة في جملتين أو ثلاث، مع مثال من الحياة اليومية. خاطب القارئ بصيغة محايدة.",
        textLang(passage) ?? voiceLangOf(pickVoice())
      );
      const body = out.trim() || t("reader.ai.noResult");
      setCheckIn({ phase: "explained", title: t("reader.check.explainedTitle"), body });
      speakText(body, {
        voiceId: pickVoice(),
        rate: rateRef.current,
        onDone: () => {
          setCheckIn(null);
          restartAt(at + 1);
        },
        onError: () => {},
      });
    } catch {
      setCheckIn({ phase: "explained", title: t("reader.check.explainedTitle"), body: t("reader.ai.requestFailed") });
    }
  }

  function checkInBack() {
    stopSpeaking();
    setCheckIn(null);
    restartAt(explainAtRef.current + 1);
  }

  // ===== الأوامر الصوتية (رد نداء التركيز + وضع المشي) =====
  const speechLang = lang === "en" || lang === "fr" ? lang : "ar";

  /** «بطاقة»: يحوّل الجملة المسموعة الآن (مع سابقتها) إلى بطاقة مراجعة */
  async function saveSentenceCard() {
    const i = Math.max(0, liveSentRef.current);
    const ctx = sentences.slice(Math.max(0, i - 1), i + 1).join(" ");
    if (!ctx.trim()) return;
    showToast(t("reader.walk.cardMaking"));
    try {
      const cards = await generateFlashcards(ctx, 1);
      const bookTitle = typeof title === "string" ? title : undefined;
      const n = await addCards(cards.slice(0, 1).map((c) => ({ ...c, bookId, bookTitle })));
      showToast(n ? t("reader.walk.cardSaved") : t("reader.ai.cardsFailed"));
    } catch {
      showToast(t("reader.ai.requestFailed"));
    }
  }

  function runVoiceCommand(cmd: WalkCommand | null) {
    switch (cmd) {
      case "with":
        return checkInWith();
      case "repeat":
        return checkInRepeat();
      case "explain":
        return void checkInExplain();
      case "card":
        return void saveSentenceCard();
      case "pause":
        if (playingRef.current) togglePlay();
        return;
      case "resume":
        if (!playingRef.current) togglePlay();
        return;
    }
  }

  // رد نداء التركيز بالصوت: ضغطة مطوّلة على الميكروفون في البطاقة
  const replyDict = useDictation({
    lang: speechLang,
    onEnd: (text) => runVoiceCommand(parseWalkCommand(text)),
  });

  // وضع المشي: استماع مستمر مع إلغاء صدى صوت القراءة
  const walkDict = useDictation({
    lang: speechLang,
    continuous: true,
    echoCancel: true,
    restoreAudio: false,
    hints: ["إعادة", "شرح", "بطاقة", "وقّف", "كمّل", "معك", "repeat", "explain", "card", "pause", "continue"],
    onText: (tx) => {
      const fresh = tx.slice(walkHandledRef.current);
      const cmd = parseWalkCommand(fresh);
      if (!cmd) return;
      walkHandledRef.current = tx.length;
      setWalkHeard(fresh.trim());
      runVoiceCommand(cmd);
    },
    onEnd: () => {
      // آبل تنهي الجلسة المستمرة بعد مدة — نعيد الاستماع ما دام الوضع مفعّلًا
      walkHandledRef.current = 0;
      if (!walkModeRef.current) return;
      walkQuickFailsRef.current = Date.now() - walkStartAtRef.current < 1500 ? walkQuickFailsRef.current + 1 : 0;
      if (walkQuickFailsRef.current >= 3) {
        // الميكروفون لا يعمل → نوقف الوضع بدل حلقة إعادة لا تنتهي
        walkModeRef.current = false;
        setWalkMode(false);
        void setRecordingAudioMode(false);
        showToast(t("reader.walk.failed"));
        return;
      }
      setTimeout(() => {
        if (!walkModeRef.current) return;
        walkStartAtRef.current = Date.now();
        void walkDict.start();
      }, 250);
    },
  });

  async function toggleWalk() {
    const next = !walkModeRef.current;
    walkModeRef.current = next;
    setWalkMode(next);
    setWalkHeard("");
    walkHandledRef.current = 0;
    if (next) {
      await setRecordingAudioMode(true);
      walkQuickFailsRef.current = 0;
      walkStartAtRef.current = Date.now();
      const ok = await walkDict.start();
      if (!ok) {
        walkModeRef.current = false;
        setWalkMode(false);
        await setRecordingAudioMode(false);
        showToast(t("va.denied"));
        return;
      }
      showToast(t("reader.walk.on"));
    } else {
      walkDict.cancel();
      await setRecordingAudioMode(false);
    }
  }

  // إغلاق القارئ يوقف الاستماع ويعيد وضع الصوت
  useEffect(
    () => () => {
      if (walkModeRef.current) {
        walkModeRef.current = false;
        walkDict.cancel();
        void setRecordingAudioMode(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // وضع التركيز: حمّل الاسم ودرجة المناداة
  useEffect(() => {
    (async () => {
      const [level, name] = await Promise.all([getFocusLevel(), getSpokenName()]);
      focusEveryRef.current = focusEvery(level);
      focusNameRef.current = focusEveryRef.current > 0 ? name.trim() : "";
    })();
  }, []);

  // يتخطّى الترويسة المتكرّرة (نفس بداية الصفحة السابقة) فتُقرأ مرة واحدة
  // يجهّز مقاطع الصفحة للقراءة/العرض (مرة واحدة لكل صفحة) مع معالجة الترويسة المتكرّرة:
  // عنوان الوحدة ورقم الصفحة يُقرآن أول مرة فقط، ثم يُحذفان من الصفحات التالية للوحدة.
  // precise: نص التشكيل/الممسوح ضوئيًا (كان يتجاوز معالجة الترويسة فتُقرأ في كل صفحة)
  function getReadingSentences(pageText: string, p: number, precise = false): string[] {
    const key = precise ? -p : p; // كاش منفصل لنص التشكيل (نفس الصفحة، نص مختلف)
    const cached = processedRef.current.get(key);
    if (cached) return cached;
    const { chunks, headerLines } = splitForReading(pageText, {
      seenHeaders: seenHeadersRef.current,
      page: p,
    });
    headerLines.forEach((h) => seenHeadersRef.current.add(h));
    processedRef.current.set(key, chunks);
    return chunks;
  }

  /**
   * مطابقة الصوت للغة نص الكتاب (عربي ↔ إنجليزي) قبل نطق أول جملة.
   * تُستدعى عند وصول نص الصفحة؛ تتوقّف متى اختار المستخدم صوتًا بنفسه.
   */
  // آخر قارئة لكل لغة: صفحة إنجليزية عابرة ثم الرجوع للعربي يعيد **نفس** القارئة العربية
  // (كان يرجع لأول صوت عربي في القائمة، فتبدو القارئة «تغيّرت» فجأة)
  const voiceByLangRef = useRef(new Map<string, string>());
  function matchVoiceToText(sample: string) {
    if (voiceChosenRef.current || listenArabicRef.current) return;
    const wanted = textLang(sample);
    const curLang = voiceLangOf(voiceIdRef.current);
    if (!wanted || curLang === wanted) return;
    voiceByLangRef.current.set(curLang, voiceIdRef.current);
    const remembered = voiceByLangRef.current.get(wanted);
    const match = remembered ?? VOICE_CATALOG.find((v) => (v.lang ?? "ar") === wanted)?.voiceId;
    if (!match) return;
    voiceIdRef.current = match;
    setVoiceId(match);
    setVoiceLang(wanted);
  }

  // الصوت المستخدم للقراءة: عند الترجمة نستخدم الصوت العربي المختار في لوحة الترجمة
  function pickVoice(): string {
    // نقرأ من المرجع لا من الحالة: عند تبديل الصوت نبدأ التشغيل فورًا في نفس
    // النبضة، وقيمة الحالة لا تكون قد طُبّقت بعد فيُقرأ بالصوت القديم.
    return listenArabicRef.current ? translateVoiceIdRef.current : voiceIdRef.current;
  }

  /**
   * اختيار قارئ من القائمة: نطبّقه ونبدأ الاستماع فورًا بصوته — بلا ضغطة
   * إضافية على زر التشغيل. إن كان السرد شغّالًا نُكمل من نفس الجملة.
   */
  function chooseVoice(newVoiceId: string) {
    voiceIdRef.current = newVoiceId;
    voiceChosenRef.current = true; // اختيار صريح → لا نبدّله تلقائيًا بعد الآن
    setVoiceId(newVoiceId);
    setVoiceModal(false);
    restartReading();
  }

  /** طريقة القراءة (عادية/هادئة/…): تُحفظ للمرات القادمة ونعيد القراءة بها فورًا من نفس الجملة */
  function chooseReadStyle(style: ReadStyle) {
    setReadStyle(style);
    setReadStyleState(style);
    setVoiceModal(false);
    restartReading();
  }

  function restartReading() {
    const resumeAt = playingRef.current ? Math.max(0, activeSentence) : resumeIdxRef.current;
    stop();
    setVoiceWarn("");
    setStatus("");
    setEverPlayed(true);
    playingRef.current = true;
    setSpeaking(true);
    playStartRef.current = Date.now();
    recordActivity({});
    playFromPage(page, resumeAt, false);
    resumeIdxRef.current = 0;
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

  // يشكّل نص الصفحة لنطق صحيح — وللصفحات الممسوحة (OCR) يصحّح أخطاء المسح
  // أيضًا. الناتج مخزّن دائمًا في page_cache (تكلفة مرة واحدة لكل صفحة).
  async function tashkeelPage(p: number, text: string, ocr = false): Promise<string> {
    if (tashkeelCacheRef.current.has(p)) return tashkeelCacheRef.current.get(p)!;
    const out = await getPreciseText(pdfPath, p, text, ocr);
    tashkeelCacheRef.current.set(p, out);
    return out;
  }

  // يترجم نص الصفحة إلى العربية (مع تخزين مؤقت)
  // يترجم نص الصفحة إلى لغة الواجهة (إنجليزي/فرنسي/عربي) ويخزّنه للجلسة.
  async function translatePage(p: number, text: string): Promise<string> {
    const cacheKey = `${uiVoiceLang}:${p}`;
    if (arTransRef.current.has(cacheKey)) return arTransRef.current.get(cacheKey)!;
    try {
      const tr = (await aiAssist("translate", text, undefined, uiVoiceLang)).trim();
      const out = tr || text;
      arTransRef.current.set(cacheKey, out);
      return out;
    } catch {
      return text;
    }
  }

  // يحضّر تشكيل/ترجمة الصفحة **التالية** في الخلفية أثناء قراءة الحالية،
  // فيصبح الانتقال للصفحة التالية فوريًا بلا انتظار (يعالج بطء التحميل).
  async function warmProcessedPage(p: number) {
    if (!pdfPath || p < 1) return;
    try {
      if (listenArabicRef.current) {
        if (arTransRef.current.has(`${uiVoiceLang}:${p}`)) return;
      } else if (tashkeelCacheRef.current.has(p)) {
        return;
      }
      const res = await extractPdfPageText(pdfPath, p);
      if (!res.text.trim()) return;
      if (listenArabicRef.current) await translatePage(res.page, res.text);
      // الصفحات الممسوحة (OCR) تمرّ على المسار الدقيق تلقائيًا حتى بلا تفعيل يدوي
      else if (tashkeelRef.current || res.ocr) await tashkeelPage(res.page, res.text, !!res.ocr);
    } catch {
      // التحضير المسبق اختياري — لا يزعج القراءة عند فشله
    }
  }

  // يقرأ صفحة جملة-بجملة، وعند انتهائها ينتقل تلقائيًا للتالية.
  // announce: يذكر رقم الصفحة مرة واحدة (عند بدء القراءة/الانتقال اليدوي فقط)
  // auto: انتقال تلقائي من نهاية الصفحة السابقة (القراءة مستمرة) — لا نقطعه ببوّابة
  async function playFromPage(p: number, startIdx = 0, announce = false, auto = false) {
    if (!pdfPath) return;

    // بيانات شاشة القفل (اسم الكتاب + الصوت) — تظهر مثل البودكاست عند القراءة والجوال مقفل
    setNowPlaying({
      title: typeof title === "string" && title.trim() ? title : "VoiceStudyFlow",
      artist: VOICE_CATALOG.find((v) => v.voiceId === pickVoice())?.name ?? "",
    });

    // بوّابة التحميل: بعد صفحتين مجانيتين، شجّعي تحميل الكتاب كامل قبل المتابعة
    const seen = sessionPagesRef.current;
    if (
      !auto &&
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
      const res = pageTextCacheRef.current.get(p) ?? (await extractPdfPageText(pdfPath, p));
      pageTextCacheRef.current.set(p, res);
      if (res.totalPages) setTotalPages(res.totalPages);
      setPage(res.page);

      // الصفحات الممسوحة (OCR) تمرّ تلقائيًا على المسار الدقيق (تصحيح + تشكيل)
      // حتى بلا تفعيل يدوي — نص الـOCR الخام فيه أخطاء مسح تُقرأ غلط.
      const precise = tashkeelRef.current || !!res.ocr;
      let pageText = res.text;
      if (listenArabicRef.current && pageText.trim()) {
        pageText = await translatePage(res.page, pageText);
      } else if (precise && pageText.trim()) {
        if (!tashkeelRef.current && !tashkeelCacheRef.current.has(res.page)) {
          setStatus(`جارٍ تحسين نص الصفحة ${res.page} الممسوحة…`);
        }
        pageText = await tashkeelPage(res.page, pageText, !!res.ocr);
      }
      if (!playingRef.current) return;
      // الترجمة/التشكيل تغيّر النص → تقسيم بسيط؛ وإلا معالجة الترويسة (عنوان+صفحة مرة واحدة)
      const sents = listenArabicRef.current
        ? splitSentences(pageText)
        : getReadingSentences(pageText, res.page, precise);
      setSentences(sents);
      offsetsRef.current = [];
      matchVoiceToText(sents.slice(0, 8).join(" "));

      if (!playingRef.current) return; // أُوقف أثناء التحميل

      if (sents.length === 0) {
        // صفحة بدون نص (قد تكون صورة ممسوحة) → جرّب التالية أو أوقف
        if (res.page < res.totalPages) {
          setStatus(`الصفحة ${res.page} بدون نص — أتنقّل للتالية…`);
          return playFromPage(res.page + 1, 0, false, true);
        }
        setStatus("لا يوجد نص قابل للقراءة في هذا الكتاب.");
        stop();
        return;
      }

      setBusy(false);
      setStatus("");
      // حضّر الصفحة التالية (تشكيل/ترجمة) في الخلفية لانتقال فوري لاحقًا
      if (listenArabicRef.current || precise) {
        void warmProcessedPage(res.page + 1);
      }
      const start = Math.min(Math.max(0, startIdx), sents.length - 1);
      if (announce && start === 0) {
        // أعلن رقم الصفحة مرة واحدة (بلغة الواجهة) ثم اقرأ المحتوى
        speakText(t("reader.speak.page", { page: res.page }), {
          voiceId: pickVoice(),
          rate: rateRef.current,
          onDone: () => playSentence(sents, 0, res.page, res.totalPages),
          onError: () => playSentence(sents, 0, res.page, res.totalPages),
        });
      } else {
        playSentence(sents, start, res.page, res.totalPages);
      }
    } catch (e: any) {
      // أثناء القراءة المتواصلة: محاولة ثانية بعد لحظة (الشبكة قد تتقطّع والجوال مقفل)
      if (auto && playingRef.current && !pageRetryRef.current.has(p)) {
        pageRetryRef.current.add(p);
        setTimeout(() => playingRef.current && playFromPage(p, startIdx, false, true), 1500);
        return;
      }
      setBusy(false);
      setStatus(`تعذّر تحميل النص: ${e?.message ?? "تحقّقي من الاتصال"}`);
      stop();
    }
  }

  // يجهّز الصفحة التالية كاملة أثناء قراءة الحالية: النص، والتشكيل/الترجمة إن لزم،
  // وصوت أول جملتين — فتبدأ فور انتهاء الحالية بلا فجوة. ويجلب نص الصفحة التي بعدها.
  /* ---------- صوت الصفحات القادمة محفوظ مسبقًا على الجهاز ----------
   * تلقائيًا أثناء القراءة: صوت الصفحات القادمة يُولَّد ويُحفظ قبل الوصول لها، فلا انتظار
   * ولا اعتماد على الإنترنت لحظة القراءة (كان يطول عند ضعف الشبكة/ضغط جوجل).
   * واختياريًا «حفظ صوت الكتاب كاملًا» مع حفظ الكتاب. كل صفحة تُحسب مرة من حصة الشهر،
   * لذلك التجربة المجانية تجهّز صفحتين فقط. عامل واحد في كل مرة (رمز للإلغاء). */
  const aheadRef = useRef<{ token: number; to: number; whole: boolean; running: boolean }>({ token: 0, to: 0, whole: false, running: false });
  const aheadPagesRef = useRef(2);
  // حفظ صوت الكتاب كاملًا (زر مستقل): التقدّم يظهر على الزر، والضغط أثناءه يوقفه
  const [audioSave, setAudioSave] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    getPlan()
      .then((pl) => (aheadPagesRef.current = pl === "free" ? 2 : 10))
      .catch(() => {});
  }, []);

  async function saveAudioOfPage(p: number, token: number): Promise<void> {
    const res = pageTextCacheRef.current.get(p) ?? (await extractPdfPageText(pdfPath, p));
    pageTextCacheRef.current.set(p, res);
    if (!res.text.trim()) return;
    const precise = tashkeelRef.current || !!res.ocr;
    let txt = res.text;
    if (listenArabicRef.current) txt = await translatePage(res.page, txt);
    else if (precise) txt = await tashkeelPage(res.page, txt, !!res.ocr);
    const sents = listenArabicRef.current ? splitSentences(txt) : getReadingSentences(txt, res.page, precise);
    const pageRef = { book: pdfPath, page: res.page };
    // جملتان معًا: أسرع من القراءة بكثير، بلا ضغط زائد على السيرفر
    for (let i = 0; i < sents.length; i += 2) {
      if (aheadRef.current.token !== token) return;
      await Promise.all(sents.slice(i, i + 2).map((x) => prefetchText(x, { voiceId: pickVoice(), page: pageRef })));
    }
  }

  function saveAudioAhead(from: number, to: number, whole = false, onPage?: (done: number, total: number) => void) {
    if (!pdfPath || from < 1) return;
    const cur = aheadRef.current;
    // عامل يعمل ويغطّي المطلوب (أو حفظ الكتاب كاملًا) → لا نقطعه
    if (cur.running && (cur.whole || cur.to >= to) && !whole) return;
    const token = cur.token + 1;
    aheadRef.current = { token, to, whole, running: true };
    void (async () => {
      const total = Math.max(0, to - from + 1);
      for (let p = from; p <= to; p++) {
        if (aheadRef.current.token !== token) return;
        try {
          await saveAudioOfPage(p, token);
        } catch {
          // صفحة تعذّرت (شبكة/حصة) → نكمل التالية؛ ستُولَّد وقت القراءة
        }
        onPage?.(p - from + 1, total);
      }
      if (aheadRef.current.token === token) aheadRef.current = { ...aheadRef.current, running: false };
    })();
  }

  function stopAudioAhead() {
    aheadRef.current = { token: aheadRef.current.token + 1, to: 0, whole: false, running: false };
  }
  // الخروج من الكتاب يوقف التجهيز (ما حُفظ يبقى على الجهاز)
  useEffect(() => () => stopAudioAhead(), []);

  async function prepareNextPage(p: number) {
    if (!pdfPath || p < 1) return;
    try {
      const res = pageTextCacheRef.current.get(p) ?? (await extractPdfPageText(pdfPath, p));
      pageTextCacheRef.current.set(p, res);
      if (!res.text.trim()) return;
      const precise = tashkeelRef.current || !!res.ocr;
      let txt = res.text;
      if (listenArabicRef.current) txt = await translatePage(res.page, txt);
      else if (precise) txt = await tashkeelPage(res.page, txt, !!res.ocr);
      const sents = listenArabicRef.current ? splitSentences(txt) : getReadingSentences(txt, res.page, precise);
      const vId = pickVoice();
      const pageRef = { book: pdfPath, page: res.page };
      for (const s of sents.slice(0, 2)) await prefetchText(s, { voiceId: vId, page: pageRef });
      if (!pageTextCacheRef.current.has(p + 1)) {
        extractPdfPageText(pdfPath, p + 1)
          .then((r) => pageTextCacheRef.current.set(p + 1, r))
          .catch(() => {});
      }
    } catch {
      // التحضير المسبق اختياري
    }
  }

  /**
   * أنهى المستخدم الكتاب. يسجّل الإنجاز على السيرفر، وإن كان أول كتاب يُنهيه
   * يعرض نافذة المكافأة. المكافأة تُمنح داخل markBookCompleted بلا أي شرط —
   * طلب التقييم يأتي لاحقًا ومنفصلًا عند إغلاق النافذة.
   */
  async function onBookFinished() {
    if (finishedRef.current) return; // مرة واحدة لكل جلسة قراءة
    finishedRef.current = true;

    recordBookCompleted(); // الإحصائية المحلية (السلسلة والعدّاد)
    const { justUnlocked } = await markBookCompleted(bookId);
    if (justUnlocked) setUnlockOpen(true);
  }

  // يقرأ جملة واحدة ثم ينتقل للتالية (أو للصفحة التالية)
  /** fromWord: يبدأ من كلمة معيّنة داخل الجملة (النقر على كلمة في منتصفها) — للجملة الأولى فقط */
  function playSentence(sents: string[], i: number, p: number, total: number, fromWord = 0) {
    if (!playingRef.current) return;

    if (i >= sents.length) {
      recordActivity({ pages: 1 }); // أنهى صفحة
      if (p < total) {
        holdAudioSession(true); // يُبقي الجلسة حيّة حتى تبدأ الصفحة التالية (الجوال مقفل)
        playFromPage(p + 1, 0, false, true);
      } else {
        void onBookFinished(); // أنهى الكتاب → يسجّل الإنجاز ويفتح المكافأة
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
      // صفحة الكتاب لهذه الجمل → تُحسب من حصة الصفحات (مرة واحدة في الشهر) لا بالأحرف
      const pageRef = pdfPath ? { book: pdfPath, page: p } : undefined;
      // المقطع التالي: نحمّل مشغّله مسبقًا (warm) ليبدأ فورًا بلا فجوة بين المقاطع
      if (i + 1 < sents.length) warmNext(sents[i + 1], { voiceId: vId, page: pageRef });
      if (i + 2 < sents.length) prefetchText(sents[i + 2], { voiceId: vId, page: pageRef });
      // أول الصفحة: صوت الصفحات القادمة يُحفظ على الجهاز مسبقًا (١٠ للمشترك، ٢ للتجربة)
      if (i === 0 && p < total) saveAudioAhead(p + 1, Math.min(total, p + aheadPagesRef.current));
      // قرب نهاية الصفحة: جهّز نص الصفحة التالية مسبقًا لتنقّل سلس
      if (i === Math.max(0, sents.length - 3) && p < total) {
        void prepareNextPage(p + 1);
      }
      // لموضع العدسة: كم مقطعًا/كلمات قبل هذا المقطع وإجماليها
      let wordsBefore = 0;
      for (let k = 0; k < i; k++) wordsBefore += (sents[k].match(/\S+/g) || []).length;
      const curWordList = sents[i].match(/\S+/g) || [];
      const curWords = curWordList.length || 1;
      const totalWords = sents.reduce((a, s) => a + (s.match(/\S+/g) || []).length, 0) || 1;
      // البدء من منتصف الجملة: نقرأ من الكلمة المختارة إلى آخرها، والتظليل يبقى على مواضعه الصحيحة
      const fw = fromWord > 0 && fromWord < curWordList.length ? fromWord : 0;
      const spokenText = fw > 0 ? curWordList.slice(fw).join(" ") : sents[i];
      speakText(spokenText, {
        voiceId: pickVoice(),
        page: pageRef,
        rate: rateRef.current,
        // هايلايت كلمة-بكلمة: التقدّم من توقيت ElevenLabs الحقيقي → الكلمة المنطوقة
        onProgress: (frac) => {
          // frac الآن دقيق (من توقيت الحروف الحقيقي بعد محاذاته بالنص المعروض)
          setActiveWord(fw + wordIndexAtFraction(spokenText, frac));
          // تقدّم القراءة (لتظليل الكلمة على الـPDF/العدسة) — في وضع PDF أو العدسة فقط
          if (pdfFollowRef.current) {
            setReadProgress(Math.min(1, Math.max(0, (wordsBefore + fw + frac * (curWords - fw)) / totalWords)));
          }
        },
        onDone: () => {
          setActiveWord(-1);
          playSentence(sents, i + 1, p, total);
        },
        // الصوت يتأخر (شبكة ضعيفة) → مؤشر واضح بدل الصمت، والمحاولة تتكرر تلقائيًا بنفس الصوت
        onWaiting: (w) => setVoiceWarn(w ? t("reader.voice.preparing") : ""),
        onError: (e) => {
          const msg = (e as any)?.message ?? "";
          setVoiceWarn("");
          if (msg === "USER_QUOTA") {
            setStatus(""); // شاشة الاشتراك ظهرت
          } else if (msg === "QUOTA") {
            setStatus(t("reader.voice.quota"));
          } else {
            setStatus(t("reader.voice.unavailable"));
          }
          resumeIdxRef.current = i; // زر التشغيل يستأنف من نفس الجملة التي تعذّرت
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
        `نكمل يا ${name}؟`,
        `رائع يا ${name}، نكمل.`,
      ];
      const phrase = phrases[Math.floor(focusCountRef.current / every) % phrases.length];
      setCheckIn({ phase: "ask", title: phrase });
      hideCheckInLater(20000); // وقت كافٍ للرد بلمسة دون إيقاف القراءة
      speakText(phrase, { voiceId: pickVoice(), rate: rateRef.current, onDone: speakCurrent, onError: speakCurrent });
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
  // رقم الصفحة المطبوع للصفحة p (أو null إن لم يُعرف الترقيم أو كانت قبل بدايته)
  function printedOf(p: number): number | null {
    if (pageOffset == null) return null;
    const n = p - pageOffset;
    return n > 0 ? n : null;
  }

  function openGoto() {
    setGotoMode(pageOffset != null ? "book" : "file");
    setGotoValue(String(printedOf(page) ?? page));
    setGotoOpen(true);
  }

  function submitGoto() {
    const n = toPageNum(gotoValue);
    if (n <= 0) return;
    gotoPage(gotoMode === "book" && pageOffset != null ? n + pageOffset : n);
  }

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

  // تقليب الصفحات بالسحب: الصفحة تتبع الإصبع، والمجاورة تظهر من الطرف، وعند الإفلات
  // تكتمل الحركة بنابض يحفظ سرعة الإصبع (أو ترجع لمكانها). أثناء القراءة يكمل القارئ من الصفحة الجديدة.
  const { width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pagerCtl = useRef({ arabic: false, playing: false, canPrev: false, canNext: false, commit: (_d: number) => {} });
  const pagerResetRef = useRef(false); // الصفحة الجديدة ستُرسم → نعيد الإزاحة بعد رسمها (بلا وميض)
  const pager = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4 && pdfZoomRef.current <= 1.05 && !lensOpenRef.current,
      onPanResponderGrant: () => pagerX.stopAnimation(),
      onPanResponderMove: (_e, g) => {
        const c = pagerCtl.current;
        const wantsNext = c.arabic ? g.dx > 0 : g.dx < 0;
        const allowed = wantsNext ? c.canNext : c.canPrev;
        // عند أول/آخر صفحة: مقاومة مطاطية بدل التوقف المفاجئ
        pagerX.setValue(allowed ? g.dx : g.dx * 0.25);
      },
      onPanResponderRelease: (_e, g) => {
        const c = pagerCtl.current;
        const wantsNext = c.arabic ? g.dx > 0 : g.dx < 0;
        const allowed = wantsNext ? c.canNext : c.canPrev;
        // تقليب بمسافة كافية أو بحركة سريعة قصيرة (نفض)
        const far = Math.abs(g.dx) > screenW * 0.2 || (Math.abs(g.vx) > 0.35 && Math.abs(g.dx) > 24);
        if (!allowed || !far) {
          Animated.spring(pagerX, { toValue: 0, velocity: g.vx, useNativeDriver: true, stiffness: 320, damping: 30, mass: 0.9 }).start();
          return;
        }
        Animated.spring(pagerX, {
          toValue: Math.sign(g.dx) * screenW,
          velocity: g.vx,
          useNativeDriver: true,
          stiffness: 260,
          damping: 32,
          mass: 0.9,
          overshootClamping: true,
          restDisplacementThreshold: 2,
          restSpeedThreshold: 6,
        }).start(() => {
          pagerResetRef.current = true;
          pagerCtl.current.commit(wantsNext ? 1 : -1);
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(pagerX, { toValue: 0, useNativeDriver: true, stiffness: 320, damping: 30 }).start();
      },
    })
  ).current;
  // بعد رسم الصفحة الجديدة نعيدها لمكانها في نفس الإطار → انتقال متصل بلا رجوع للصفحة القديمة
  useLayoutEffect(() => {
    if (!pagerResetRef.current) return;
    pagerResetRef.current = false;
    pagerX.setValue(0);
  }, [page, pageImg, pagerX]);

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
    // أوقفها المستخدم من شاشة القفل/الجزيرة ثم رجع للتطبيق → الزر يكمل بدل أن يوقف
    if ((speaking || playingRef.current) && resumeIfPausedExternally()) return;
    // حماية: الزر يُظهر «تشغيل» بينما صوت يُقرأ فعلًا (عدم تطابق) → ضغطة واحدة توقفه
    if (!speaking && (playingRef.current || isNarrating())) {
      resumeIdxRef.current = Math.max(0, activeSentence);
      stop();
      setStatus("");
      return;
    }
    if (speaking) {
      // احفظ الموضع الحالي عند الإيقاف ليُستأنف من نفس الجملة (لا من البداية)
      resumeIdxRef.current = Math.max(0, activeSentence);
      stop();
      setStatus("");
      return;
    }
    setStatus("");
    setVoiceWarn("");
    setEverPlayed(true); // أول تشغيل → توقف نبضة الزر
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
    setAiCards(null);
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

  // ترجمة نص الصفحة إلى لغة يختارها المستخدم (بدل لغة الواجهة تلقائيًا)
  async function runTranslate(lang: string) {
    setAiBusy(true);
    setAiResult("");
    setAiCards(null);
    try {
      const text = await ensurePageText();
      if (!text.trim()) {
        setAiResult(t("reader.ai.noPageText"));
        return;
      }
      const out = await aiAssist("translate", text, undefined, lang);
      setAiResult(out || t("reader.ai.noResult"));
    } catch {
      setAiResult(t("reader.ai.requestFailed"));
    } finally {
      setAiBusy(false);
    }
  }

  function openTranslatePicker() {
    Alert.alert(t("reader.ai.translateTo"), undefined, [
      ...TRANSLATE_LANGS.map((l) => ({ text: l.label, onPress: () => runTranslate(l.code) })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }

  // اختيار نوع البطاقات قبل التوليد (الصور التوضيحية تُضاف لمعاني الكلمات فقط)
  function pickCardType() {
    Alert.alert(t("cards.type.title"), undefined, [
      ...CARD_TYPES.map((ct) => ({ text: t(`cards.type.${ct}`), onPress: () => void makeFlashcards(ct) })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }

  async function makeFlashcards(cardType: CardType = "qa") {
    setAiOpen(true);
    setAiBusy(true);
    setAiResult("");
    setAiCards(null);
    try {
      const text = await ensurePageText();
      if (!text.trim()) {
        setAiResult(t("reader.ai.noPageText"));
        return;
      }
      const cards = await generateFlashcards(text, undefined, cardType);
      if (cards.length === 0) {
        setAiResult(t("reader.ai.cardsFailed"));
        return;
      }
      const bookTitle = typeof title === "string" ? title : undefined;
      const n = await addCards(cards.map((c) => ({ ...c, bookId, bookTitle, kind: cardType })));
      setAiCards(cards);
      setAiResult(t("reader.ai.cardsSaved", { count: n }));
    } catch {
      setAiResult(t("reader.ai.requestFailed"));
    } finally {
      setAiBusy(false);
    }
  }

  // لمس كلمة → عرض معناها حسب سياقها
  // يبدأ القراءة من جملة محددة في الصفحة الحالية
  function readFromSentence(i: number, fromWord = 0) {
    stop();
    setActiveSentence(i);
    setStatus("");
    playingRef.current = true;
    setSpeaking(true);
    playStartRef.current = Date.now();
    recordActivity({});
    playSentence(sentences, i, page, totalPages || sentences.length, fromWord);
  }

  // كلمة: ضغطة = معنى/تحديد، ضغطتان سريعتان = اقرأ من هنا
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onWordPress(i: number, tok: string, s: string, wordIdx = 0) {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      readFromSentence(i, wordIdx); // ضغطتان → القراءة من هذه الكلمة بالضبط
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      if (highlightMode) onSentenceLongPress(s);
      else onWordTap(tok, s); // ضغطة واحدة → المعنى
    }, 280);
  }

  /** ضغطة مطوّلة على كلمة: تُحفظ في «كلماتي» ويجهّز الذكاء معناها ومرادفاتها وأضدادها وأمثلتها */
  async function saveToMyWords(rawWord: string, context: string) {
    const w = await addWord({
      word: rawWord,
      context,
      bookId,
      bookTitle: typeof title === "string" ? title : undefined,
      page: livePageRef.current,
    });
    if (!w) return;
    setDictOpen(false);
    setWordSheet(w);
  }

  // ضغطتان على صورة الصفحة → القراءة من الجملة تحت الإصبع (مثل عرض النص)
  const pageTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  function onPageTap(locX: number, locY: number) {
    const now = Date.now();
    const prev = pageTapRef.current;
    if (prev && now - prev.t < 320 && Math.abs(prev.x - locX) < 30 && Math.abs(prev.y - locY) < 30) {
      pageTapRef.current = null;
      const at = wordAtPoint(locX, locY);
      if (at) readFromSentence(at.sentence, at.word);
      return;
    }
    pageTapRef.current = { t: now, x: locX, y: locY };
  }
  /**
   * أي كلمة تحت الإصبع بالضبط؟ من مواضع كلمات الصفحة ومحاذاتها مع الكلمات المنطوقة:
   * يُرجع رقم الجملة ورقم الكلمة داخلها، فتبدأ القراءة من الكلمة نفسها حتى لو في منتصف الجملة.
   * (كان يُبحث عن الجملة من مستطيلاتها فقط، فبعض الجمل لا يمكن الوصول إليها، والبدء دائمًا من أولها)
   */
  function wordAtPoint(locX: number, locY: number): { sentence: number; word: number } | null {
    if (!pdfImgW2 || !sentences.length) return null;
    const H = pdfImgW2 / (pageImgAspect || 0.7);
    const x = locX / pdfImgW2;
    const y = locY / H;
    const { map, starts } = hl;
    if (pageWords.length && map.length) {
      // أقرب صندوق كلمة للإصبع (المسافة العمودية أهم: نفس السطر أولًا)
      let bi = -1;
      let bd = Infinity;
      pageWords.forEach((b, idx) => {
        const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0;
        const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - (b.y + b.h) : 0;
        const d = dy * 2 + dx;
        if (d < bd) {
          bd = d;
          bi = idx;
        }
      });
      if (bi >= 0 && bd < 0.06) {
        // الكلمات المنطوقة المرتبطة بهذا الصندوق (قد يحوي الصندوق عبارة كاملة)
        let ks: number[] = [];
        map.forEach((m, k) => m === bi && ks.push(k));
        if (!ks.length) {
          // صندوق بلا مقابل منطوق (عنوان/رقم) → أقرب كلمة منطوقة بعده في الصفحة
          let best = -1;
          let bestGap = Infinity;
          map.forEach((m, k) => {
            const gap = m >= bi ? m - bi : (bi - m) * 3;
            if (gap < bestGap) {
              bestGap = gap;
              best = k;
            }
          });
          ks = best >= 0 ? [best] : [];
        }
        if (ks.length) {
          let k = ks[0];
          if (ks.length > 1) {
            const b = pageWords[bi];
            const frac = Math.min(1, Math.max(0, (x - b.x) / Math.max(b.w, 1e-6)));
            const pos = isArabicText ? 1 - frac : frac; // العربي من اليمين
            k = ks[Math.min(ks.length - 1, Math.floor(pos * ks.length))];
          }
          // الجملة: آخر جملة (لها كلمات) تبدأ قبل هذه الكلمة أو عندها
          let si = 0;
          for (let j = 0; j < starts.length; j++) {
            const len = (sentences[j]?.match(/\S+/g) || []).length;
            if (starts[j] <= k && len > 0) si = j;
          }
          return { sentence: si, word: Math.max(0, k - starts[si]) };
        }
      }
    }
    // بلا مواضع كلمات موثوقة: الجملة الأقرب (من أولها)
    const si = sentenceAtPoint(locX, locY);
    return si >= 0 ? { sentence: si, word: 0 } : null;
  }

  /** أي جملة تحت النقطة؟ من مستطيلات الجمل، وإلا أقرب جملة عموديًا */
  function sentenceAtPoint(locX: number, locY: number): number {
    if (!pdfImgW2 || !sentences.length) return -1;
    const H = pdfImgW2 / (pageImgAspect || 0.7);
    const x = locX / pdfImgW2;
    const y = locY / H;
    let best = -1;
    let bestD = Infinity;
    hl.rects.forEach((rs, si) => {
      for (const r of rs ?? []) {
        const inX = x >= r.x - 0.01 && x <= r.x + r.w + 0.01;
        const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
        const d = (inX ? 0 : 0.05) + dy;
        if (d < bestD) {
          bestD = d;
          best = si;
        }
      }
    });
    if (best >= 0 && bestD < 0.06) return best;
    // بلا مواضع موثوقة: نقدّر بنسبة الارتفاع
    return Math.min(sentences.length - 1, Math.max(0, Math.floor(y * sentences.length)));
  }

  // ضغطة مطوّلة على صورة الصفحة: أي كلمة تحت الإصبع؟ (من مواضع كلمات الصفحة)
  function onPageLongPress(locX: number, locY: number) {
    if (!pdfImgW2 || !pageWords.length) return;
    const H = pdfImgW2 / (pageImgAspect || 0.7);
    const x = locX / pdfImgW2;
    const y = locY / H;
    const pad = 0.006;
    const i = pageWords.findIndex((w) => x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad);
    if (i < 0) return;
    const box = pageWords[i];
    // السياق: كلمات السطر نفسه
    const cy = box.y + box.h / 2;
    const ctx = pageWords
      .filter((w) => Math.abs(w.y + w.h / 2 - cy) < box.h * 0.6)
      .map((w) => w.t)
      .join(" ");
    // بعض ملفات PDF تخزّن عبارة كاملة في صندوق واحد ← نحدّد الكلمة تحت الإصبع
    // بنسبة موضعه داخل الصندوق (من اليمين للعربي، ومن اليسار لغيره)
    const tokens = box.t.split(/\s+/).filter((tk) => /[\p{L}]/u.test(tk));
    let word = box.t;
    if (tokens.length > 1) {
      const frac = Math.min(1, Math.max(0, (x - box.x) / Math.max(box.w, 1e-6)));
      const pos = isArabicText ? 1 - frac : frac;
      const total = tokens.reduce((a, tk) => a + tk.length + 1, 0);
      let acc = 0;
      word = tokens[tokens.length - 1];
      for (const tk of tokens) {
        acc += tk.length + 1;
        if (acc / total >= pos) {
          word = tk;
          break;
        }
      }
    }
    void saveToMyWords(word, ctx);
  }

  async function onWordTap(rawWord: string, context: string) {
    const word = rawWord.replace(/[^\p{L}\p{M}]/gu, "").trim();
    if (!word) return;
    setDictWord(word);
    dictContextRef.current = context;
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
    // وصوت الكتاب أيضًا (اختياري): من الصفحة الحالية حتى آخر الكتاب — للاستماع بلا إنترنت
    askSaveBookAudio(total);
  }

  /** يسأل ثم يحفظ صوت الكتاب من الصفحة الحالية حتى آخره (زر «حفظ الصوت» أو مع «حفظ الكتاب») */
  function askSaveBookAudio(totalArg?: number) {
    const total = totalArg || totalPages;
    if (!total) return;
    const from = Math.max(1, page);
    Alert.alert(t("reader.audioSave.title"), t("reader.audioSave.body", { n: total - from + 1 }), [
      { text: t("reader.audioSave.no"), style: "cancel" },
      {
        text: t("reader.audioSave.yes"),
        onPress: () => {
          showToast(t("reader.audioSave.started"));
          setAudioSave({ done: 0, total: total - from + 1 });
          saveAudioAhead(from, total, true, (done, all) => {
            setAudioSave(done === all ? null : { done, total: all });
            if (done === all) showToast(t("reader.audioSave.done"));
          });
        },
      },
    ]);
  }

  /** زر «حفظ الصوت»: يبدأ الحفظ، أو يوقفه إن كان جاريًا (ما حُفظ يبقى) */
  // نفس مخزن المنهج: الوحدة التي وُلّدت خريطتها في صفحة المنهج تظهر هنا فورًا وبلا تكلفة.
  // بلا منهج: تُبنى من نص الصفحات القريبة وتُخزَّن بمفتاح النطاق.
  async function openMindmap() {
    setMmOpen(true);
    if (mmBusy || !pdfPath) return;
    setMmFailed(false);
    setMmBusy(true);
    try {
      const sc = await unitForPage(pdfPath, page, totalPages);
      const key = sc.unitIndex ?? 2_000_000 + sc.from * 10000 + sc.to;
      setMmTitle(sc.title ?? t("reader.mindmap.pages", { from: sc.from, to: sc.to }));
      let map = await getUnitContent<MindMap>(pdfPath, key, "mindmap");
      if (!map) {
        let ctx = "";
        if (sc.unitIndex !== null) {
          const u = (await getSyllabus(pdfPath).catch(() => null))?.data.units[sc.unitIndex];
          if (u?.topics?.length) ctx = `الفكرة المركزية: ${u.title}\nالفروع الرئيسية:\n${u.topics.map((x) => "- " + x).join("\n")}`;
        }
        if (!ctx) ctx = (await unitText(pdfPath, sc.from, sc.to)).slice(0, 9000);
        map = ctx.trim() ? await generateMindmap(ctx) : null;
        if (map) await setUnitContent(pdfPath, key, "mindmap", map);
      }
      setMmMap(map);
      if (!map) setMmFailed(true);
    } catch (e) {
      setMmFailed(true);
      if ((e as Error).message === "USER_QUOTA") setMmOpen(false); // صفحة الاشتراك تظهر
    } finally {
      setMmBusy(false);
    }
  }

  // 🎬 ملخّص فيديو لوحدة الصفحة الحالية (من المنهج، أو نطاق الصفحات القريبة بلا منهج)
  async function openUnitVideo() {
    if (!pdfPath) return;
    const sc = await unitForPage(pdfPath, page, totalPages).catch(() => null);
    const bt = typeof title === "string" ? title : "";
    const params: Record<string, string> = { pdf_path: pdfPath, book_title: bt };
    if (sc?.unitIndex != null) {
      params.unit = String(sc.unitIndex);
      params.title = sc.title ?? bt;
    } else if (sc) {
      params.from = String(sc.from);
      params.to = String(sc.to);
      params.title = t("reader.mindmap.pages", { from: sc.from, to: sc.to });
    } else return;
    router.push({ pathname: "/unit-video", params });
  }

  async function printReaderMindmap() {
    if (!mmMap) return;
    try {
      await Print.printAsync({
        html: mindmapPrintHtml(mmMap, {
          heading: `${t("syllabus.mindmap.title")} — ${mmTitle}`,
          outlineTitle: t("syllabus.mindmap.outline"),
          dir: dir.isRTL ? "rtl" : "ltr",
        }),
      });
    } catch {}
  }

  function onAudioSaveTool() {
    if (audioSave) {
      stopAudioAhead();
      setAudioSave(null);
      showToast(t("reader.audioSave.stopped"));
      return;
    }
    askSaveBookAudio();
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

  // صناديق كلمات الصفحة للهايلايتر والعدسة: أولًا من طبقة نص الـPDF (مجانية وفورية)،
  // وإن لم توجد (صفحة مصوّرة) أو لم تطابق النص المقروء → التعرّف الضوئي (أدق لكنه أثقل).
  const cleanWords = (ws: WordBox[]) =>
    ws.filter((w) => {
      const t = (w.t || "").trim();
      if (!t) return false;
      if (/:{3,}/.test(t)) return false;
      if (/restricted|confidential/i.test(t)) return false;
      if (/^[\d٠-٩.\-|]+$/.test(t)) return false;
      if (/^(مقيّ?د|سرّي|مقيد)$/.test(t)) return false;
      return true;
    });
  async function loadVisionWords(p: number) {
    wordsSrcRef.current.set(p, "vision");
    const ws = cleanWords(await getPageWords(pdfPath, p));
    if (!ws.length) return;
    wordsCacheRef.current.set(p, ws);
    if (p === livePageRef.current) setPageWords(ws);
  }
  useEffect(() => {
    if ((viewMode !== "pdf" && !lensOpen) || !pdfPath) return;
    const p = page;
    const cached = wordsCacheRef.current.get(p);
    setPageWords(cached ?? []); // لا نُبقي كلمات صفحة سابقة أبدًا (سبب الهايلايتر الخاطئ سابقًا)
    if (cached) return;
    let on = true;
    (async () => {
      const ws = cleanWords(await getPageWordsFromText(pdfPath, p));
      if (!on) return;
      if (ws.length >= 8) {
        wordsSrcRef.current.set(p, "text");
        wordsCacheRef.current.set(p, ws);
        setPageWords(ws);
      } else {
        await loadVisionWords(p);
      }
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lensOpen, viewMode, pdfPath, page]);

  // هل نص الكتاب عربي؟ (النطق الدقيق/التشكيل خاصٌّ بالعربية فقط — نخفيه لغير العربي)
  const isArabicText = useMemo(() => {
    const sample = sentences.slice(0, 8).join(" ").slice(0, 600);
    const ar = (sample.match(/[؀-ۿ]/g) || []).length;
    const latin = (sample.match(/[A-Za-z]/g) || []).length;
    return ar >= Math.max(4, latin); // عربي إن كانت الحروف العربية هي الغالبة
  }, [sentences]);
  // أحدث حالة لمقبض السحب (يُقرأ داخل PanResponder)
  pagerCtl.current = {
    arabic: isArabicText,
    playing: speaking,
    canPrev: page > 1,
    canNext: !totalPages || page < totalPages,
    commit: (d: number) => {
      const uri = imgUriRef.current.get(page + d);
      if (uri) {
        pageImgForRef.current = page + d; // لا وميض: نعرض الصورة الجاهزة فورًا
        setPageImg(uri);
      }
      goPage(d);
    },
  };

  // أمان: إن كان النص غير عربي وكان التشكيل مفعّلًا، أوقفه (خاصية عربية فقط)
  useEffect(() => {
    if (!isArabicText && tashkeelRef.current) {
      tashkeelRef.current = false;
      setTashkeelMode(false);
    }
  }, [isArabicText]);

  // مطابقة الصوت للغة الكتاب: الكتاب الإنجليزي يُقرأ بصوت إنجليزي لا بصوت عربي
  // بلكنة. نفعلها مرة واحدة وقبل أول تشغيل فقط، ونتوقّف نهائيًا متى اختار
  // المستخدم صوتًا بنفسه — قراره أولى من التخمين.
  useEffect(() => {
    if (everPlayed || sentences.length === 0) return;
    matchVoiceToText(sentences.slice(0, 8).join(" "));
  }, [sentences, everPlayed]);

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

  // محاذاة الكلمات المنطوقة بصناديق كلمات الصفحة. تُبنى مرة لكل صفحة/نص،
  // وبدونها كان التظليل يُسقَط خطّيًا على الصناديق فينزاح عن الصوت تدريجيًا
  // (المنطوق يحذف الترويسات والاستشهادات ويوسّع الأرقام).
  const spokenToBox = useMemo(() => {
    if (pageWords.length === 0 || sentences.length === 0) return [];
    const spoken = sentences.flatMap((s) => s.match(/\S+/g) ?? []);
    return alignSpokenToBoxes(spoken, pageWords.map((w) => w.t));
  }, [sentences, pageWords]);

  // هايلايتر الجملة كاملة على صفحة الـPDF (أسطرها كلها) + الكلمة المنطوقة داخلها
  const hl = useMemo(() => sentenceRects(sentences, pageWords), [sentences, pageWords]);
  // المطابقة مرنة، والجمل التي بلا مقابل لا تُرسم أصلًا (sentenceRects) → حدّ أقل للصفحة
  const hlOk = hl.confidence >= 0.4;
  const curWordBox = useMemo<WordBox | null>(() => {
    if (!speaking || !hlOk || activeSentence < 0 || activeWord < 0) return null;
    const idx = hl.map[(hl.starts[activeSentence] ?? 0) + activeWord];
    return idx === undefined ? null : pageWords[idx] ?? null;
  }, [speaking, hlOk, activeSentence, activeWord, hl, pageWords]);
  // جملة طويلة جدًا (جداول/قوائم بلا نقاط) → نظلّل سطر الكلمة الحالية فقط بدل كتلة كاملة
  const curRects = useMemo(() => {
    if (!speaking || !hlOk || activeSentence < 0) return [];
    const all = hl.rects[activeSentence] ?? [];
    if (all.length <= 3 || !curWordBox) return all;
    const cy = curWordBox.y + curWordBox.h / 2;
    const line = all.find((r) => cy >= r.y - r.h * 0.3 && cy <= r.y + r.h * 1.3);
    return line ? [line] : all.slice(0, 1);
  }, [speaking, hlOk, activeSentence, hl, curWordBox]);

  // طبقة النص لم تطابق المقروء (ترتيب كلمات معطوب في بعض ملفات PDF) → نجرّب التعرّف الضوئي مرة
  useEffect(() => {
    if (viewMode !== "pdf" && !lensOpen) return;
    if (!pageWords.length || !sentences.length || hlOk) return;
    if (wordsSrcRef.current.get(page) !== "text") return;
    void loadVisionWords(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlOk, pageWords, sentences, page, viewMode, lensOpen]);

  // الجملة المقروءة تبقى في الثلث العلوي؛ وإن لم تتوفر مواضعها نتقدّم بنسبة الجمل
  const followTop = curRects.length ? Math.min(...curRects.map((r) => r.y)) : -1;
  useEffect(() => {
    if (viewMode !== "pdf" || !speaking || activeSentence < 0 || sentences.length === 0) return;
    if (detachedAtRef.current && Date.now() - detachedAtRef.current < 5000) return;
    if (detached) setDetached(false);
    const scrollable = Math.max(0, pdfContentH.current - pdfViewH.current);
    const imgH = pdfImgW2 / (pageImgAspect || 0.7);
    const y =
      followTop >= 0 && imgH > 0
        ? followTop * imgH - pdfViewH.current * 0.3
        : (sentences.length > 1 ? activeSentence / (sentences.length - 1) : 0) * scrollable;
    pdfScrollRef.current?.scrollTo({ y: Math.max(0, Math.min(scrollable, y)), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSentence, followTop, viewMode, speaking, sentences.length]);

  function followReader() {
    detachedAtRef.current = 0;
    setDetached(false);
    const imgH = pdfImgW2 / (pageImgAspect || 0.7);
    if (followTop >= 0) pdfScrollRef.current?.scrollTo({ y: Math.max(0, followTop * imgH - pdfViewH.current * 0.3), animated: true });
  }

  /**
   * السحب الأفقي في عرض النص يقلّب الصفحات (وأثناء القراءة يكمل القارئ من الصفحة الجديدة).
   * الكتاب العربي: السحب لليمين = الصفحة التالية (مثل الورقي).
   */
  function onPageTouchEnd(x: number, y: number) {
    const st = touchRef.current;
    touchRef.current = null;
    if (!st) return;
    const dx = x - st.x;
    const dy = y - st.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - st.t > 700) return;
    if (pdfZoomRef.current > 1.05) return;
    const next = isArabicText ? dx > 0 : dx < 0;
    goPage(next ? 1 : -1);
  }

  // نقطة القراءة المتصلة — تتحرك يمين→يسار داخل السطر ثم تنزل (كحركة العين)
  const readPoint = useMemo<{ cx: number; cy: number; idx: number } | null>(() => {
    if (pageWords.length === 0) return null;
    const f = boxIndexAtProgress(readProgress, spokenToBox, pageWords.length);
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
  }, [readProgress, pageWords, spokenToBox]);


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


  // العدسة مغناطيس **متحرّك** يكبّر جزءًا من السطر ثم ينزلق مع القراءة فيغطّي السطر
  // كاملًا يمينًا→يسارًا (وليست لقطة ثابتة للسطر كله). 1.7x = تكبير واضح ومريح.
  const lensScale = lensZoom;

  // مركز العدسة: الكلمة المنطوقة الآن (دقيق بتوقيت الصوت)، ثم أول سطر الجملة، ثم التقدير القديم
  // wordL/lineL (للنص الأجنبي LTR فقط): الحافة اليسرى للكلمة المنطوقة وبداية سطرها،
  // لتبدأ العدسة من أول السطر وتمسح يمينًا مع الكلمة بدل توسيط الكلمة (الذي كان يقصّ بداية السطر).
  const lensTarget = useMemo<{ cx: number; cy: number; wordL?: number; lineL?: number } | null>(() => {
    if (curWordBox) {
      const cy = curWordBox.y + curWordBox.h / 2;
      const ln = lines.find((l) => cy >= l.y - l.h * 0.3 && cy <= l.y + l.h * 1.3);
      return { cx: curWordBox.x + curWordBox.w / 2, cy, wordL: curWordBox.x, lineL: ln ? ln.x : curWordBox.x };
    }
    // بلا كلمة حالية: نبدأ من أول السطر (يمينه للعربي، يساره للأجنبي) لا من منتصفه
    const half = 1 / lensScale / 2;
    const r = curRects[0] ?? lines[0];
    if (!r) return readPoint ? { cx: readPoint.cx, cy: readPoint.cy } : null;
    const cx = isArabicText ? Math.min(r.x + r.w, fitCol.R) - half : Math.max(r.x, fitCol.L) + half;
    return { cx, cy: r.y + r.h / 2, wordL: r.x, lineL: r.x };
  }, [curWordBox, curRects, lines, readPoint, isArabicText, fitCol, lensScale]);

  // العدسة تمسح السطر الحالي **كاملًا** مع تقدّم القراءة، محصورةً دائمًا داخل حدود
  // السطر/عمود النص (فلا تُظهر هامش الصفحة الفاضي أبدًا)، وتصل لطرف السطر مضمونًا:
  //   • النص العربي (RTL): تبدأ يمين السطر وتنتهي عند أقصى يساره.
  //   • النص الأجنبي (LTR): تبدأ يسار السطر وتنتهي عند أقصى يمينه.
  // وعموديًا تتمركز على السطر فتنزل سطرًا بسطر. الاتجاه يُضبط تلقائيًا (pageRTL).
  useEffect(() => {
    if (!lensOpen || lensW <= 0 || lensH <= 0 || !lensTarget) return;
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
    } else if (!isArabicText && lensTarget.wordL !== undefined) {
      // النص الأجنبي (LTR): تبدأ النافذة من **أول السطر** (لا تتجاوز يسار العمود)، وتنزلق
      // يمينًا فقط حين تقترب الكلمة المنطوقة من حافتها اليمنى، ولا تتجاوز يمين العمود أبدًا.
      // (سابقًا كانت تُوسِّط الكلمة — وفي ملفات PDF اللاتينية الصندوق غالبًا عبارة/سطر كامل —
      // فتقع بداية السطر خارج العدسة: «ins, colorés…» بدل أول السطر.)
      const lineL = Math.max(colL, lensTarget.lineL ?? colL);
      let a = Math.max(lineL, lensTarget.wordL - win * 0.25);
      a = Math.min(a, colR - win);
      a = Math.max(a, colL);
      tX = Math.min(0, Math.max(minX, -a * scaledW));
    } else {
      // المغناطيس يضع **الكلمة المقروءة في منتصف العدسة دائمًا** وينزلق معها بحرية:
      // يمين→يسار في العربي و يسار→يمين في الأجنبي تلقائيًا (cx يتبع موضع الكلمة).
      // لا نحصره بحواف النص، فعند طرفَي السطر يظهر **هامش أبيض نظيف متساوٍ** (خلفية
      // العدسة) بدل التصاق الكلمة بالحافة أو قصّها. الهامش داخل العدسة فقط لا في الكتاب.
      const a = lensTarget.cx - win / 2;
      tX = -a * scaledW;
    }

    // ── عموديًا: تمركز على السطر الحالي فتنزل مع كل سطر ──
    const lineCY = lensTarget.cy;
    const tY = Math.min(0, Math.max(minY, lensH / 2 - lineCY * scaledH));

    Animated.timing(lensX, { toValue: tX, duration: 150, useNativeDriver: true }).start();
    Animated.timing(lensY, { toValue: tY, duration: 150, useNativeDriver: true }).start();
  }, [lensOpen, lensW, lensH, lensTarget, fitCol, lensScale, pageImgAspect, lensX, lensY, isArabicText]);

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

  useEffect(() => {
    livePageRef.current = page;
  }, [page]);
  useEffect(() => {
    liveSentRef.current = activeSentence;
  }, [activeSentence]);
  useEffect(() => {
    liveTotalRef.current = totalPages;
  }, [totalPages]);
  // استنتاج ترقيم الكتاب المطبوع مرة لكل كتاب (من الرقم في هامش ٣ صفحات) ويُحفظ
  useEffect(() => {
    if (!prefsLoaded || !pdfPath || !bookId) return;
    let on = true;
    const key = `vsf:pageoffset:${bookId}`;
    (async () => {
      const saved = await AsyncStorage.getItem(key).catch(() => null);
      if (saved != null && saved !== "") {
        const v = Number(saved);
        if (on && Number.isFinite(v) && v >= 0) setPageOffset(v);
        return;
      }
      const base = Math.max(3, page);
      const pages = [base, base + 1, base + 2].filter((p) => !totalPages || p <= totalPages);
      const words = await Promise.all(pages.map((p) => getPageWordsFromText(pdfPath, p).catch(() => [] as WordBox[])));
      let samples = pages.map((p, i) => ({ pdf: p, printed: printedNumber(words[i]) }));
      if (samples.every((x) => x.printed == null)) {
        // كتاب مصوّر بلا طبقة نص: نقرأ صفحة واحدة بالتعرّف الضوئي
        const vw = await getPageWords(pdfPath, base).catch(() => [] as WordBox[]);
        samples = [{ pdf: base, printed: printedNumber(vw) }];
      }
      const off = inferOffset(samples);
      if (!on || off == null) return;
      setPageOffset(off);
      AsyncStorage.setItem(key, String(off)).catch(() => {});
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, pdfPath, bookId]);

  // استلام من الشريط العائم: بعد تحميل الموضع المحفوظ نكمل التشغيل تلقائيًا
  useEffect(() => {
    if (!prefsLoaded || !autoResumeRef.current) return;
    autoResumeRef.current = false;
    togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded]);

  function goBack() {
    // لا نوقف القراءة هنا: إن كانت شغّالة تنتقل للشريط العائم عند المغادرة (انظر التنظيف)
    // التحميل يكمل في الخلفية — لا نوقفه عند الرجوع
    if (router.canGoBack()) router.back();
    else router.replace("/"); // فُتح القارئ مباشرة (رابط/إشعار) بلا شاشة قبله

  }

  return (
    <SafeAreaView style={[styles.safe, paper && !fullText && { backgroundColor: PAPER }]} edges={["top", "left", "right"]}>
      <StatusBar style={paper && !fullText ? "dark" : "light"} />
      {/* الشريط العلوي (تصميم 2.0): رجوع · الكتاب والصفحة · المظهر */}
      {!fullText && (
      <View style={[styles.topBar, { flexDirection: dir.row }]}>
        <Pressable onPress={goBack} style={[styles.topBtn, paper && styles.topBtnPaper]} hitSlop={8} accessibilityLabel={t("common.back")}>
          <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={paper ? INK : Palette.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.topTitle, paper && { color: INK }]} numberOfLines={1}>
            {typeof title === "string" && title.trim() ? title : t("reader.book")}
          </Text>
          {ingesting ? (
            <Text style={[styles.topSub, paper && { color: INK }]} numberOfLines={1}>
              {t("reader.pageInfo.loading", { done: ingestDone, total: ingestTotal })}
            </Text>
          ) : null}
        </View>
        <CoachHelpButton onPress={coach.replay} />
        <Pressable onPress={togglePaper} style={[styles.topBtn, paper && styles.topBtnPaper]} hitSlop={8} accessibilityLabel={t("reader.theme.toggle")}>
          <Ionicons name={paper ? "moon-outline" : "sunny-outline"} size={19} color={paper ? INK : Palette.text} />
        </Pressable>
      </View>
      )}

      {/* العارض: PDF أو نص بتظليل الجملة المقروءة */}
      <View {...coach.bind("page")} style={[styles.viewer, fullText && styles.viewerFull]}>
        {walkMode && !checkIn ? (
          <Pressable onPress={toggleWalk} style={[styles.walkChip, { flexDirection: dir.row }]}>
            <Ionicons name="walk" size={16} color={SKY.accent} />
            <Text style={styles.walkChipTxt} numberOfLines={1}>
              {walkHeard ? t("reader.walk.heard", { text: walkHeard }) : t("reader.walk.listening")}
            </Text>
            <Ionicons name="close" size={15} color={Palette.textDim} />
          </Pressable>
        ) : null}
        {checkIn ? (
          <View style={styles.checkCard}>
            <View style={[styles.checkHead, { flexDirection: dir.row }]}>
              <View style={[styles.checkOrb, { backgroundColor: SKY.accent }]}>
                {checkIn.phase === "explaining" ? (
                  <ActivityIndicator color={SKY.onAccent} size="small" />
                ) : (
                  <Ionicons name={checkIn.phase === "done" ? "checkmark" : "sparkles"} size={16} color={SKY.onAccent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkTitle, { textAlign: dir.textAlign }]}>{checkIn.title}</Text>
                {checkIn.phase === "ask" ? (
                  <Text style={[styles.checkSub, { textAlign: dir.textAlign }]}>{t("reader.check.sub")}</Text>
                ) : null}
              </View>
              {checkIn.phase === "ask" && (
                <Pressable
                  onPressIn={() => void replyDict.start()}
                  onPressOut={() => replyDict.stop()}
                  style={[styles.checkMic, replyDict.listening && { backgroundColor: SKY.accent }]}
                  accessibilityLabel={t("reader.check.voice")}
                  hitSlop={6}
                >
                  <Ionicons name="mic" size={17} color={replyDict.listening ? SKY.onAccent : SKY.ink} />
                </Pressable>
              )}
              <Pressable onPress={() => setCheckIn(null)} hitSlop={10}>
                <Ionicons name="close" size={18} color={Palette.textDim} />
              </Pressable>
            </View>
            {checkIn.phase === "ask" ? (
              <View style={[styles.checkRow, { flexDirection: dir.row }]}>
                <Pressable onPress={checkInWith} style={[styles.checkBtn, styles.checkBtnMain]}>
                  <Text style={styles.checkBtnMainTxt}>{t("reader.check.with")}</Text>
                </Pressable>
                <Pressable onPress={checkInRepeat} style={styles.checkBtn}>
                  <Text style={styles.checkBtnTxt}>{t("reader.check.repeat")}</Text>
                </Pressable>
                <Pressable onPress={checkInExplain} style={[styles.checkBtn, styles.checkBtnAlt]}>
                  <Text style={[styles.checkBtnTxt, { color: SKY.accent }]}>{t("reader.check.explain")}</Text>
                </Pressable>
              </View>
            ) : null}
            {checkIn.phase === "explained" && checkIn.body ? (
              <>
                <Text style={[styles.checkBody, { textAlign: dir.textAlign }]}>{checkIn.body}</Text>
                <Pressable onPress={checkInBack} style={[styles.checkBtn, styles.checkBtnMain, { alignSelf: "stretch" }]}>
                  <Text style={styles.checkBtnMainTxt}>{t("reader.check.back")}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
        {viewMode === "text" ? (
          <ScrollView
            ref={scrollRef}
            style={[styles.textScroll, paper && { backgroundColor: PAPER }]}
            onTouchStart={(e) => (touchRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now() })}
            onTouchEnd={(e) => onPageTouchEnd(e.nativeEvent.pageX, e.nativeEvent.pageY)}
            contentContainerStyle={styles.textContent}
            onLayout={(e) => (textViewH.current = e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => (textContentH.current = h)}
            scrollEventThrottle={16}
          >
            {/* شريط الهايلايتر للدراسة */}
            <View style={styles.hlBar}>
              <Pressable
                onPress={() => setHighlightMode((m) => !m)}
                style={[styles.hlToggle, paper && styles.hlTogglePaper, highlightMode && styles.hlToggleOn]}
              >
                <Ionicons name="brush" size={15} color={highlightMode ? SKY.onAccent : paper ? INK : Palette.text} />
                <Text style={[styles.hlToggleTxt, paper && { color: INK }, highlightMode && { color: SKY.onAccent }]}>
                  {highlightMode ? t("reader.highlight.modeOn") : t("reader.highlight.modeOff")}
                </Text>
              </Pressable>
              <Pressable onPress={() => setNotesOpen(true)} style={[styles.hlToggle, paper && styles.hlTogglePaper]}>
                <Ionicons name="bookmarks-outline" size={15} color={paper ? INK : Palette.text} />
                <Text style={[styles.hlToggleTxt, paper && { color: INK }]}>{t("reader.highlight.myExcerpts")}</Text>
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
                      selectionColor="rgba(246,213,138,0.45)"
                      style={[
                        active ? styles.sentenceActive : styles.sentence,
                        paper && (active ? { color: INK } : { color: "rgba(42,38,34,0.62)" }),
                        { fontSize: (active ? 22 : 21) * fontScale, lineHeight: (active ? 42 : 40) * fontScale },
                      ]}
                    >
                      {/* كل الكلمات قابلة للضغط (ضغطة = ترجمة/معنى، ضغطتان = قراءة من هنا)؛
                          وتظليل الكاراوكي يظهر فقط في الكلمة الجاري نطقها بالجملة النشطة */}
                      {(() => {
                        let wc = -1;
                        return s.split(/(\s+)/).map((tok, wi) => {
                          if (!/\S/.test(tok)) return tok;
                          wc++;
                          const spoken = active && wc === activeWord;
                          return (
                            <Text
                              key={wi}
                              onPress={() => onWordPress(i, tok, s, s.split(/(\s+)/).slice(0, wi).filter((x) => /\S/.test(x)).length)}
                              onLongPress={highlightMode ? undefined : () => void saveToMyWords(tok, s)}
                              suppressHighlighting
                              style={spoken ? styles.wordSpoken : undefined}
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
          <View style={{ flex: 1, overflow: "hidden" }} {...(penOn ? {} : pager.panHandlers)}>
          <Animated.View style={{ flex: 1, transform: [{ translateX: pagerX }] }}>
            {/* الصفحتان المجاورتان خارج الشاشة — تنزلقان للداخل مع السحب */}
            {pageImg && (isArabicText ? nbr.next : nbr.prev) ? (
              <Image
                source={{ uri: (isArabicText ? nbr.next : nbr.prev)! }}
                style={[styles.pagerSide, { left: -screenW, width: screenW, aspectRatio: pageImgAspect }]}
                resizeMode="contain"
              />
            ) : null}
            {pageImg && (isArabicText ? nbr.prev : nbr.next) ? (
              <Image
                source={{ uri: (isArabicText ? nbr.prev : nbr.next)! }}
                style={[styles.pagerSide, { left: screenW, width: screenW, aspectRatio: pageImgAspect }]}
                resizeMode="contain"
              />
            ) : null}
            {pageImg ? (
              <GHScrollView
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
                onScroll={(e) => (pdfZoomRef.current = e.nativeEvent.zoomScale ?? 1)}
                scrollEventThrottle={64}
                onScrollBeginDrag={() => {
                  if (!playingRef.current) return;
                  detachedAtRef.current = Date.now();
                  setDetached(true);
                }}
              >
                <View
                  // حاوية الصفحة + الهامش (الهامش للكتابة بالقلم على الآيباد)
                  style={[{ direction: "ltr", width: "100%", paddingHorizontal: marginPx }, showMargins && penOn && styles.inkMarginBg]}
                  onLayout={(e) => setPageAreaW(e.nativeEvent.layout.width)}
                >
                <View
                  // إحداثيات الصفحة من اليسار دائمًا (بدونها تنقلب يمين↔يسار في الواجهة العربية)
                  style={{ direction: "ltr" }}
                  onLayout={(e) => setPdfImgW2(e.nativeEvent.layout.width)}
                >
                  <Pressable
                    delayLongPress={380}
                    onPress={(e) => onPageTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
                    onLongPress={(e) => onPageLongPress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
                  >
                    <Image
                      source={{ uri: pageImg }}
                      style={{ width: "100%", aspectRatio: pageImgAspect }}
                      resizeMode="contain"
                    />
                  </Pressable>
                  {/* هايلايتر الجملة المقروءة (كل أسطرها) + الكلمة المنطوقة الآن */}
                  {pdfImgW2 > 0 &&
                    curRects.map((r, i) => {
                      const H = pdfImgW2 / (pageImgAspect || 0.7);
                      return (
                        <View
                          key={i}
                          pointerEvents="none"
                          style={[
                            styles.sentHL,
                            { left: (r.x - 0.006) * pdfImgW2, top: (r.y - 0.003) * H, width: (r.w + 0.012) * pdfImgW2, height: (r.h + 0.006) * H },
                          ]}
                        />
                      );
                    })}
                  {pdfImgW2 > 0 && curWordBox ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.wordNow,
                        {
                          left: (curWordBox.x - 0.003) * pdfImgW2,
                          top: (curWordBox.y - 0.002) * (pdfImgW2 / (pageImgAspect || 0.7)),
                          width: (curWordBox.w + 0.006) * pdfImgW2,
                          height: (curWordBox.h + 0.004) * (pdfImgW2 / (pageImgAspect || 0.7)),
                        },
                      ]}
                    />
                  ) : null}
                </View>
                {/* طبقة قلم الآيباد فوق الصفحة والهامش */}
                {isPad && pdfImgW2 > 0 && (penOn || inkStrokes.length > 0) ? (
                  <InkLayer
                    strokes={inkStrokes}
                    onChange={changeInk}
                    active={penOn}
                    tool={inkTool}
                    color={inkColor}
                    imgW={pdfImgW2}
                    offsetX={marginPx}
                    width={pdfImgW2 + marginPx * 2}
                    height={pdfImgW2 / (pageImgAspect || 0.7)}
                    scrollRef={pdfScrollRef}
                  />
                ) : null}
                </View>
              </GHScrollView>
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
            {penOn ? (
              <View pointerEvents="box-none" style={styles.inkBarWrap}>
                <InkToolbar
                  tool={inkTool}
                  color={inkColor}
                  onTool={setInkTool}
                  onColor={setInkColor}
                  onUndo={undoInk}
                  onClear={() => changeInk([])}
                  onDone={() => setPenOn(false)}
                  labels={{
                    marker: t("reader.ink.marker"),
                    eraser: t("reader.ink.eraser"),
                    undo: t("reader.ink.undo"),
                    clear: t("reader.ink.clear"),
                    clearConfirm: t("reader.ink.clearConfirm"),
                    cancel: t("common.cancel"),
                    done: t("reader.ink.done"),
                  }}
                />
              </View>
            ) : null}
            {/* زر «تابع القارئ» بعد سحب الصفحة يدويًا أثناء القراءة */}
            {detached && speaking && !lensOpen ? (
              <Pressable onPress={followReader} style={styles.followPill}>
                <Ionicons name="locate" size={15} color={SKY.onAccent} />
                <Text style={styles.followTxt}>{t("reader.follow")}</Text>
              </Pressable>
            ) : null}

            {/* العدسة: بطاقة مكبّرة عائمة تتابع الكلمة المنطوقة، والصفحة خلفها معتمة قليلًا */}
            {lensOpen && pageImg ? (
              <View pointerEvents="box-none" style={styles.lensBandWrap}>
                <View pointerEvents="none" style={styles.lensDim} />
                <View style={styles.lensCard}>
                  <View style={[styles.lensHead, { flexDirection: dir.row }]}>
                    <Ionicons name="search" size={15} color={SKY.accent} />
                    <Text style={styles.lensTitle}>{t("reader.lens.title")}</Text>
                    <View style={{ flex: 1 }} />
                    {[1.5, 2, 2.5].map((z) => (
                      <Pressable key={z} onPress={() => setLensZoom(z)} style={[styles.zoomChip, lensZoom === z && styles.zoomChipOn]} hitSlop={4}>
                        <Text style={[styles.zoomTxt, lensZoom === z && styles.zoomTxtOn]}>{z}×</Text>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => setLensOpen(false)} style={styles.lensClose} hitSlop={8} accessibilityLabel={t("common.close")}>
                      <Ionicons name="close" size={16} color={SKY.ink} />
                    </Pressable>
                  </View>
                  <View
                    style={styles.lensView}
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
                          direction: "ltr",
                          width: lensW * lensScale,
                          height: (lensW / (pageImgAspect || 0.7)) * lensScale,
                          transform: [{ translateX: lensX }, { translateY: lensY }],
                        }}
                      >
                        <Image source={{ uri: pageImg }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                        {curRects.map((r, i) => {
                          const W = lensW * lensScale;
                          const H = (lensW / (pageImgAspect || 0.7)) * lensScale;
                          return (
                            <View
                              key={i}
                              pointerEvents="none"
                              style={[styles.sentHL, { left: (r.x - 0.006) * W, top: (r.y - 0.003) * H, width: (r.w + 0.012) * W, height: (r.h + 0.006) * H }]}
                            />
                          );
                        })}
                        {curWordBox ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.wordNow,
                              {
                                left: (curWordBox.x - 0.003) * lensW * lensScale,
                                top: (curWordBox.y - 0.002) * (lensW / (pageImgAspect || 0.7)) * lensScale,
                                width: (curWordBox.w + 0.006) * lensW * lensScale,
                                height: (curWordBox.h + 0.004) * (lensW / (pageImgAspect || 0.7)) * lensScale,
                              },
                            ]}
                          />
                        ) : null}
                      </Animated.View>
                    ) : null}
                    {!speaking ? (
                      <View pointerEvents="none" style={styles.lensHint}>
                        <Text style={styles.lensHintTxt}>{t("reader.lens.hint")}</Text>
                      </View>
                    ) : null}
                  </View>
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
          </Animated.View>
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
            <GoldPlayButton
              playing={speaking}
              busy={busy}
              onPress={togglePlay}
              size={60}
              hint={!everPlayed}
            />
            <Pressable onPress={() => goPage(1)} style={styles.floatBtn} hitSlop={8} disabled={!!totalPages && page >= totalPages}>
              <Ionicons name="chevron-back" size={22} color={!!totalPages && page >= totalPages ? Palette.textDim : Palette.text} />
            </Pressable>
            <Pressable onPress={cycleSpeed} style={styles.floatBtn} hitSlop={8}>
              <Text style={styles.floatSpeed}>{rate}x</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* أسفل القارئ (تصميم 2.0): شريط الصفحات + كبسولة الأدوات الخمس */}
      {!fullText && (
      <View style={[styles.bottom, { paddingBottom: Math.max(safeInsets.bottom, 12) + (toolsHidden ? 10 : 2) }]}>
        {voiceWarn ? (
          <Text style={styles.warnTxt}>{t("reader.voice.humanFailed", { reason: voiceWarn })}</Text>
        ) : null}
        {ingesting && ingestTotal > 0 ? (
          <View style={styles.ingestBarBg}>
            <View style={[styles.ingestBarFill, { width: `${Math.round((ingestDone / ingestTotal) * 100)}%` }]} />
          </View>
        ) : null}
        {/* شريط الصفحات: رقم الصفحة (اضغط للانتقال المباشر) + السحب */}
        <View {...coach.bind("nav")} style={[styles.navRow, { flexDirection: dir.row }]}>
          <Pressable
            onPress={openGoto}
            style={[styles.pagePill, paper && styles.topBtnPaper, { flexDirection: dir.row }]}
            hitSlop={6}
            accessibilityLabel={t("reader.tool.goto")}
          >
            <Ionicons name="keypad-outline" size={14} color={paper ? INK : Palette.text} />
            <Text style={[styles.pagePillTxt, paper && { color: INK }]}>
              {printedOf(page) != null ? t("reader.page.book", { n: printedOf(page)! }) : t("reader.page.file", { n: page })}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PageScrubber page={page} totalPages={totalPages} onSeek={gotoPage} rtl={dir.isRTL} paper={paper} />
          </View>
          <Pressable
            {...coach.bind("toggle")}
            onPress={toggleToolsHidden}
            style={[styles.toolsToggle, paper && styles.topBtnPaper]}
            hitSlop={8}
            accessibilityLabel={toolsHidden ? t("reader.tools.show") : t("reader.tools.hide")}
          >
            <Ionicons name={toolsHidden ? "options-outline" : "chevron-down"} size={18} color={paper ? INK : Palette.text} />
          </Pressable>
        </View>

        {/* التحكّم بالاستماع: مقطع سابق · تشغيل · مقطع تالٍ (الصفحات: الرقم والشريط أعلاه، أو السحب بالإصبع) */}
        <View {...coach.bind("capsule")} style={[styles.capsule, { flexDirection: dir.row }]}>
          <Pressable onPress={() => skipSentence(-1)} style={styles.capBtn} accessibilityLabel={t("reader.tool.prevSegment")}>
            <Ionicons name={dir.isRTL ? "play-skip-forward" : "play-skip-back"} size={22} color={Palette.text} />
            {skipMult > 1 && skipDir < 0 ? <Text style={styles.capBadge}>×{skipMult}</Text> : null}
          </Pressable>
          <Pressable onPress={togglePlay} accessibilityLabel={speaking ? t("dock.pause") : t("dock.play")}>
            <View style={styles.capPlay}>
              {busy && speaking ? (
                <ActivityIndicator color={SKY.onAccent} />
              ) : (
                <Ionicons name={speaking ? "pause" : "play"} size={26} color={SKY.onAccent} style={speaking ? null : { marginLeft: 3 }} />
              )}
            </View>
          </Pressable>
          <Pressable onPress={() => skipSentence(1)} style={styles.capBtn} accessibilityLabel={t("reader.tool.nextSegment")}>
            <Ionicons name={dir.isRTL ? "play-skip-back" : "play-skip-forward"} size={22} color={Palette.text} />
            {skipMult > 1 && skipDir > 0 ? <Text style={styles.capBadge}>×{skipMult}</Text> : null}
          </Pressable>
        </View>

        {/* أدوات القراءة داخل الصفحة: ثلاث مجموعات ظاهرة، واختيارات الأداة تظهر تحتها مباشرة */}
        {!toolsHidden && (
        <>
        <View {...coach.bind("tabs")} style={[styles.tabsRow, { flexDirection: dir.row }]}>
          {(["listen", "study", "view"] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => {
                setToolTab(g);
                setToolOpt(null);
              }}
              style={[styles.toolTab, toolTab === g && styles.toolTabOn]}
            >
              <Text style={[styles.toolTabTxt, toolTab === g && { color: SKY.onAccent }]}>{t(`reader.tools.${g}`)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.inGrid, { flexDirection: dir.row }]}>
          {toolTab === "listen" ? (
            <>
              <InTool text={`${rate}×`} label={t("reader.tool.speed")} on={toolOpt === "speed"} onPress={() => setToolOpt(toolOpt === "speed" ? null : "speed")} />
              <InTool
                icon={sleepMin === SLEEP_UNTIL_END ? "book-outline" : "moon-outline"}
                label={sleepMin === SLEEP_UNTIL_END ? t("reader.tool.sleepUntilEnd") : sleepMin > 0 ? t("reader.tool.sleepMinutes", { minutes: sleepMin }) : t("reader.tool.sleep")}
                on={toolOpt === "sleep" || sleepMin !== 0}
                onPress={() => setToolOpt(toolOpt === "sleep" ? null : "sleep")}
              />
              <InTool icon="walk-outline" label={t("reader.walk.title")} on={walkMode} onPress={() => void toggleWalk()} />
              <InTool
                icon={presMusicKey ? "musical-notes" : "musical-notes-outline"}
                label={presMusicKey ? t(`music.${presMusicKey}`) : t("reader.music.background")}
                on={toolOpt === "music" || !!presMusicKey}
                onPress={() => setToolOpt(toolOpt === "music" ? null : "music")}
              />
              <InTool icon="mic-outline" label={VOICE_CATALOG.find((v) => v.voiceId === voiceId)?.name.split(" · ")[0] ?? t("reader.tool.voice")} onPress={() => setVoiceModal(true)} />
              <InTool icon="language-outline" label={t("reader.cap.translate")} on={listenArabic} onPress={() => setTranslateModal(true)} />
              {viewMode === "pdf" ? (
                <InTool icon="search-outline" label={t("reader.cap.lens")} on={lensOpen} onPress={() => setLensOpen((v) => !v)} />
              ) : (
                <InTool text="Aa" label={t("reader.cap.textSize")} on={toolOpt === "font"} onPress={() => setToolOpt(toolOpt === "font" ? null : "font")} />
              )}
              <InTool icon="car-sport-outline" label={t("reader.tools.driving")} onPress={() => setDrivingMode(true)} />
            </>
          ) : toolTab === "study" ? (
            <>
              <InTool icon="sparkles-outline" label={t("reader.tools.ai")} onPress={() => setAiOpen(true)} />
              <InTool
                icon="chatbubble-ellipses-outline"
                label={t("reader.cap.ask")}
                onPress={() => bookId && router.push({ pathname: "/ask/[id]", params: { id: bookId } })}
              />
              <InTool
                icon={isBookmarked ? "bookmark" : "bookmark-outline"}
                label={isBookmarked ? t("reader.tools.bookmarked") : t("reader.tools.bookmark")}
                on={isBookmarked}
                onPress={onToggleBookmark}
              />
              <InTool
                icon="list-outline"
                label={t("reader.tools.notes")}
                badge={bookmarks.length + highlights.length > 0 ? String(bookmarks.length + highlights.length) : undefined}
                onPress={() => setNotesOpen(true)}
              />
              {isArabicText ? (
                <InTool icon="text-outline" label={tashkeelMode ? t("reader.aids.tashkeelOn") : t("reader.aids.tashkeelOff")} on={tashkeelMode} onPress={toggleTashkeel} />
              ) : null}
              <InTool
                icon="easel-outline"
                label={t("reader.aids.present")}
                onPress={() => {
                  presUsedRef.current = true;
                  warmAllMusic();
                  setPresentOpen(true);
                }}
              />
              <InTool
                icon="albums-outline"
                label={t("reader.ai.cards")}
                onPress={() => {
                  // بطاقات مراجعة للصفحة: يُختار نوعها أولًا، ثم تُحفظ في «البطاقات» مع الحفظ والطباعة
                  if (!aiBusy) pickCardType();
                }}
              />
              <InTool icon="git-network-outline" label={t("syllabus.mindmap.title")} onPress={() => void openMindmap()} />
              <InTool icon="videocam-outline" label={t("video.open")} onPress={() => void openUnitVideo()} />
              <InTool
                icon="library-outline"
                label={t("reader.tools.bookPage")}
                onPress={() => bookId && router.push({ pathname: "/book/[id]", params: { id: bookId } })}
              />
            </>
          ) : (
            <>
              <InTool
                icon={viewMode === "pdf" ? "reader-outline" : "document-outline"}
                label={viewMode === "pdf" ? t("reader.tools.viewText") : t("reader.tools.viewPdf")}
                onPress={toggleViewMode}
              />
              <InTool icon={paper ? "moon-outline" : "sunny-outline"} label={paper ? t("reader.tools.night") : t("reader.tools.paper")} onPress={togglePaper} />
              <InTool icon="expand-outline" label={t("reader.tools.fullscreen")} onPress={() => setFullText(true)} />
              {isPad && viewMode === "pdf" ? (
                <InTool icon="pencil-outline" label={t("reader.ink.title")} on={penOn} onPress={() => setPenOn((v) => !v)} />
              ) : null}
              <InTool
                icon={fullyLoaded && !ingesting ? "checkmark-circle" : ingesting ? "stop-circle-outline" : "cloud-download-outline"}
                label={fullyLoaded ? t("reader.tool.loaded") : t("reader.tool.download")}
                on={fullyLoaded && !ingesting}
                disabled={fullyLoaded && !ingesting}
                onPress={startIngest}
              />
              <InTool
                icon={audioSave ? "stop-circle-outline" : "headset-outline"}
                label={audioSave ? t("reader.audioSave.progressShort", { done: audioSave.done, all: audioSave.total }) : t("reader.audioSave.tool")}
                on={!!audioSave}
                onPress={onAudioSaveTool}
              />
            </>
          )}
        </View>
        {toolOpt === "speed" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.optRow, { flexDirection: dir.row }]}>
            {SPEEDS.map((r) => (
              <OptChip key={r} label={`${r}×`} on={rate === r} onPress={() => setSpeed(r)} />
            ))}
          </ScrollView>
        ) : toolOpt === "sleep" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.optRow, { flexDirection: dir.row }]}>
            {SLEEP_OPTIONS.map((m) => (
              <OptChip
                key={m}
                label={m === 0 ? t("reader.music.none") : m === SLEEP_UNTIL_END ? t("reader.tool.sleepUntilEnd") : t("reader.tool.sleepMinutes", { minutes: m })}
                on={sleepMin === m}
                onPress={() => setSleep(m)}
              />
            ))}
          </ScrollView>
        ) : toolOpt === "font" ? (
          <View style={[styles.optRow, { flexDirection: dir.row }]}>
            {([1, 1.15, 1.3] as const).map((f, i) => (
              <OptChip
                key={f}
                label={t(["reader.font.s", "reader.font.m", "reader.font.l"][i])}
                on={fontScale === f}
                onPress={() => {
                  setFontScale(f);
                  void setReaderFontScale(f);
                }}
              />
            ))}
          </View>
        ) : toolOpt === "music" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.optRow, { flexDirection: dir.row }]}>
            <OptChip
              label={t("reader.music.none")}
              on={!presMusicKey}
              onPress={() => {
                setPresMusicKey(null);
                stopAmbient();
              }}
            />
            {MUSIC_OPTIONS.map((m) => (
              <OptChip
                key={m.key}
                label={musicLoading === m.key ? t("reader.music.loading") : `${MUSIC_EMOJI[m.key] ?? "🎵"} ${t(`music.${m.key}`)}`}
                on={presMusicKey === m.key}
                onPress={() => selectMusic(m.key)}
              />
            ))}
          </ScrollView>
        ) : null}
        </>
        )}
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
                      <ActivityIndicator size="small" color={SKY.onAccent} />
                    ) : (
                      <Ionicons name="albums" size={16} color={SKY.onAccent} />
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
                        <Ionicons name="checkmark" size={18} color={SKY.onAccent} />
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
              <Pressable
                style={styles.aiAction}
                onPress={() => {
                  // نطاق الملخّص: الصفحة، أو الوحدة كاملة (حدودها من المنهج)، أو ملف المذاكرة للكتاب كله
                  const bt = typeof title === "string" ? title : "";
                  Alert.alert(t("reader.ai.sumScopeTitle"), undefined, [
                    {
                      text: t("reader.ai.sumScopePage"),
                      onPress: () => {
                        setAiOpen(false);
                        router.push({ pathname: "/unit-summary", params: { pdf_path: pdfPath, page: String(page), title: t("reader.ai.pageTitle", { page }), book_title: bt } });
                      },
                    },
                    {
                      text: t("reader.ai.sumScopeUnit"),
                      onPress: async () => {
                        setAiOpen(false);
                        const sc = await unitForPage(pdfPath, page, totalPages).catch(() => null);
                        if (!sc) return;
                        router.push({
                          pathname: "/unit-summary",
                          params:
                            sc.unitIndex !== null
                              ? { pdf_path: pdfPath, unit: String(sc.unitIndex), title: sc.title ?? "", book_title: bt }
                              : { pdf_path: pdfPath, from: String(sc.from), to: String(sc.to), title: t("reader.present.pagesRange", { from: sc.from, to: sc.to }), book_title: bt },
                        });
                      },
                    },
                    {
                      text: t("reader.ai.sumScopeBook"),
                      onPress: () => {
                        setAiOpen(false);
                        router.push({ pathname: "/study-file", params: { pdf_path: pdfPath, book_title: bt } });
                      },
                    },
                    { text: t("common.cancel"), style: "cancel" },
                  ]);
                }}
              >
                <Ionicons name="list" size={18} color={Palette.neonCyan} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.summarize")}</Text>
              </Pressable>
              <Pressable
                style={styles.aiAction}
                onPress={() => {
                  setAiOpen(false);
                  router.push({
                    pathname: "/unit-quiz",
                    params: {
                      pdf_path: pdfPath,
                      page: String(page),
                      title: t("reader.ai.pageTitle", { page }),
                      book_title: typeof title === "string" ? title : "",
                    },
                  });
                }}
              >
                <Ionicons name="help-circle" size={18} color={Palette.neonViolet} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.quiz")}</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={pickCardType} disabled={aiBusy}>
                <Ionicons name="albums" size={18} color={Palette.neonPink} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.cards")}</Text>
              </Pressable>
              <Pressable style={styles.aiAction} onPress={openTranslatePicker} disabled={aiBusy}>
                <Ionicons name="language" size={18} color={Palette.neonBlue} />
                <Text style={styles.aiActionTxt}>{t("reader.ai.translate")}</Text>
              </Pressable>
            </View>

            {/* خانة السؤال الحر عن الصفحة: لحساب المالك فقط (تُقلّل سوء الاستخدام) */}
            {owner ? (
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
                  <Ionicons name="send" size={18} color={SKY.onAccent} />
                </Pressable>
              </View>
            ) : null}

            <ScrollView style={styles.aiResultBox} contentContainerStyle={{ padding: 14 }}>
              {aiBusy ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <ActivityIndicator color={Palette.primary} />
                  <Text style={styles.aiHint}>{t("reader.ai.thinking")}</Text>
                </View>
              ) : aiResult ? (
                <>
                  <Text style={[styles.aiResultTxt, { textAlign: dir.textAlign }]}>{aiResult}</Text>
                  {/* حفظ الإجابة في «محفوظات الكتاب» أو ملف PDF */}
                  <View style={[styles.aiSaveRow, { flexDirection: dir.row }]}>
                    <Pressable style={styles.aiSaveBtn} onPress={saveAssistant} disabled={saveBusy}>
                      {saveBusy ? <ActivityIndicator size="small" color={Palette.neonCyan} /> : <Ionicons name="bookmark-outline" size={16} color={Palette.neonCyan} />}
                      <Text style={styles.aiSaveTxt}>{t("save.save")}</Text>
                    </Pressable>
                    <Pressable style={styles.aiSaveBtn} onPress={assistantPdf}>
                      <Ionicons name="document-text-outline" size={16} color={Palette.neonCyan} />
                      <Text style={styles.aiSaveTxt}>{t("save.pdf")}</Text>
                    </Pressable>
                  </View>
                  {aiCards ? (
                    <View style={{ gap: 8, marginTop: 10 }}>
                      {aiCards.map((c, i) => (
                        <View key={i} style={styles.aiCardRow}>
                          <Text style={[styles.aiCardQ, { textAlign: dir.textAlign }]}>{`${i + 1}. ${c.front}`}</Text>
                          <Text style={[styles.aiCardA, { textAlign: dir.textAlign }]}>{c.back}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
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

            <GoldPlayButton
              playing={speaking}
              busy={busy}
              onPress={togglePlay}
              size={120}
              hint={!everPlayed}
            />

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
            {pageOffset != null ? (
              <>
                <View style={[styles.gotoModes, { flexDirection: dir.row }]}>
                  {(["book", "file"] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setGotoMode(m);
                        setGotoValue(String(m === "book" ? (printedOf(page) ?? page) : page));
                      }}
                      style={[styles.gotoMode, gotoMode === m && styles.gotoModeOn]}
                    >
                      <Text style={[styles.gotoModeTxt, gotoMode === m && styles.gotoModeTxtOn]}>{t(`reader.goto.${m}`)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.dictHint, { textAlign: dir.textAlign }]}>
                  {t("reader.goto.now", { book: printedOf(page) ?? "—", file: page, total: totalPages || "؟" })}
                </Text>
              </>
            ) : (
              <Text style={[styles.dictHint, { textAlign: dir.textAlign }]}>{t("reader.goto.hint", { total: totalPages || "؟" })}</Text>
            )}
            <TextInput
              value={gotoValue}
              onChangeText={(txt) => setGotoValue(txt.replace(/[^0-9٠-٩]/g, ""))}
              keyboardType="number-pad"
              placeholder={`${page}`}
              placeholderTextColor={Palette.placeholder}
              style={styles.gotoInput}
              textAlign="center"
              autoFocus
              onSubmitEditing={submitGoto}
            />
            <Pressable onPress={submitGoto} style={styles.gotoBtn}
            >
              <Ionicons name="arrow-back" size={18} color={SKY.onAccent} />
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
              <>
                <Text style={[styles.dictMeaning, { textAlign: dir.textAlign }]}>{dictMeaning}</Text>
                <Pressable onPress={() => void saveToMyWords(dictWord, dictContextRef.current)} style={[styles.dictSave, { flexDirection: dir.row }]}>
                  <Ionicons name="bookmark" size={15} color={SKY.onAccent} />
                  <Text style={styles.dictSaveTxt}>{t("words.saveMore")}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <WordSheet word={wordSheet} onClose={() => setWordSheet(null)} />

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

            {/* توضيح دور «الصوت»: يقرأ النص كما هو بلغته — يُختار حسب لغة الكتاب */}
            <Text style={[styles.notesHint, { textAlign: dir.textAlign }]}>
              {t("reader.voice.hint")}
            </Text>

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
              {([false, true] as const).map((premium) => {
                const group = VOICE_CATALOG.filter(
                  (v) => !!v.premium === premium
                );
                if (group.length === 0) return null;
                return (
                  <View key={premium ? "premium" : "standard"} style={{ gap: 8 }}>
                    <Text style={[styles.voiceGroupTxt, { textAlign: dir.textAlign }]}>
                      {t(premium ? "voice.group.premium" : "voice.group.standard")}
                    </Text>
                    {group.map((v) => {
                      const active = v.voiceId === voiceId;
                      return (
                        <Pressable
                          key={v.id}
                          onPress={() => chooseVoice(v.voiceId)}
                          style={[styles.voiceRowItem, active && styles.voiceRowItemOn]}
                        >
                          <View style={styles.voiceRowName}>
                            <Text style={[styles.voiceRowTxt, active && { color: Palette.neonCyan }]}>{v.name}</Text>
                            {v.premium ? (
                              <View style={styles.premiumBadge}>
                                <Text style={styles.premiumBadgeTxt}>{t("voice.badge.premium")}</Text>
                              </View>
                            ) : null}
                          </View>
                          {active ? <Ionicons name="checkmark-circle" size={20} color={Palette.neonCyan} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>

            {/* طريقة القراءة: تُطبَّق على كل الأصوات */}
            <Text style={[styles.voiceGroupTxt, { textAlign: dir.textAlign, marginTop: 14 }]}>{t("reader.style.title")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.voiceRow, { paddingTop: 8 }]}>
              {READ_STYLES.map((st) => {
                const sel = st === readStyle;
                return (
                  <Pressable key={st} onPress={() => chooseReadStyle(st)} style={[styles.voiceChip, sel && styles.voiceChipActive]}>
                    <Text style={[styles.voiceChipTxt, sel && styles.voiceChipTxtActive]}>{t(`reader.style.${st}`)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[styles.notesHint, { textAlign: dir.textAlign, marginTop: 8 }]}>{t(`reader.style.${readStyle}.hint`)}</Text>
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
              {VOICE_CATALOG.map((v) => {
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
                    <Text style={[styles.voiceChipTxt, sel && styles.voiceChipTxtActive]}>
                      {v.name}
                      {v.premium ? <Text style={styles.premiumBadgeTxt}>{`  ${t("voice.badge.premium")}`}</Text> : null}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => applyTranslate(!listenArabic, translateVoiceId)}
              style={styles.trApplyWrap}
            >
              <LinearGradient
                colors={listenArabic ? ["#ff5d6c", "#ff8a5c"] : GOLD_SOLID}
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
          stopAmbient(); // أوقف موسيقى الخلفية عند الخروج من العرض
          setPresMusicKey(null);
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
          stopAmbient(); // أوقف موسيقى الخلفية عند الخروج من العرض
          setPresMusicKey(null);
          setPresentOpen(false);
              }}
              style={styles.presExit}
              hitSlop={8}
            >
              <Ionicons name="chevron-down" size={18} color={Palette.text} />
              <Text style={styles.presExitTxt}>{t("reader.present.exit")}</Text>
            </Pressable>
            <Text style={[styles.presPage, { flexShrink: 1 }]} numberOfLines={1}>{presTitle}</Text>
            {/* حفظ العرض في «محفوظات الكتاب» + ملف PDF */}
            <Pressable onPress={savePresentation} disabled={!pageSlides.length || saveBusy} style={[styles.presMusicBtn, !pageSlides.length && { opacity: 0.4 }]} hitSlop={8} accessibilityLabel={t("save.save")}>
              {saveBusy ? <ActivityIndicator size="small" color={Palette.text} /> : <Ionicons name="bookmark-outline" size={18} color={Palette.text} />}
            </Pressable>
            <Pressable onPress={presentationPdf} disabled={!pageSlides.length} style={[styles.presMusicBtn, !pageSlides.length && { opacity: 0.4 }]} hitSlop={8} accessibilityLabel={t("save.pdf")}>
              <Ionicons name="document-text-outline" size={18} color={Palette.text} />
            </Pressable>
            {/* زر الموسيقى — يفتح اختيارات هادئة (للروايات/القصص) */}
            <Pressable
              onPress={() => setShowMusicPicker((v) => !v)}
              style={[styles.presMusicBtn, !!presMusicKey && styles.presMusicBtnOn]}
              hitSlop={8}
            >
              <Ionicons
                name={presMusicKey ? "musical-notes" : "musical-notes-outline"}
                size={18}
                color={presMusicKey ? SKY.onAccent : Palette.text}
              />
            </Pressable>
          </View>

          {/* نطاق العرض: هذه الصفحة أو الوحدة كاملة */}
          <View style={[styles.presScopeRow, { flexDirection: dir.row }]}>
            {(["page", "unit"] as const).map((sc) => {
              const on = presScope === sc;
              return (
                <Pressable
                  key={sc}
                  onPress={() => {
                    if (sc === presScope) return;
                    presNarratingRef.current = false;
                    setPresNarrating(false);
                    stopSpeaking();
                    setPresScope(sc);
                  }}
                  style={[styles.presScopeChip, on && styles.presScopeChipOn]}
                >
                  <Ionicons name={sc === "page" ? "document-outline" : "albums-outline"} size={15} color={on ? SKY.onAccent : Palette.text} />
                  <Text style={[styles.presScopeTxt, on && { color: SKY.onAccent }]}>
                    {t(sc === "page" ? "reader.present.scopePage" : "reader.present.scopeUnit")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* اختيارات الموسيقى الهادئة — بطاقات مرتّبة أفقيًا (بارتفاع ثابت) */}
          {showMusicPicker ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.musicScroll}
              contentContainerStyle={styles.musicScrollContent}
            >
              <Pressable
                onPress={() => {
                  setPresMusicKey(null);
                  stopAmbient();
                }}
                style={[styles.musicCard, !presMusicKey && styles.musicCardOn]}
              >
                <Ionicons name="volume-mute" size={20} color={!presMusicKey ? SKY.onAccent : Palette.textMuted} />
                <Text style={[styles.musicCardTxt, !presMusicKey && styles.musicCardTxtOn]} numberOfLines={1}>
                  {t("reader.music.none")}
                </Text>
              </Pressable>
              {MUSIC_OPTIONS.map((m) => {
                const on = presMusicKey === m.key;
                const loading = musicLoading === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => selectMusic(m.key)}
                    style={[styles.musicCard, on && styles.musicCardOn]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={on ? SKY.onAccent : Palette.text} />
                    ) : (
                      <Text style={styles.musicCardEmoji}>{MUSIC_EMOJI[m.key] ?? "🎵"}</Text>
                    )}
                    <Text style={[styles.musicCardTxt, on && styles.musicCardTxtOn]} numberOfLines={1}>
                      {loading ? t("reader.music.loading") : t(`music.${m.key}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {showMusicPicker ? (
            <Text style={[styles.musicNote, { textAlign: dir.textAlign }]}>{t("reader.music.aiNote")}</Text>
          ) : null}

          {/* الشريحة */}
          <View style={styles.presStage}>
            {slidesLoading ? (
              <View style={styles.presCenter}>
                <ActivityIndicator color={Palette.neonCyan} />
                <Text style={styles.presHint}>{t(presScope === "unit" ? "reader.present.preparingUnit" : "reader.present.preparingSlides")}</Text>
              </View>
            ) : pageSlides.length === 0 ? (
              <View style={styles.presCenter}>
                <Ionicons name="easel-outline" size={48} color={Palette.textDim} />
                <Text style={styles.presHint}>
                  {t("reader.present.emptySlides")}
                </Text>
              </View>
            ) : (
              <SlideView slide={pageSlides[slideIdx]} index={slideIdx} total={pageSlides.length} />
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
              <ActivityIndicator color={SKY.onAccent} />
            ) : (
              <Ionicons name={presNarrating ? "pause" : "play"} size={30} color={SKY.onAccent} />
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
              <Ionicons name="cloud-download" size={18} color={SKY.onAccent} />
              <Text style={styles.gatePrimaryTxt}>{t("reader.gate.downloadNow")}</Text>
            </Pressable>
            <Pressable onPress={gateContinueWithout} style={styles.gateSecondary} hitSlop={6}>
              <Text style={styles.gateSecondaryTxt}>{t("reader.gate.continueWithout")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* الخريطة الذهنية لوحدة الصفحة: ملء الشاشة مع التكبير بإصبعين، والقراءة الصوتية تستمر خلفها */}
      <Modal visible={mmOpen} animationType="slide" onRequestClose={() => setMmOpen(false)} supportedOrientations={["portrait", "landscape"]}>
        <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <View style={[styles.mmHead, { paddingTop: insets.top + 10, flexDirection: dir.row }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mmHeadTitle, { textAlign: dir.textAlign }]}>🗺️ {t("syllabus.mindmap.title")}</Text>
              {mmTitle ? (
                <Text style={[styles.mmHeadSub, { textAlign: dir.textAlign }]} numberOfLines={1}>
                  {mmTitle}
                </Text>
              ) : null}
            </View>
            {mmMap ? (
              <Pressable onPress={printReaderMindmap} hitSlop={8} accessibilityLabel={t("reader.mindmap.print")} style={styles.mmHeadBtn}>
                <Ionicons name="print-outline" size={21} color="#14233a" />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setMmOpen(false)} hitSlop={8} accessibilityLabel={t("common.close")} style={styles.mmHeadBtn}>
              <Ionicons name="close" size={22} color="#14233a" />
            </Pressable>
          </View>
          {mmBusy ? (
            <View style={styles.mmCenterBox}>
              <ActivityIndicator color="#7C5CFF" />
              <Text style={styles.mmMsg}>{t("reader.mindmap.loading")}</Text>
            </View>
          ) : mmMap ? (
            <ScrollView
              maximumZoomScale={3}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom + 12 }}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <BuzanMindMap map={mmMap} size={Math.min(screenW, 1100) - 16} theme={{ dark: false, bg: "#FFFFFF", ink: "#14233a", dim: "#5B6B82" }} />
              <Text style={styles.mmMsg}>{t("reader.mindmap.hint")}</Text>
            </ScrollView>
          ) : mmFailed ? (
            <View style={styles.mmCenterBox}>
              <Ionicons name="alert-circle-outline" size={32} color="#D97706" />
              <Text style={styles.mmMsg}>{t("reader.mindmap.failed")}</Text>
              <Pressable onPress={() => void openMindmap()} style={styles.mmRetry}>
                <Text style={styles.mmRetryTxt}>{t("reader.mindmap.retry")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* مكافأة إنهاء أول كتاب — تُمنح بلا شرط، وطلب التقييم يأتي بعد إغلاقها */}
      <UnlockModal
        visible={unlockOpen}
        bookTitle={typeof title === "string" ? title : undefined}
        newLimit={FREE_BOOKS_UNLOCKED}
        onClose={() => {
          setUnlockOpen(false);
          // مهلة قصيرة حتى تُغلق النافذة فعليًا قبل ظهور نافذة آبل
          setTimeout(() => void askForReviewOnce(), 700);
        }}
      />
      {coach.overlay}
    </SafeAreaView>
  );
}

// ألوان شرائح العرض: هادئة تنسجم مع سماء الليل (ذهبي أولًا)

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SKY.bg },
  topBar: { alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  topBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBtnPaper: { backgroundColor: "rgba(42,38,34,0.07)" },
  topTitleRow: { alignItems: "center", gap: 5, marginTop: 1 },
  navRow: { alignItems: "center", gap: 8 },
  toolsToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(21,24,56,0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SKY.cardBorder,
  },
  navArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  // تظليل الجملة: ذهبي دافئ يبقى مقروءًا فوق صفحات الكتاب البيضاء
  sentHL: { position: "absolute", borderRadius: 5, backgroundColor: "rgba(246,213,138,0.35)" },
  // الكلمة المنطوقة: ذهبي أقوى + خط سفلي كهرماني واضح على الأبيض
  wordNow: { position: "absolute", borderRadius: 4, backgroundColor: "rgba(246,213,138,0.55)", borderBottomWidth: 2.5, borderBottomColor: "#D9A43A" },
  followPill: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: SKY.accent,
  },
  followTxt: { color: SKY.onAccent, fontSize: 13, fontWeight: "800" },
  lensDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,14,38,0.45)" },
  lensCard: {
    height: "48%",
    marginHorizontal: 10,
    borderRadius: 22,
    backgroundColor: SKY.card,
    borderWidth: 1,
    borderColor: SKY.cardBorder,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  lensHead: { alignItems: "center", gap: 8, paddingHorizontal: 12, height: 44 },
  lensTitle: { color: SKY.ink, fontSize: 13.5, fontWeight: "700" },
  zoomChip: { paddingHorizontal: 9, height: 28, borderRadius: 14, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  zoomChipOn: { backgroundColor: SKY.accent },
  zoomTxt: { color: SKY.dim, fontSize: 12, fontWeight: "700" },
  zoomTxtOn: { color: SKY.onAccent },
  lensClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" },
  lensView: { flex: 1, marginHorizontal: 6, marginBottom: 6, borderRadius: 16, overflow: "hidden", backgroundColor: "#FFFFFF" },
  lensHint: { position: "absolute", bottom: 10, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(11,14,38,0.85)" },
  lensHintTxt: { color: SKY.ink, fontSize: 12 },
  topSub: { color: Palette.textDim, fontSize: 12, maxWidth: "100%" },
  topTitle: { color: Palette.text, fontSize: 14, fontWeight: "700", marginTop: 1 },

  checkCard: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    zIndex: 20,
    padding: 12,
    gap: 10,
    borderRadius: 20,
    backgroundColor: SKY.card,
    borderWidth: 1,
    borderColor: SKY.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  checkHead: { alignItems: "center", gap: 10 },
  checkMic: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" },
  walkChip: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    zIndex: 19,
    alignItems: "center",
    gap: 8,
    maxWidth: "88%",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(21,24,56,0.96)",
    borderWidth: 1,
    borderColor: "rgba(246,213,138,0.35)",
  },
  walkChipTxt: { color: SKY.ink, fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
  checkOrb: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  checkTitle: { color: SKY.ink, fontSize: 15, fontWeight: "700" },
  checkSub: { color: SKY.dim, fontSize: 12, marginTop: 2 },
  checkRow: { gap: 6 },
  checkBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBtnMain: { backgroundColor: SKY.accent },
  checkBtnAlt: { flex: 1.3, backgroundColor: GOLD_SOFT },
  checkBtnTxt: { color: SKY.ink, fontSize: 13, fontWeight: "600" },
  checkBtnMainTxt: { color: SKY.onAccent, fontSize: 13, fontWeight: "800" },
  checkBody: { color: Palette.textMuted, fontSize: 14, lineHeight: 24 },

  bottom: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6, gap: 6 },
  gotoModes: { gap: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 4 },
  gotoMode: { flex: 1, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  gotoModeOn: { backgroundColor: SKY.accent },
  gotoModeTxt: { color: Palette.textMuted, fontSize: 13.5, fontWeight: "700" },
  gotoModeTxtOn: { color: SKY.onAccent, fontWeight: "900" },
  pagerSide: { position: "absolute", top: 0 },
  pagePill: {
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: "rgba(21,24,56,0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SKY.cardBorder,
  },
  pagePillTxt: { color: Palette.text, fontSize: 12.5, fontWeight: "800" },
  quickRow: { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  qChip: {
    minWidth: 64,
    height: 54,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(21,24,56,0.92)",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  // المفعّل واضح على أي خلفية (ورقية أو داكنة): ذهبي ممتلئ ونص داكن
  qChipOn: { backgroundColor: SKY.accent },
  goldPlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKY.accent,
    shadowColor: SKY.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  qChipTxt: { color: Palette.text, fontSize: 15, fontWeight: "900" },
  qChipLbl: { color: SKY.dim, fontSize: 10.5, fontWeight: "700", maxWidth: 86 },
  capBadge: { position: "absolute", top: 4, right: 2, color: SKY.accent, fontSize: 9.5, fontWeight: "900" },
  capsule: {
    height: 64,
    borderRadius: 30,
    backgroundColor: "rgba(21,24,56,0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  capBtn: { width: 56, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  tabsRow: { gap: 6 },
  toolTab: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(21,24,56,0.92)" },
  toolTabOn: { backgroundColor: SKY.accent },
  toolTabTxt: { color: SKY.dim, fontSize: 12.5, fontWeight: "800" },
  inGrid: { flexWrap: "wrap", gap: 6 },
  inTool: {
    width: "23.5%",
    alignItems: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(21,24,56,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  inToolOn: { backgroundColor: SKY.accent, borderColor: SKY.accent },
  inToolLbl: { color: SKY.dim, fontSize: 10.5, fontWeight: "700", maxWidth: "92%" },
  optRow: { gap: 6, paddingVertical: 2 },
  optChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(21,24,56,0.92)" },
  optChipOn: { backgroundColor: SKY.accent },
  optChipTxt: { color: Palette.text, fontSize: 12.5, fontWeight: "700" },
  capDot: { position: "absolute", top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.neonCyan },
  capPlay: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    // دائرة ذهبية مُصمتة بأيقونة كحلية وتوهّج ذهبي ناعم
    backgroundColor: SKY.accent,
    shadowColor: SKY.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  capAa: { color: Palette.text, fontSize: 19, fontWeight: "700" },

  toolsSheet: {
    backgroundColor: SKY.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  sheetGrip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 10 },
  toolsTitle: { color: Palette.text, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  toolsSection: { color: Palette.textDim, fontSize: 12, fontWeight: "700" },
  toolsWide: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toolsWideTxt: { flex: 1, color: Palette.text, fontSize: 14, fontWeight: "700" },
  toolsGrid: { flexWrap: "wrap", gap: 8 },
  tile: {
    width: "23.5%",
    minHeight: 76,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 4,
  },
  tileOn: { backgroundColor: GOLD_SOFT, borderColor: "rgba(246,213,138,0.45)" },
  tileTxt: { color: Palette.text, fontSize: 16, fontWeight: "800" },
  tileLabel: { color: Palette.textMuted, fontSize: 11.5, fontWeight: "600", textAlign: "center" },
  tileBadge: {
    position: "absolute",
    top: -8,
    right: -14,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Palette.neonViolet,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeTxt: { color: SKY.onAccent, fontSize: 10, fontWeight: "800" },
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
  aiBtnTxt: { color: SKY.onAccent, fontWeight: "900", fontSize: 13 },

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
  countDotTxt: { color: SKY.onAccent, fontSize: 10, fontWeight: "900" },

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
  makeCardsTxt: { color: SKY.onAccent, fontSize: 14, fontWeight: "900" },
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

  mmHead: { alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E3E8F0" },
  mmHeadTitle: { color: "#14233a", fontSize: 17, fontWeight: "900" },
  mmHeadSub: { color: "#5B6B82", fontSize: 13.5, fontWeight: "700", marginTop: 2 },
  mmHeadBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F1F4F9", alignItems: "center", justifyContent: "center" },
  mmCenterBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  mmMsg: { color: "#5B6B82", fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 22, marginTop: 8, paddingHorizontal: 16 },
  mmRetry: { backgroundColor: "#7C5CFF", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 },
  mmRetryTxt: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
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
  aiCardRow: { borderRadius: 12, borderWidth: 1, borderColor: Palette.glassBorder, backgroundColor: Palette.surface, padding: 10, gap: 4 },
  aiCardQ: { color: Palette.text, fontSize: 14.5, lineHeight: 23, fontWeight: "800" },
  aiCardA: { color: Palette.textMuted, fontSize: 14, lineHeight: 22 },
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
    backgroundColor: "rgba(246,213,138,0.18)", // تظليل السطر خفيف
  },
  presScopeRow: { gap: 8, paddingHorizontal: 16, marginTop: 8, justifyContent: "center" },
  presScopeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  presScopeChipOn: { backgroundColor: SKY.accent, borderColor: SKY.accent },
  presScopeTxt: { color: Palette.text, fontSize: 13, fontWeight: "800" },
  aiSaveRow: { gap: 10, marginTop: 14 },
  aiSaveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: Palette.neonCyan + "66" },
  aiSaveTxt: { color: Palette.neonCyan, fontSize: 13, fontWeight: "800" },
  inkMarginBg: { backgroundColor: "rgba(255,255,255,0.05)" },
  inkBarWrap: { position: "absolute", top: 10, left: 0, right: 0, alignItems: "center", zIndex: 20 },
  pdfImgWrap: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", backgroundColor: "transparent" },
  pdfImgWrapFull: { paddingBottom: 96 }, // مساحة للأزرار العائمة بالأسفل
  textScroll: { flex: 1, backgroundColor: "transparent" },
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
  hlToggleOn: { backgroundColor: SKY.accent, borderColor: SKY.accent },
  hlTogglePaper: { backgroundColor: "rgba(42,38,34,0.06)", borderColor: "rgba(42,38,34,0.14)" },
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
  wordSpoken: { color: SKY.onAccent, backgroundColor: SKY.accent, fontWeight: "800" },

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
  dictSave: { alignSelf: "flex-start", alignItems: "center", gap: 6, marginTop: 12, paddingHorizontal: 14, height: 38, borderRadius: 12, backgroundColor: SKY.accent },
  dictSaveTxt: { color: SKY.onAccent, fontSize: 13.5, fontWeight: "800" },

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
  gotoBtnTxt: { color: SKY.onAccent, fontSize: 16, fontWeight: "900" },

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
  floatSpeed: { color: Palette.text, fontSize: 15, fontWeight: "900" },

  toast: {
    position: "absolute",
    top: 70,
    alignSelf: "center",
    maxWidth: "88%",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: SKY.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(246,213,138,0.35)",
  },
  toastTxt: { color: SKY.ink, fontSize: 14, fontWeight: "800", textAlign: "center" },

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
    marginHorizontal: 0,
    marginTop: 2,
    overflow: "hidden",
    backgroundColor: "transparent",
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
    marginVertical: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.xl,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.border,
    gap: 5,
  },
  voicePickBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
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
  voiceRowName: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexShrink: 1 },
  voiceGroupTxt: { color: Palette.textMuted, fontSize: 12, fontWeight: "800", marginTop: 4 },
  premiumBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: "#E8C26A",
    backgroundColor: "rgba(232,194,106,0.14)",
  },
  premiumBadgeTxt: { color: "#E8C26A", fontSize: 11, fontWeight: "800" },
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
  langChipTxtOn: { color: SKY.onAccent },
  voiceRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 2 },
  arToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: "rgba(246,213,138,0.4)",
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
  modeSegTxtOn: { color: SKY.onAccent },
  aidsRow: { flexDirection: "row-reverse", gap: 8, marginTop: 8 },
  aidWrap: {
    flex: 1,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  aidGrad: { paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  aidGradTxt: { color: SKY.onAccent, fontSize: 12.5, fontWeight: "900" },
  trVoicesLabel: { color: Palette.textMuted, fontSize: 13, fontWeight: "800", textAlign: "right", marginTop: 12, marginBottom: 8 },
  trApplyWrap: { borderRadius: Radius.lg, overflow: "hidden", marginTop: 16 },
  trApply: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  trApplyTxt: { color: SKY.onAccent, fontSize: 15, fontWeight: "900" },

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
  musicNote: { color: Palette.textMuted, fontSize: 11, fontWeight: "600", marginTop: 6, opacity: 0.85 },
  musicChipTxt: { color: Palette.text, fontSize: 13, fontWeight: "800" },
  musicChipTxtOn: { color: SKY.onAccent },
  // بطاقات موسيقى العرض التقديمي (ارتفاع ثابت — لا تتمدّد لأشرطة طويلة)
  musicScroll: { flexGrow: 0, marginTop: 6 },
  musicScrollContent: { alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  musicCard: {
    width: 92,
    height: 76,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  musicCardOn: { backgroundColor: Palette.neonCyan, borderColor: Palette.neonCyan },
  musicCardEmoji: { fontSize: 24 },
  musicCardTxt: { color: Palette.text, fontSize: 12, fontWeight: "800", textAlign: "center" },
  musicCardTxtOn: { color: SKY.onAccent },
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
  voiceChipTxtActive: { color: SKY.onAccent },

  controls: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 18 },
  navBtn: {
    width: 104,
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
  skipBadgeTxt: { color: SKY.onAccent, fontSize: 11, fontWeight: "900" },
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
  gatePrimaryTxt: { color: SKY.onAccent, fontSize: 16, fontWeight: "900" },
  gateSecondary: { marginTop: 14, padding: 6 },
  gateSecondaryTxt: { color: Palette.textDim, fontSize: 14, fontWeight: "700" },
  toolTxt: { color: Palette.text, fontSize: 11, fontWeight: "900", paddingHorizontal: 2 },
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
  chipTxtActive: { color: SKY.onAccent },

  pageInfo: { color: Palette.textMuted, textAlign: "center", fontWeight: "800", fontSize: 13 },
  statusTxt: { color: Palette.neonCyan, textAlign: "center", fontWeight: "700", fontSize: 12, marginTop: 2 },
  warnTxt: { color: Palette.warn, textAlign: "center", fontWeight: "700", fontSize: 12, marginTop: 4 },
});
