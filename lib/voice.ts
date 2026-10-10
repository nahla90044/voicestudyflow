// lib/voice.ts
// أصوات بشرية عبر ElevenLabs مع رجوع تلقائي لصوت الجهاز (expo-speech) عند الفشل.
//
// الأمان: لا يوجد أي مفتاح ElevenLabs في العميل إطلاقًا. كل طلبات الصوت تمرّ عبر
// دالة Supabase «tts» (Edge Function) التي تحفظ المفتاح سرّيًا بالسيرفر
// (Deno.env). لا تضعي EXPO_PUBLIC_ELEVENLABS_API_KEY في .env — أي متغيّر
// EXPO_PUBLIC_ يُحزَّم داخل التطبيق ويصبح مكشوفًا. الواجهة (speakText/stopSpeaking)
// تبقى كما هي.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";

import { isReadingCardSupported } from "../modules/reading-activity";
import { LIVE_CARD_ENABLED } from "./readingCard";
import { requestPaywall } from "./plan";

import { numbersToArabicWords } from "./arabicNumbers";
import { detectSpeechLang, normalizeLatinDates } from "./speechLang";
import { markUpdateRequired } from "./appVersion";
import { supabase } from "./supabase";

/* -------- سجلّ عام لكل مشغّلات السرد: صوت واحد فقط في أي لحظة -------- */
// يُحفظ على globalThis فيبقى حتى لو أُعيد تحميل هذه الوحدة (التحديث السريع أثناء التطوير)،
// فلا يبقى صوت «يتيم» يقرأ بلا زر يوقفه. أي سرد جديد يُسكت كل ما قبله.
type Registry = Set<AudioPlayer>;
const G = globalThis as unknown as { __vsfNarration?: Registry };
const registry: Registry = (G.__vsfNarration ??= new Set());
// وحدة أُعيد تحميلها: أسكت أي مشغّلات من النسخة السابقة
for (const p of registry) {
  try {
    p.pause();
    p.remove();
  } catch {}
}
registry.clear();

function track(p: AudioPlayer): AudioPlayer {
  registry.add(p);
  return p;
}
function silenceAllExcept(keep: AudioPlayer | null) {
  for (const p of [...registry]) {
    if (p === keep || p === warmPlayer?.player) continue;
    try {
      p.pause();
      p.remove();
    } catch {}
    registry.delete(p);
  }
}

export type VoiceGender = "male" | "female";
export type VoiceLang = "ar" | "en";

export type SpeakCallbacks = {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (e: unknown) => void;
  // يُستدعى عند فشل الصوت البشري والرجوع لصوت الجهاز (للتشخيص)
  onFallback?: (reason: string) => void;
  // تقدّم التشغيل 0..1 (لتحديد الكلمة المقروءة)
  onProgress?: (fraction: number) => void;
};

export type SpeakOptions = {
  lang?: VoiceLang;
  gender?: VoiceGender;
  voiceId?: string; // معرّف صوت محدد من الكتالوج (يتجاوز gender)
  rate?: number;
  pitch?: number;
  expressive?: boolean; // صوت أدفأ وأكثر تعبيرًا (للعرض التقديمي/السرد)
  page?: PageRef; // صفحة الكتاب المقروءة (تُحسب من حصة الصفحات مرة واحدة في الشهر)
} & SpeakCallbacks;

/** صفحة كتاب يُقرأ صوتها — حصة الاشتراك بالصفحات (إعادة الاستماع مجانية) */
export type PageRef = { book: string; page: number };

/* ---------------- كتالوج أصوات ElevenLabs العربية ---------------- */

export type VoiceOption = {
  id: string;
  name: string; // الاسم المعروض في الواجهة
  voiceId: string; // معرّف ElevenLabs
  gender: VoiceGender;
  rate?: number; // سرعة تشغيل خاصة بالصوت (< 1 = أبطأ وأعمق)
  lang?: "ar" | "en" | "fr"; // لغة الصوت (افتراضي عربي) — لكتب اللغات
  premium?: boolean; // صوت فاخر (ElevenLabs) — بعدد صفحات محدود في الاشتراك
};

