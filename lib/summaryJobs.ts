// lib/summaryJobs.ts
// التلخيص الشامل كمهمة خلفية مستقلة عن الشاشة: الخروج من شاشة الملخّص والرجوع للكتاب لا يوقفه،
// والشاشة حين تُفتح من جديد تتصل بنفس المهمة. عند الاكتمال يصل إشعار (إن لم تكن الشاشة مفتوحة)
// يفتح الملخّص بالضغط عليه. والشاشة تبقى مضاءة أثناء التلخيص (قفلها يقطع الاتصال في iOS).
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { getCurrentLang } from "./i18n";
import "./notify"; // يضبط عرض الإشعار والتطبيق مفتوح (القارئ مثلًا)
import { dict } from "./i18n/strings";
import type { StudySummary } from "./studySummary";
import { getCachedSummary, getOrMakeSummary, summaryCacheKey, type SummaryProgress, type SummarySource } from "./unitSummary";
import { recordPerf } from "./perf";

export type SummaryJob = SummaryProgress & {
  key: string;
  status: "running" | "done" | "failed" | "quota";
  result: StudySummary | null;
};

type Meta = { title: string; params: Record<string, string> };

const jobs = new Map<string, SummaryJob>();
const subs = new Map<string, Set<(j: SummaryJob) => void>>();
const viewing = new Map<string, number>(); // الشاشات المفتوحة لكل مهمة
const KEEP_TAG = "vsf-summary";
const t = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;

export function summaryJobKey(pdfPath: string, src: SummarySource): string {
  const k = summaryCacheKey(src);
  return `${pdfPath}|${k.kind}|${k.id}`;
}

/** مهمة جارية (أو مكتملة في هذه الجلسة) لهذا المصدر — فلا يُسأل عن الأسلوب وهي تعمل */
export function hasSummaryJob(pdfPath: string, src: SummarySource): boolean {
  return jobs.get(summaryJobKey(pdfPath, src))?.status === "running";
}

export function getSummaryJob(key: string): SummaryJob | undefined {
  return jobs.get(key);
}

function emit(j: SummaryJob) {
  jobs.set(j.key, j);
  subs.get(j.key)?.forEach((f) => f(j));
}

/** اشتراك في تقدّم مهمة. viewer=true: الشاشة معروضة (فلا حاجة لإشعار عند الاكتمال) */
export function watchSummaryJob(key: string, fn: (j: SummaryJob) => void, viewer = true): () => void {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key)!.add(fn);
  if (viewer) viewing.set(key, (viewing.get(key) ?? 0) + 1);
  const cur = jobs.get(key);
  if (cur) fn(cur);
  return () => {
    subs.get(key)?.delete(fn);
    if (viewer) viewing.set(key, Math.max(0, (viewing.get(key) ?? 1) - 1));
  };
}

function running(): number {
  let n = 0;
  jobs.forEach((j) => j.status === "running" && n++);
  return n;
}

async function notifyDone(meta: Meta, ok: boolean) {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: ok ? t("summary.notify.doneTitle") : t("summary.notify.failTitle"),
        body: meta.title,
        sound: "default",
        data: { kind: "summary", params: meta.params },
      },
      trigger: null,
    });
  } catch {}
}

/** يبدأ مهمة التلخيص (أو يعيد المهمة الجارية نفسها) */
/** notifyWhenDone=false: مهمة يطلبها الفيديو (إشعاره هو الذي يصل لا إشعار الملخّص) */
export function startSummaryJob(pdfPath: string, src: SummarySource, meta: Meta, notifyWhenDone = true): string {
  const key = summaryJobKey(pdfPath, src);
  const cur = jobs.get(key);
  if (cur?.status === "running") return key;
  const job: SummaryJob = { key, status: "running", result: null, done: 0, total: 0, soFar: null, etaSec: null, waiting: false };
  emit(job);
  activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
  // إذن الإشعار يُطلب هنا (مرة واحدة) ليصل خبر الاكتمال بعد الرجوع للكتاب
  Notifications.getPermissionsAsync()
    .then((p) => (p.granted || !p.canAskAgain ? null : Notifications.requestPermissionsAsync()))
    .catch(() => {});
  (async () => {
    let last = job;
    const t0 = Date.now();
    try {
      const result = await getOrMakeSummary(pdfPath, src, (p) => {
        last = { ...last, ...p };
        emit(last);
      });
      // مكتمل = خُزّن الملخّص كاملًا (كل الأجزاء نجحت)؛ وإلا يبقى ما اكتمل معروضًا ومحفوظًا
      const complete = !!(await getCachedSummary(pdfPath, src));
      last = { ...last, status: complete ? "done" : "failed", result, soFar: result ?? last.soFar, etaSec: 0 };
      recordPerf("summary.total", Date.now() - t0, complete, last.total);
      emit(last);
      if (notifyWhenDone && !viewing.get(key)) void notifyDone(meta, complete);
    } catch (e) {
      last = { ...last, status: (e as Error).message === "USER_QUOTA" ? "quota" : "failed" };
      emit(last);
    } finally {
      if (!running()) deactivateKeepAwake(KEEP_TAG);
    }
  })();
  return key;
}

/**
 * ملخّصات عدة وحدات واحدة بعد الأخرى في الخلفية (تكمل بعد مغادرة الشاشة)، وإشعار واحد عند انتهاء الكل.
 * انتهاء الحصة يوقف الباقي. الشاشة تتابع كل وحدة بـ watchSummaryJob.
 */
const queues = new Set<string>();
const waitingUnits = new Map<string, Set<number>>(); // وحدات تنتظر دورها في الطابور (لعلامة الانتظار)
export function isSummaryQueueRunning(pdfPath: string): boolean {
  return queues.has(pdfPath);
}
export function isUnitQueued(pdfPath: string, unit: number): boolean {
  return !!waitingUnits.get(pdfPath)?.has(unit);
}
export function queueUnitSummaries(pdfPath: string, units: number[], metaFor: (unit: number) => Meta, last: Meta): void {
  if (!units.length || queues.has(pdfPath)) return;
  queues.add(pdfPath);
  waitingUnits.set(pdfPath, new Set(units));
  let allOk = true;
  const step = (k: number) => {
    waitingUnits.get(pdfPath)?.delete(units[k - 1]);
    if (k >= units.length) {
      queues.delete(pdfPath);
      waitingUnits.delete(pdfPath);
      void notifyDone(last, allOk);
      return;
    }
    const src: SummarySource = { kind: "unit", unit: units[k] };
    const key = startSummaryJob(pdfPath, src, metaFor(units[k]), false);
    let un: (() => void) | undefined;
    let settled = false;
    un = watchSummaryJob(
      key,
      (j) => {
        if (j.status === "running" || settled) return;
        settled = true;
        un?.();
        if (j.status !== "done") allOk = false;
        if (j.status === "quota") {
          queues.delete(pdfPath);
          waitingUnits.delete(pdfPath);
          return;
        }
        step(k + 1);
      },
      false
    );
    if (settled) un(); // انتهت فورًا (جاهزة) قبل أن يُحفظ إلغاء الاشتراك
  };
  step(0);
}

// الضغط على إشعار «الملخّص جاهز» يفتح الملخّص (من المخزن فورًا)
Notifications.addNotificationResponseReceivedListener((r) => {
  const d = r.notification.request.content.data as { kind?: string; params?: Record<string, string> } | undefined;
  if (d?.kind === "summary" && d.params) {
    try {
      router.push({ pathname: "/unit-summary", params: d.params });
    } catch {}
  }
});
