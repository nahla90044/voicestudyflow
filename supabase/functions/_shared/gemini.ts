// supabase/functions/_shared/gemini.ts
// أصوات جيميناي (Google Gemini TTS): المزوّد الوحيد للصوت (قرار ١٠ أكتوبر ٢٠٢٦ — بدل Azure وElevenLabs).
// تقرأ النص وهي فاهمة معناه (الأرقام والتواريخ والكلمات الملتبسة)، وأرخص بكثير.
// جيميناي يرجّع صوتًا خامًا (PCM ‏24 كيلوهرتز) فنحوّله MP3 ‏48 كيلوبت (خفيف للجوال) على السيرفر.
import { createMp3Encoder } from "npm:wasm-media-encoders@0.7.0";

export const GEMINI_MODEL = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-3.8-flash-lite-tts";
export const GEMINI_KBPS = 48;
const RATE = 24000;
// ميزانية زمن واحدة لكل جملة (كل المحاولات معًا): كانت كل محاولة ٢٥ث مستقلة، فتصل الجملة
// الواحدة لأكثر من دقيقة والتطبيق ينتظر. الآن: ١٨ث للجملة كاملة، وطريقة القراءة تأخذ ٩ث كحد أقصى.
const BUDGET_MS = 18_000;
const STYLED_MAX_MS = 9_000;

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

// بلا أي توجيه داخل النص: التوجيه (حتى الجملة الإنجليزية القصيرة) كان يُقرأ أحيانًا بصوت عالي
// وسط الكلام («Read aloud in a clear…»). طريقة القراءة تُرسل الآن في حقل منفصل عن النص
// (speech_metadata.style) فلا تُقرأ أبدًا — اختُبر بتفريغ الصوت.
export type ReadStyle = "normal" | "calm" | "story" | "clear" | "oratory";
export const READ_STYLES: ReadStyle[] = ["normal", "calm", "story", "clear", "oratory"];
const STYLE_TEXT: Record<Exclude<ReadStyle, "normal">, string> = {
  calm: "very calm, slow and soft, like a bedtime story",
  story: "warm and engaging, like a storyteller narrating a book",
  clear: "slow, with very clear articulation, for studying",
  oratory: "strong, confident and eloquent, like an orator",
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

// Vertex (بوابة جوجل للشركات): نفس النموذج والأصوات، بحدود أعلى بكثير وبلا سقف يومي ١٠٠ طلب.
// المفتاح مربوط بحساب الخدمة vsf-tts (دور Agent Platform User). عند تعذّره نرجع لبوابة AI Studio.
const VERTEX_PROJECT = Deno.env.get("GOOGLE_CLOUD_PROJECT") ?? "gen-lang-client-0211542939";

/** صوت النص كاملًا (MP3) ومدته بالثواني. البث من جوجل أسرع بكثير من انتظار الرد كاملًا.
 *  طريقة القراءة (غير «عادية») تمر عبر بوابة AI Studio فقط (حقل speech_metadata غير متاح في Vertex
 *  بمفتاح API)؛ إن تعذّرت (مثل سقف ١٠٠ طلب يوميًا) نكمل بالقراءة العادية على Vertex — الصوت لا يتوقف. */
export async function geminiMp3(voiceName: string, text: string, style: ReadStyle = "normal"): Promise<{ mp3: Uint8Array; seconds: number }> {
  const vertexKey = Deno.env.get("GOOGLE_TTS_API_KEY");
  const studioKey = Deno.env.get("GEMINI_API_KEY");
  if (!vertexKey && !studioKey) throw new Error("Missing GEMINI_API_KEY");
  const deadline = Date.now() + BUDGET_MS;
  const left = () => deadline - Date.now();
  if (style !== "normal" && studioKey) {
    try {
      return await streamTts(
        "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse",
        studioKey,
        JSON.stringify({
          model: GEMINI_MODEL,
          input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: STYLE_TEXT[style] }] }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: voiceName }] },
          stream: true,
        }),
        Math.min(STYLED_MAX_MS, left()),
      );
    } catch (e) {
      console.error(`styled tts (${style}) failed, reading normally:`, (e as Error).message.slice(0, 200));
    }
  }
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  });
  if (vertexKey) {
    try {
      return await streamTts(
        `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/global/publishers/google/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
        vertexKey,
        body,
        left(),
      );
    } catch (e) {
      // لا وقت كافٍ لمحاولة أخرى → نُرجع الخطأ فورًا فيكمل التطبيق بصوت الجهاز بدل الانتظار
      if (!studioKey || left() < 4000) throw e;
      console.error("vertex tts failed, falling back:", (e as Error).message.slice(0, 200));
    }
  }
  if (left() < 3000) throw new Error("gemini 504: time budget exhausted");
  return streamTts(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, studioKey!, body, left());
}

async function streamTts(url: string, key: string, body: string, timeoutMs: number): Promise<{ mp3: Uint8Array; seconds: number }> {
  // حد أقصى للانتظار: طلب عالق لا يُعلّق القراءة دقائق — نلغيه ويكمل التطبيق بصوت الجهاز
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(1000, timeoutMs));
  try {
  const res = await fetch(url, {
    method: "POST",
    signal: abort.signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body,
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
      // generateContent: candidates[].content.parts[].inlineData — interactions: step.delta بنوع audio
      const chunks: string[] = (d.candidates?.[0]?.content?.parts ?? []).map((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
      if (d.delta?.type === "audio") chunks.push(d.delta.data);
      for (const c of chunks) {
        if (!c) continue;
        const pcm = b64(c);
        got += pcm.length;
        enc.push(pcm);
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