// الأصوات الأساسية: Microsoft Azure (واضحة وبلا سقف ضمن صفحات الخطة) — تأتي أولًا.
// ثم الأصوات الفاخرة: ElevenLabs (أقرب للصوت البشري، بعدد صفحات محدود شهريًا).
export const VOICE_CATALOG: VoiceOption[] = [
  { id: "rashid", name: "راشد · فصحى", voiceId: "azure:ar-AE-Rashid:DragonHDLatestNeural", gender: "male" },
  { id: "hamed", name: "حامد · سعودي", voiceId: "azure:ar-SA-HamedNeural", gender: "male" },
  { id: "zariyah", name: "زارية · سعودية", voiceId: "azure:ar-SA-ZariyahNeural", gender: "female" },
  { id: "salma-az", name: "سلمى · مصرية", voiceId: "azure:ar-EG-SalmaNeural", gender: "female" },
  { id: "ava", name: "Ava · English", voiceId: "azure:en-US-Ava:DragonHDLatestNeural", gender: "female", lang: "en" },
  { id: "andrew", name: "Andrew · English", voiceId: "azure:en-US-Andrew:DragonHDLatestNeural", gender: "male", lang: "en" },
  { id: "vivienne", name: "Vivienne · Français", voiceId: "azure:fr-FR-VivienneMultilingualNeural", gender: "female", lang: "fr" },
  { id: "remy", name: "Rémy · Français", voiceId: "azure:fr-FR-RemyMultilingualNeural", gender: "male", lang: "fr" },
  // الأصوات الفاخرة (ElevenLabs)
  { id: "omar", name: "عمر · فصحى", voiceId: "apsZFlSToM2vmFpwz5jX", gender: "male", premium: true },
  { id: "abdullah", name: "عبدالله · فصحى جهوري", voiceId: "XdoLPWNt7ytn6BtU4FBf", gender: "male", premium: true },
  { id: "tariq", name: "طارق · فصحى رنّان", voiceId: "18HMWpalD7cscJTD8lEY", gender: "male", premium: true },
  { id: "layla", name: "ليلى · فصحى", voiceId: "RaelJk8tltOJ5KMrKjDu", gender: "female", premium: true },
  { id: "haytham", name: "هيثم · حكواتي", voiceId: "UR972wNGq3zluze0LoIp", gender: "male", premium: true, rate: 0.82 },
  { id: "yahya", name: "يحيى · حكواتي فصحى", voiceId: "QRq5hPRAKf5ZhSlTBH6r", gender: "male", premium: true },
  { id: "fatima", name: "فاطمة · مصرية", voiceId: "vWDp3PLsTWjIhBxxUKh9", gender: "female", premium: true },
  { id: "sufyan", name: "سفيان · عراقي", voiceId: "9FHjCdVXgA4tYxIYHTcZ", gender: "male", premium: true },
  { id: "sultan", name: "سلطان · خليجي", voiceId: "rUaPbzcZIu8df8iNL9WZ", gender: "male", premium: true },
  { id: "salma", name: "سلمى · خليجي", voiceId: "KxMRrXEjbJ6kZ93yT3fq", gender: "female", premium: true },
  { id: "noura", name: "نورة · خليجي", voiceId: "isQLuoVuANx6FjDxyasX", gender: "female", premium: true },
  // أصوات إنجليزية وفرنسية لكتب اللغات (أصوات ElevenLabs الجاهزة)
  { id: "rachel", name: "Rachel · English", voiceId: "21m00Tcm4TlvDq8ikWAM", gender: "female", premium: true, lang: "en" },
  { id: "adam", name: "Adam · English", voiceId: "pNInz6obpgDQGcFmaJgB", gender: "male", premium: true, lang: "en" },
  { id: "charlotte", name: "Charlotte · Français", voiceId: "XB0fDUnXU5powFXDhCwa", gender: "female", premium: true, lang: "fr" },
  { id: "antoni", name: "Antoni · Français", voiceId: "ErXwobaYiN019PkySvjV", gender: "male", premium: true, lang: "fr" },
];

export const DEFAULT_VOICE_ID = VOICE_CATALOG[0].voiceId;

/** هل الصوت فاخر (ElevenLabs)؟ أي معرّف لا يبدأ بـ azure: يُعدّ فاخرًا */
export const isPremiumVoice = (voiceId?: string) => !!voiceId && !voiceId.startsWith("azure:");

/** الصوت الأساسي المناسب للغة (عند انتهاء صفحات الصوت الفاخر) */
export function standardVoiceFor(voiceId?: string): string {
  const lang = voiceLangOf(voiceId);
  const g = VOICE_CATALOG.find((v) => v.voiceId === voiceId)?.gender;
  return (
    VOICE_CATALOG.find((v) => !v.premium && (v.lang ?? "ar") === lang && (!g || v.gender === g))?.voiceId ??
    VOICE_CATALOG.find((v) => !v.premium && (v.lang ?? "ar") === lang)?.voiceId ??
    DEFAULT_VOICE_ID
  );
}

// انتهت صفحات الصوت الفاخر هذا الشهر → القراءة تكمل بالأساسي، والواجهة تنبّه مرة
const premiumListeners = new Set<() => void>();
export function onPremiumExhausted(fn: () => void): () => void {
  premiumListeners.add(fn);
  return () => premiumListeners.delete(fn);
}

/** لغة الصوت المختار من الكتالوج (افتراضي عربي) — تحدّد طريقة تنظيف النص للنطق. */
export function voiceLangOf(voiceId?: string): "ar" | "en" | "fr" {
  return VOICE_CATALOG.find((v) => v.voiceId === voiceId)?.lang ?? "ar";
}

/* ---------------- إعدادات الصوت ---------------- */
// لا مفتاح صوت في العميل — التوليد عبر الدالة السحابية «tts» فقط (المفتاح بالسيرفر).

// احتياطي عند غياب voiceId (المسار المباشر فقط)
const VOICE_IDS: Record<VoiceGender, string> = {
  female: "RaelJk8tltOJ5KMrKjDu", // Layla
  male: "apsZFlSToM2vmFpwz5jX", // Omar
};

/* ---------------- حالة التشغيل ---------------- */

let currentPlayer: AudioPlayer | null = null;
let currentVoiceRate = 1; // سرعة الصوت الجاري الداخلية (لتطبيق سرعة المستخدم فورًا)
let audioModeReady = false;
// مشغّل المقطع التالي مُحمّل مسبقًا (لتشغيل متواصل بلا فجوة بين المقاطع)
let warmPlayer: { uri: string; player: AudioPlayer } | null = null;

function disposeWarm() {
  if (warmPlayer) {
    try {
      warmPlayer.player.remove();
    } catch {}
    registry.delete(warmPlayer.player);
    warmPlayer = null;
  }
}

/* -------- أزرار التحكّم على شاشة القفل (مثل البودكاست) -------- */
// بيانات «قيد التشغيل» التي تظهر على شاشة القفل (يحدّثها القارئ باسم الكتاب والصوت).
let nowPlayingMeta: { title: string; artist: string } = { title: "VoiceStudyFlow", artist: "" };

/**
 * أُوقف المقطع من شاشة القفل/الجزيرة (iOS يوقف المشغّل مباشرة)؟ نكمله من مكانه.
 * يُرجع true إن كان موقوفًا خارجيًا واستُؤنف — فلا يعامل الزر الضغطة كإيقاف.
 */
