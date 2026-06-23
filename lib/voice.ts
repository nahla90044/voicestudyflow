// lib/voice.ts
// أصوات بشرية عبر ElevenLabs مع رجوع تلقائي لصوت الجهاز (expo-speech)
// عند عدم وجود مفتاح أو فشل الطلب.
//
// الإعداد عبر متغيرات البيئة (.env):
//   EXPO_PUBLIC_ELEVENLABS_API_KEY=...
//   EXPO_PUBLIC_ELEVENLABS_VOICE_FEMALE=<voice_id>   (اختياري)
//   EXPO_PUBLIC_ELEVENLABS_VOICE_MALE=<voice_id>     (اختياري)
//
// لاحقاً للنشر: نحوّل نداء fetch إلى Supabase Edge Function بدل مناداة
// ElevenLabs مباشرة، عشان لا ينكشف المفتاح. الواجهة (speakText/stopSpeaking)
// تبقى كما هي.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";

export type VoiceGender = "male" | "female";
export type VoiceLang = "ar" | "en";

export type SpeakCallbacks = {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (e: unknown) => void;
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
  // يشغّل الصوت حتى لو الجهاز على الصامت
  await setAudioModeAsync({ playsInSilentMode: true });
  audioModeReady = true;
}

function disposePlayer() {
  if (currentPlayer) {
    try {
      currentPlayer.remove();
    } catch {}
    currentPlayer = null;
  }
  if (currentFileUri) {
    try {
      new File(currentFileUri).delete();
    } catch {}
    currentFileUri = null;
  }
}

/* ---------------- الواجهة العامة ---------------- */

/** هل الأصوات البشرية مفعّلة (يوجد مفتاح)؟ */
export function isHumanVoiceEnabled(): boolean {
  return !!ELEVEN_KEY;
}

/** تشغيل نص بصوت بشري (مع رجوع لصوت الجهاز عند الحاجة). */
export async function speakText(text: string, opts: SpeakOptions = {}): Promise<void> {
  const clean = text?.trim();
  if (!clean) return;

  // أوقف أي صوت شغّال أولاً
  await stopSpeaking();

  opts.onStart?.();

  // لا يوجد مفتاح → صوت الجهاز
  if (!ELEVEN_KEY) {
    speakWithDevice(clean, opts);
    return;
  }

  try {
    const gender = opts.gender ?? "female";
    const voiceId = VOICE_IDS[gender];

    const res = await fetch(`${ELEVEN_BASE}/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: clean,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${msg}`);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());

    await ensureAudioMode();

    const file = new File(Paths.cache, `tts-${Date.now()}.mp3`);
    file.write(bytes);
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
    opts.onError?.(e);
    // فشل السحابة → ارجع لصوت الجهاز حتى لا يبقى المستخدم بدون صوت
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
