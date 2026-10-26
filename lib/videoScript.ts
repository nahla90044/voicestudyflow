// lib/videoScript.ts
// «ملخّص الفيديو» للوحدة بأسلوب NotebookLM: مشاهد بصرية (تخطيطات Gamma) + راوٍ يشرح كمعلّم،
// مع أسئلة فهم أثناء الشرح، وخلاصة، ثم «أسئلة الوحدة» في النهاية، فيخرج الطالب جاهزًا للاختبار.
// يُبنى من الملخّص الشامل (يغطي الوحدة كلها) عبر محرك الأجزاء المشترك (partsRunner):
// أجزاء معًا ببثّ، حفظ كل جزء فورًا، إكمال بعد القفل، وقت متبقٍّ. السيناريو يُخزَّن مرة واحدة،
// وصوت الراوي يُحفظ على الجهاز، فالعودة للفيديو فورية وبلا إنترنت.
// «ملخّص الفيديو ٢» (٢٦ أكتوبر): خطة واحدة للوحدة أولًا (videoplan، مجانية)، ثم الأجزاء معًا كما كانت،
// ولكل جزء نصيبه من الخطة — فلا تكرار ولا رجوع لموضوع، والأسئلة الختامية في آخر الفيديو.
// الفيديوهات المحفوظة قبله تُعرض كما هي (لا تنظيف ولا إعادة توليد آلية).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

import { jobPart } from "./aiJobs";
import { getGenId, renewGenId } from "./genId";
import { getCurrentLang } from "./i18n";
import { dict } from "./i18n/strings";
import { runParts, type PartsProgress } from "./partsRunner";
import { recordPerf } from "./perf";
import { qaPart } from "./qualityAgent";
import { checkVideoPart, videoMetrics } from "./qualityCore";
import type { StudySummary } from "./studySummary";
import { anyUnitContentWhere, getUnitContent, removeUnitContent, removeUnitContentWhere, setUnitContent } from "./unitContent";
import { summaryCacheKey, type SummarySource } from "./unitSummary";
import { fallbackPlan, normalizePlan, partStamp, planInput, planParts, soloPart, summarySig, videoJobKeyOf, type PlannedPart, type VideoPlan } from "./videoPlanCore";
import { assembleVideo, mergeVideo, parsePartialVideo, parseVideo, videoParts, type VideoLabels, type VideoScene, type VideoScript } from "./videoScriptCore";
import { DEFAULT_VOICE_ID, prefetchText, speechCharsPerSec } from "./voice";
export { mergeVideo, parsePartialVideo, parseVideo, videoParts, type VideoScene, type VideoScript };

export type VideoProgress = PartsProgress<VideoScript>;

/** مهلة خطة الوحدة (من وقت التطبيق في الواجهة): بعدها تُستعمل الخطة الآلية فلا ينتظر الطالب */
const PLAN_MS = 100_000; // خطة الوحدة الطويلة تأخذ نحو دقيقة (٢٦ أكتوبر: ٤٥ ث كانت تُفوّتها فيُستعمل البديل الآلي)

function cacheIds(src: SummarySource) {
  const k = summaryCacheKey(src);
  const id = (k.kind === "pagestudysummary" ? 1 : 2) * 1e12 + k.id;
  return {
    id,
    // المسار القديم كما هو. تنبيه (٢٦ أكتوبر): id×١٠٠٠٠ يتجاوز دقة الأعداد (٢^٥٣)، فأرقام أجزاء الوحدة
    // الواحدة تتصادم (الأجزاء ١–٣ من أربعة رقم واحد) — لذلك لا يُستكمل بالمسار القديم إلا الجزء الوحيد
    partId: (n: number, i: number) => id * 1e4 + n * 100 + i,
    // ملخّص الفيديو ٢: أرقام صحيحة آمنة (id×١٠٢٤ < ٢^٥٣، حتى ٣١ جزءًا)
    part2: (n: number, i: number) => id * 1024 + n * 32 + i,
  };
}
// بصمة الملخّص في المفتاح: مهمة خطة لملخّص قديم (أو لوحدة أخرى بعد إعادة الترقيم) لا يُتصل بها
const planKey = (pdfPath: string, id: number, sig: string) => `vid2:${pdfPath}:${id}:plan:${sig}`;
/** نطاق «جلسة التوليد» لفيديو الوحدة (lib/genId): يتجدّد عند الحذف لإعادة التوليد فقط */
const genScope = (pdfPath: string, id: number) => `vid:${pdfPath}:${id}`;

