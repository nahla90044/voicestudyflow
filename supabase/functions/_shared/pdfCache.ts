// supabase/functions/_shared/pdfCache.ts
// ذاكرة مؤقتة لملفات الكتب داخل نسخة الدالة الدافئة: الصفحات المتتالية من الكتاب نفسه
// تُخدم بلا تنزيل الملف كاملًا من جديد لكل صفحة (كان أكبر سبب لبطء التجهيز والقراءة).
// حد للحجم الكلي حتى لا تمتلئ ذاكرة الدالة، والأقدم استخدامًا يُحذف أولًا.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TTL_MS = 5 * 60_000;
const MAX_BYTES = 120 * 1024 * 1024;
const files = new Map<string, { buf: Uint8Array; at: number }>();
const pending = new Map<string, Promise<Uint8Array>>();

function evict() {
  const now = Date.now();
  for (const [k, v] of files) if (now - v.at > TTL_MS) files.delete(k);
  let total = [...files.values()].reduce((s, v) => s + v.buf.length, 0);
  for (const [k, v] of [...files].sort((a, b) => a[1].at - b[1].at)) {
    if (total <= MAX_BYTES) break;
    files.delete(k);
    total -= v.buf.length;
  }
}

/** بايتات ملف الكتاب (من الذاكرة إن نُزّل حديثًا، وطلبات متزامنة للملف نفسه تشترك في تنزيل واحد) */
export async function pdfBytes(admin: SupabaseClient, pdfPath: string): Promise<Uint8Array> {
  const hit = files.get(pdfPath);
  if (hit && Date.now() - hit.at < TTL_MS) {
    hit.at = Date.now();
    return hit.buf;
  }
  const inflight = pending.get(pdfPath);
  if (inflight) return inflight;
  const p = (async () => {
    const { data, error } = await admin.storage.from("pdfs").download(pdfPath);
    if (error || !data) throw error ?? new Error("Failed to download PDF");
    const buf = new Uint8Array(await data.arrayBuffer());
    files.set(pdfPath, { buf, at: Date.now() });
    evict();
    return buf;
  })().finally(() => pending.delete(pdfPath));
  pending.set(pdfPath, p);
  return p;
}

/** كائن مفتوح مشتق من الملف (مثل مستند pdf.js أو mupdf)، يُعاد استخدامه ما دام الملف في الذاكرة */
const opened = new Map<string, { doc: unknown; buf: Uint8Array }>();
export async function openCached<T>(admin: SupabaseClient, pdfPath: string, kind: string, open: (buf: Uint8Array) => Promise<T> | T): Promise<T> {
  const buf = await pdfBytes(admin, pdfPath);
  const k = `${kind}:${pdfPath}`;
  const o = opened.get(k);
  if (o && o.buf === buf) return o.doc as T;
  const doc = await open(buf.slice());
  opened.set(k, { doc, buf });
  for (const key of opened.keys()) if (!files.has(key.slice(key.indexOf(":") + 1))) opened.delete(key);
  return doc;
}
