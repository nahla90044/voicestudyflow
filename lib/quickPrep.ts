// lib/quickPrep.ts
// «الاستعداد السريع ⏰» (قرار نهلة ٢٥ أكتوبر) — جلسة الخطة وتخزينها وتشغيلها، والمنطق الخالص في quickPrepCore:
// - الجلسة محفوظة على الجهاز لكل كتاب (تستمر بعد إغلاق التطبيق وفتحه، ويمكن إنهاؤها)، وكل تعديل يمر بـ updatePrep
//   بكتابات متسلسلة فلا يمحو تعديلٌ تعديلًا آخر.
// - عند البدء يُعرض عدد الطلبات، ثم تُجهَّز الملخصات الناقصة في الخلفية بالترتيب حتى تكون جاهزة حين تصل خطوتها
//   (انتهاء الحصة يوقف التجهيز، والوحدة التي تعذّر ملخصها تُقرأ صفحاتها بدله — ويُعاد التجهيز تلقائيًا بعد
//   دقائق، فتعثّر الشبكة أو تجدد الحصة لا يبقي الخطة على قراءة الصفحات حتى نهايتها). انتهاء وقت الخطة يوقفه.
// - كل خطوة تفتح الشاشة الموجودة المناسبة، وإشعار عند انتهاء وقتها، وإعادة توزيع الوقت الباقي عند التأخر أو التقدم.
// - كل طلب بمهلة (لا انتظار بلا نهاية)، وكل قراءة وكتابة محمية من الأعطال.
import { peekStudyInfo } from "./studyKind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";

import { confirmCost } from "./costConfirm";
import { getCards, type Card } from "./flashcards";
import { getCachedUnitRanges, getUnitRanges, type UnitRange } from "./glossary";
import { getCurrentLang } from "./i18n";
import { dict } from "./i18n/strings";
import "./notify"; // يضبط عرض الإشعار والتطبيق مفتوح
import { getAnswered } from "./readiness";
import { computeReadiness, type QuestionState } from "./readinessCore";
import { getRawProgress, type RawProgress } from "./studyTrack";
import { startSummaryJob, watchSummaryJob } from "./summaryJobs";
import { supabase } from "./supabase";
import { getSyllabus, type QuizQ } from "./syllabus";
import { getUnitContent } from "./unitContent";
import { getCachedSummary, summaryRequestCost, type SummarySource } from "./unitSummary";
import {
  autoEndAt,
  buildPlan,
  cardsChanged,
  cardSig,
  countDistinct,
  estimateSummaryRequests,
  isPlanFinished,
  isStepComplete,
  planExpired,
  quizProgress,
  quotaWaiting,
  replan,
  requeue,
  unitsToRetry,
  withLiveMastery,
  wrongFor,
  type PrepareState,
  type PrepPlan,
  type PrepStep,
  type PrepUnit,
  type ReplanResult,
  type StepKind,
  type StepSignal,
  type SumLevel,
} from "./quickPrepCore";

type T = (key: string, vars?: Record<string, string | number>) => string;

export type PrepNotice = { kind: "replanned" | "restored" | "noMistakes" | "noExam"; a?: number; b?: number; at: number };
export type PrepSession = {
  v: 1;
  bookId: string;
  pdfPath: string;
  bookTitle: string;
  createdAt: number;
  deadlineAt: number;
  unitCount: number;
  plan: PrepPlan;
  units: PrepUnit[];
  // pending: الوحدات الناقصة بترتيب الخطة، failed: تعذّر ملخصها (تُقرأ صفحاتها وتُعاد محاولتها بعد دقائق)،
  // failedAt/retries: آخر تعذّر وجولات الإعادة لكل وحدة، quota/quotaAt: نفاد الحصة وآخر تجربة بعده
  prepare: PrepareState & { approved: boolean };
  notifId?: string;
  notice?: PrepNotice;
  endedAt?: number;
  overtime?: boolean;
};

const PREFIX = "vsf:quickprep:v1:";
const keyOf = (bookId: string) => `${PREFIX}${bookId}`;
const STALE_MS = 24 * 3600_000; // جلسة مضى على موعدها يوم كامل لا تُعرض
const MIN_MS = 60_000;
const QUIZ_KINDS: StepKind[] = ["quiz5", "quiz", "exam", "mistakes"];
const SUM_KINDS: StepKind[] = ["final", "brief", "listen"];

// نصوص خارج React (الإشعار والاستئناف)
const tr: T = (k, vars) => {
  let s = dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(String(b));
  return s;
};

/** وعد بمهلة: انتهاء الوقت أو الخطأ → القيمة البديلة (لا انتظار بلا نهاية) */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

// ===== التخزين: نسخة في الذاكرة هي المرجع، وكتابات متسلسلة لكل كتاب =====
const mem = new Map<string, PrepSession | null>();
const chains = new Map<string, Promise<unknown>>();
const subs = new Map<string, Set<(s: PrepSession | null) => void>>();

