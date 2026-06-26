// lib/sfx.ts
// مؤثرات صوتية + موسيقى خلفية للعرض التقديمي (تُولَّد مرة عبر ElevenLabs وتُخبّأ محليًا).
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";

import { supabase } from "./supabase";

const DIR = "sfx-cache-v1";

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

/* ---------------- مؤثّر الانتقال بين الشرائح ---------------- */
let transitionPlayer: AudioPlayer | null = null;

export async function playTransition(): Promise<void> {
  const f = await getSfxFile("transition", "soft gentle whoosh page transition, very short and subtle", 1);
  if (!f) return;
  try {
    if (transitionPlayer) transitionPlayer.remove();
    transitionPlayer = createAudioPlayer({ uri: f.uri });
    transitionPlayer.volume = 0.45;
    transitionPlayer.seekTo(0);
    transitionPlayer.play();
  } catch {}
}

/* ---------------- موسيقى خلفية هادئة (حلقة) ---------------- */
let ambientPlayer: AudioPlayer | null = null;

export async function startAmbient(): Promise<void> {
  if (ambientPlayer) return;
  const f = await getSfxFile(
    "ambient",
    "calm soothing ambient background pad for studying, soft, minimal, gentle, seamless loop",
    22
  );
  if (!f) return;
  try {
    ambientPlayer = createAudioPlayer({ uri: f.uri });
    ambientPlayer.loop = true;
    ambientPlayer.volume = 0.12; // خفيفة جدًا حتى لا تشتّت
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
}