const tr = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;
function videoLabels(): VideoLabels {
  const sep = getCurrentLang() === "ar" ? "، " : ", ";
  return {
    summaryTitle: tr("video.summaryTitle"),
    qTitle: tr("video.qTitle"),
    qBody: tr("video.qBody"),
    qBullets: tr("video.qBullets")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean),
    coverAuto: (title, topics) => tr("video.coverAuto").replace("{title}", title).replace("{topics}", topics.join(sep)),
  };
}

export async function getCachedVideo(pdfPath: string, src: SummarySource): Promise<VideoScript | null> {
  const v = await getUnitContent<VideoScript>(pdfPath, cacheIds(src).id, "video").catch(() => null);
  return v?.scenes?.length ? v : null;
}

/** يحذف الفيديو المخزَّن وكل أجزائه وخطته ومهامه، بالمسارين القديم والجديد (إعادة التوليد أو الحذف) */
export async function clearVideo(pdfPath: string, src: SummarySource): Promise<void> {
  const ids = cacheIds(src);
  // جلسة توليد جديدة: إعادة التوليد اليدوية تُخصم (قرار ١٩ أكتوبر)، أما إعادات الأجزاء الآلية داخلها فمجانية
  await renewGenId(genScope(pdfPath, ids.id));
  await removeUnitContent(pdfPath, ids.id, "video");
  await removeUnitContent(pdfPath, ids.id, "videoplan");
  await removeUnitContentWhere(pdfPath, "videopart", (u) => u >= ids.id * 1e4 && u < (ids.id + 1) * 1e4);
  await removeUnitContentWhere(pdfPath, "videopart2", (u) => Math.floor(u / 1024) === ids.id);
  try {
    // مفاتيح مهام الفيديو بالمسارين، ومنها مفاتيح إعادة الجودة (:qa) ومهمة الخطة (كانت تبقى فتتصل إعادة التوليد بمهمة قديمة)
    const keys = (await AsyncStorage.getAllKeys()).filter((x) => {
      const o = videoJobKeyOf(x);
      return !!o && o.pdfPath === pdfPath && o.id === ids.id;
    });
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {}
}

/**
 * توليد قديم منقطع يُكمَل بالمسار القديم (لا يُخصم مرتين): فقط حين يكون جزءًا واحدًا — أرقام أجزاء المسار القديم
 * المتعددة متصادمة، فما حُفظ منها لا يُعرف لأي جزء هو (استكماله كان يكرر جزءًا مكان آخر).
 */
async function v1Pending(pdfPath: string, src: SummarySource, oldN: number): Promise<boolean> {
  if (oldN !== 1) return false;
  const pid = cacheIds(src).partId(1, 0);
  if (await anyUnitContentWhere(pdfPath, "videopart", (u) => u === pid)) return true;
  return !!(await AsyncStorage.getItem(`vsf:aijob:vid:${pdfPath}:${pid}`).catch(() => null));
}

/** يقيس الوقت والتطبيق في الواجهة فقط (القفل لا يستهلك المهلة)؛ null عند انتهائها */
export function activeTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let used = 0;
    let last = Date.now();
    let over = false;
    const tick = setInterval(() => {
      const now = Date.now();
      // فجوة كبيرة بين نبضتين = التطبيق كان معلّقًا في الخلفية → لا تُحسب
      if (AppState.currentState === "active") used += Math.min(now - last, 1000);
      last = now;
      if (used >= ms && !over) {
        over = true;
        clearInterval(tick);
        resolve(null);
      }
    }, 500);
    p.then(
      (v) => {
        if (over) return;
        over = true;
        clearInterval(tick);
        resolve(v);
      },
      (e) => {
        if (over) return;
        over = true;
        clearInterval(tick);
        reject(e);
      }
    );
  });
}

/** خطة الوحدة: المحفوظة (لنفس الملخّص)، أو طلب videoplan (مجاني)، أو الآلية عند التعذّر. تُحفظ قبل الأجزاء */
async function getPlan(pdfPath: string, src: SummarySource, summary: StudySummary, unitTitle: string): Promise<VideoPlan> {
  const ids = cacheIds(src);
  const sig = summarySig(summary);
  const saved = await getUnitContent<VideoPlan>(pdfPath, ids.id, "videoplan").catch(() => null);
  if (saved?.v === 2 && saved.sig === sig && saved.topics?.length) return saved;
  const t0 = Date.now();
  const signal = { aborted: false };
  let plan: VideoPlan | null = null;
  let why = "ok";
  try {
    const raw = await activeTimeout(
      jobPart<string>("videoplan", planInput(summary, unitTitle), planKey(pdfPath, ids.id, sig), () => null, (r) => (r.trim() ? r : null), () => {}, {}, undefined, signal),
      PLAN_MS
    );
    if (raw == null) {
      signal.aborted = true;
      why = "timeout";
    } else {
      plan = normalizePlan(raw, summary);
      if (!plan) why = "unreadable";
    }
  } catch (e) {
    why = (e as Error).message === "RATE_LIMITED" ? "limited" : "failed";
  }
  if (!plan) {
    plan = fallbackPlan(summary);
    recordPerf(`video.v2.plan.${why}`, Date.now() - t0, false);
  }
  recordPerf("video.v2.plan", Date.now() - t0, !plan.auto, plan.topics.length);
  await setUnitContent(pdfPath, ids.id, "videoplan", plan);
  return plan;
}