const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x)) as X;
const isStale = (s: PrepSession, now = Date.now()) => now - s.deadlineAt > STALE_MS;
const expired = (s: PrepSession, now = Date.now()) => planExpired(s, now);

function cancelNotif(id?: string) {
  if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** جلسة الكتاب (أو null). القديمة (مضى على موعدها يوم) تُحذف */
export async function getPrep(bookId: string): Promise<PrepSession | null> {
  if (!bookId) return null;
  let s: PrepSession | null;
  if (mem.has(bookId)) s = mem.get(bookId) ?? null;
  else {
    try {
      const raw = await AsyncStorage.getItem(keyOf(bookId));
      const v = raw ? (JSON.parse(raw) as PrepSession) : null;
      s = v && v.v === 1 && v.plan?.steps ? v : null;
    } catch {
      s = null;
    }
    // كتابة جرت أثناء القراءة لها الأولوية
    if (mem.has(bookId)) s = mem.get(bookId) ?? null;
    else mem.set(bookId, s);
  }
  if (s && isStale(s)) {
    cancelNotif(s.notifId);
    mem.set(bookId, null);
    AsyncStorage.removeItem(keyOf(bookId)).catch(() => {});
    subs.get(bookId)?.forEach((f) => f(null));
    return null;
  }
  return s;
}

/** كل تعديل على الجلسة يمر هنا بالترتيب. إرجاع null يحذف الجلسة */
export function updatePrep(bookId: string, fn: (s: PrepSession | null) => PrepSession | null): Promise<PrepSession | null> {
  const prev = chains.get(bookId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const cur = await getPrep(bookId);
      let nxt: PrepSession | null;
      try {
        nxt = fn(cur ? clone(cur) : null);
      } catch {
        return cur;
      }
      if (JSON.stringify(nxt) === JSON.stringify(cur)) return cur; // لا تغيير → لا كتابة
      mem.set(bookId, nxt);
      subs.get(bookId)?.forEach((f) => f(nxt));
      try {
        if (nxt) await AsyncStorage.setItem(keyOf(bookId), JSON.stringify(nxt));
        else await AsyncStorage.removeItem(keyOf(bookId));
      } catch {}
      return nxt;
    });
  chains.set(bookId, next);
  return next;
}

/** متابعة حية لتغيّر الجلسة (للشاشة) */
export function watchPrep(bookId: string, fn: (s: PrepSession | null) => void): () => void {
  if (!subs.has(bookId)) subs.set(bookId, new Set());
  subs.get(bookId)!.add(fn);
  return () => {
    subs.get(bookId)?.delete(fn);
  };
}

/** خطة جارية لم تنتهِ ولم يحلّ موعدها (لشارة «جارية» في أدوات الكتاب) — الموعد يُفحص هنا لأن الإنهاء بالوقت
 * لا يُسجَّل إلا بمزامنة (شاشة الخطة أو فتح التطبيق) */
export async function hasActivePrep(bookId: string): Promise<boolean> {
  const s = await getPrep(bookId).catch(() => null);
  return !!s && !s.endedAt && !expired(s);
}

// ===== مدخلات الخطة: وحدات المنهج بصفحاتها وإتقانها وبطاقاتها =====
export type PrepInputs = { kind: "ok"; units: PrepUnit[]; unitCount: number; answered: number[] } | { kind: "nosyl" } | { kind: "error" };

function unitCardsOf(cards: Card[], bookId: string, u: PrepUnit | undefined): Card[] {
  if (!u || u.from === null || u.to === null) return [];
  return cards.filter((c) => c.bookId === bookId && !c.archived && !!c.page && c.page >= u.from! && c.page <= u.to!);
}

async function bookPageCount(bookId: string): Promise<number> {
  const { data } = await supabase.from("books").select("page_count").eq("id", bookId).maybeSingle();
  return Number(data?.page_count) || 0;
}