export function resumeIfPausedExternally(): boolean {
  const p = currentPlayer;
  if (!p) return false;
  try {
    if (!p.playing && p.currentTime > 0 && p.currentTime < (p.duration || Infinity) - 0.05) {
      p.play();
      return true;
    }
  } catch {
    // مشغّل محرَّر → نترك الزر يتصرف عاديًا
  }
  return false;
}

/** يحدّث بيانات شاشة القفل (اسم الكتاب/الصوت) قبل بدء القراءة. */
export function setNowPlaying(meta: { title?: string; artist?: string }): void {
  nowPlayingMeta = {
    title: meta.title?.trim() || "VoiceStudyFlow",
    artist: meta.artist?.trim() || "",
  };
}

// نوع مساعد: دوال شاشة القفل قد لا تتوفّر في كل النسخ (Expo Go) → اختيارية وآمنة.
type LockScreenCapable = {
  setActiveForLockScreen?: (active: boolean, metadata?: AudioMetadata, options?: object) => void;
  updateLockScreenMetadata?: (metadata: AudioMetadata) => void;
  clearLockScreenControls?: () => void;
};
type AudioMetadata = { title?: string; artist?: string; albumTitle?: string; artworkUrl?: string };

/** يفعّل أزرار شاشة القفل لهذا المشغّل (يتجاهل بأمان إن لم تتوفّر الميزة). */
function activateLockScreen(player: AudioPlayer): void {
  // بطاقة القراءة الحيّة (الجزيرة العائمة) تحلّ محلّ عناصر «قيد التشغيل» العامة حين تتوفّر،
  // حتى لا يظهر للمستخدم مشغّلان في الجزيرة وشاشة القفل.
  if (LIVE_CARD_ENABLED && isReadingCardSupported()) return;
  try {
    (player as unknown as LockScreenCapable).setActiveForLockScreen?.(
      true,
      { title: nowPlayingMeta.title, artist: nowPlayingMeta.artist, albumTitle: "VoiceStudyFlow" },
      // نُبقي زرّي التشغيل/الإيقاف فقط (المقاطع قصيرة، فلا معنى للتقديم داخل المقطع)
      { showSeekForward: false, showSeekBackward: false }
    );
  } catch {
    // الميزة غير متوفّرة → التشغيل يكمل عاديًا بلا أزرار قفل
  }
}

/** يزيل أزرار شاشة القفل عند التوقّف الكامل. */
function clearLockScreen(player: AudioPlayer | null): void {
  if (!player) return;
  try {
    (player as unknown as LockScreenCapable).clearLockScreenControls?.();
  } catch {}
}

/**
 * بعد استخدام الميكروفون (التعرّف على الكلام) يتغيّر وضع الصوت في iOS إلى
 * تسجيل+تشغيل؛ هذا يجبر ensureAudioMode على إعادة ضبط وضع التشغيل المعتاد.
 */
export function invalidateAudioMode(): void {
  audioModeReady = false;
}

/**
 * وضع المشي: السرد والميكروفون معًا. نسمح بالتسجيل في جلسة الصوت (تشغيل+تسجيل)
 * ونُبقي التشغيل بالخلفية؛ وعند الإيقاف نعيد وضع التشغيل المعتاد.
 */
export async function setRecordingAudioMode(on: boolean): Promise<void> {
  if (!on) {
    audioModeReady = false;
    await ensureAudioMode();
    return;
  }
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "mixWithOthers",
      allowsRecording: true,
    });
    audioModeReady = true; // لا تُعِد speakText ضبطه لوضع تشغيل فقط فيُقطع الميكروفون
  } catch {
    // نتجاهل: الاستماع يعمل بإعدادات التعرّف الافتراضية
  }
}

export async function ensureAudioMode() {
  if (audioModeReady) return;
  // يشغّل الصوت حتى لو الجهاز على الصامت، ويكمل في الخلفية / عند قفل الشاشة.
  // مهم: لا نسمح لفشل ضبط الوضع بإسقاط التشغيل (في Expo Go قد لا تتوفر
  // خاصية التشغيل بالخلفية) — نجرّب إعدادًا أبسط بدلًا من رمي الخطأ.
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // "mixWithOthers" لا "doNotMix": التطبيق يشغّل مشغّلَين معًا (السرد +
      // الموسيقى الخلفية)، و"doNotMix" كان يجعل جلسة الصوت حصرية فتُكتم
      // الموسيقى — وبوضوح عند قفل الشاشة حيث يبقى السرد وحده.
      interruptionMode: "mixWithOthers",
    });
  } catch {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {
      // نتجاهل — التشغيل العادي يكفي
    }
  }
  audioModeReady = true;
}

// رمز تشغيل يتغيّر مع كل إيقاف — يُلغي أي صوت كان قيد التحضير (يمنع التراكب)
let playToken = 0;

function disposePlayer() {
  if (currentPlayer) {
    try {
      currentPlayer.pause(); // إيقاف فعلي قبل الحذف
    } catch {}
    try {
      currentPlayer.remove();
    } catch {}
    registry.delete(currentPlayer);
    currentPlayer = null;
  }
  // لا نحذف الملف: صار مخبّأً (cache) لإعادة استخدامه بدون تكلفة جديدة
}

/* ---------------- تخزين الصوت محليًا (cache) ---------------- */
// نخبّئ كل مقطع صوتي باسم مشتق من (الجنس + الصوت + النص) حتى:
//  - لا نعيد دفع تكلفة ElevenLabs لنفس الجملة
//  - يعمل التشغيل بدون إنترنت بعد أول مرة

