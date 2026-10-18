// lib/summaryAudio.ts
// صوت الملخّص الشامل: يُقرأ مقطعًا مقطعًا بالترتيب (السيرفر يقرأ ٥٠٠٠ حرف كحد أقصى للطلب،
// فكان الملخّص الطويل لا يُسمع آخره)، مع تجهيز المقطع التالي مسبقًا لاستماع بلا توقف.
// saveSummaryAudio يحفظ صوت كل المقاطع على الجهاز (مع «حفظ» الملخّص) للاستماع لاحقًا بلا إنترنت.
import type { StudySummary } from "./studySummary";
import { summaryToSpeech } from "./studySummary";
import { DEFAULT_VOICE_ID, prefetchText, speakText, stopSpeaking } from "./voice";

const CHUNK = 600;

/** مقاطع الاستماع بالترتيب (تُجمع الأسطر القصيرة حتى ~٦٠٠ حرف، والطويل يُقسم على الجمل) */
export function summaryChunks(s: StudySummary): string[] {
  const out: string[] = [];
  let cur = "";
  for (const raw of summaryToSpeech(s).split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const pieces = line.length > CHUNK ? line.match(/[^.!؟?،]+[.!؟?،]*\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [line] : [line];
    for (const p of pieces) {
      if (cur && cur.length + p.length + 1 > CHUNK) {
        out.push(cur);
        cur = "";
      }
      cur = cur ? `${cur} ${p}` : p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

let token = 0;

/** مصدر المقاطع: قائمة ثابتة، أو دالة لملخّص ما زال يُكتب (final=false → ينتظر المقاطع الجديدة) */
export type ChunkSource = string[] | (() => { chunks: string[]; final: boolean });

/** يشغّل المقاطع من index بالترتيب. onIndex: المقطع الحالي، onDone: انتهى أو توقف */
export function playSummary(
  source: ChunkSource,
  index: number,
  opts: { voiceId?: string; onIndex?: (i: number) => void; onDone?: () => void; onWaiting?: (w: boolean) => void } = {}
): void {
  const my = ++token;
  const voiceId = opts.voiceId ?? DEFAULT_VOICE_ID;
  const read = () => (Array.isArray(source) ? { chunks: source, final: true } : source());
  const step = (i: number) => {
    if (my !== token) return;
    const { chunks, final } = read();
    if (i >= chunks.length) {
      if (final) return opts.onDone?.();
      // الملخّص ما زال يُكتب → ننتظر المقطع التالي ثم نكمل بلا توقف
      opts.onWaiting?.(true);
      setTimeout(() => step(i), 1500);
      return;
    }
    opts.onWaiting?.(false);
    opts.onIndex?.(i);
    // المقطعان التاليان يُجهَّزان أثناء قراءة الحالي
    for (const j of [i + 1, i + 2]) if (j < chunks.length) void prefetchText(chunks[j], { voiceId });
    let moved = false;
    const next = () => {
      if (moved) return;
      moved = true;
      step(i + 1);
    };
    // مقطع بلا حروف تُنطق (رموز فقط) → speakText يرجع دون onDone فيعلق التسلسل؛ نتخطاه
    if (!/[\p{L}\p{N}]/u.test(chunks[i])) return next();
    speakText(chunks[i], { voiceId, onDone: next, onError: next });
  };
  step(index);
}

export function stopSummary(): void {
  token++;
  stopSpeaking();
}

/** يحفظ صوت كل المقاطع على الجهاز (بالترتيب، في الخلفية) — يُستدعى مع «حفظ» الملخّص */
export async function saveSummaryAudio(s: StudySummary, voiceId = DEFAULT_VOICE_ID, onProgress?: (done: number, total: number) => void): Promise<void> {
  const chunks = summaryChunks(s);
  for (let i = 0; i < chunks.length; i++) {
    await prefetchText(chunks[i], { voiceId });
    onProgress?.(i + 1, chunks.length);
  }
}