/** وحدات الكتاب للخطة. answered = عدد الأسئلة المُجابة لكل وحدة (٠ = لم تُختبر بعد) */
export async function loadPrepInputs({ pdfPath, bookId, pageCount }: { pdfPath: string; bookId: string; pageCount?: number }): Promise<PrepInputs> {
  try {
    // انتهاء المهلة = خطأ (إعادة المحاولة)، وبلا وحدات = يلزم منهج
    type SylRes = { ok: boolean; r: Awaited<ReturnType<typeof getSyllabus>> };
    const syl = await within<SylRes>(
      getSyllabus(pdfPath).then((r) => ({ ok: true, r })),
      20_000,
      { ok: false, r: null }
    );
    if (!syl.ok) return { kind: "error" };
    const list = syl.r?.data.units ?? [];
    if (!list.length) {
      // getSyllabus يعيد null عند تعذّر الاتصال أيضًا (لا يميّز الخطأ): يُتأكَّد أن المنهج غائب فعلًا قبل «يلزم منهج»،
      // وإلا تظهر رسالة الخطأ وإعادة المحاولة
      const chk = await within<{ ok: boolean; units: number } | null>(
        Promise.resolve(supabase.from("book_syllabus").select("data").eq("pdf_path", pdfPath).maybeSingle()).then(({ data, error }) => {
          const us = (data?.data as { units?: unknown } | null | undefined)?.units;
          return { ok: !error, units: Array.isArray(us) ? us.length : 0 };
        }),
        8_000,
        null
      );
      return !chk || !chk.ok || chk.units > 0 ? { kind: "error" } : { kind: "nosyl" };
    }
    const titles = list.map((u) => u.title);
    let ranges: UnitRange[] | null = await getCachedUnitRanges(pdfPath, titles.length).catch(() => null);
    if (!ranges) {
      const pc = pageCount && pageCount > 0 ? pageCount : await within(bookPageCount(bookId), 8_000, 0);
      ranges = await within(getUnitRanges(pdfPath, titles, pc).then((r): UnitRange[] | null => r), 20_000, null);
    }
    const [answered, cards] = await Promise.all([getAnswered(pdfPath).catch(() => [] as QuestionState[]), getCards().catch(() => [] as Card[])]);
    const r = computeReadiness({ questions: answered, unitCount: titles.length, readFraction: 0 });
    const units: PrepUnit[] = titles.map((title, i) => {
      const rg = ranges?.[i];
      const from = rg && rg.from > 0 ? rg.from : null;
      const to = rg && rg.to >= rg.from ? rg.to : null;
      const u: PrepUnit = {
        unit: i,
        title,
        pages: from !== null && to !== null ? to - from + 1 : null,
        from,
        to,
        mastery: r.perUnit[i]?.mastery ?? 0,
        hasCards: false,
      };
      u.hasCards = unitCardsOf(cards, bookId, u).length > 0;
      return u;
    });
    return { kind: "ok", units, unitCount: titles.length, answered: titles.map((_, i) => r.perUnit[i]?.answered ?? 0) };
  } catch {
    return { kind: "error" };
  }
}

const unitOf = (s: PrepSession, u: number | null) => (u === null ? undefined : s.units.find((x) => x.unit === u));
const coreOf = (s: PrepSession, u: number) => s.plan.steps.find((x) => x.unit === u && x.prio === 1);
const srcOf = (u: number, level: SumLevel): SummarySource => ({ kind: "unit", unit: u, level });
const hasNewQuiz = (q: QuizQ[] | null | undefined): q is QuizQ[] => !!q?.length && q.some((x) => x.type);
const isOpen = (st?: PrepStep) => !!st && (st.status === "todo" || st.status === "doing");

/** أسئلة الاختبارات المحفوظة بالصيغة الجديدة لهذه الوحدات بلا تكرار (٠ = لا اختبار محفوظ) — أقصى ما تعرضه شاشة الاختبار */
async function savedQuizCount(pdfPath: string, units: number[]): Promise<number> {
  const lists = await Promise.all(
    units.map((u) =>
      getUnitContent<QuizQ[]>(pdfPath, u, "quiz")
        .then((q) => (hasNewQuiz(q) ? q : []))
        .catch(() => [] as QuizQ[])
    )
  );
  return countDistinct(...lists);
}

function noticeOf(rp: ReplanResult, now: number): PrepNotice | null {
  if (rp.shrunk || rp.dropped) return { kind: "replanned", a: rp.shrunk, b: rp.dropped, at: now };
  if (rp.restored) return { kind: "restored", a: rp.restored, at: now };
  return null;
}

/**
 * يبني الخطة ويعرض عدد الطلبات (الملخصات الناقصة + اختبارات الوحدات غير المولّدة) ثم يحفظ الجلسة
 * ويبدأ تجهيز الملخصات في الخلفية. الرفض يعيد null.
 */