/** السيناريو كاملًا: من المخزن، أو يُولَّد من الملخّص (خطة ثم الأجزاء معًا ببثّ) ويُخزَّن عند اكتمال كل الأجزاء */
export async function getOrMakeVideo(
  pdfPath: string,
  src: SummarySource,
  summary: StudySummary,
  unitTitle: string,
  onProgress?: (p: VideoProgress) => void
): Promise<{ script: VideoScript | null; complete: boolean }> {
  const cached = await getCachedVideo(pdfPath, src);
  if (cached) return { script: cached, complete: true };
  const oldN = videoParts(summary, unitTitle).length;
  if (!oldN) return { script: null, complete: false };
  if (await v1Pending(pdfPath, src, oldN)) return getOrMakeVideoV1(pdfPath, src, summary, unitTitle, onProgress);
  const t0 = Date.now();
  const ids = cacheIds(src);
  // وحدة قصيرة: جزء واحد بلا خطة (الزمن والتكلفة كاليوم)؛ وإلا الخطة أولًا
  const plan = oldN === 1 ? null : await getPlan(pdfPath, src, summary, unitTitle);
  const parts: PlannedPart[] = plan ? planParts(summary, plan, unitTitle, oldN) : [soloPart(summary, unitTitle)];
  if (!parts.length) return { script: null, complete: false };
  const n = parts.length;
  const stamps = parts.map(partStamp);
  const labels = videoLabels();
  const stats = { dropped: 0 };
  const merge = (list: VideoScript[]) => assembleVideo(list, { plan, n, labels, unitTitle, stats });
  // معرّف جلسة التوليد مع كل جزء: السيرفر يخصم الجزء مرة واحدة في الجلسة، وإعاداته الآلية مجانية
  const genId = await getGenId(genScope(pdfPath, ids.id));
  const results = await runParts<VideoScript, VideoScript>({
    parts: parts.map((p) => p.text),
    speedKey: "vsf:video:speed",
    defaultSpeed: { chars: 7000, rate: 45 },
    // المحفوظ لا يُستعمل إلا لنفس الجزء (بصمته): لا يدخل جزء ملخّص قديم أو وحدة أخرى في هذا الفيديو
    load: (i) => getUnitContent<VideoScript>(pdfPath, ids.part2(n, i), "videopart2").then((x) => (x?.scenes?.length && x.ps === stamps[i] ? x : undefined)),
    save: (i, p) => setUnitContent(pdfPath, ids.part2(n, i), "videopart2", { ...p, ps: stamps[i] }),
    // وكيل الجودة: جزء أغفل موضوعًا، أو بلا أسئلته الختامية/تمارينه/أسئلة الفهم، أو يكرر مواضيع غيره → يُعاد مرة مجانًا
    // (وكل إعادة آلية أخرى للجزء — توقّف، انقطاع، ردّ فارغ — مجانية أيضًا برصيد الجزء على السيرفر)
    run: (ctx, i, onPartial) => {
      const meta = parts[i].meta;
      return qaPart(
        `vid2:${pdfPath}:${ids.part2(n, i)}:${stamps[i]}`,
        "videoscript",
        ctx,
        (key, qaRetryOf) => jobPart("videoscript", ctx, key, parsePartialVideo, parseVideo, onPartial, { qaRetryOf, vpart: meta, genId }),
        (v, c) => checkVideoPart(v, c, meta)
      ).then((v) => ({ ...v, done: true }));
    },
    merge,
    onProgress,
    parallel: Math.min(6, n),
    inOrder: true,
    size: (p) => p.scenes.length,
  });
  const ok = results.filter((x): x is VideoScript => !!x);
  const complete = ok.length === n;
  const script = ok.length ? merge(ok) : null;
  if (script && complete) {
    await setUnitContent(pdfPath, ids.id, "video", script);
    const m = videoMetrics(script);
    recordPerf("video.v2.total", Date.now() - t0, true, n);
    recordPerf("video.v2.examples", 0, true, Math.round(m.examples * 100));
    recordPerf("video.v2.read", 0, true, Math.round(m.read * 100));
    recordPerf("video.v2.words", 0, true, Math.round(m.words));
    recordPerf("video.v2.masc", 0, m.masc === 0, m.masc);
    recordPerf("video.v2.dropped", 0, true, stats.dropped);
    recordPerf(`video.v2.plan.${plan ? (plan.auto ? "auto" : "model") : "solo"}`, 0, true, script.scenes.length);
  }
  return { script, complete };
}

