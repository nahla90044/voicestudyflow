// lib/jobWatchCore.ts
// متابعة مهمة الذكاء على السيرفر (lib/aiJobs) — منطق خالص مُختبَر في tests/jobWatchCore.test.ts.
// خلل ٢٦ أكتوبر: التطبيق كان يعدّ «لا نص خلال ٩٠ ثانية» موتًا للمهمة، والنموذج يفكّر قبل الكتابة أكثر من ذلك،
// فيترك مهمة حية ويطلب بثًّا ثم طلبًا عاديًا — وكلٌّ يُخصم. الآن:
// - المهمة حية ما دام السيرفر يحدّث updated_at (نبض كل ١٠ ث حتى أثناء التفكير) أو يزيد نصها.
// - «متوقفة» فقط إن لم يتغيّر شيء فيها ٩٠ ثانية من وقت التطبيق في الواجهة (وقت الخلفية لا يُحسب).
// - «مفقودة» فقط إن رجع الصف فارغًا بلا خطأ عدة مرات متتالية؛ مهلة الشبكة أو خطؤها ليسا فقدًا (نكمل المتابعة).
// - الحد الأقصى للمتابعة من وقت التطبيق في الواجهة، لا من وقت إنشاء المهمة.

export const STALL_MS = 90_000;
export const WATCH_MAX_MS = 20 * 60_000;
export const MISSING_LIMIT = 5;
export const ERROR_LIMIT = 40;
/** أقصى ما يُحسب بين قراءتين (أكبر منه = كان التطبيق معلّقًا في الخلفية) */
const MAX_TICK_MS = 20_000;

export type JobRow = { status: "running" | "done" | "failed"; partial: string; result: string | null; updated_at?: string | null };
/** نتيجة قراءة صف المهمة: الصف، أو غير موجود (بلا خطأ)، أو تعذّرت القراءة (شبكة/مهلة) */
export type JobRead = { kind: "row"; row: JobRow } | { kind: "missing" } | { kind: "error" };

export type WatchState = {
  /** بصمة آخر حالة مرئية (الحالة + طول النص + updated_at) */
  sig: string;
  /** آخر تغيّر مرئي (بوقت الجهاز) */
  changedAt: number;
  /** وقت المتابعة والتطبيق في الواجهة */
  activeMs: number;
  lastTick: number;
  misses: number;
  errors: number;
};

export type WatchVerdict = "wait" | "done" | "failed" | "stalled" | "missing" | "lost" | "expired";

export function watchInit(now: number): WatchState {
  return { sig: "", changedAt: now, activeMs: 0, lastTick: now, misses: 0, errors: 0 };
}

/** بعد رجوع التطبيق من الخلفية: لا يُحسب وقت الغياب (لا توقّف ولا انتهاء مهلة بسببه) */
export function watchResume(s: WatchState, now: number): WatchState {
  return { ...s, changedAt: now, lastTick: now };
}

/** خطوة متابعة واحدة بعد قراءة الصف */
export function watchStep(s0: WatchState, read: JobRead, now: number): { state: WatchState; verdict: WatchVerdict } {
  const gap = Math.max(0, now - s0.lastTick);
  // فجوة كبيرة بين قراءتين = التطبيق كان مجمّدًا (قفل الشاشة) دون أن نلاحظ: كالرجوع من الخلفية
  const s: WatchState = gap > MAX_TICK_MS ? { ...watchResume(s0, now) } : { ...s0, activeMs: s0.activeMs + gap, lastTick: now };
  if (read.kind === "error") {
    // لا نعرف شيئًا: لا توقّف ولا فقد — نكمل المتابعة، إلا إن طال التعذّر جدًا (يُعاد الاتصال بنفس المهمة لاحقًا)
    s.errors++;
    return { state: s, verdict: s.errors >= ERROR_LIMIT ? "lost" : s.activeMs > WATCH_MAX_MS ? "expired" : "wait" };
  }
  s.errors = 0;
  if (read.kind === "missing") {
    s.misses++;
    return { state: s, verdict: s.misses >= MISSING_LIMIT ? "missing" : "wait" };
  }
  s.misses = 0;
  const r = read.row;
  if (r.status === "done") return { state: s, verdict: "done" };
  if (r.status === "failed") return { state: s, verdict: "failed" };
  const sig = `${r.status}|${(r.partial ?? "").length}|${r.updated_at ?? ""}`;
  if (sig !== s.sig) {
    s.sig = sig;
    s.changedAt = now;
  } else if (now - s.changedAt > STALL_MS) {
    return { state: s, verdict: "stalled" };
  }
  return { state: s, verdict: s.activeMs > WATCH_MAX_MS ? "expired" : "wait" };
}

/** نص المهمة المعروض: «مسافة» النبض (قبل أي نص) ليست نصًا */
export function jobText(r: JobRow): string {
  const raw = r.status === "done" ? r.result ?? r.partial : r.partial;
  return (raw ?? "").trim() ? raw ?? "" : "";
}