export async function startPrep({
  bookId,
  pdfPath,
  bookTitle,
  totalMin,
  units,
  unitCount,
  t,
}: {
  bookId: string;
  pdfPath: string;
  bookTitle: string;
  totalMin: number;
  units: PrepUnit[];
  unitCount: number;
  t: T;
}): Promise<PrepSession | null> {
  const t0 = Date.now();
  const plan = buildPlan({ totalMin, units });
  const ordered = [...units].sort((a, b) => a.unit - b.unit);
  // الملخصات الناقصة بمستوى كل وحدة
  const have = await Promise.all(ordered.map((u) => within(getCachedSummary(pdfPath, srcOf(u.unit, plan.levels[u.unit] ?? "brief")), 8_000, null)));
  const missing = ordered.filter((_, i) => !have[i]);
  let estimated = false;
  const costs = await Promise.all(
    missing.map((u) => within(summaryRequestCost(pdfPath, srcOf(u.unit, plan.levels[u.unit] ?? "brief")).then((c) => c.pending), 20_000, -1))
  );
  let sum = 0;
  costs.forEach((c, i) => {
    if (c < 0) {
      estimated = true;
      sum += estimateSummaryRequests(missing[i].pages);
    } else sum += c;
  });
  // اختبار وحدة لم يُولَّد بعد بالصيغة الجديدة = طلب عند وصول خطوته
  const quizUnits = new Set(plan.steps.filter((s) => (s.kind === "quiz" || s.kind === "quiz5") && s.status !== "dropped" && s.unit !== null).map((s) => s.unit as number));
  for (const u of quizUnits) {
    const q = await getUnitContent<QuizQ[]>(pdfPath, u, "quiz").catch(() => null);
    if (!hasNewQuiz(q)) {
      sum += 1;
      estimated = true;
    }
  }
  if (!(await confirmCost(sum, "quickprep", t, estimated, `quickprep:${bookId}`))) return null;

  const deadlineAt = t0 + plan.totalMin * MIN_MS;
  // وقت نافذة التأكيد يُحسب من الخطة بصمت (بلا تنبيه «أُعيد التوزيع» لحظة البدء)
  const rp = replan({ steps: plan.steps, units: ordered, now: Date.now(), deadlineAt });
  const session: PrepSession = {
    v: 1,
    bookId,
    pdfPath,
    bookTitle,
    createdAt: t0,
    deadlineAt,
    unitCount,
    plan: { ...plan, steps: rp.steps },
    units: ordered,
    prepare: { approved: true, pending: missing.map((u) => u.unit), failed: [], quota: false },
  };
  let oldNotif: string | undefined;
  const saved = await updatePrep(bookId, (old) => {
    oldNotif = old?.notifId;
    return session;
  });
  cancelNotif(oldNotif);
  void runPrepare(bookId);
  return saved;
}

// ===== تجهيز الملخصات الناقصة في الخلفية (واحدة بعد الأخرى بترتيب الخطة) =====
const running = new Set<string>();
const GUARD_MS = 15 * MIN_MS;

/** ملخص وحدة واحدة كمهمة خلفية، وانتظار نتيجتها بحارس ١٥ دقيقة (يُعدّ فشلًا) */
function runSummary(s: PrepSession, u: number, level: SumLevel): Promise<"done" | "quota" | "failed"> {
  const title = unitOf(s, u)?.title ?? "";
  const key = startSummaryJob(
    s.pdfPath,
    srcOf(u, level),
    { title: title || s.bookTitle, params: { pdf_path: s.pdfPath, unit: String(u), title, book_title: s.bookTitle, level } },
    false
  );
  return new Promise((resolve) => {
    let settled = false;
    let un: (() => void) | undefined;
    const finish = (r: "done" | "quota" | "failed") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      un?.();
      resolve(r);
    };
    const timer = setTimeout(() => finish("failed"), GUARD_MS);
    un = watchSummaryJob(
      key,
      (j) => {
        if (j.status === "running") return;
        finish(j.status === "done" ? "done" : j.status === "quota" ? "quota" : "failed");
      },
      false
    );
    if (settled) un();
  });
}

/**
 * يجهّز الملخصات الناقصة بالترتيب حتى تنتهي أو يحلّ موعد الخطة. المتعذّرة تبقى في failed (فتُقرأ صفحاتها) وتُعاد
 * للطابور بعد ٣ دقائق، ونفاد الحصة يوقف التجهيز مع تجربة كل ١٠ دقائق — ويُمسح فور نجاح أي ملخص للخطة.
 * يُستدعى عند البدء، وعند الرجوع للخطة وعودة التطبيق للواجهة وكل دقيقة والشاشة ظاهرة، وبعد فتح التطبيق.
 */
