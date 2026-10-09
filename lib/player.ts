// lib/player.ts
// المشغّل العام (تصميم 2.0 — «الشريط العائم»): يُبقي الكتاب مسموعًا أثناء التنقّل.
//
// الفكرة: القارئ هو المشغّل الكامل (تظليل الكلمات، العدسة، الترجمة…). عند مغادرته
// والصوت شغّال، يسلّم الموضع (الكتاب + الصفحة + الجملة) لهذا المشغّل الخفيف الذي يكمل
// القراءة جملة-بجملة وصفحة-بصفحة، ويحفظ الموضع باستمرار. عند الرجوع للقارئ يستلم
// القارئ من نفس الجملة (takeOver) ويتوقف هذا المشغّل — فلا يُقرأ الكتاب من مكانين.
import { getSpokenName } from "./auth";
import { extractPdfPageText, getPreciseText } from "./pdfText";
import { setLastPage, setLastSentence } from "./readerPrefs";
import { focusEvery, getFocusLevel } from "./settings";
import { recordActivity } from "./stats";
import { splitSentences } from "./textUtils";
import { closeReadingCard, nextSpeed, onReadingAction, syncReadingCard } from "./readingCard";
import {
  holdAudioSession,
  isPremiumVoice,
  onPremiumExhausted,
  setLivePlaybackRate,
  setNowPlaying,
  speakText,
  standardVoiceFor,
  stopSpeaking,
} from "./voice";

export type PlayerState = {
  bookId: string;
  title: string;
  pdfPath: string;
  page: number;
  totalPages: number;
  idx: number; // الجملة الحالية داخل الصفحة
  voiceId: string;
  rate: number;
  precise: boolean; // المسار الدقيق (تشكيل) — كما كان مفعّلًا في القارئ
  playing: boolean;
  loading: boolean;
  sentence: string; // نص الجملة الحالية (يُعرض في الشريط)
};

export type Handoff = Omit<PlayerState, "playing" | "loading" | "sentence">;

let state: PlayerState | null = null;
let token = 0; // يُبطل أي ردّ متأخر بعد إيقاف/تبديل
let sents: string[] = [];
let sentsPage = 0;
let playStart = 0;
let focusCount = 0;
const listeners = new Set<(s: PlayerState | null) => void>();

function emit() {
  const snap = state ? { ...state } : null;
  listeners.forEach((fn) => fn(snap));
  // بطاقة الجزيرة العائمة/شاشة القفل تتبع حالة المشغّل العام
  if (snap) syncReadingCard(snap);
  else closeReadingCard();
}

// أزرار البطاقة حين يكون المشغّل العام هو من يقرأ (القارئ مغلق)
let cardSub: (() => void) | null = null;
function listenCard() {
  if (cardSub) return;
  cardSub = onReadingAction((a) => {
    if (!state) return;
    if (a === "toggle") return state.playing ? pause() : resume();
    const r = nextSpeed(state.rate);
    setLivePlaybackRate(r);
    patch({ rate: r });
  });
}
function unlistenCard() {
  cardSub?.();
  cardSub = null;
}

function patch(p: Partial<PlayerState>) {
  if (!state) return;
  state = { ...state, ...p };
  emit();
}

// انتهت صفحات الصوت الفاخر: speakText يعيد الجملة بالأساسي؛ نثبّته هنا للجمل التالية
onPremiumExhausted(() => {
  if (state && isPremiumVoice(state.voiceId)) patch({ voiceId: standardVoiceFor(state.voiceId) });
});

export function getPlayer(): PlayerState | null {
  return state ? { ...state } : null;
}

