// lib/sfx.ts
// مؤثرات صوتية + موسيقى خلفية للعرض التقديمي (تُولَّد مرة عبر ElevenLabs وتُخبّأ محليًا).
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";

import { supabase } from "./supabase";

const DIR = "sfx-cache-v3"; // v3: موسيقى ElevenLabs (مقطوعات أطول) بدل مؤثّرات قصيرة

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
// موسيقى ElevenLabs (v1/music): مقطوعة أطول وأغنى ومرخّصة تجاريًا. عند تعذّرها
// (خطة/شبكة) نرجع لمؤثّر الصوت القصير حتى لا تنقطع الميزة.
async function getMusicFile(key: string, prompt: string, lengthMs: number): Promise<File | null> {
  const f = new File(dir(), `${hash(key)}.mp3`);
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
  return getSfxFile(key, prompt, 22);
}

export const MUSIC_OPTIONS: { key: string; name: string; prompt: string }[] = [
  { key: "piano", name: "بيانو هادئ", prompt: "calm slow solo piano, gentle and warm, continuous ambient background for studying, soft dynamics, no strong intro or ending, loopable" },
  { key: "nature", name: "طبيعة", prompt: "peaceful ambient soundscape with soft nature textures and gentle warm pads, calm and continuous, soothing background, loopable" },
  { key: "strings", name: "وتريات", prompt: "warm soft cinematic strings pad, slow and soothing, continuous ambient background, no strong intro or ending, loopable" },
  { key: "lofi", name: "لو-فاي", prompt: "mellow lo-fi chillhop instrumental for studying, relaxed steady groove, continuous soft background, loopable" },
  { key: "meditation", name: "تأمّل", prompt: "peaceful meditative ambient drone with airy warm pads, very soft and calming, continuous, loopable" },
];

// طول مقطوعة الموسيقى (ms) — ٦٠ث: أطول وأنعم من مؤثّرات ٢٢ث، وبتكلفة معقولة.
const MUSIC_MS = 60000;

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
      MUSIC_OPTIONS.map((o) => getMusicFile(`music-${o.key}`, o.prompt, MUSIC_MS).catch(() => null))
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
  const f = await getMusicFile(`music-${opt.key}`, opt.prompt, MUSIC_MS);
  if (!f) return;
  try {
    ambientPlayer = createAudioPlayer({ uri: f.uri });
    ambientKey = key;
    ambientPlayer.loop = true;
    ambientPlayer.volume = 0.14; // خفيفة حتى لا تشتّت
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