export async function runPrepare(bookId: string): Promise<void> {
  if (!bookId || running.has(bookId)) return;
  running.add(bookId);
  try {
    for (let guard = 0; guard < 500; guard++) {
      const s = await getPrep(bookId);
      if (!s || s.endedAt || expired(s) || !s.prepare.approved) return;
      const now = Date.now();
      // وحدة أُنجزت خطوتها الأساسية أو تُخطّيت لا حاجة لتجهيز ملخصها الآن
      const live = s.prepare.pending.filter((u) => isOpen(coreOf(s, u)));
      if (live.length !== s.prepare.pending.length)
        await updatePrep(bookId, (x) => (x ? { ...x, prepare: { ...x.prepare, pending: x.prepare.pending.filter((u) => live.includes(u)) } } : x));
      const quotaWait = quotaWaiting(s.prepare, now);
      // المتعذّرة تعود للطابور (بترتيب الخطة) وتبقى في failed، فتُقرأ صفحاتها حتى ينجح ملخصها
      const again = unitsToRetry(s.prepare, (u) => isOpen(coreOf(s, u)), now);
      if (again.length) {
        await updatePrep(bookId, (x) => (x ? { ...x, prepare: requeue(x.prepare, again, now) } : x));
        continue;
      }
      const u = live[0];
      if (u === undefined) return;
      const level = s.plan.levels[u] ?? "brief";
      // ملخص جاهز = الطلبات متاحة، فيُمسح علم الحصة معه
      const drop = (failed: boolean) =>
        updatePrep(bookId, (x) =>
          x
            ? {
                ...x,
                prepare: {
                  ...x.prepare,
                  pending: x.prepare.pending.filter((y) => y !== u),
                  ...(failed
                    ? { failed: x.prepare.failed.includes(u) ? x.prepare.failed : [...x.prepare.failed, u], failedAt: Date.now() }
                    : { failed: x.prepare.failed.filter((y) => y !== u), quota: false }),
                },
              }
            : x
        );
      if (await within(getCachedSummary(s.pdfPath, srcOf(u, level)), 8_000, null)) {
        await drop(false);
        continue;
      }
      if (quotaWait) return;
      // تجربة بعد نفاد الحصة: وقتها يُسجَّل أولًا، فتعذّرها لأي سبب ينتظر ١٠ دقائق أخرى (والصفحات تُقرأ حتى تنجح)
      if (s.prepare.quota) await updatePrep(bookId, (x) => (x ? { ...x, prepare: { ...x.prepare, quotaAt: now } } : x));
      let r = await runSummary(s, u, level);
      if (r === "failed") r = await runSummary(s, u, level); // محاولة ثانية واحدة (الأجزاء الناجحة محفوظة)
      if (r === "quota") {
        await updatePrep(bookId, (x) => (x ? { ...x, prepare: { ...x.prepare, quota: true, quotaAt: Date.now() } } : x));
        return;
      }
      await drop(r === "failed");
    }
  } catch {
    // لا يُعطّل الخطة: الخطوة تفتح الملخص (يكمله) أو صفحات الوحدة
  } finally {
    running.delete(bookId);
  }
}

/**
 * بعد فتح التطبيق: الجلسة التي حلّ موعدها والتطبيق مغلق تُنهى عند موعدها (تصح الشارة والتقرير ولا يُجهَّز لها شيء)،
 * وتجهيز الملخصات لكل جلسة لم تكتمل يكمل من حيث توقف
 */
export async function resumeQuickPreps(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    for (const k of keys) {
      const id = k.slice(PREFIX.length);
      const s = await getPrep(id);
      if (!s || s.endedAt) continue;
      if (expired(s)) {
        let notif: string | undefined;
        await updatePrep(id, (x) => {
          if (!x || x.endedAt || !expired(x)) return x;
          notif = x.notifId;
          return { ...x, endedAt: x.deadlineAt, notifId: undefined }; // عند الموعد نفسه لا وقت فتح التطبيق
        });
        cancelNotif(notif);
        continue;
      }
      if (s.prepare.approved && (s.prepare.pending.length || s.prepare.failed.length)) void runPrepare(id);
    }
  } catch {}
}

// ===== الخطوات: اسمها، وشاشتها، وفتحها وإنهاؤها =====

/** اسم الخطوة للعرض (والإشعار) */
export function stepLabel(step: PrepStep, t: T): string {
  if (step.kind === "quiz" || step.kind === "exam") return t(`qprep.step.${step.kind}`, { n: step.count ?? 0 });
  return t(`qprep.step.${step.kind}`);
}

/** تُقرأ صفحات الوحدة بدل ملخصها: نفدت الحصة أو تعذّر تجهيزه، وصفحاتها معروفة */
export function readsPages(s: PrepSession, step: PrepStep): boolean {
  if (!SUM_KINDS.includes(step.kind) || step.unit === null) return false;
  return (s.prepare.quota || s.prepare.failed.includes(step.unit)) && unitOf(s, step.unit)?.from != null;
}

