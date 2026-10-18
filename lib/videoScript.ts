// lib/videoScript.ts
// «ملخّص الفيديو» للوحدة بأسلوب NotebookLM: مشاهد بصرية (تخطيطات Gamma) + راوٍ يشرح كمعلّم،
// مع أسئلة سريعة بين المشاهد وخلاصة، فيخرج الطالب جاهزًا للاختبار.
// يُبنى من الملخّص الشامل (يغطي الوحدة كلها) عبر محرك الأجزاء المشترك (partsRunner):
// أجزاء معًا ببثّ، حفظ كل جزء فورًا، إكمال بعد القفل، وقت متبقٍّ. السيناريو يُخزَّن مرة واحدة،
// وصوت الراوي يُحفظ على الجهاز، فالعودة للفيديو فورية وبلا إنترنت.
import { jobPart } from "./aiJobs";
import { runParts, type PartsProgress } from "./partsRunner";
import type { StudySummary } from "./studySummary";
import { mergeVideo, parsePartialVideo, parseVideo, videoParts, type VideoScene, type VideoScript } from "./videoScriptCore";
export { mergeVideo, parsePartialVideo, parseVideo, videoParts, type VideoScene, type VideoScript };
import { getUnitContent, setUnitContent } from "./unitContent";
import { summaryCacheKey, type SummarySource } from "./unitSummary";
import { DEFAULT_VOICE_ID, prefetchText } from "./voice";

export type VideoProgress = PartsProgress<VideoScript>;

function cacheIds(src: SummarySource) {
  const k = summaryCacheKey(src);
  const id = (k.kind === "pagestudysummary" ? 1 : 2) * 1e12 + k.id;
  return { id, partId: (n: number, i: number) => id * 1e4 + n * 100 + i };
}

export async function getCachedVideo(pdfPath: string, src: SummarySource): Promise<VideoScript | null> {
  const v = await getUnitContent<VideoScript>(pdfPath, cacheIds(src).id, "video").catch(() => null);
  return v?.scenes?.length ? v : null;
}

/** السيناريو كاملًا: من المخزن، أو يُولَّد من الملخّص (الأجزاء معًا ببثّ) ويُخزَّن عند اكتمال كل الأجزاء */
export async function getOrMakeVideo(
  pdfPath: string,
  src: SummarySource,
  summary: StudySummary,
  unitTitle: string,
  onProgress?: (p: VideoProgress) => void
): Promise<{ script: VideoScript | null; complete: boolean }> {
  const cached = await getCachedVideo(pdfPath, src);
  if (cached) return { script: cached, complete: true };
  const parts = videoParts(summary, unitTitle);
  if (!parts.length) return { script: null, complete: false };
  const n = parts.length;
  const ids = cacheIds(src);
  const results = await runParts<VideoScript, VideoScript>({
    parts,
    speedKey: "vsf:video:speed",
    defaultSpeed: { chars: 7000, rate: 45 },
    load: (i) => getUnitContent<VideoScript>(pdfPath, ids.partId(n, i), "videopart").then((x) => (x?.scenes?.length ? x : undefined)),
    save: (i, p) => setUnitContent(pdfPath, ids.partId(n, i), "videopart", p),
    run: (ctx, i, onPartial) => jobPart("videoscript", ctx, `vid:${pdfPath}:${ids.partId(n, i)}`, parsePartialVideo, parseVideo, onPartial),
    merge: mergeVideo,
    onProgress,
    parallel: Math.min(6, n),
  });
  const ok = results.filter((x): x is VideoScript => !!x);
  const script = mergeVideo(ok);
  const complete = !!script && ok.length === n;
  if (script && complete) await setUnitContent(pdfPath, ids.id, "video", script);
  return { script, complete };
}

/** ما يقوله الراوي لكل مشهد (السؤال ثم الجواب منفصلان: بينهما وقفة تفكير) */
export function sceneSpeech(s: VideoScene): string[] {
  if (s.kind === "check") return [s.narration, s.answer ? s.answer : ""].filter(Boolean);
  return [s.narration];
}

/** يحفظ صوت الراوي لكل المشاهد على الجهاز (للمشاهدة لاحقًا بلا إنترنت ولا انتظار) */
export async function saveVideoAudio(v: VideoScript, voiceId = DEFAULT_VOICE_ID, onProgress?: (done: number, total: number) => void): Promise<void> {
  const lines = v.scenes.flatMap(sceneSpeech);
  for (let i = 0; i < lines.length; i++) {
    await prefetchText(lines[i], { voiceId });
    onProgress?.(i + 1, lines.length);
  }
}
