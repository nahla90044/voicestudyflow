// lib/sfx.ts
// مؤثرات صوتية + موسيقى خلفية للعرض التقديمي (تُولَّد مرة عبر ElevenLabs وتُخبّأ محليًا).
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";

import { supabase } from "./supabase";

const DIR = "sfx-cache-v1"; // نفس تخزين رفع ٣ → نفس المقاطع الصوتية بالضبط

function dir(): Directory {
  const d = new Directory(Paths.cache, DIR);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getSfxFile(key: string, prompt: string, duration: number): Promise<File | null> {
  const f = new File(dir(), `${hash(key)}.mp3`);
  if (f.exists && (f.size ?? 0) > 0) return f;
  try {
    const { data, error } = await supabase.functions.invoke("sfx", { body: { prompt, duration } });
    const audio = (data as { audio?: string; error?: string })?.audio;
    if (error || !audio) return null;
    f.write(b64ToBytes(audio));
    return f;
  } catch {
    return null;
  }
}

/* ---------------- موسيقى خلفية هادئة (اختيارات متعددة، حلقة متواصلة) ---------------- */

// موسيقى ElevenLabs (v1/music): مقطوعة أطول وأغنى. عند تعذّرها نرجع لمؤثّر قصير.
// **مهم:** اسم الملف مبني على «التعليمات» (prompt) لا المفتاح — فأي تغيير في النغمة
// يولّد ملفًا جديدًا بدل إرجاع القديم من الكاش (يحلّ رجوع النغمة القديمة).
async function getMusicFile(key: string, prompt: string, lengthMs: number): Promise<File | null> {
  const f = new File(dir(), `m-${hash(prompt)}.mp3`);
  if (f.exists && (f.size ?? 0) > 0) return f;
  try {
    const { data, error } = await supabase.functions.invoke("music", { body: { prompt, lengthMs } });
    const audio = (data as { audio?: string; error?: string })?.audio;
    if (!error && audio) {
      f.write(b64ToBytes(audio));
      return f;
    }
  } catch {
    // نتجاهل — نجرّب مؤثّر الصوت كبديل
  }
  return getSfxFile(key, prompt, 12);
}

type MusicKind = "sfx" | "music";
export type MusicOption = { key: string; name: string; prompt: string; kind?: MusicKind; lengthMs?: number };

// (١) مؤثّرات رفع ٣ القصيرة ذات التكرار السلس + (٢) مقطوعات ElevenLabs الأطول.
// كلها تُشغَّل بحلقة **متلاشية متصالبة (crossfade)** فتتكرّر بلا أي «قطعة» إطلاقًا.
export const MUSIC_OPTIONS: MusicOption[] = [
  { key: "piano", name: "بيانو هادئ", prompt: "soft slow calm solo piano, gentle, peaceful, seamless loop" },
  { key: "nature", name: "طبيعة", prompt: "gentle calm nature ambience, soft rain and distant birds, soothing, seamless loop" },
  { key: "strings", name: "وتريات", prompt: "calm soft warm strings pad, soothing, slow, cinematic, seamless loop" },
  { key: "lofi", name: "لو-فاي", prompt: "calm soft lo-fi chillhop beat for studying, mellow, relaxing, seamless loop" },
  { key: "meditation", name: "تأمّل", prompt: "peaceful meditative ambient drone, very soft, airy, calming, seamless loop" },
  // أصوات الطبيعة (مؤثّرات قصيرة ذات تكرار سلس) — مريحة للقراءة
  { key: "rain", name: "مطر", prompt: "steady gentle rain, soft calming rainfall ambience, seamless loop" },
  { key: "ocean", name: "أمواج البحر", prompt: "gentle calm ocean waves on a quiet shore, soothing, seamless loop" },
  { key: "stream", name: "جدول ماء", prompt: "gentle flowing stream, soft babbling brook water, calming, seamless loop" },
  { key: "birds", name: "طيور", prompt: "soft morning birdsong ambience, gentle and calming, seamless loop" },
  { key: "wind", name: "نسيم", prompt: "soft gentle wind through trees, calm airy breeze ambience, seamless loop" },
  { key: "fire", name: "مدفأة", prompt: "cozy crackling fireplace, soft warm campfire ambience, calming, seamless loop" },
  { key: "thunder", name: "مطر ورعد", prompt: "gentle steady rain with soft distant thunder, calming, seamless loop" },
  { key: "night", name: "ليل هادئ", prompt: "peaceful summer night ambience, soft crickets and gentle breeze, calming, seamless loop" },
  // 🎬 موسيقى سينمائية أوركسترالية (ElevenLabs) — أحاسيس وميلودراما بأسلوب سكور
  // الأفلام الملحمية، يندمج معها القارئ. (وصف أسلوب عام — بلا نسخ أعمال محمية.)
  { key: "epic", name: "ملحمي", kind: "music", lengthMs: 90000, prompt: "epic cinematic orchestral score, sweeping strings, powerful brass and choir, grand fantasy adventure atmosphere, majestic and emotional, instrumental film score" },
  { key: "heroic", name: "بطولي", kind: "music", lengthMs: 90000, prompt: "heroic epic orchestral score, bold brass and driving strings, noble and stirring, uplifting battle atmosphere, instrumental film score" },
  { key: "emotional", name: "عاطفي", kind: "music", lengthMs: 90000, prompt: "sweeping emotional cinematic orchestral score, soaring strings and gentle piano, romantic, tender and touching, instrumental film score" },
  { key: "dark", name: "مظلم", kind: "music", lengthMs: 90000, prompt: "dark tense cinematic orchestral score, ominous low strings and brass, suspenseful and dramatic thriller atmosphere, instrumental film score" },
  { key: "historical", name: "تاريخي", kind: "music", lengthMs: 90000, prompt: "noble historical orchestral score, warm strings and soft horns, epic period-drama atmosphere, dignified and emotional, instrumental film score" },
  { key: "classical", name: "كلاسيكي", kind: "music", lengthMs: 90000, prompt: "calm classical orchestral piece in a warm romantic style, gentle slow strings and soft piano, peaceful and soothing, instrumental" },
  { key: "study", name: "دراسة", kind: "music", lengthMs: 90000, prompt: "warm uplifting study music, gentle soft piano with light warm strings, positive hopeful and encouraging mood, calm and relaxing yet motivating, soft steady and continuous, instrumental" },
  // 🎹 بيانو متنوّع (٣) — طول أقصر ليظهر أسرع
  { key: "piano_dream", name: "بيانو حالم", kind: "music", lengthMs: 30000, prompt: "gentle calm solo piano, slow soft dreamy melody, peaceful warm and flowing, instrumental" },
  { key: "piano_emotive", name: "بيانو عاطفي", kind: "music", lengthMs: 30000, prompt: "reflective emotional solo piano, tender slow melancholic melody, contemplative and touching, instrumental" },
  { key: "piano_bright", name: "بيانو مشرق", kind: "music", lengthMs: 30000, prompt: "bright uplifting soft piano, gentle flowing hopeful melody, light and positive, instrumental" },
  // 🎻 كمان متنوّع (٣)
  { key: "violin_calm", name: "كمان هادئ", kind: "music", lengthMs: 30000, prompt: "solo violin, warm slow expressive melody, calm and soothing, soft gentle strings, instrumental" },
  { key: "violin_emotive", name: "كمان عاطفي", kind: "music", lengthMs: 30000, prompt: "emotional solo violin, tender melancholic flowing melody, gentle and moving, instrumental" },
  { key: "violin_classical", name: "كمان كلاسيكي", kind: "music", lengthMs: 30000, prompt: "elegant classical violin, graceful warm flowing melody, refined and calm, instrumental" },
  // 🥁 إيقاع هادئ متنوّع (٣) — طبول واضحة ومحدّدة مع لمسة لحنية دافئة
  { key: "drum_calm", name: "إيقاع هادئ", kind: "music", lengthMs: 30000, prompt: "soft calm steady drum groove, clear gentle hand percussion with a warm mellow melodic pad, relaxing and well defined rhythm, instrumental" },
  { key: "drum_meditative", name: "طبول تأمّلية", kind: "music", lengthMs: 30000, prompt: "gentle meditative drum rhythm, clear soft frame drums and shakers with a warm drone, slow hypnotic and calming, instrumental" },
  { key: "drum_warm", name: "إيقاع دافئ", kind: "music", lengthMs: 30000, prompt: "warm mellow drum groove, clear soft world percussion with a gentle melodic pad, relaxing defined and cozy, instrumental" },
  // 🎷 ساكسفون هادئ متنوّع (٣)
  { key: "sax_calm", name: "ساكسفون هادئ", kind: "music", lengthMs: 30000, prompt: "smooth calm saxophone, soft slow jazzy melody, warm and relaxing, gentle, instrumental" },
  { key: "sax_romantic", name: "ساكسفون رومانسي", kind: "music", lengthMs: 30000, prompt: "gentle romantic saxophone, tender smooth flowing melody, soothing and warm, instrumental" },
  { key: "sax_night", name: "ساكسفون ليلي", kind: "music", lengthMs: 30000, prompt: "soft mellow late-night saxophone, calm smooth relaxed jazz, laid-back and warm, instrumental" },
];

const MUSIC_SECONDS = 12; // طول مؤثّر رفع ٣

async function fileFor(opt: MusicOption): Promise<File | null> {
  return opt.kind === "music"
    ? getMusicFile(`music-${opt.key}`, opt.prompt, opt.lengthMs ?? 90000)
    : getSfxFile(`music-${opt.key}`, opt.prompt, MUSIC_SECONDS);
}

/** كل مقطوعة تُولَّد عند اختيارها أول مرة ثم تُخزَّن (توفير التكلفة مع كثرة الخيارات). */
export async function warmAllMusic(): Promise<void> {
  // بلا تحضير مسبق — الخيارات كثيرة، فنولّد ما يُختار فقط.
}

/* --- تشغيل بحلقة بسيطة موثوقة (نفس رفع ٣): مؤثّرات التكرار السلس بلا قطعة --- */
const AMB_VOLUME = 0.14;

let ambientPlayer: AudioPlayer | null = null;
let ambientKey: string | null = null;
// رمز يتغيّر مع كل إيقاف/تبديل — يُلغي أي مقطوعة كانت «قيد التوليد» فلا يشتغل اثنان معًا
let ambientToken = 0;

export function stopAmbient(): void {
  ambientToken++; // يُبطل أي startAmbient قيد الانتظار (توليد) فلا يتراكب الصوت
  if (ambientPlayer) {
    try { ambientPlayer.pause(); } catch {}
    try { ambientPlayer.remove(); } catch {}
    ambientPlayer = null;
  }
  ambientKey = null;
}

export async function startAmbient(key: string): Promise<void> {
  const opt = MUSIC_OPTIONS.find((o) => o.key === key);
  if (!opt) return;
  if (ambientPlayer && ambientKey === key) return; // نفس المقطع شغّال
  stopAmbient(); // يوقف الحالي ويزيد الرمز
  const myToken = ambientToken; // بصمة هذا الطلب بعد الإيقاف
  const f = await fileFor(opt);
  // تغيّر الاختيار (أو أُوقف) أثناء التوليد → لا تشغّل هذا (يمنع تراكب صوتين)
  if (myToken !== ambientToken || !f) return;
  try {
    ambientPlayer = createAudioPlayer({ uri: f.uri });
    ambientKey = key;
    ambientPlayer.loop = true;
    ambientPlayer.volume = AMB_VOLUME;
    ambientPlayer.play();
  } catch {}
}