/** الشاشة الموجودة التي تفتحها الخطوة (كلها push فتعود للخطة) */
export function routeForStep(s: PrepSession, step: PrepStep, _t?: T, read = false): Href {
  const u = step.unit;
  const pu = unitOf(s, u);
  const title = pu?.title ?? "";
  const units = s.units.map((x) => x.unit).join(",");
  const count = String(step.count ?? "");
  if (read && pu?.from != null)
    return { pathname: "/reader/[id]", params: { id: s.bookId, title: s.bookTitle, pdf_path: s.pdfPath, page: String(pu.from) } };
  switch (step.kind) {
    case "final":
    case "brief":
      return { pathname: "/unit-summary", params: { pdf_path: s.pdfPath, unit: String(u ?? 0), title, book_title: s.bookTitle, level: step.kind } };
    case "listen":
      return {
        pathname: "/unit-summary",
        params: { pdf_path: s.pdfPath, unit: String(u ?? 0), title, book_title: s.bookTitle, level: s.plan.levels[u ?? 0] ?? "brief", autoplay: "1" },
      };
    case "quiz5":
    case "quiz":
      return { pathname: "/unit-quiz", params: { pdf_path: s.pdfPath, unit: String(u ?? 0), title, book_title: s.bookTitle, count } };
    case "cards":
      return { pathname: "/unit-cards", params: { book_id: s.bookId, pdf_path: s.pdfPath, unit: String(u ?? 0), book_title: s.bookTitle } };
    case "mindmap":
      return { pathname: "/unit-mindmap", params: { pdf_path: s.pdfPath, unit: String(u ?? 0), title, book_title: s.bookTitle } };
    case "mistakes":
      return { pathname: "/unit-quiz", params: { pdf_path: s.pdfPath, title: s.bookTitle, book_title: s.bookTitle, mode: "mistakes", units, count } };
    case "exam":
    default:
      // كتب الشهادات: الاختبار الشامل في الخطة اختبار تجريبي بوقت الخطوة نفسه (٢٧ أكتوبر)
      if (peekStudyInfo(s.pdfPath)?.kind === "cert")
        return { pathname: "/unit-quiz", params: { pdf_path: s.pdfPath, title: s.bookTitle, book_title: s.bookTitle, book_id: s.bookId, mode: "mock", units: "all", count, minutes: String(step.min || 0) } };
      return { pathname: "/unit-quiz", params: { pdf_path: s.pdfPath, title: s.bookTitle, book_title: s.bookTitle, mode: "mix", units, count } };
  }
}

/** إشعار نهاية وقت الخطوة (يحلّ محل السابق). kind:"once" إلزامي حتى لا تمحوه التذكيرات اليومية */
async function scheduleStepNotif(s: PrepSession, step: PrepStep): Promise<string | undefined> {
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return undefined;
    const at = (step.startedAt ?? Date.now()) + step.min * MIN_MS;
    if (at - Date.now() < 30_000) return undefined;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: tr("qprep.notif.title"),
        body: tr("qprep.notif.body", { step: stepLabel(step, tr), unit: unitOf(s, step.unit)?.title || s.bookTitle }),
        sound: "default",
        data: { kind: "once", sub: "quickprep", book_id: s.bookId, pdf_path: s.pdfPath, book_title: s.bookTitle },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: "default" },
    });
  } catch {
    return undefined;
  }
}

/** يفتح الخطوة: أول مرة تُضبط بياناتها (العدد/البصمة) وتبدأ مؤقتها وإشعارها، ثم شاشتها */
export async function openStep(bookId: string, stepId: string, t: T): Promise<void> {
  const s0 = await getPrep(bookId);
  const step0 = s0?.plan.steps.find((x) => x.id === stepId);
  if (!s0 || !step0) return;
  const u = step0.unit;
  const us = s0.units.map((x) => x.unit);
  const otherDoing = s0.plan.steps.some((x) => x.status === "doing" && x.id !== stepId);

  if (step0.status === "todo" && !otherDoing) {
    const patch: Partial<PrepStep> = {};
    let autoSkip: "noMistakes" | "noExam" | null = null;
    // العدد: من دقائق الخطوة (بعد أي تقليص)، ولا يزيد على المتاح فعلًا بلا تكرار (فاسم الخطوة يطابق ما يُعرض)
    if (step0.kind === "mistakes") {
      const n = wrongFor(await getAnswered(s0.pdfPath).catch(() => [] as QuestionState[]), us).length;
      if (!n) autoSkip = "noMistakes";
      else patch.count = Math.min(step0.count ?? 15, n);
    } else if (step0.kind === "exam") {
      const avail = await savedQuizCount(s0.pdfPath, us);
      if (!avail) autoSkip = "noExam";
      else patch.count = Math.min(step0.count ?? avail, avail);
    } else if ((step0.kind === "quiz" || step0.kind === "quiz5") && u !== null) {
      const avail = await savedQuizCount(s0.pdfPath, [u]);
      if (avail) patch.count = Math.min(step0.count ?? avail, avail);
    } else if (step0.kind === "listen" && u !== null) {
      // انتهاء المهلة يُسقط حتى التقدم المحلي: لقطة لا تُتجاوز بدل ٠ (لا إكمال كاذب بعدّ المقاطع)، ويبقى الإكمال بوقت انتهاء الاستماع
      const raw = await within(getRawProgress(s0.pdfPath).then((r): RawProgress | null => r), 8_000, null);
      patch.snap = raw ? raw[String(u)]?.s?.length ?? 0 : Number.MAX_SAFE_INTEGER;
    } else if (step0.kind === "cards") {
      patch.cardSnap = cardSig(unitCardsOf(await getCards().catch(() => [] as Card[]), s0.bookId, unitOf(s0, u)));
    }
    if (autoSkip) {
      await finishStep(bookId, stepId, "skipped", t, true);
      const kind = autoSkip;
      await updatePrep(bookId, (x) => (x ? { ...x, notice: { kind, at: Date.now() } } : x));
      return;
    }
    const now = Date.now();
    const s1 = await updatePrep(bookId, (x) =>
      x ? { ...x, plan: { ...x.plan, steps: x.plan.steps.map((st) => (st.id === stepId && st.status === "todo" ? { ...st, ...patch, status: "doing" as const, startedAt: now } : st)) } } : x
    );
    const started = s1?.plan.steps.find((x) => x.id === stepId);
    if (s1 && started?.status === "doing") {
      cancelNotif(s1.notifId);
      const id = await scheduleStepNotif(s1, started);
      await updatePrep(bookId, (x) => (x ? { ...x, notifId: id } : x));
    }
  }

  const s = (await getPrep(bookId)) ?? s0;
  const step = s.plan.steps.find((x) => x.id === stepId) ?? step0;
  let read = false;
  // في كل فتح لخطوات الملخص: غير الجاهز يُجهَّز الآن (فلا تسأل شاشته عن التكلفة مرة ثانية)، أو تُقرأ الصفحات بدله
  if (SUM_KINDS.includes(step.kind) && step.unit !== null) {
    const level: SumLevel = step.kind === "listen" ? s.plan.levels[step.unit] ?? "brief" : (step.kind as SumLevel);
    const src = srcOf(step.unit, level);
    if (!(await within(getCachedSummary(s.pdfPath, src), 8_000, null))) {
      if (readsPages(s, step)) read = true;
      else if (s.prepare.approved) {
        const title = unitOf(s, step.unit)?.title ?? "";
        startSummaryJob(s.pdfPath, src, { title: title || s.bookTitle, params: { pdf_path: s.pdfPath, unit: String(step.unit), title, book_title: s.bookTitle, level } }, false);
      }
    }
  }
  try {
    router.push(routeForStep(s, step, t, read));
  } catch {}
}

