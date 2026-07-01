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
  { key: "forest", name: "غابة", prompt: "peaceful forest ambience, soft distant birdsong and gentle breeze, seamless loop" },
  { key: "stream", name: "جدول ماء", prompt: "gentle flowing stream, soft babbling brook water, calming, seamless loop" },
  { key: "birds", name: "طيور", prompt: "soft morning birdsong ambience, gentle and calming, seamless loop" },
  { key: "wind", name: "نسيم", prompt: "soft gentle wind through trees, calm airy breeze ambience, seamless loop" },
  { key: "fire", name: "مدفأة", prompt: "cozy crackling fireplace, soft warm campfire ambience, calming, seamless loop" },
  { key: "thunder", name: "مطر ورعد", prompt: "gentle steady rain with soft distant thunder, calming, seamless loop" },
  { key: "night", name: "ليل هادئ", prompt: "peaceful summer night ambience, soft crickets and gentle breeze, calming, seamless loop" },
  // مقطوعات ElevenLabs (أغنى) — kind: music
  { key: "symphony", name: "سمفونية", kind: "music", lengthMs: 90000, prompt: "very calm classical symphony, soft slow strings and light woodwinds, gentle, peaceful, continuous ambient pad texture, no loud crescendos and no percussion" },
  { key: "cinematic", name: "سينمائي", kind: "music", lengthMs: 90000, prompt: "calm cinematic ambient, warm sustained strings and soft pads, slow evolving, peaceful, continuous" },
  { key: "lofi_long", name: "لو-فاي غني", kind: "music", lengthMs: 90000, prompt: "mellow lo-fi chillhop instrumental for studying, relaxed steady groove, warm, continuous, soft" },
  { key: "classical", name: "كلاسيكي هادئ", kind: "music", lengthMs: 90000, prompt: "calm classical orchestral piece in a warm romantic style, gentle slow strings and soft piano, peaceful and soothing for reading, soft dynamics, no loud crescendos, continuous" },
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

/* --- حلقة متواصلة بلا قطع: مشغّلان ينتقل الصوت بينهما بتلاشٍ متصالب --- */
const AMB_VOLUME = 0.14;
const CROSSFADE_MS = 2500;

let ambA: AudioPlayer | null = null;
let ambB: AudioPlayer | null = null;
let ambActive: AudioPlayer | null = null;
let ambientKey: string | null = null;
let ambLoopTimer: ReturnType<typeof setInterval> | null = null;
let ambFadeTimer: ReturnType<typeof setInterval> | null = null;
let ambFading = false;

export function stopAmbient(): void {
  if (ambLoopTimer) { clearInterval(ambLoopTimer); ambLoopTimer = null; }
  if (ambFadeTimer) { clearInterval(ambFadeTimer); ambFadeTimer = null; }
  for (const p of [ambA, ambB]) {
    if (p) {
      try { p.pause(); } catch {}
      try { p.remove(); } catch {}
    }
  }
  ambA = ambB = ambActive = null;
  ambientKey = null;
  ambFading = false;
}

function beginCrossfade(): void {
  const cur = ambActive;
  const next = cur === ambA ? ambB : ambA;
  if (!cur || !next) return;
  ambFading = true;
  try { next.seekTo(0); } catch {}
  next.volume = 0;
  try { next.play(); } catch {}
  let i = 0;
  const steps = 25;
  if (ambFadeTimer) clearInterval(ambFadeTimer);
  ambFadeTimer = setInterval(() => {
    i++;
    const r = Math.min(1, i / steps);
    try { cur.volume = AMB_VOLUME * (1 - r); } catch {}
    try { next.volume = AMB_VOLUME * r; } catch {}
    if (i >= steps) {
      if (ambFadeTimer) { clearInterval(ambFadeTimer); ambFadeTimer = null; }
      try { cur.pause(); cur.seekTo(0); cur.volume = AMB_VOLUME; } catch {}
      ambActive = next;
      ambFading = false;
    }
  }, CROSSFADE_MS / steps);
}

export async function startAmbient(key: string): Promise<void> {
  const opt = MUSIC_OPTIONS.find((o) => o.key === key);
  if (!opt) return;
  if (ambActive && ambientKey === key) return; // نفس المقطع شغّال
  stopAmbient();
  const f = await fileFor(opt);
  if (!f) return;
  try {
    ambA = createAudioPlayer({ uri: f.uri }, { updateInterval: 200 });
    ambB = createAudioPlayer({ uri: f.uri }, { updateInterval: 200 });
    ambA.volume = AMB_VOLUME;
    ambB.volume = 0;
    ambActive = ambA;
    ambientKey = key;
    ambA.play();
    // مراقب الحلقة: قبل نهاية المقطع نبدأ التلاشي المتصالب مع النسخة الأخرى
    ambLoopTimer = setInterval(() => {
      const p = ambActive;
      if (!p || ambFading) return;
      const dur = p.duration ?? 0;
      const t = p.currentTime ?? 0;
      if (dur > 0.5 && t >= dur - CROSSFADE_MS / 1000) beginCrossfade();
    }, 200);
  } catch {}
}