/** المسار القديم كما كان (يُكمل توليدًا قديمًا منقطعًا بجزء واحد فقط — انظر v1Pending) */
async function getOrMakeVideoV1(
  pdfPath: string,
  src: SummarySource,
  summary: StudySummary,
  unitTitle: string,
  onProgress?: (p: VideoProgress) => void
): Promise<{ script: VideoScript | null; complete: boolean }> {
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
    // وكيل الجودة: جزء بلا مشاهد كافية أو يسكت راويه أو شاشاته بلا نقاط → يُعاد مرة واحدة مجانًا
    run: (ctx, i, onPartial) =>
      qaPart(`vid:${pdfPath}:${ids.partId(n, i)}`, "videoscript", ctx, (key, qaRetryOf) => jobPart("videoscript", ctx, key, parsePartialVideo, parseVideo, onPartial, { qaRetryOf }), checkVideoPart),
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

/**
 * كم طلبًا سيستهلك الفيديو: أجزاء الملخّص الناقصة (يُبنى منه) + أجزاء الفيديو الناقصة. خطة الوحدة لا تُحسب.
 * قبل وجود الخطة: عدد أجزاء التقسيم القديم، وهو حد أعلى مضمون (الأجزاء الجديدة لا تزيد عليه).
 * قبل وجود الملخّص يُقدَّر عدد أجزاء الفيديو بعدد أجزاء الملخّص (estimated=true).
 */
export async function videoRequestCost(pdfPath: string, src: SummarySource, unitTitle: string): Promise<{ pending: number; estimated: boolean }> {
  if (await getCachedVideo(pdfPath, src)) return { pending: 0, estimated: false };
  const { getCachedSummary, summaryRequestCost } = await import("./unitSummary");
  const summary = (await getCachedSummary(pdfPath, src)) ?? (await getCachedSummary(pdfPath, { ...src, level: "expand" }));
  if (!summary) {
    const s = await summaryRequestCost(pdfPath, src);
    return { pending: s.pending + Math.max(1, s.total), estimated: true };
  }
  const oldN = videoParts(summary, unitTitle).length;
  const ids = cacheIds(src);
  if (await v1Pending(pdfPath, src, oldN)) {
    const saved = await getUnitContent<VideoScript>(pdfPath, ids.partId(1, 0), "videopart").catch(() => null);
    return { pending: saved?.scenes?.length ? 0 : 1, estimated: false };
  }
  // الأجزاء المحفوظة لنفس الأجزاء (بصمتها) كما في getOrMakeVideo
  const missing = async (parts: PlannedPart[]) => {
    const n = parts.length;
    const have = await Promise.all(
      parts.map((p, i) => getUnitContent<VideoScript>(pdfPath, ids.part2(n, i), "videopart2").then((x) => !!x?.scenes?.length && x.ps === partStamp(p)).catch(() => false))
    );
    return have.filter((x) => !x).length;
  };
  if (oldN <= 1) return { pending: oldN ? await missing([soloPart(summary, unitTitle)]) : 0, estimated: false };
  const plan = await getUnitContent<VideoPlan>(pdfPath, ids.id, "videoplan").catch(() => null);
  if (plan?.v === 2 && plan.sig === summarySig(summary)) return { pending: await missing(planParts(summary, plan, unitTitle, oldN)), estimated: false };
  return { pending: oldN, estimated: false };
}

/** مدة المشاهدة بالثواني من مشهد from: كلام الراوي بسرعته المقيسة ÷ سرعة التشغيل + وقفات التفكير والانتقال */
export function videoSeconds(scenes: VideoScene[], rate = 1, from = 0, thinkSecs = 5): number {
  const cps = speechCharsPerSec() * rate;
  let sec = 0;
  for (const s of scenes.slice(from)) {
    const chars = sceneSpeech(s).reduce((n, l) => n + l.length, 0);
    sec += chars / cps + 0.65 + (s.kind === "check" ? thinkSecs + 1.2 : 0);
  }
  return Math.round(sec);
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
