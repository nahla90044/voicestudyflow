// lib/videoJobs.ts
// تجهيز «ملخّص الفيديو» كمهمة خلفية مستقلة عن الشاشة (نفس دروس الملخّص):
// الخروج من الشاشة والرجوع للكتاب لا يوقفها، والعودة تتصل بها، والشاشة تبقى مضاءة أثناءها،
// وإشعار عند الاكتمال يفتح الفيديو. المرحلتان: الملخّص الشامل (إن لم يكن جاهزًا) ثم السيناريو.
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { getCurrentLang } from "./i18n";
import { dict } from "./i18n/strings";
import "./notify";
import { startSummaryJob, watchSummaryJob } from "./summaryJobs";
import type { StudySummary } from "./studySummary";
import { getCachedSummary, summaryCacheKey, type SummarySource } from "./unitSummary";
import { getOrMakeVideo, type VideoScript } from "./videoScript";
import { recordPerf } from "./perf";

export type VideoJob = {
  key: string;
  status: "running" | "done" | "failed" | "quota";
  stage: "summary" | "script";
  done: number;
  total: number;
  etaSec: number | null;
  waiting: boolean;
  script: VideoScript | null;
};

type Meta = { title: string; params: Record<string, string> };

const KEEP_TAG = "vsf-video";
const t = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;
const jobs = new Map<string, VideoJob>();
const subs = new Map<string, Set<(j: VideoJob) => void>>();
const viewing = new Map<string, number>();

export function videoJobKey(pdfPath: string, src: SummarySource): string {
  const k = summaryCacheKey(src);
  return `video|${pdfPath}|${k.kind}|${k.id}`;
}

/** فيديو يُجهَّز الآن (لا يُسأل عن تكلفته مرة ثانية عند الرجوع لشاشته) */
export function hasVideoJob(pdfPath: string, src: SummarySource): boolean {
  return jobs.get(videoJobKey(pdfPath, src))?.status === "running";
}

function emit(j: VideoJob) {
  jobs.set(j.key, j);
  subs.get(j.key)?.forEach((f) => f(j));
}

export function watchVideoJob(key: string, fn: (j: VideoJob) => void): () => void {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key)!.add(fn);
  viewing.set(key, (viewing.get(key) ?? 0) + 1);
  const cur = jobs.get(key);
  if (cur) fn(cur);
  return () => {
    subs.get(key)?.delete(fn);
    viewing.set(key, Math.max(0, (viewing.get(key) ?? 1) - 1));
  };
}

/** الملخّص الشامل: من المخزن، أو عبر مهمة الملخّص نفسها (لا يُولَّد مرتين إن كان يُكتب في شاشته) */
function summaryFor(pdfPath: string, src: SummarySource, meta: Meta, onProg: (j: { done: number; total: number; etaSec: number | null; waiting: boolean }) => void): Promise<StudySummary | null> {
  return new Promise((resolve, reject) => {
    const key = startSummaryJob(pdfPath, src, meta, false);
    let un: (() => void) | undefined;
    un = watchSummaryJob(
      key,
      (j) => {
        if (j.status === "running") return onProg(j);
        un?.();
        if (j.status === "quota") reject(new Error("USER_QUOTA"));
        else resolve(j.status === "done" ? j.result : null);
      },
      false
    );
  });
}

async function notify(meta: Meta, ok: boolean) {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: ok ? t("video.notify.done") : t("video.notify.fail"),
        body: meta.title,
        sound: "default",
        data: { kind: "video", params: meta.params },
      },
      trigger: null,
    });
  } catch {}
}

export function startVideoJob(pdfPath: string, src: SummarySource, unitTitle: string, meta: Meta): string {
  const key = videoJobKey(pdfPath, src);
  if (jobs.get(key)?.status === "running") return key;
  let last: VideoJob = { key, status: "running", stage: "summary", done: 0, total: 0, etaSec: null, waiting: false, script: null };
  emit(last);
  activateKeepAwakeAsync(KEEP_TAG).catch(() => {});
  Notifications.getPermissionsAsync()
    .then((p) => (p.granted || !p.canAskAgain ? null : Notifications.requestPermissionsAsync()))
    .catch(() => {});
  (async () => {
    const t0 = Date.now();
    try {
      const summary = (await getCachedSummary(pdfPath, src)) ?? (await summaryFor(pdfPath, src, meta, (p) =>
          // أرقام التقدّم فقط من مهمة الملخّص — لا هويتها (key): نسخها كان يحوّل كل تحديثات الفيديو التالية
          // لعنوان الملخّص فلا تسمعها شاشة الفيديو أبدًا (تبقى متوقفة حتى يُعاد فتحها)
          emit((last = { ...last, done: p.done, total: p.total, etaSec: p.etaSec, waiting: p.waiting, stage: "summary" }))
        ));
      if (!summary) {
        emit((last = { ...last, status: "failed" }));
        if (!viewing.get(key)) void notify(meta, false);
        return;
      }
      emit((last = { ...last, stage: "script", done: 0, total: 0, etaSec: null }));
      const { script, complete } = await getOrMakeVideo(pdfPath, src, summary, unitTitle, (p) =>
        emit((last = { ...last, done: p.done, total: p.total, etaSec: p.etaSec, waiting: p.waiting, script: p.soFar ?? last.script }))
      );
      emit((last = { ...last, status: complete ? "done" : "failed", script: script ?? last.script, etaSec: 0 }));
      recordPerf("video.total", Date.now() - t0, complete, last.total);
      if (!viewing.get(key)) void notify(meta, complete);
    } catch (e) {
      emit((last = { ...last, status: (e as Error).message === "USER_QUOTA" ? "quota" : "failed" }));
    } finally {
      let running = false;
      jobs.forEach((j) => j.status === "running" && (running = true));
      if (!running) deactivateKeepAwake(KEEP_TAG);
    }
  })();
  return key;
}

// الضغط على إشعار «الفيديو جاهز» يفتحه
Notifications.addNotificationResponseReceivedListener((r) => {
  const d = r.notification.request.content.data as { kind?: string; params?: Record<string, string> } | undefined;
  if (d?.kind === "video" && d.params) {
    try {
      router.push({ pathname: "/unit-video", params: d.params });
    } catch {}
  }
});
