// lib/bookAudio.ts
// حفظ صوت الكتاب كاملًا على الجهاز — مستقل عن شاشة القارئ:
// - يبدأ من الصفحة الأولى ويتخطى المحفوظ، وتقدّمه محفوظ دائمًا (يكمل من حيث وقف، لا من جديد).
// - عدة صفحات في الوقت نفسه (أسرع بكثير)، والشاشة تبقى مضاءة أثناءه.
// - الخروج من الكتاب لا يوقفه؛ قفل الجوال يوقفه مؤقتًا (iOS) ويكمل تلقائيًا عند الرجوع، وحتى بعد إعادة فتح التطبيق.
// - إشعار عند الاكتمال، ومكانه الواضح: صفحة الكتاب (الصوت المحفوظ: ١٢٠ من ٣٨٠).
// - الصفحات تُحسب من باقة المستخدم: عند نفادها يتوقف ويُخبر بوضوح.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";

import { getCurrentLang } from "./i18n";
import { dict } from "./i18n/strings";
import "./notify";
import { whenActive } from "./partsRunner";
import { extractPdfPageText, getPageWords, getPageWordsFromText, getPreciseText } from "./pdfText";
import { getPageImage } from "./pageImage";
import { refreshUsage } from "./plan";
import { splitForReading } from "./textUtils";
import { cacheText } from "./voice";

export type BookAudioStatus = "idle" | "running" | "paused" | "done" | "quota";
export type BookAudio = {
  pdfPath: string;
  bookTitle: string;
  voiceId: string;
  precise: boolean;
  total: number;
  saved: number[]; // الصفحات المحفوظة كاملة
  status: BookAudioStatus;
};

const KEY = (pdfPath: string) => `vsf:bookaudio:v1:${pdfPath}`;
const INDEX = "vsf:bookaudio:index";
const PAGES_PARALLEL = 3;
const SENTS_PARALLEL = 3;
const KEEP_TAG = "vsf-book-audio";
const t = (k: string, p: Record<string, string | number> = {}) =>
  (dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(p[x] ?? ""));

const states = new Map<string, BookAudio>();
const subs = new Map<string, Set<(s: BookAudio | null) => void>>();
const tokens = new Map<string, number>();

async function load(pdfPath: string): Promise<BookAudio | null> {
  if (states.has(pdfPath)) return states.get(pdfPath)!;
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY(pdfPath))) || "null") as BookAudio | null;
    if (v) states.set(pdfPath, v);
    return v;
  } catch {
    return null;
  }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(s: BookAudio, now = false) {
  const write = () => AsyncStorage.setItem(KEY(s.pdfPath), JSON.stringify(s)).catch(() => {});
  if (now) return void write();
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void write();
  }, 1500);
}
function emit(s: BookAudio) {
  states.set(s.pdfPath, s);
  subs.get(s.pdfPath)?.forEach((f) => f(s));
}

export async function getBookAudio(pdfPath: string): Promise<BookAudio | null> {
  return load(pdfPath);
}

export function watchBookAudio(pdfPath: string, fn: (s: BookAudio | null) => void): () => void {
  if (!subs.has(pdfPath)) subs.set(pdfPath, new Set());
  subs.get(pdfPath)!.add(fn);
  void load(pdfPath).then(fn);
  return () => subs.get(pdfPath)?.delete(fn);
}

async function notifyDone(s: BookAudio, quota: boolean) {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: quota ? t("bookAudio.notify.quota") : t("bookAudio.notify.done"),
        body: `${s.bookTitle} · ${t("bookAudio.progress", { done: s.saved.length, total: s.total })}`,
        sound: "default",
      },
      trigger: null,
    });
  } catch {}
}

function anyRunning(): boolean {
  let r = false;
  states.forEach((s) => s.status === "running" && (r = true));
  return r;
}

/** يبدأ (أو يكمل) حفظ صوت الكتاب كله */
export async function startBookAudio(o: { pdfPath: string; bookTitle: string; voiceId: string; precise: boolean; total: number }): Promise<void> {
  const prev = await load(o.pdfPath);
  // صوت مختلف = ملفات مختلفة → يبدأ العدّ من جديد لهذا الصوت
  const sameVoice = prev && prev.voiceId === o.voiceId && prev.precise === o.precise;
  const s: BookAudio = { ...o, total: Math.max(o.total, prev?.total ?? 0), saved: sameVoice ? prev!.saved : [], status: "running" };
  emit(s);
  persist(s, true);
  try {
    const idx: string[] = JSON.parse((await AsyncStorage.getItem(INDEX)) || "[]");
    if (!idx.includes(o.pdfPath)) await AsyncStorage.setItem(INDEX, JSON.stringify([...idx, o.pdfPath]));
  } catch {}
  Notifications.getPermissionsAsync()
    .then((p) => (p.granted || !p.canAskAgain ? null : Notifications.requestPermissionsAsync()))
    .catch(() => {});
  void run(o.pdfPath);
}

