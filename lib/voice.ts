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

import { supabase } from "./supabase";

export type VoiceGender = "male" | "female";
export type VoiceLang = "ar" | "en";

export type SpeakCallbacks = {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (e: unknown) => void;
  // يُستدعى عند فشل الصوت البشري والرجوع لصوت الجهاز (للتشخيص)
  onFallback?: (reason: string) => void;
};

export type SpeakOptions = {
  lang?: VoiceLang;
  gender?: VoiceGender;
  rate?: number;
  pitch?: number;
} & SpeakCallbacks;

/* ---------------- إعدادات ElevenLabs ---------------- */

const ELEVEN_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";

// أصوات متعددة اللغات (تعمل للعربية والإنجليزية مع eleven_multilingual_v2).
// تقدرين تغيّرينها من .env بمعرّفات أصوات عربية مخصصة لنطق أفضل.
const VOICE_IDS: Record<VoiceGender, string> = {
  female: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_FEMALE ?? "21m00Tcm4TlvDq8ikWAM", // Rachel
  male: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_MALE ?? "pNInz6obpgDQGcFmaJgB", // Adam
};

/* ---------------- حالة التشغيل ---------------- */

let currentPlayer: AudioPlayer | null = null;
let currentFileUri: string | null = null;
let audioModeReady = false;

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

function disposePlayer() {
  if (currentPlayer) {
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

const CACHE_DIR_NAME = "tts-cache-v2"; // v2: تجاهل أي ملفات قديمة تالفة
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

function cacheFileFor(text: string, gender: VoiceGender): File {
  const voiceId = VOICE_IDS[gender];
  const name = `${gender}_${hashKey(voiceId + "|" + text)}.mp3`;
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
async function synthToFile(text: string, gender: VoiceGender): Promise<File> {
  // 1) موجود في التخزين؟ شغّله مباشرة بدون تكلفة/إنترنت
  const file = cacheFileFor(text, gender);
  if (file.exists && (file.size ?? 0) > 0) return file;

  if (ELEVEN_KEY) {
    // مسار التطوير المباشر (المفتاح موجود محليًا)
    const voiceId = VOICE_IDS[gender];
    const res = await fetch(`${ELEVEN_BASE}/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${msg}`);
    }
    file.write(new Uint8Array(await res.arrayBuffer()));
    pruneCache();
    return file;
  }

  // مسار الإنتاج: الدالة السحابية (المفتاح سرّي بالسيرفر)
  const { data, error } = await supabase.functions.invoke("tts", {
    body: { text, gender },
  });
  if (error) throw error;
  const b64 = (data as { audio?: string; error?: string })?.audio;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  if (!b64) throw new Error("لا يوجد صوت في رد الدالة");
  file.write(base64ToBytes(b64));
  pruneCache();
  return file;
}

/** تشغيل نص بصوت بشري (مع رجوع لصوت الجهاز عند الحاجة). */
export async function speakText(text: string, opts: SpeakOptions = {}): Promise<void> {
  const clean = text?.trim();
  if (!clean) return;

  // أوقف أي صوت شغّال أولاً
  await stopSpeaking();

  opts.onStart?.();

  try {
    const gender = opts.gender ?? "female";

    const file = await synthToFile(clean, gender);

    await ensureAudioMode();
    currentFileUri = file.uri;

    const player = createAudioPlayer(file.uri);
    currentPlayer = player;
    if (opts.rate && opts.rate > 0) player.playbackRate = opts.rate;

    player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        opts.onDone?.();
        disposePlayer();
      }
    });

    player.play();
  } catch (e) {
    // فشل الصوت البشري → بلّغ السبب ثم ارجع لصوت الجهاز ويكمل التسلسل
    const reason = (e as Error)?.message ?? String(e);
    opts.onFallback?.(reason);
    speakWithDevice(clean, opts);
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
export async function stopSpeaking(): Promise<void> {
  Speech.stop();
  disposePlayer();
}
