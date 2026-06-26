// lib/downloadManager.ts
// مدير تحميل عام للكتاب — لا يرتبط بشاشة القراءة، فيستمر التحميل حتى لو خرجتِ
// من الكتاب أو فتحتِ كتابًا آخر. ويُحفظ «التحميل الجاري» في الذاكرة الدائمة،
// فيُستأنف تلقائيًا عند فتح التطبيق (التحميل قابل للاستئناف لأن الصفحات تُخزَّن
// في قاعدة البيانات) حتى يكتمل بنفسه.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { cachedPageCount, ingestBook, stopIngest } from "./ingest";

const DL_KEY = "active-download-v1";

export type DownloadState = {
  pdfPath: string;
  title: string;
  done: number;
  total: number;
  running: boolean;
  failed: number;
};

let state: DownloadState | null = null;
let token = 0;
const listeners = new Set<(s: DownloadState | null) => void>();

export function getDownloadState(): DownloadState | null {
  return state;
}

/** يشترك في تحديثات التحميل. يستدعي fn فورًا بالحالة الحالية، ويُرجع دالة إلغاء. */
export function subscribeDownload(fn: (s: DownloadState | null) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  for (const l of listeners) l(state);
}

function run(pdfPath: string, title: string, total: number) {
  // نفس الكتاب يعمل بالفعل → لا تُكرّر
  if (state?.running && state.pdfPath === pdfPath) return;
  const myToken = ++token;
  stopIngest(); // أوقف أي تجهيز سابق لكتاب آخر
  state = { pdfPath, title, done: 0, total, running: true, failed: 0 };
  emit();

  ingestBook(pdfPath, total, (done, t) => {
    if (myToken !== token) return;
    if (state) {
      state = { ...state, done, total: t };
      emit();
    }
  })
    .then(async (res) => {
      if (myToken !== token) return;
      const cached = await cachedPageCount(pdfPath).catch(() => res.succeeded);
      const complete = !res.stopped && (res.failed === 0 || cached >= total);
      if (state) {
        state = { ...state, running: false, failed: res.failed, done: Math.max(state.done, cached) };
        emit();
      }
      if (complete) await AsyncStorage.removeItem(DL_KEY).catch(() => {});
    })
    .catch(() => {
      if (myToken !== token) return;
      if (state) {
        state = { ...state, running: false };
        emit();
      }
    });
}

/** يبدأ (أو يستأنف) تحميل كتاب كامل في الخلفية. */
export async function startDownload(pdfPath: string, title: string, total: number) {
  if (!pdfPath || total <= 0) return;
  await AsyncStorage.setItem(DL_KEY, JSON.stringify({ pdfPath, title, total })).catch(() => {});
  run(pdfPath, title, total);
}

/** يوقف التحميل الجاري ويُلغي حفظه. */
export function stopDownload() {
  token++;
  stopIngest();
  if (state) {
    state = { ...state, running: false };
    emit();
  }
  AsyncStorage.removeItem(DL_KEY).catch(() => {});
}

/** يُستدعى عند فتح التطبيق: إن كان هناك تحميل لم يكتمل، أكمله تلقائيًا. */
export async function resumePendingDownload() {
  try {
    const raw = await AsyncStorage.getItem(DL_KEY);
    if (!raw) return;
    const { pdfPath, title, total } = JSON.parse(raw) as { pdfPath: string; title: string; total: number };
    if (!pdfPath || !total) return;
    const cached = await cachedPageCount(pdfPath).catch(() => 0);
    if (cached >= total) {
      await AsyncStorage.removeItem(DL_KEY).catch(() => {});
      return;
    }
    run(pdfPath, title || "كتاب", total);
  } catch {
    // لا شيء لاستئنافه
  }
}
