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

/* ---------------- موسيقى خلفية هادئة (اختيارات متعددة، حلقة) ---------------- */
// كل الخيارات هادئة ومريحة
// نفس مؤثّرات رفع ٣ بالضبط (الأنعم في التكرار بلا أي «قطعة») — نفس التعليمات
// ونفس التخزين (sfx-cache-v1) فتُستخدم نفس المقاطع الصوتية تمامًا.
export const MUSIC_OPTIONS: { key: string; name: string; prompt: string }[] = [
  { key: "piano", name: "بيانو هادئ", prompt: "soft slow calm solo piano, gentle, peaceful, seamless loop" },
  { key: "nature", name: "طبيعة", prompt: "gentle calm nature ambience, soft rain and distant birds, soothing, seamless loop" },
  { key: "strings", name: "وتريات", prompt: "calm soft warm strings pad, soothing, slow, cinematic, seamless loop" },
  { key: "lofi", name: "لو-فاي", prompt: "calm soft lo-fi chillhop beat for studying, mellow, relaxing, seamless loop" },
  { key: "meditation", name: "تأمّل", prompt: "peaceful meditative ambient drone, very soft, airy, calming, seamless loop" },
];

// طول مقطع المؤثّر (ث) — ١٢ث كما في رفع ٣.
const MUSIC_SECONDS = 12;

let ambientPlayer: AudioPlayer | null = null;
let ambientKey: string | null = null;

/**
 * يحضّر **كل** مقطوعات الموسيقى مرة واحدة ويخزّنها محليًا (بالتوازي)، فيصير
 * التبديل بينها فوريًا بلا أي توليد لاحق ولا استهلاك ذكاء. آمن للاستدعاء المتكرر
 * (يتخطّى المخزَّن). يُستدعى عند فتح العرض التقديمي أو عند تحميل الكتاب.
 */
export async function warmAllMusic(): Promise<void> {
  try {
    await Promise.all(
      MUSIC_OPTIONS.map((o) => getSfxFile(`music-${o.key}`, o.prompt, MUSIC_SECONDS).catch(() => null))
    );
  } catch {
    // التحضير المسبق اختياري — لا نُزعج المستخدم عند فشله
  }
}

export async function startAmbient(key: string): Promise<void> {
  const opt = MUSIC_OPTIONS.find((o) => o.key === key);
  if (!opt) return;
  if (ambientPlayer && ambientKey === key) return; // نفس المقطع شغّال
  stopAmbient();
  const f = await getSfxFile(`music-${opt.key}`, opt.prompt, MUSIC_SECONDS);
  if (!f) return;
  try {
    ambientPlayer = createAudioPlayer({ uri: f.uri });
    ambientKey = key;
    ambientPlayer.loop = true;
    ambientPlayer.volume = 0.14; // نفس مستوى رفع ٣
    ambientPlayer.play();
  } catch {}
}

export function stopAmbient(): void {
  if (ambientPlayer) {
    try {
      ambientPlayer.pause();
      ambientPlayer.remove();
    } catch {}
    ambientPlayer = null;
  }
  ambientKey = null;
}
