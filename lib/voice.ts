// lib/voice.ts
// أصوات بشرية عبر ElevenLabs مع رجوع تلقائي لصوت الجهاز (expo-speech)
// عند عدم وجود مفتاح أو فشل الطلب.
//
// الإعداد عبر متغيرات البيئة (.env):
//   EXPO_PUBLIC_ELEVENLABS_API_KEY=...
//   EXPO_PUBLIC_ELEVENLABS_VOICE_FEMALE=<voice_id>   (اختياري)
//   EXPO_PUBLIC_ELEVENLABS_VOICE_MALE=<voice_id>     (اختياري)
//
// الإنتاج: إذا لم يوجد مفتاح محلي، نستدعي دالة Supabase «tts» التي تحفظ
// المفتاح سرّيًا بالسيرفر. الواجهة (speakText/stopSpeaking) تبقى كما هي.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";

import { numbersToArabicWords } from "./arabicNumbers";
import { supabase } from "./supabase";

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
} & SpeakCallbacks;

/* ---------------- كتالوج أصوات ElevenLabs العربية ---------------- */

export type VoiceOption = {
  id: string;
  name: string; // الاسم المعروض في الواجهة
  voiceId: string; // معرّف ElevenLabs
  gender: VoiceGender;
  rate?: number; // سرعة تشغيل خاصة بالصوت (< 1 = أبطأ وأعمق)
  lang?: "ar" | "en" | "fr"; // لغة الصوت (افتراضي عربي) — لكتب اللغات
};

// أصوات عربية حقيقية: سعودية واضحة + فصحى + خليجي محايد (مضافة لحساب ElevenLabs).
export const VOICE_CATALOG: VoiceOption[] = [
  { id: "omar", name: "عمر · فصحى", voiceId: "apsZFlSToM2vmFpwz5jX", gender: "male" },
  { id: "abdullah", name: "عبدالله · فصحى جهوري", voiceId: "XdoLPWNt7ytn6BtU4FBf", gender: "male" },
  { id: "tariq", name: "طارق · فصحى رنّان", voiceId: "18HMWpalD7cscJTD8lEY", gender: "male" },
  { id: "layla", name: "ليلى · فصحى", voiceId: "RaelJk8tltOJ5KMrKjDu", gender: "female" },
  { id: "haytham", name: "هيثم · حكواتي", voiceId: "UR972wNGq3zluze0LoIp", gender: "male", rate: 0.82 },
  { id: "yahya", name: "يحيى · حكواتي فصحى", voiceId: "QRq5hPRAKf5ZhSlTBH6r", gender: "male" },
  { id: "fatima", name: "فاطمة · مصرية", voiceId: "vWDp3PLsTWjIhBxxUKh9", gender: "female" },
  { id: "sufyan", name: "سفيان · عراقي", voiceId: "9FHjCdVXgA4tYxIYHTcZ", gender: "male" },
  { id: "sultan", name: "سلطان · خليجي", voiceId: "rUaPbzcZIu8df8iNL9WZ", gender: "male" },
  { id: "salma", name: "سلمى · خليجي", voiceId: "KxMRrXEjbJ6kZ93yT3fq", gender: "female" },
  { id: "noura", name: "نورة · خليجي", voiceId: "isQLuoVuANx6FjDxyasX", gender: "female" },
  // أصوات إنجليزية وفرنسية لكتب اللغات (أصوات ElevenLabs الجاهزة)
  { id: "rachel", name: "Rachel · English", voiceId: "21m00Tcm4TlvDq8ikWAM", gender: "female", lang: "en" },
  { id: "adam", name: "Adam · English", voiceId: "pNInz6obpgDQGcFmaJgB", gender: "male", lang: "en" },
  { id: "charlotte", name: "Charlotte · Français", voiceId: "XB0fDUnXU5powFXDhCwa", gender: "female", lang: "fr" },
  { id: "antoni", name: "Antoni · Français", voiceId: "ErXwobaYiN019PkySvjV", gender: "male", lang: "fr" },
];

