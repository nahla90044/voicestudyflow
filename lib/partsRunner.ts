// lib/partsRunner.ts
// محرك مشترك للتوليد الطويل بالذكاء جزءًا جزءًا (الملخّص الشامل، ملخّص الفيديو):
// - الأجزاء تُولَّد معًا (٣ في الوقت نفسه)، كل جزء ببثّ مباشر يظهر أولًا بأول بالترتيب.
// - كل جزء يُحفظ على الجهاز فور اكتماله: قفل الشاشة/الخروج لا يضيّع ما اكتمل.
// - الجزء المنقطع (التطبيق خرج من الواجهة) يُعاد تلقائيًا عند الرجوع ولا يُحسب محاولة فاشلة.
// - وقت متبقٍّ من سرعة الكتابة الفعلية المقيسة على الجهاز (تتحسّن مع كل استخدام).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

import { aiAssist, aiAssistStream, type AiAction } from "./ai";

const PARALLEL = 3;
const MAX_TRIES = 3;

export type PartsProgress<R> = { done: number; total: number; soFar: R | null; etaSec: number | null; waiting: boolean };

type Speed = { chars: number; rate: number };
const speeds = new Map<string, Speed>();
async function loadSpeed(key: string, def: Speed): Promise<Speed> {
  if (speeds.has(key)) return speeds.get(key)!;
  let sp = def;
  try {
    const v = JSON.parse((await AsyncStorage.getItem(key)) || "null");
    if (v?.chars > 500 && v?.rate > 5) sp = v;
  } catch {}
  speeds.set(key, sp);
  return sp;
}
function learnSpeed(key: string, chars: number, secs: number) {
  const sp = speeds.get(key);
  if (!sp || chars < 500 || secs < 3) return;
  const next = { chars: Math.round(sp.chars * 0.6 + chars * 0.4), rate: sp.rate * 0.6 + (chars / secs) * 0.4 };
  speeds.set(key, next);
  AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
}

/** ينتظر حتى يعود التطبيق للواجهة (القفل/الخلفية يقطعان الاتصال في iOS) */
export function whenActive(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((res) => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        sub.remove();
        res();
      }
    });
  });
}

/** جزء واحد ببثّ مباشر؛ احتياطًا طلب عادي إن تعذّر البثّ والتطبيق في الواجهة. يرمي WENT_AWAY إن انقطع بالخروج */
export async function streamPart<P>(
  action: AiAction,
  ctx: string,
  parsePartial: (raw: string) => P | null,
  parseFull: (raw: string) => P | null,
  onPartial: (p: P, chars: number) => void
): Promise<P> {
  let raw = "";
  let wentAway = false;
  const sub = AppState.addEventListener("change", (st) => {
    if (st !== "active") wentAway = true;
  });
  try {
    raw = await aiAssistStream(action, ctx, (soFar) => {
      raw = soFar;
      const p = parsePartial(soFar);
      if (p) onPartial(p, soFar.length);
    });
  } catch (e) {
    if ((e as Error).message === "USER_QUOTA") throw e;
    if (wentAway || AppState.currentState !== "active") throw new Error("WENT_AWAY");
    raw = await aiAssist(action, ctx, undefined, undefined, undefined, 150000);
  } finally {
    sub.remove();
  }
  const p = parseFull(raw);
  if (!p) throw new Error("BAD_PART");
  return p;
}

/**
 * يشغّل الأجزاء ويعيد نتيجة كل جزء بالترتيب (null = فشل بعد كل المحاولات).
 * merge: يدمج قائمة أجزاء (للعرض أولًا بأول). يرمي USER_QUOTA إن انتهت الحصة.
 */
export async function runParts<P, R>(o: {
  parts: string[];
  speedKey: string;
  defaultSpeed: Speed;
  load: (i: number) => Promise<P | undefined>;
  save: (i: number, p: P) => Promise<void>;
  run: (ctx: string, i: number, onPartial: (p: P, chars: number) => void) => Promise<P>;
  merge: (list: P[]) => R | null;
  onProgress?: (p: PartsProgress<R>) => void;
}): Promise<(P | null)[]> {
  const n = o.parts.length;
  const speed = () => speeds.get(o.speedKey) ?? o.defaultSpeed;
  await loadSpeed(o.speedKey, o.defaultSpeed);
  const final: (P | null | undefined)[] = await Promise.all(o.parts.map((_, i) => o.load(i).catch(() => undefined)));
  const partial: (P | null)[] = o.parts.map(() => null);
  const chars: number[] = o.parts.map(() => 0);
  const started: number[] = o.parts.map(() => 0);
  let done = final.filter((x) => x !== undefined).length;
  let waiting = false;
  let lastPaint = 0;
  const eta = (): number | null => {
    const left = o.parts.map((_, i) => i).filter((i) => final[i] === undefined);
    if (!left.length) return 0;
    const sp = speed();
    let work = 0;
    for (const i of left) work += Math.max(sp.chars - chars[i], sp.chars * 0.08) + (started[i] ? 0 : sp.rate * 6); // ~٦ ث لبدء الطلب
    return Math.round(work / (sp.rate * Math.min(PARALLEL, left.length)));
  };
  const report = (force = false) => {
    const now = Date.now();
    if (!o.onProgress || (!force && now - lastPaint < 300)) return;
    lastPaint = now;
    const shown: P[] = [];
    for (let i = 0; i < n; i++) {
      const s = final[i] !== undefined ? final[i] : partial[i];
      if (!s) {
        if (final[i] === undefined) break; // لم يظهر منه شيء بعد → نحافظ على الترتيب
        continue; // فشل → نتخطاه
      }
      shown.push(s);
    }
    o.onProgress({ done, total: n, soFar: o.merge(shown), etaSec: eta(), waiting });
  };
  report(true);
  const queue = o.parts.map((_, i) => i).filter((i) => final[i] === undefined);
  let quota: Error | null = null;
  const worker = async () => {
    while (queue.length && !quota) {
      const i = queue.shift()!;
      for (let tries = 0; final[i] === undefined && !quota; ) {
        if (AppState.currentState !== "active") {
          waiting = true;
          report(true);
          await whenActive();
          waiting = false;
        }
        started[i] = Date.now();
        try {
          const p = await o.run(o.parts[i], i, (pp, c) => {
            partial[i] = pp;
            chars[i] = c;
            report();
          });
          final[i] = p;
          await o.save(i, p).catch(() => {});
          learnSpeed(o.speedKey, chars[i], (Date.now() - started[i]) / 1000);
        } catch (e) {
          const m = (e as Error).message;
          if (m === "USER_QUOTA") quota = e as Error;
          else if (m !== "WENT_AWAY" && ++tries >= MAX_TRIES) final[i] = null; // فشل حقيقي متكرر
          chars[i] = 0;
        }
      }
      done++;
      report(true);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  if (quota) throw quota;
  return final.map((x) => x ?? null);
}