/** ينهي الخطوة (تمّت/تخطٍّ) ويعيد توزيع الوقت الباقي بإتقان الجلسة الحي */
export async function finishStep(bookId: string, stepId: string, outcome: "done" | "skipped", _t?: T, auto = false): Promise<void> {
  const s0 = await getPrep(bookId);
  const step0 = s0?.plan.steps.find((x) => x.id === stepId);
  if (!s0 || !step0 || (step0.status !== "todo" && step0.status !== "doing")) return;
  const answered = await getAnswered(s0.pdfPath).catch(() => [] as QuestionState[]);
  const us = s0.units.map((x) => x.unit);
  const result = QUIZ_KINDS.includes(step0.kind) ? quizProgress(answered, { unit: step0.unit, units: us, since: step0.startedAt ?? s0.createdAt }) : undefined;
  const now = Date.now();
  let notif: string | undefined;
  await updatePrep(bookId, (x) => {
    if (!x) return x;
    notif = x.notifId;
    let steps = x.plan.steps.map((st) =>
      st.id === stepId && (st.status === "todo" || st.status === "doing")
        ? { ...st, status: outcome, doneAt: now, ...(result ? { result } : {}), ...(auto ? { auto: true } : {}) }
        : st
    );
    const units = withLiveMastery(x.units, answered, x.unitCount);
    let notice = x.notice;
    // بعد انتهاء الوقت (متابعة الباقي) لا موعد يُوزَّع عليه
    if (!x.overtime) {
      const rp = replan({ steps, units, now, deadlineAt: x.deadlineAt });
      steps = rp.steps;
      notice = noticeOf(rp, now) ?? notice;
    }
    return { ...x, units, plan: { ...x.plan, steps }, notifId: undefined, notice, endedAt: isPlanFinished(steps) ? now : x.endedAt };
  });
  cancelNotif(notif);
}