export function subscribePlayer(fn: (s: PlayerState | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function logMinutes() {
  if (!playStart) return;
  const mins = Math.round((Date.now() - playStart) / 60000);
  playStart = 0;
  if (mins > 0) recordActivity({ minutes: mins }).catch(() => {});
}

/** القارئ يسلّم الموضع عند مغادرته والصوت شغّال. */
export function handoff(h: Handoff) {
  token++;
  sents = [];
  sentsPage = 0;
  focusCount = 0;
  state = { ...h, playing: true, loading: true, sentence: "" };
  playStart = Date.now();
  listenCard();
  emit();
  void playFrom(h.page, h.idx, token);
}

export function pause() {
  if (!state?.playing) return;
  token++;
  stopSpeaking().catch(() => {});
  logMinutes();
  patch({ playing: false, loading: false });
}

export function resume() {
  if (!state || state.playing) return;
  token++;
  playStart = Date.now();
  patch({ playing: true });
  void playFrom(state.page, state.idx, token);
}

/** إغلاق الشريط: يوقف الصوت ويُخفي الشريط (الموضع محفوظ أصلًا). */
export function close() {
  token++;
  stopSpeaking().catch(() => {});
  logMinutes();
  state = null;
  unlistenCard();
  emit();
}

/**
 * القارئ يستلم: إن كان هذا المشغّل يقرأ نفس الكتاب نوقفه ونُرجع هل كان شغّالًا
 * (الموضع محفوظ في readerPrefs فيفتح القارئ عليه تلقائيًا).
 */
export function takeOver(bookId?: string): { wasPlaying: boolean } {
  if (!state || state.bookId !== bookId) {
    // كتاب آخر يُفتح: نوقف المشغّل حتى لا يتداخل صوتان
    if (state) close();
    return { wasPlaying: false };
  }
  const wasPlaying = state.playing;
  token++;
  stopSpeaking().catch(() => {});
  logMinutes();
  state = null;
  unlistenCard();
  // القارئ يستلم ويعرض البطاقة بنفسه — لا نغلقها هنا حتى لا تختفي وتظهر
  listeners.forEach((fn) => fn(null));
  return { wasPlaying };
}

async function loadPage(p: number, my: number): Promise<boolean> {
  if (!state) return false;
  if (sentsPage === p && sents.length) return true;
  patch({ loading: true });
  try {
    const res = await extractPdfPageText(state.pdfPath, p);
    if (my !== token || !state) return false;
    let text = res.text;
    if ((state.precise || res.ocr) && text.trim()) text = await getPreciseText(state.pdfPath, res.page, text, !!res.ocr);
    if (my !== token || !state) return false;
    sents = splitSentences(text);
    sentsPage = res.page;
    patch({ loading: false, totalPages: res.totalPages || state.totalPages });
    return true;
  } catch {
    if (my === token) patch({ loading: false, playing: false });
    return false;
  }
}

async function playFrom(p: number, i: number, my: number) {
  if (!state || my !== token) return;
  setNowPlaying({ title: state.title, artist: "" });
  const ok = await loadPage(p, my);
  if (!ok || !state || my !== token) return;

  if (sents.length === 0 || i >= sents.length) {
    // صفحة منتهية أو بلا نص → التالية، أو نهاية الكتاب
    if (sents.length > 0) recordActivity({ pages: 1 }).catch(() => {});
    if (p < state.totalPages) {
      holdAudioSession(true); // يُبقي الصوت حيًّا بين الصفحات والجوال مقفل
      patch({ page: p + 1, idx: 0 });
      return playFrom(p + 1, 0, my);
    }
    logMinutes();
    patch({ playing: false });
    return;
  }

  patch({ page: p, idx: i, sentence: sents[i] });
  setLastPage(state.bookId, p).catch(() => {});
  setLastSentence(state.bookId, i).catch(() => {});

  const speakSentence = () => {
    if (!state || my !== token) return;
    speakText(sents[i], {
      voiceId: state.voiceId,
      // صفحة الكتاب → تُحسب من حصة الصفحات (مرة في الشهر) لا بالأحرف
      page: { book: state.pdfPath, page: p },
      rate: state.rate,
      onDone: () => {
        if (my === token) void playFrom(p, i + 1, my);
      },
      onError: () => {
        if (my === token) pause();
      },
    });
  };

  // وضع التركيز: نفس نداء القارئ بالاسم المسجّل (صياغة محايدة)
  focusCount += 1;
  const [level, name] = await Promise.all([getFocusLevel().catch(() => 0 as const), getSpokenName().catch(() => "")]);
  const every = focusEvery(level);
  if (name && every > 0 && focusCount % every === 0 && my === token && state) {
    const phrases = [`معاي يا ${name}؟`, `نكمل يا ${name}؟`, `رائع يا ${name}، نكمل.`];
    speakText(phrases[Math.floor(focusCount / every) % phrases.length], {
      voiceId: state.voiceId,
      rate: state.rate,
      onDone: speakSentence,
      onError: speakSentence,
    });
  } else {
    speakSentence();
  }
}