export function pauseBookAudio(pdfPath: string): void {
  tokens.set(pdfPath, (tokens.get(pdfPath) ?? 0) + 1);
  const s = states.get(pdfPath);
  if (s && s.status === "running") {
    const next = { ...s, status: "paused" as const };
    emit(next);
    persist(next, true);
  }
  if (!anyRunning()) deactivateKeepAwake(KEEP_TAG);
}

/** عند فتح التطبيق: يكمل أي حفظ كان جاريًا قبل إغلاقه */
export async function resumeBookAudioIfRunning(): Promise<void> {
  try {
    const idx: string[] = JSON.parse((await AsyncStorage.getItem(INDEX)) || "[]");
    for (const p of idx) {
      const s = await load(p);
      if (s?.status === "running") void run(p);
    }
  } catch {}
}

async function run(pdfPath: string): Promise<void> {
  const my = (tokens.get(pdfPath) ?? 0) + 1;
  tokens.set(pdfPath, my);
  const alive = () => tokens.get(pdfPath) === my;
  activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
  const s0 = states.get(pdfPath)!;
  const savedSet = new Set(s0.saved);
  const seen = new Set<string>(); // الترويسة المتكررة تُقرأ أول مرة فقط (مثل القارئ)
  const queue: number[] = [];
  for (let p = 1; p <= s0.total; p++) if (!savedSet.has(p)) queue.push(p);
  let quota = false;
  const failed: number[] = [];

  const savePage = async (p: number): Promise<"ok" | "quota" | "fail"> => {
    const res = await extractPdfPageText(pdfPath, p).catch(() => null);
    if (!res) return "fail";
    if (!res.text.trim()) return "ok"; // صفحة بلا نص (صورة) → لا صوت لها
    const cur = states.get(pdfPath)!;
    const precise = cur.precise || !!res.ocr;
    const txt = precise ? await getPreciseText(pdfPath, res.page, res.text, !!res.ocr) : res.text;
    // الكتاب يعمل بلا إنترنت كاملًا: صورة الصفحة ومواضع كلماتها (للتظليل) تُحفظ مع صوتها
    // (النص والنص الدقيق يُحفظان على الجهاز تلقائيًا عند جلبهما)
    void getPageImage(pdfPath, res.page).catch(() => null);
    void (res.ocr ? getPageWords(pdfPath, res.page) : getPageWordsFromText(pdfPath, res.page)).catch(() => null);
    const { chunks, headerLines } = splitForReading(txt, { seenHeaders: seen, page: res.page });
    headerLines.forEach((h) => seen.add(h));
    const pageRef = { book: pdfPath, page: res.page };
    for (let i = 0; i < chunks.length; i += SENTS_PARALLEL) {
      if (!alive()) return "fail";
      const out = await Promise.all(chunks.slice(i, i + SENTS_PARALLEL).map((x) => cacheText(x, { voiceId: cur.voiceId, page: pageRef })));
      if (out.includes("quota")) return "quota";
      if (out.includes("fail")) return "fail";
    }
    return "ok";
  };

  const worker = async () => {
    while (queue.length && alive() && !quota) {
      await whenActive(); // قفل الجوال يوقف الشبكة في iOS → نكمل عند الرجوع
      const p = queue.shift()!;
      const r = await savePage(p).catch(() => "fail" as const);
      if (!alive()) return;
      if (r === "quota") {
        quota = true;
        return;
      }
      if (r === "fail") {
        failed.push(p);
        continue;
      }
      const cur = states.get(pdfPath)!;
      const next = { ...cur, saved: [...cur.saved, p].sort((a, b) => a - b) };
      emit(next);
      persist(next);
      if (next.saved.length % 10 === 0) refreshUsage();
    }
  };

  // جولة ثانية للصفحات التي تعذّرت (شبكة) قبل إعلان الانتهاء
  for (let round = 0; round < 2 && alive() && !quota; round++) {
    await Promise.all(Array.from({ length: PAGES_PARALLEL }, worker));
    if (!failed.length) break;
    queue.push(...failed.splice(0));
  }
  if (!alive()) return;
  const cur = states.get(pdfPath)!;
  const complete = cur.saved.length >= cur.total || (!quota && !queue.length && !failed.length);
  const fin: BookAudio = { ...cur, status: quota ? "quota" : complete ? "done" : "paused" };
  emit(fin);
  persist(fin, true);
  refreshUsage();
  if (!anyRunning()) deactivateKeepAwake(KEEP_TAG);
  if (quota || complete) void notifyDone(fin, quota);
}