const CACHE_DIR_NAME = "tts-cache-v10"; // v10: مع توقيت الحروف للهايلايت كلمة-بكلمة
const CACHE_MAX_BYTES = 200 * 1024 * 1024; // ~200MB سقف تقريبي

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

// تجزئة بسيطة (FNV-1a 32-bit) لاسم ملف ثابت لكل نص
function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function cacheFileFor(text: string, voiceId: string): File {
  const name = `${hashKey(voiceId)}_${hashKey(voiceId + "|" + text)}.mp3`;
  return new File(cacheDir(), name);
}
// ملف توقيت الحروف (مزامنة الهايلايتر) بجانب ملف الصوت
function timingFileFor(text: string, voiceId: string): File {
  const name = `${hashKey(voiceId)}_${hashKey(voiceId + "|" + text)}.json`;
  return new File(cacheDir(), name);
}

/** يحذف أقدم الملفات إذا تجاوز التخزين السقف. */
function pruneCache() {
  try {
    const items = cacheDir().list();
    const files = items.filter((f): f is File => f instanceof File);
    let total = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
    if (total <= CACHE_MAX_BYTES) return;
    // الأقدم أولًا (حسب وقت التعديل إن توفّر، وإلا حسب الاسم)
    files.sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
    for (const f of files) {
      if (total <= CACHE_MAX_BYTES) break;
      const size = f.size ?? 0;
      try {
        f.delete();
        total -= size;
      } catch {}
    }
  } catch {}
}

/** حجم التخزين الصوتي الحالي بالبايت. */
export function audioCacheSize(): number {
  try {
    return cacheDir()
      .list()
      .filter((f): f is File => f instanceof File)
      .reduce((sum, f) => sum + (f.size ?? 0), 0);
  } catch {
    return 0;
  }
}

/** يمسح كل الصوت المخبّأ (من الإعدادات). */
export function clearAudioCache() {
  try {
    const dir = cacheDir();
    if (dir.exists) dir.delete();
  } catch {}
}

/* ---------------- الواجهة العامة ---------------- */

/** نحاول دائمًا الصوت البشري (محلي أو سحابي) مع رجوع تلقائي لصوت الجهاز عند الفشل. */
export function isHumanVoiceEnabled(): boolean {
  return true;
}

// فكّ ترميز base64 إلى بايتات — أمتن من الاعتماد على كتابة الملف بترميز base64
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const outLen = Math.floor((clean.length * 3) / 4) - pad;
  const bytes = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] ? B64_CHARS.indexOf(clean[i + 2]) : 0;
    const c3 = clean[i + 3] ? B64_CHARS.indexOf(clean[i + 3]) : 0;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (p < outLen) bytes[p++] = (n >> 16) & 255;
    if (p < outLen) bytes[p++] = (n >> 8) & 255;
    if (p < outLen) bytes[p++] = n & 255;
  }
  return bytes;
}

/** يولّد ملف صوت mp3 من النص — عبر المفتاح المحلي (تطوير) أو الدالة السحابية (إنتاج). */
async function synthToFile(
  text: string,
  gender: VoiceGender,
  voiceId?: string,
  expressive?: boolean,
  page?: PageRef
): Promise<{ file: File; starts: number[] }> {
  const vid = voiceId || VOICE_IDS[gender];
  // مفتاح تخزين مختلف للإعداد التعبيري (صوت مختلف) عن العادي
  const cacheKey = vid + (expressive ? "|x" : "");

  // 1) موجود في التخزين؟ شغّله مباشرة بدون تكلفة/إنترنت (مع توقيت الحروف إن وُجد)
  const file = cacheFileFor(text, cacheKey);
  const timingFile = timingFileFor(text, cacheKey);
  if (file.exists && (file.size ?? 0) > 0) {
    let starts: number[] = [];
    try {
      if (timingFile.exists) starts = JSON.parse(await timingFile.text());
    } catch {}
    return { file, starts };
  }

  // الأمان: الصوت يُولَّد دائمًا عبر الدالة السحابية «tts» (المفتاح سرّي بالسيرفر).
  // لا يوجد مفتاح ElevenLabs داخل التطبيق إطلاقًا، فلا يمكن استخراجه أو إساءة استخدامه.
  const { data, error } = await supabase.functions.invoke("tts", {
    body: { text, gender, voiceId: vid, expressive: !!expressive, ...(page ? { book: page.book, page: page.page } : {}) },
  });
  if (error) {
    // نسخة لم تعد مدعومة (426) → قفل التطبيق بشاشة التحديث
    if ((error as { context?: { status?: number } })?.context?.status === 426) markUpdateRequired();
    throw error;
  }
  const b64 = (data as { audio?: string; error?: string })?.audio;
  const d = data as { error?: string; quota?: boolean; userQuota?: boolean; premiumQuota?: boolean };
  if (d?.premiumQuota) throw new Error("PREMIUM_QUOTA");
  if (d?.userQuota) throw new Error("USER_QUOTA");
  if (d?.error) throw new Error(d.quota ? `QUOTA: ${d.error}` : d.error);
  if (!b64) throw new Error("لا يوجد صوت في رد الدالة");
  const starts = Array.isArray((data as { starts?: number[] })?.starts)
    ? ((data as { starts: number[] }).starts as number[])
    : [];
  file.write(base64ToBytes(b64));
  try {
    if (starts.length) timingFile.write(JSON.stringify(starts));
  } catch {}
  pruneCache();
  return { file, starts };
}

