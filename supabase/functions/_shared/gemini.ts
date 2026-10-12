// supabase/functions/_shared/gemini.ts
// أصوات جيميناي (Google Gemini TTS): المزوّد الوحيد للصوت (قرار ١٠ أكتوبر ٢٠٢٦ — بدل Azure وElevenLabs).
// تقرأ النص وهي فاهمة معناه (الأرقام والتواريخ والكلمات الملتبسة)، وأرخص بكثير.
// جيميناي يرجّع صوتًا خامًا (PCM ‏24 كيلوهرتز) فنحوّله MP3 ‏48 كيلوبت (خفيف للجوال) على السيرفر.
import { createMp3Encoder } from "npm:wasm-media-encoders@0.7.0";

export const GEMINI_MODEL = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-3.8-flash-lite-tts";
export const GEMINI_KBPS = 48;
const RATE = 24000;
const TIMEOUT_MS = 25_000;

// أصوات جيميناي المسموحة (نفس أصوات حاكي) — أي اسم غيرها يُرفض ويُستبدل بالافتراضي
export const GEMINI_VOICES = new Set([
  "Sulafat", "Kore", "Aoede", "Leda", "Despina", "Achernar", "Vindemiatrix", "Gacrux",
  "Charon", "Orus", "Iapetus", "Algenib", "Schedar", "Sadaltager", "Achird", "Algieba",
]);

// الأصوات القديمة (Azure وElevenLabs) → أقرب صوت جيميناي، حتى لا يتعطل أي اختيار محفوظ
const LEGACY: Record<string, string> = {
  "azure:ar-AE-Rashid:DragonHDLatestNeural": "Charon",
  "azure:ar-SA-HamedNeural": "Orus",
  "azure:ar-SA-ZariyahNeural": "Kore",
  "azure:ar-EG-SalmaNeural": "Leda",
  "azure:en-US-Ava:DragonHDLatestNeural": "Kore",
  "azure:en-US-Andrew:DragonHDLatestNeural": "Charon",
  "azure:fr-FR-VivienneMultilingualNeural": "Aoede",
  "azure:fr-FR-RemyMultilingualNeural": "Orus",
  apsZFlSToM2vmFpwz5jX: "Charon", // عمر
  XdoLPWNt7ytn6BtU4FBf: "Iapetus", // عبدالله
  "18HMWpalD7cscJTD8lEY": "Algenib", // طارق
  RaelJk8tltOJ5KMrKjDu: "Sulafat", // ليلى
  UR972wNGq3zluze0LoIp: "Sadaltager", // هيثم
  QRq5hPRAKf5ZhSlTBH6r: "Schedar", // يحيى
  vWDp3PLsTWjIhBxxUKh9: "Despina", // فاطمة
  "9FHjCdVXgA4tYxIYHTcZ": "Achird", // سفيان
  rUaPbzcZIu8df8iNL9WZ: "Algieba", // سلطان
  KxMRrXEjbJ6kZ93yT3fq: "Leda", // سلمى
  isQLuoVuANx6FjDxyasX: "Aoede", // نورة
  "21m00Tcm4TlvDq8ikWAM": "Kore", // Rachel
  pNInz6obpgDQGcFmaJgB: "Charon", // Adam
  XB0fDUnXU5powFXDhCwa: "Aoede", // Charlotte
  ErXwobaYiN019PkySvjV: "Orus", // Antoni
};

/** معرّف الصوت من التطبيق («gemini:Kore» أو معرّف قديم) → اسم صوت جيميناي */
export function geminiVoiceFor(voiceId: string | undefined, gender?: string): string {
  const id = String(voiceId ?? "");
  const name = id.startsWith("gemini:") ? id.slice(7) : LEGACY[id];
  if (name && GEMINI_VOICES.has(name)) return name;
  return gender === "male" ? "Charon" : "Sulafat";
}

export function langOf(t: string): "ar" | "en" | "fr" {
  const ar = (t.match(/[؀-ۿ]/g) ?? []).length;
  const lat = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (ar >= lat) return "ar";
  return /[àâçéèêëîïôûùüÿœ]/i.test(t) ? "fr" : "en";
}

// التوجيه جملة إنجليزية قصيرة قبل النص — التوجيه الطويل بالعربي كان يُقرأ بصوت عالي مع النص.
// expressive = إلقاء أدفأ (سرد العرض التقديمي)، وإلا قراءة دراسية واضحة.
const PROMPTS: Record<"ar" | "en" | "fr", [string, string]> = {
  ar: [
    "Read aloud in a clear, natural Modern Standard Arabic narrator voice:",
    "Read in a warm, calm Arabic storyteller voice:",
  ],
  en: ["Read aloud in a clear, natural English narrator voice:", "Read in a warm, engaging English storyteller voice:"],
  fr: ["Read aloud in a clear, natural French narrator voice:", "Read in a warm, engaging French storyteller voice:"],
};

// يحوّل مقاطع الصوت الخام (16-بت) إلى MP3 أول بأول.
async function encoder() {
  const enc = await createMp3Encoder();
  enc.configure({ sampleRate: RATE, channels: 1, bitrate: GEMINI_KBPS } as Parameters<typeof enc.configure>[0]);
  const out: Uint8Array[] = [];
  let carry: Uint8Array | null = null; // بايت زايد من مقطع سابق (العيّنة الواحدة بايتين)
  let samples = 0;
  return {
    push(bytes: Uint8Array) {
      let b = bytes;
      if (carry) {
        const m = new Uint8Array(carry.length + b.length);
        m.set(carry);
        m.set(b, carry.length);
        b = m;
        carry = null;
      }
      if (b.length % 2) {
        carry = b.slice(b.length - 1);
        b = b.subarray(0, b.length - 1);
      }
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const f = new Float32Array(b.length / 2);
      for (let i = 0; i < f.length; i++) f[i] = view.getInt16(i * 2, true) / 32768;
      samples += f.length;
      out.push(new Uint8Array(enc.encode([f])));
    },
    finish(): { mp3: Uint8Array; seconds: number } {
      out.push(new Uint8Array(enc.finalize()));
      const all = new Uint8Array(out.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of out) (all.set(c, o), (o += c.length));
      return { mp3: all, seconds: samples / RATE };
    },
  };
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** صوت النص كاملًا (MP3) ومدته بالثواني. البث من جوجل أسرع بكثير من انتظار الرد كاملًا. */
export async function geminiMp3(voiceName: string, text: string, expressive = false): Promise<{ mp3: Uint8Array; seconds: number }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const instruction = PROMPTS[langOf(text)][expressive ? 1 : 0];
  // حد أقصى للانتظار: طلب عالق لا يُعلّق القراءة دقائق — نلغيه ويكمل التطبيق بصوت الجهاز
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    signal: abort.signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${instruction}\n${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const enc = await encoder();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value.replaceAll("\r\n", "\n");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = ev.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const d = JSON.parse(line.slice(5));
      for (const p of d.candidates?.[0]?.content?.parts ?? []) {
        if (p.inlineData?.data) {
          const pcm = b64(p.inlineData.data);
          got += pcm.length;
          enc.push(pcm);
        }
      }
    }
  }
  if (!got) throw new Error("gemini 502: empty audio");
  return enc.finish();
  } catch (e) {
    if (abort.signal.aborted) throw new Error("gemini 504: timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
