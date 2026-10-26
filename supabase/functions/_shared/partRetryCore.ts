// supabase/functions/_shared/partRetryCore.ts
// «رصيد الجزء» (قرار نهلة ٢٦ أكتوبر): الطالب يدفع مرة واحدة لكل جزء (ملخّص/فيديو/منهج)، وكل إعادة آلية
// لنفس الجزء بسبب خلل من جهتنا (انقطاع، ردّ فارغ أو غير مقروء، توقّف المهمة، فشل البثّ، رفض وكيل الجودة) مجانية.
// منطق خالص بلا اعتماديات — مُختبَر في tests/partRetryCore.test.ts، ودالتا SQL في 0038_part_retry.sql
// (claim_part_retry وpart_attempt_done) تطبّقان القواعد نفسها ذرّيًا على دفتر الخصم.
//
// لماذا لا ثغرة:
// - المجانية مربوطة بقيد مدفوع حقيقي لنفس المستخدم ونفس الإجراء ونفس الجزء حرفيًا (بصمة النص وخياراته)،
//   داخل نافذة ٦ ساعات من الدفع، وبسقف ٣ إعادات تُسلِّم نصًا لكل قيد مدفوع. أي تغيير في النص = بصمة جديدة = خصم.
// - البصمة يحسبها السيرفر من الطلب نفسه، ولا يُوثق بأي رقم مهمة يرسله التطبيق.
// - المحاولة التي لم تُسلِّم شيئًا (فشل قبل أي نص، أو ردّ فارغ) لا تُحسب من السقف: لا قيمة فيها لأحد.
// - إعادة التوليد اليدوية (حذف ثم توليد) يرسل معها التطبيق genId جديدًا → بصمة جديدة → خصم عادي كما قررت نهلة.

/** الإجراءات المشمولة: أجزاء التوليد الطويل */
export const PART_ACTIONS = new Set(["videoscript", "studysummary", "syllabus"]);
/** نافذة الإعادة المجانية من وقت الدفع */
export const RETRY_WINDOW_MS = 6 * 3600_000;
/** أقصى إعادات مجانية تُسلِّم نصًا لكل قيد مدفوع */
export const FREE_RETRIES = 3;

/**
 * حصيلة محاولة كما يراها السيرفر (لا التطبيق):
 * ok = اكتملت بنص، cut = نص انقطع عند سقف المخرجات (أو رُفض بعد نص)، empty = انتهت بلا نص،
 * failed = فشلت قبل تسليم أي شيء، partial = فشل البثّ بعد تسليم نص للتطبيق (قد يكون التطبيق قطعه بنفسه).
 */
export type Outcome = "ok" | "cut" | "empty" | "failed" | "partial";
export const OUTCOMES: Outcome[] = ["ok", "cut", "empty", "failed", "partial"];

/** هل يشمل «رصيد الجزء» هذا الطلب؟ المنهج: مهمة السيرفر فقط (إعادة إنشاء وحدة واحدة طلب مباشر مقصود يُخصم) */
export function partScope(action: string, body: { job?: unknown; qaRetryOf?: unknown }): boolean {
  if (action === "videoscript" || action === "studysummary") return true;
  if (action === "syllabus") return body.job === true || typeof body.qaRetryOf === "string";
  return false;
}

/** JSON بمفاتيح مرتّبة: نفس المدخلات → نفس النص دائمًا مهما اختلف ترتيب الحقول */
export function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export type PartFields = {
  action: string;
  /** النص بعد القصّ بحد السيرفر (هو ما يُرسل للنموذج فعلًا) */
  text: string;
  targetLang?: string;
  mode?: unknown;
  table?: unknown;
  deep?: unknown;
  /** نصيب جزء الفيديو بعد تنقيحه بـ readVpart (null إن لم يوجد) */
  vpart?: unknown;
  /** معرّف جلسة التوليد: يتغيّر عند إعادة التوليد اليدوية فقط */
  genId?: unknown;
};

/** النص القانوني لبصمة الجزء: كل ما يغيّر المخرجات، بترتيب ثابت */
export function partKey(f: PartFields): string {
  const genId = typeof f.genId === "string" ? f.genId.slice(0, 64) : "";
  return stableStringify({
    a: f.action,
    t: f.text,
    l: String(f.targetLang ?? "ar"),
    m: typeof f.mode === "string" ? f.mode : "",
    tb: f.table === true,
    d: f.deep === true,
    v: f.vpart ?? null,
    g: genId,
  });
}

