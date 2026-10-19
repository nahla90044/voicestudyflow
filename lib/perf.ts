// lib/perf.ts
// قياس السرعة الفعلية (جدول perf_log): مدة كل عملية مهمة ونجاحها — لتحسين السرعة بأرقام حقيقية لا تقديرات.
// يُرسل على دفعات ولا يؤثر على الأداء ولا يرمي أبدًا.
import { APP_VERSION, supabase } from "./supabase";

type Row = { op: string; ms: number; ok: boolean; size?: number };
let buf: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const rows = buf;
  buf = [];
  if (!rows.length) return;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await supabase.from("perf_log").insert(rows.map((r) => ({ ...r, user_id: uid, app_version: APP_VERSION })));
  } catch {
    // القياس اختياري
  }
}

export function recordPerf(op: string, ms: number, ok = true, size?: number): void {
  buf.push({ op, ms: Math.round(ms), ok, size });
  if (!timer) timer = setTimeout(() => void flush(), 8000);
}

/** يقيس مدة عملية غير متزامنة ويسجّلها (ناجحة أو فاشلة) */
export async function timed<T>(op: string, fn: () => Promise<T>, size?: (r: T) => number | undefined): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    recordPerf(op, Date.now() - t0, true, size?.(r));
    return r;
  } catch (e) {
    recordPerf(op, Date.now() - t0, false);
    throw e;
  }
}