export const DEFAULT_VOICE_ID = VOICE_CATALOG[0].voiceId;

/* ---------------- إعدادات الصوت ---------------- */
// لا مفتاح صوت في العميل — التوليد عبر الدالة السحابية «tts» فقط (المفتاح بالسيرفر).

// احتياطي عند غياب voiceId (المسار المباشر فقط)
const VOICE_IDS: Record<VoiceGender, string> = {
  female: "RaelJk8tltOJ5KMrKjDu", // Layla
  male: "apsZFlSToM2vmFpwz5jX", // Omar
};

/* ---------------- حالة التشغيل ---------------- */

let currentPlayer: AudioPlayer | null = null;
let currentFileUri: string | null = null;
let audioModeReady = false;
// مشغّل المقطع التالي مُحمّل مسبقًا (لتشغيل متواصل بلا فجوة بين المقاطع)
let warmPlayer: { uri: string; player: AudioPlayer } | null = null;

function disposeWarm() {
  if (warmPlayer) {
    try {
      warmPlayer.player.remove();
    } catch {}
    warmPlayer = null;
  }
}

async function ensureAudioMode() {
  if (audioModeReady) return;
  // يشغّل الصوت حتى لو الجهاز على الصامت، ويكمل في الخلفية / عند قفل الشاشة.
  // مهم: لا نسمح لفشل ضبط الوضع بإسقاط التشغيل (في Expo Go قد لا تتوفر
  // خاصية التشغيل بالخلفية) — نجرّب إعدادًا أبسط بدلًا من رمي الخطأ.
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
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
    currentPlayer = null;
  }
  // لا نحذف الملف: صار مخبّأً (cache) لإعادة استخدامه بدون تكلفة جديدة
  currentFileUri = null;
}

/* ---------------- تخزين الصوت محليًا (cache) ---------------- */
// نخبّئ كل مقطع صوتي باسم مشتق من (الجنس + الصوت + النص) حتى:
//  - لا نعيد دفع تكلفة ElevenLabs لنفس الجملة
//  - يعمل التشغيل بدون إنترنت بعد أول مرة

const CACHE_DIR_NAME = "tts-cache-v9"; // v9: رجوع لصوت القارئ الأصلي تمامًا
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
  voiceId?: string
): Promise<{ file: File; starts: number[] }> {
  const vid = voiceId || VOICE_IDS[gender];

  // 1) موجود في التخزين؟ شغّله مباشرة بدون تكلفة/إنترنت (مع توقيت الحروف إن وُجد)
  const file = cacheFileFor(text, vid);
  const timingFile = timingFileFor(text, vid);
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
    body: { text, gender, voiceId: vid },
  });
  if (error) throw error;
  const b64 = (data as { audio?: string; error?: string })?.audio;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
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