/** إشارات إكمال الخطوة الجارية (الإجابات وعدد المتاح منها، المقاطع المسموعة ووقت انتهاء الاستماع، البطاقات المُراجَعة) */
async function signalFor(s: PrepSession, step: PrepStep): Promise<StepSignal> {
  if (QUIZ_KINDS.includes(step.kind)) {
    const us = s.units.map((x) => x.unit);
    const answered = await getAnswered(s.pdfPath).catch(() => [] as QuestionState[]);
    const sig: StepSignal = { answered: quizProgress(answered, { unit: step.unit, units: us, since: step.startedAt ?? s.createdAt }).answered };
    // المتاح فعلًا: اختبار الوحدة المحفوظ (قد يُولَّد أقل من المطلوب بعد التحقق منه)، أو اختبارات كل الوحدات للشامل.
    // الأخطاء عددها مقيَّد بالمتاح عند الفتح
    if (step.kind === "exam" || ((step.kind === "quiz" || step.kind === "quiz5") && step.unit !== null)) {
      const avail = await savedQuizCount(s.pdfPath, step.kind === "exam" ? us : [step.unit as number]);
      if (avail > 0) sig.cap = avail;
    }
    return sig;
  }
  if (step.kind === "listen" && step.unit !== null) {
    const raw = await within(getRawProgress(s.pdfPath), 8_000, {} as RawProgress);
    const p = raw[String(step.unit)];
    return { heard: p?.s?.length ?? 0, heardTotal: p?.st ?? 0, listenDoneAt: p?.dT };
  }
  if (step.kind === "cards") {
    const before = step.cardSnap ?? {};
    const after = cardSig(unitCardsOf(await getCards().catch(() => [] as Card[]), s.bookId, unitOf(s, step.unit)));
    return { cardsChanged: cardsChanged(before, after), cardsTotal: Object.keys(before).length };
  }
  return {};
}

/** عند الرجوع للخطة وكل دقيقة: كشف إكمال الخطوة الجارية، وإعادة التوزيع، وانتهاء الوقت */
export async function syncPrep(bookId: string, t: T): Promise<void> {
  try {
    const s = await getPrep(bookId);
    if (!s || s.endedAt) return;
    const cur = s.plan.steps.find((x) => x.status === "doing");
    if (cur) {
      const sig = await signalFor(s, cur);
      if (isStepComplete(cur, sig)) await finishStep(bookId, cur.id, "done", t, true);
      else if (sig.cap !== undefined && (cur.count ?? 0) > Math.max(1, sig.cap)) {
        // عُرض أقل من عدد الخطوة (حُذف بعض الأسئلة المولّدة عند التحقق منها): العدد يطابق ما عُرض
        const cap = Math.max(1, sig.cap);
        await updatePrep(bookId, (x) =>
          x ? { ...x, plan: { ...x.plan, steps: x.plan.steps.map((st) => (st.id === cur.id && st.status === "doing" ? { ...st, count: cap } : st)) } } : x
        );
      }
    }
    const answered = await getAnswered(s.pdfPath).catch(() => [] as QuestionState[]);
    const now = Date.now();
    let notif: string | undefined;
    await updatePrep(bookId, (x) => {
      if (!x || x.endedAt) return x;
      let nx = x;
      if (!x.overtime) {
        const units = withLiveMastery(x.units, answered, x.unitCount);
        const rp = replan({ steps: x.plan.steps, units, now, deadlineAt: x.deadlineAt });
        if (rp.changed) nx = { ...x, units, plan: { ...x.plan, steps: rp.steps }, notice: noticeOf(rp, now) ?? x.notice };
      }
      // حلّ الموعد (تنتهي عنده)، أو لم تبقَ خطوة لأن إعادة التوزيع حذفت آخر الباقي (الوقت أقل من حده الأدنى) →
      // يُعرض التقرير، لا شاشة تنفيذ بلا خطوة حالية حتى يحلّ الموعد
      const endAt = autoEndAt({ ...nx, steps: nx.plan.steps }, now);
      if (endAt !== null) {
        notif = x.notifId;
        nx = { ...nx, endedAt: endAt, notifId: undefined };
      }
      return nx;
    });
    cancelNotif(notif);
  } catch {}
}

/** إنهاء الخطة الآن (يُعرض التقرير بما أُنجز) */
export async function endPrep(bookId: string): Promise<void> {
  let notif: string | undefined;
  await updatePrep(bookId, (x) => {
    if (!x) return x;
    notif = x.notifId;
    return { ...x, endedAt: x.endedAt ?? Date.now(), notifId: undefined };
  });
  cancelNotif(notif);
}

/** متابعة الخطوات الباقية بعد انتهاء الوقت */
export async function continuePrep(bookId: string): Promise<void> {
  await updatePrep(bookId, (x) => (x ? { ...x, overtime: true, endedAt: undefined } : x));
}

/** حذف الجلسة (خطة جديدة) */
export async function clearPrep(bookId: string): Promise<void> {
  let notif: string | undefined;
  await updatePrep(bookId, (x) => {
    notif = x?.notifId;
    return null;
  });
  cancelNotif(notif);
}

// الضغط على إشعار «انتهى وقت الخطوة» يفتح الخطة
Notifications.addNotificationResponseReceivedListener((r) => {
  const d = r.notification.request.content.data as { kind?: string; sub?: string; book_id?: string; pdf_path?: string; book_title?: string } | undefined;
  if (d?.kind === "once" && d.sub === "quickprep" && d.book_id) {
    try {
      router.push({ pathname: "/quick-prep", params: { book_id: d.book_id, pdf_path: d.pdf_path ?? "", book_title: d.book_title ?? "" } });
    } catch {}
  }
});