/** بصمة الجزء (sha256 بالنظام الست عشري) */
export async function partHash(f: PartFields): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(partKey(f)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** حصيلة المحاولة من ناتجها الفعلي على السيرفر */
export function attemptOutcome(o: { text: string; stopReason?: string | null; error?: boolean; delivered?: number }): Outcome {
  const has = o.text.trim().length > 0;
  if (o.error) return (o.delivered ?? 0) > 0 && has ? "partial" : "failed";
  if (!has) return "empty";
  if (o.stopReason === "max_tokens" || o.stopReason === "refusal") return "cut";
  return "ok";
}

/** هل سلّمت المحاولة شيئًا (أو ما زالت تعمل)؟ هذه وحدها تُحسب من سقف الإعادات */
export const countsTowardCap = (o: Outcome | null): boolean => o === null || o === "ok" || o === "cut" || o === "partial";

/** قيد في دفتر الخصم (نموذج لصف usage_ledger) */
export type LedgerRow = {
  id: number;
  userId: string;
  action: string;
  hash: string | null;
  amount: number;
  refunded: boolean;
  /** للإعادة المجانية: رقم القيد المدفوع الأصلي */
  retryOf: number | null;
  createdAt: number;
  /** null = ما زالت تعمل */
  outcome: Outcome | null;
};

export type RetryDecision = { kind: "charge" } | { kind: "free"; rootId: number } | { kind: "limit"; rootId: number };

/** القيد المدفوع الأصلي الساري لهذا الجزء (أحدث قيد مدفوع غير مردود داخل النافذة) */
export function findRoot(rows: LedgerRow[], q: { userId: string; action: string; hash: string; now: number }, windowMs = RETRY_WINDOW_MS): LedgerRow | null {
  let best: LedgerRow | null = null;
  for (const r of rows) {
    if (r.userId !== q.userId || r.action !== q.action || r.hash !== q.hash) continue;
    if (r.retryOf !== null || r.amount <= 0 || r.refunded) continue;
    if (r.createdAt <= q.now - windowMs) continue;
    if (!best || r.createdAt > best.createdAt || (r.createdAt === best.createdAt && r.id > best.id)) best = r;
  }
  return best;
}

/**
 * قرار الطلب قبل الخصم (نموذج دالة SQL claim_part_retry):
 * regen (إعادة يدوية بلا genId — للتوافق فقط) → خصم. بلا قيد مدفوع ساري → خصم (يصير هو الأصل).
 * وإلا: مجانية ما دام عدد الإعادات التي سلّمت نصًا (أو ما زالت تعمل) أقل من السقف، وإلا RETRY_LIMIT بلا خصم ولا توليد.
 */
export function decideRetry(
  rows: LedgerRow[],
  q: { userId: string; action: string; hash: string; now: number; regen?: boolean },
  opts: { windowMs?: number; cap?: number } = {}
): RetryDecision {
  if (q.regen) return { kind: "charge" };
  const root = findRoot(rows, q, opts.windowMs ?? RETRY_WINDOW_MS);
  if (!root) return { kind: "charge" };
  const used = rows.filter((r) => r.retryOf === root.id && countsTowardCap(r.outcome)).length;
  return used >= (opts.cap ?? FREE_RETRIES) ? { kind: "limit", rootId: root.id } : { kind: "free", rootId: root.id };
}

/**
 * يُردّ القيد المدفوع؟ (نموذج دالة SQL part_attempt_done) فقط حين انتهت كل محاولات سلسلته
 * (الأصل وإعاداته) ولم تُسلِّم أيٌّ منها شيئًا — فلا يدفع الطالب ثمن عمل لم يصله، ولا يُردّ ما وصله.
 */
export function chainRefund(rows: LedgerRow[], rootId: number): boolean {
  const root = rows.find((r) => r.id === rootId);
  if (!root || root.refunded || root.amount <= 0) return false;
  const chain = rows.filter((r) => r.id === rootId || r.retryOf === rootId);
  return chain.every((r) => r.outcome === "failed" || r.outcome === "empty");
}