/** تشغيل نص بصوت بشري (مع رجوع لصوت الجهاز عند الحاجة). */
export async function speakText(text: string, opts: SpeakOptions = {}): Promise<void> {
  // نتخطّى المصادر بين قوسين، ونحوّل الأرقام إلى كلمات (النص المعروض لا يتغيّر)
  const clean = numbersToArabicWords(stripCitations(text?.trim() ?? ""));
  if (!clean) return;

  // إن كان مشغّل هذا المقطع مُحمّلًا مسبقًا (warm) → نتبنّاه قبل الإيقاف لتشغيل فوري
  const vidForWarm = opts.voiceId || VOICE_IDS[opts.gender ?? "female"];
  const expectedUri = cacheFileFor(clean, vidForWarm).uri;
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
    const { file, starts } = await synthToFile(clean, gender, opts.voiceId);
    if (myToken !== playToken) return; // أُوقف/استُبدل أثناء التحضير → لا تشغّل

    step = "وضع الصوت";
    await ensureAudioMode();
    if (myToken !== playToken) return;
    currentFileUri = file.uri;

    step = "إنشاء المشغّل";
    // المشغّل المُحمّل مسبقًا (warm) إن توفّر → تشغيل فوري بلا فجوة، وإلا ننشئ واحدًا
    const player = adopted ?? createAudioPlayer({ uri: file.uri }, { updateInterval: 80 });
    currentPlayer = player;
    // سرعة خاصة بالصوت (مثل هيثم) مضروبة بسرعة المستخدم. الأصوات ذات السرعة
    // الخاصة (< 1) نلغي تصحيح طبقة الصوت لها فتصير أعمق مع البطء.
    const voiceRate = VOICE_CATALOG.find((v) => v.voiceId === opts.voiceId)?.rate ?? 1;
    const userRate = opts.rate && opts.rate > 0 ? opts.rate : 1;
    const finalRate = userRate * voiceRate;
    try {
      (player as { shouldCorrectPitch?: boolean }).shouldCorrectPitch = voiceRate >= 1;
    } catch {}
    if (finalRate !== 1) {
      try {
        player.setPlaybackRate(finalRate);
      } catch {
        // نتجاهل — التشغيل بالسرعة الافتراضية أهم من توقّف الصوت
      }
    }

    let finished = false;
    player.addListener("playbackStatusUpdate", (status) => {
      if (opts.onProgress) {
        let frac = 0;
        const t = status.currentTime ?? 0;
        if (starts.length > 1) {
          // التقدّم الحقيقي = عدد الحروف التي بدأ نطقها ÷ إجمالي الحروف (بحث ثنائي)
          let lo = 0,
            hi = starts.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid] <= t) lo = mid + 1;
            else hi = mid;
          }
          // الحرف المنطوق حاليًا (لا الذي بعده) → بلا سبق عند حدود الكلمات
          frac = Math.max(0, lo - 1) / starts.length;
        } else if (status.duration && status.duration > 0) {
          frac = t / status.duration;
        }
        opts.onProgress(Math.min(1, Math.max(0, frac)));
      }
      if (status.didJustFinish && !finished) {
        finished = true;
        opts.onProgress?.(1);
        opts.onDone?.();
        disposePlayer();
      }
    });

    step = "التشغيل";
    player.play();
  } catch (e) {
    // فشل الصوت البشري → بلّغ الخطوة والسبب ثم ارجع لصوت الجهاز ويكمل التسلسل
    const reason = `[${step}] ${(e as Error)?.message ?? String(e)}`;
    console.warn("VSF_TTS_FALLBACK", reason); // يظهر في سجل خادم التطوير
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
  opts: { voiceId?: string; gender?: VoiceGender } = {}
): Promise<void> {
  const clean = numbersToArabicWords(stripCitations(text?.trim() ?? ""));
  if (!clean) return;
  try {
    const vid = opts.voiceId || VOICE_IDS[opts.gender ?? "female"];
    const uri = cacheFileFor(clean, vid).uri;
    if (warmPlayer?.uri === uri) return; // محمّل بالفعل
    const { file } = await synthToFile(clean, opts.gender ?? "female", opts.voiceId);
    if (warmPlayer?.uri === file.uri) return;
    disposeWarm(); // أزل أي مشغّل تالٍ قديم
    warmPlayer = { uri: file.uri, player: createAudioPlayer({ uri: file.uri }, { updateInterval: 80 }) };
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
  opts: { voiceId?: string; gender?: VoiceGender } = {}
): Promise<void> {
  try {
    const clean = numbersToArabicWords(stripCitations(text?.trim() ?? ""));
    if (!clean) return;
    await synthToFile(clean, opts.gender ?? "female", opts.voiceId);
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

export async function stopSpeaking(): Promise<void> {
  stopCurrentOnly();
  disposeWarm(); // إيقاف كامل (المستخدم) → نتخلّص من المشغّل التالي أيضًا
}