// يزيل المصادر/الإحالات بين قوسين (اسم/كتاب/سنة، أو رقم إحالة) من النص المنطوق فقط
function stripCitations(text: string): string {
  return text
    .replace(/[（(]([^()（）]*)[)）]/g, (m, inner: string) => {
      const isJustNumber = /^[\s\d٠-٩.,،\-]+$/.test(inner);
      const hasYear = /[\d٠-٩]{3,4}/.test(inner) || /[\d٠-٩]+\s*(هـ|م)\b/.test(inner);
      const looksCitation = hasYear && (/[،,]/.test(inner) || /[A-Za-zء-ي]/.test(inner));
      return isJustNumber || looksCitation ? " " : m;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

// أسماء الحروف العربية للنطق الصحيح في المراجع القانونية (م/٥ → ميم تقسيم خمسة)
const LETTER_NAMES: Record<string, string> = {
  أ: "ألف", ا: "ألف", ب: "باء", ت: "تاء", ث: "ثاء", ج: "جيم", ح: "حاء", خ: "خاء",
  د: "دال", ذ: "ذال", ر: "راء", ز: "زاي", س: "سين", ش: "شين", ص: "صاد", ض: "ضاد",
  ط: "طاء", ظ: "ظاء", ع: "عين", غ: "غين", ف: "فاء", ق: "قاف", ك: "كاف", ل: "لام",
  م: "ميم", ن: "نون", ه: "هاء", و: "واو", ي: "ياء", ء: "همزة",
};

// المراجع القانونية «حرف/رقم» (مرسوم ملكي/قرار): م/٥ → «ميم تقسيم خمسة».
// ننطق الحرف باسمه الصحيح، و«/» تقسيم، والرقم كما هو (يحوّله محرّك الأرقام لاحقًا).
function expandLegalRefs(text: string): string {
  return text.replace(
    /(^|[^ء-ي])([ء-ي])\s*\/\s*([٠-٩\d]+)/g,
    (m, pre: string, letter: string, num: string) => {
      const name = LETTER_NAMES[letter];
      return name ? `${pre}${name} تقسيم ${num}` : m;
    }
  );
}

// يوضّح علامات التأريخ المختصرة عند نطقها: «1445 هـ» → «1445 هجري»، «2024 م» → «2024 ميلادي»
// (النص المعروض لا يتغيّر — فقط ما يُنطق). نشترط أن تلي رقمًا وألا تكون جزءًا من كلمة.
function expandEraMarkers(text: string): string {
  return text
    .replace(/([\d٠-٩])\s*هـ(?![ء-ي])/g, "$1 هجري")
    .replace(/([\d٠-٩])\s*ه(?![ء-ي])/g, "$1 هجري")
    .replace(/([\d٠-٩])\s*م(?![ء-ي])/g, "$1 ميلادي");
}

// تنظيف النص للنطق مع **حماية آيات القرآن الكريم**: أي نص بين القوسين المزخرفين
// ﴿ ﴾ يُقرأ حرفيًا بتشكيله كاملًا بلا أي تحويل (أرقام/إحالات/مصادر)، حتى لا يُخطئ
// القارئ في كلام الله. باقي النص يمرّ بالتنظيف المعتاد.
function cleanForSpeech(text: string, voiceLang: "ar" | "en" | "fr" = "ar"): string {
  const src = text?.trim() ?? "";
  if (!src) return "";

  // اللغة تُؤخذ من النص المنطوق نفسه لا من الصوت المختار: الصوت الافتراضي عربي،
  // وكان ذلك يُمرّر الكتب الإنجليزية على تحويل الأرقام العربي («In ألف وتسعمئة…»).
  // ولأن المنطوق عند الترجمة هو النصّ المترجَم، تُقرأ الترجمة بلغتها تلقائيًا.
  // لغة الصوت تبقى المرجع حين يخلو النص من الحروف (سطر أرقام فقط).
  const lang = detectSpeechLang(src, voiceLang);

  // كتب اللغات (إنجليزي/فرنسي): لا نحوّل الأرقام إلى كلمات عربية ولا نطبّق التوسّعات
  // العربية (هجري/ميلادي، المراجع القانونية). نحوّل الأرقام العربية الهندية إلى
  // لاتينية، ثم نطبّع التواريخ والسنوات لتُقرأ نطق السنوات لا نطق الأعداد.
  if (lang !== "ar") {
    const latin = stripCitations(src).replace(/[٠-٩]/g, (d) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
    );
    return normalizeLatinDates(latin, lang).replace(/\s{2,}/g, " ").trim();
  }
  return src
    .split(/([﴾﴿][^﴾﴿]*[﴾﴿])/) // نفصل الآيات المزخرفة كمقاطع مستقلة
    .map((seg) => {
      if (/^[﴾﴿][^﴾﴿]*[﴾﴿]$/.test(seg)) {
        return seg.slice(1, -1).trim(); // آية: انزع القوسين فقط وأبقِ النص بتشكيله
      }
      return numbersToArabicWords(expandEraMarkers(expandLegalRefs(stripCitations(seg))));
    })
    .filter((s) => s.length > 0)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * محاذاة النص المنطوق (clean) مع النص المعروض (orig): تُرجع دالة تحوّل موضع الحرف
 * المنطوق → نسبة موضعه الصحيحة في النص المعروض. هكذا يبقى الهايلايت/العدسة مطابقين
 * للكلمة المعروضة حتى لو نُطقت الأرقام كلمات («2009»→«ألفين وتسعة») أو حُذفت استشهادات.
 */
function makeSpokenToOrigFrac(orig: string, clean: string): (cleanCharIdx: number) => number {
  const tok = (s: string) => {
    const t: { s: number; e: number; w: string }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) t.push({ s: m.index, e: m.index + m[0].length, w: m[0] });
    return t;
  };
  // تطبيع للمطابقة: نحذف التشكيل والتطويل وكل ما ليس حرفًا/رقمًا (آمن على Hermes)
  const norm = (w: string) =>
    w
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
      .replace(/[^0-9A-Za-z\u0621-\u064A\u0660-\u0669\u066E-\u06D3\u06F0-\u06F9]/g, "");
  const O = tok(orig);
  const C = tok(clean);
  const oLen = Math.max(1, orig.length);
  const cLen = Math.max(1, clean.length);
  if (O.length === 0 || C.length === 0) return (ci) => Math.min(1, Math.max(0, ci / cLen));

  // لكل كلمة منطوقة: رقم الكلمة المقابلة في النص الأصلي (محاذاة جشعة مع نظرة أمامية)
  const c2o = new Array<number>(C.length);
  let oi = 0;
  for (let ci = 0; ci < C.length; ci++) {
    const cn = norm(C[ci].w);
    if (oi < O.length && cn && norm(O[oi].w) === cn) {
      c2o[ci] = oi;
      oi++;
      continue;
    }
    // الأصل فيه كلمات زائدة (استشهاد محذوف من المنطوق) → ابحث أمامًا قليلًا
    let found = -1;
    for (let k = 1; k <= 5 && oi + k < O.length; k++) {
      if (cn && norm(O[oi + k].w) === cn) {
        found = oi + k;
        break;
      }
    }
    if (found >= 0) {
      c2o[ci] = found;
      oi = found + 1;
      continue;
    }
    // المنطوق فيه كلمات زائدة (رقم توسّع لعدة كلمات) → اربطها بالكلمة الأصلية الحالية
    c2o[ci] = Math.min(oi, O.length - 1);
  }

  return (cleanCharIdx: number): number => {
    if (cleanCharIdx >= C[C.length - 1].e) return 1;
    // آخر كلمة منطوقة بدايتها ≤ موضع الحرف
    let lo = 0,
      hi = C.length - 1,
      wi = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (C[mid].s <= cleanCharIdx) {
        wi = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const cw = C[wi];
    const within = cw.e > cw.s ? Math.min(1, Math.max(0, (cleanCharIdx - cw.s) / (cw.e - cw.s))) : 0;
    const ow = O[c2o[wi]] ?? O[O.length - 1];
    const origPos = ow.s + within * (ow.e - ow.s);
    return Math.min(1, Math.max(0, origPos / oLen));
  };
}

/** تشغيل نص بصوت بشري (مع رجوع لصوت الجهاز عند الحاجة). */
export async function speakText(text: string, opts: SpeakOptions = {}): Promise<void> {
  // نتخطّى المصادر بين قوسين، ونحوّل الأرقام إلى كلمات (النص المعروض لا يتغيّر).
  // تنظيف واعٍ باللغة: كتب الإنجليزي/الفرنسي لا تُنطق أرقامها بالعربية.
  const clean = cleanForSpeech(text, voiceLangOf(opts.voiceId));
  if (!clean) return;

  // إن كان مشغّل هذا المقطع مُحمّلًا مسبقًا (warm) → نتبنّاه قبل الإيقاف لتشغيل فوري
  const vidForWarm = opts.voiceId || VOICE_IDS[opts.gender ?? "female"];
  const expectedUri = cacheFileFor(clean, vidForWarm + (opts.expressive ? "|x" : "")).uri;
  let adopted: AudioPlayer | null = null;
  if (warmPlayer && warmPlayer.uri === expectedUri) {
    adopted = warmPlayer.player;
    warmPlayer = null; // تبنّيناه فلا يُحذف مع الإيقاف
  }

  // أوقف المقطع الحالي فقط (نُبقي المشغّل التالي المُحمّل مسبقًا لنتبنّاه)
  stopCurrentOnly();
  const myToken = playToken; // بصمة هذا التشغيل بعد الإيقاف

  opts.onStart?.();

  let step = "تجهيز";
  try {
    const gender = opts.gender ?? "female";

    step = "توليد الصوت";
    const { file, starts } = await synthToFile(clean, gender, opts.voiceId, opts.expressive, opts.page);
    if (myToken !== playToken) return; // أُوقف/استُبدل أثناء التحضير → لا تشغّل

    step = "وضع الصوت";
    await ensureAudioMode();
    if (myToken !== playToken) return;

    step = "إنشاء المشغّل";
    // المشغّل المُحمّل مسبقًا (warm) إن توفّر → تشغيل فوري بلا فجوة، وإلا ننشئ واحدًا
    const player = adopted ?? track(createAudioPlayer({ uri: file.uri }, { updateInterval: 120 }));
    registry.add(player);
    currentPlayer = player;
    // سرعة خاصة بالصوت (مثل هيثم) مضروبة بسرعة المستخدم. زر السرعة يسرّع/يبطّئ
    // **نفس الصوت فقط** — نحافظ دائمًا على طبقة الصوت (pitch) فلا تتغيّر هويّته.
    const voiceRate = VOICE_CATALOG.find((v) => v.voiceId === opts.voiceId)?.rate ?? 1;
    currentVoiceRate = voiceRate; // ليطبّق setLivePlaybackRate سرعة المستخدم فورًا
    const userRate = opts.rate && opts.rate > 0 ? opts.rate : 1;
    const finalRate = userRate * voiceRate;
    try {
      (player as { shouldCorrectPitch?: boolean }).shouldCorrectPitch = true;
    } catch {}
    if (finalRate !== 1) {
      try {
        // تمرير جودة تصحيح الطبقة يضمن ثبات الطبقة عند أي سرعة (لا «تأثير سنجاب»)
        player.setPlaybackRate(finalRate, "high");
      } catch {
        // نتجاهل — التشغيل بالسرعة الافتراضية أهم من توقّف الصوت
      }
    }

    // دالة تحوّل موضع الحرف المنطوق → نسبة موضعه في النص المعروض (تُبنى مرة)
    const toOrigFrac = makeSpokenToOrigFrac(text ?? "", clean);

    let finished = false;
    player.addListener("playbackStatusUpdate", (status) => {
      // مشغّل قديم استُبدل (بدأ تشغيل أحدث) → تجاهله تمامًا حتى لا يتراكب ويتسارع
      if (myToken !== playToken) return;
      if (opts.onProgress) {
        let frac = 0;
        const t = status.currentTime ?? 0;
        if (starts.length > 1) {
          // موضع الحرف المنطوق الآن (بحث ثنائي على توقيت الحروف الحقيقي)
          let lo = 0,
            hi = starts.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid] <= t) lo = mid + 1;
            else hi = mid;
          }
          const ci = Math.max(0, lo - 1);
          // حوّله لموضعه الصحيح في النص المعروض (مع رجوع آمن لئلا يتجمّد التقدّم أبدًا)
          try {
            frac = toOrigFrac(ci);
          } catch {
            frac = ci / starts.length;
          }
        } else if (status.duration && status.duration > 0) {
          frac = t / status.duration;
        }
        // onProgress يُنفَّذ دائمًا → التقدّم/الهايلايت/العدسة لا تتجمّد إطلاقًا
        opts.onProgress(Math.min(1, Math.max(0, frac)));
      }
      if (status.didJustFinish && !finished) {
        finished = true;
        opts.onProgress?.(1);
        opts.onDone?.(); // قد يبدأ المقطع التالي (يتبنّى المشغّل المُحمّل مسبقًا)
        // نظّف هذا المشغّل فقط إن لم يُستبدل بمقطع جديد (لئلا نوقف التالي)
        if (currentPlayer === player) disposePlayer();
      }
    });

    step = "التشغيل";
    silenceAllExcept(player); // ضمان: لا صوت آخر يقرأ بالتوازي
    player.play();
    holdAudioSession(false); // بدأ السرد فعلًا → لا حاجة للمقطع الصامت
    // أزرار شاشة القفل (تشغيل/إيقاف + «قيد التشغيل») لهذا المقطع. التفعيل يخص مركز
    // «قيد التشغيل» فقط ولا يمسّ جلسة الصوت، فلا يُحدث تقطيعًا في الصوت.
    activateLockScreen(player);
  } catch (e) {
    const reason = `[${step}] ${(e as Error)?.message ?? String(e)}`;
    console.warn("VSF_TTS_FALLBACK", reason);
    // انتهت صفحات الصوت الفاخر هذا الشهر → نكمل نفس الجملة بالصوت الأساسي (بلا انقطاع)
    if (/PREMIUM_QUOTA/.test(reason) && isPremiumVoice(opts.voiceId)) {
      premiumListeners.forEach((fn) => fn());
      return speakText(text, { ...opts, voiceId: standardVoiceFor(opts.voiceId) });
    }
    // انتهت دقائق المستخدم الشهرية → نكمل بصوت الجهاز (لا تتوقف القراءة) ونعرض الاشتراك
    if (/USER_QUOTA/.test(reason)) {
      requestPaywall("voice");
      opts.onFallback?.(reason);
      speakWithDevice(clean, opts);
      return;
    }
    // نفاد رصيد حساب الصوت نفسه → لا نرجع لصوت آلي مفاجئ؛ نبلّغ بوضوح ونتوقّف
    if (/QUOTA/i.test(reason)) {
      opts.onError?.(new Error("QUOTA"));
      return;
    }
    // أخطاء أخرى (شبكة مثلًا) → رجوع لصوت الجهاز ليكمل التسلسل
    opts.onFallback?.(reason);
    speakWithDevice(clean, opts);
  }
}

/**
 * يُحمّل مشغّل المقطع التالي مسبقًا (صوت + مشغّل جاهز) ليبدأ **فورًا بلا فجوة**
 * عند انتهاء المقطع الحالي. يُستدعى للمقطع التالي لحظة بدء الحالي.
 */
export async function warmNext(
  text: string,
  opts: { voiceId?: string; gender?: VoiceGender; page?: PageRef } = {}
): Promise<void> {
  const clean = cleanForSpeech(text, voiceLangOf(opts.voiceId));
  if (!clean) return;
  try {
    const vid = opts.voiceId || VOICE_IDS[opts.gender ?? "female"];
    const uri = cacheFileFor(clean, vid).uri;
    if (warmPlayer?.uri === uri) return; // محمّل بالفعل
    const { file } = await synthToFile(clean, opts.gender ?? "female", opts.voiceId, false, opts.page);
    if (warmPlayer?.uri === file.uri) return;
    disposeWarm(); // أزل أي مشغّل تالٍ قديم
    warmPlayer = { uri: file.uri, player: track(createAudioPlayer({ uri: file.uri }, { updateInterval: 120 })) };
  } catch {
    // غير حرج — التشغيل العادي يكفي
  }
}

/**
 * تحضير صوت نص مسبقًا (تخزينه دون تشغيل) لقراءة سلسة بلا تقطيع.
 * يُستدعى للجملة التالية أثناء قراءة الحالية. آمن للاستدعاء المتكرر (يتخطّى المخزَّن).
 */
export async function prefetchText(
  text: string,
  opts: { voiceId?: string; gender?: VoiceGender; page?: PageRef } = {}
): Promise<void> {
  try {
    const clean = cleanForSpeech(text, voiceLangOf(opts.voiceId));
    if (!clean) return;
    await synthToFile(clean, opts.gender ?? "female", opts.voiceId, false, opts.page);
  } catch {
    // التحضير المسبق اختياري — لا نُزعج القراءة عند فشله
  }
}

/* --------- اختيار أفضل صوت جهاز + التفريق ذكر/أنثى --------- */

function guessGender(name = "", id = ""): VoiceGender | null {
  const s = (name + " " + id).toLowerCase();
  const female = ["female", "woman", "zira", "mary", "laila", "layla", "noura", "hala", "salma", "fatima", "samantha", "tessa", "amira", "f-"];
  const male = ["male", "man", "majid", "maged", "ahmad", "ahmed", "omar", "tarik", "hamed", "daniel", "fred", "m-"];
  if (female.some((k) => s.includes(k))) return "female";
  if (male.some((k) => s.includes(k))) return "male";
  return null;
}

async function pickDeviceVoiceId(lang: VoiceLang, gender: VoiceGender): Promise<string | undefined> {
  try {
    const all = await Speech.getAvailableVoicesAsync();
    const prefix = lang === "ar" ? "ar" : "en";
    const matches = all.filter((v) => v.language?.toLowerCase().startsWith(prefix));
    if (matches.length === 0) return undefined;

    // الأعلى جودة أولاً
    matches.sort((a, b) => Number(b.quality ?? 0) - Number(a.quality ?? 0));

    // فضّل الصوت المطابق للجنس
    const byGender = matches.find((v) => guessGender(v.name, v.identifier) === gender);
    return (byGender ?? matches[0]).identifier;
  } catch {
    return undefined;
  }
}

/** صوت الجهاز المدمّج (احتياطي) مع محاولة مطابقة الجنس وأفضل جودة. */
async function speakWithDevice(text: string, opts: SpeakOptions) {
  const lang = opts.lang ?? "ar";
  const gender = opts.gender ?? "female";
  const voice = await pickDeviceVoiceId(lang, gender);

  Speech.stop();
  holdAudioSession(false);
  Speech.speak(text, {
    language: lang === "ar" ? "ar-SA" : "en-US",
    voice,
    // نخفّض حدة الصوت قليلاً للذكر ونرفعها قليلاً للأنثى لزيادة التمييز
    rate: opts.rate ?? 0.95,
    pitch: opts.pitch ?? (gender === "male" ? 0.85 : 1.1),
    onDone: () => opts.onDone?.(),
    onStopped: () => opts.onDone?.(),
    onError: (e) => opts.onError?.(e),
  });
}

/** إيقاف الصوت (السحابي وصوت الجهاز معاً). */
// يوقف المقطع الحالي فقط (يُبقي المشغّل التالي المُحمّل مسبقًا للتشغيل المتواصل)
function stopCurrentOnly(): void {
  playToken++; // يُبطل أي صوت قيد التحضير حتى لا يشتغل بعد الإيقاف
  Speech.stop();
  disposePlayer();
}

/** هل يُسمع سرد الآن فعليًا؟ (لحماية الواجهة من عدم تطابق زر التشغيل مع الصوت) */
export function isNarrating(): boolean {
  for (const p of registry) {
    try {
      if ((p as unknown as { playing?: boolean }).playing) return true;
    } catch {}
  }
  return false;
}

export async function stopSpeaking(): Promise<void> {
  holdAudioSession(false);
  clearLockScreen(currentPlayer); // إيقاف كامل → أزل أزرار شاشة القفل
  stopCurrentOnly();
  disposeWarm(); // إيقاف كامل (المستخدم) → نتخلّص من المشغّل التالي أيضًا
  silenceAllExcept(null); // وأي صوت آخر مهما كان مصدره
}

/* -------- إبقاء جلسة الصوت حيّة بين الصفحات (الجوال مقفل) -------- */
// iOS يعلّق التطبيق في الخلفية متى توقّف الصوت، ولو لثانية. بين نهاية صفحة وبدء
// التالية (جلب النص + تجهيز الصوت) فجوة صامتة قد تكفي لتعليقه فتتوقف القراءة.
// الحل: مقطع صامت يدور طوال الانتقال، فتبقى الجلسة «تشغّل» حتى يبدأ السرد.
let holdPlayer: AudioPlayer | null = null;

function silenceFile(): File {
  const f = new File(cacheDir(), "silence-1s.wav");
  if (!f.exists) {
    // WAV أحادي 8kHz 16-bit لمدة ثانية كلها أصفار
    const rate = 8000;
    const data = rate * 2;
    const buf = new Uint8Array(44 + data);
    const v = new DataView(buf.buffer);
    const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF");
    v.setUint32(4, 36 + data, true);
    str(8, "WAVE");
    str(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, data, true);
    f.write(buf);
  }
  return f;
}

/** يشغّل/يوقف المقطع الصامت الذي يُبقي القراءة مستمرة أثناء الانتقال بين الصفحات. */
export function holdAudioSession(on: boolean): void {
  if (!on) {
    if (holdPlayer) {
      try {
        holdPlayer.pause();
        holdPlayer.remove();
      } catch {}
      holdPlayer = null;
    }
    return;
  }
  if (holdPlayer) return;
  try {
    void ensureAudioMode();
    const p = createAudioPlayer({ uri: silenceFile().uri });
    p.loop = true;
    p.play();
    holdPlayer = p;
  } catch {
    // غير حرج — في المقدّمة لا حاجة له أصلًا
  }
}

/**
 * يطبّق سرعة المستخدم على الصوت الجاري **فورًا** أثناء القراءة (دون إيقاف/تشغيل)،
 * مع الحفاظ على طبقة الصوت. تُضرب بسرعة الصوت الداخلية كما في بدء التشغيل.
 */
export function setLivePlaybackRate(userRate: number): void {
  const p = currentPlayer;
  if (!p) return;
  const r = userRate > 0 ? userRate : 1;
  try {
    (p as { shouldCorrectPitch?: boolean }).shouldCorrectPitch = true;
    p.setPlaybackRate(r * currentVoiceRate, "high");
  } catch {
    // نتجاهل — لو فشل التطبيق الفوري، ستُطبَّق السرعة على المقطع التالي
  }
}
