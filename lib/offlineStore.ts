// lib/offlineStore.ts
// تخزين الكتاب على الجهاز (دائم، لا يحذفه النظام): نص كل صفحة، ونصها الدقيق (التشكيل)، ومواضع كلماتها
// للتظليل — فيعمل الكتاب كاملًا بلا إنترنت: الصفحة والصوت المحفوظ والتظليل معًا.
// ملفات صغيرة (JSON) في مجلد خاص بكل كتاب داخل مستندات التطبيق.
import { Directory, File, Paths } from "expo-file-system";

const ROOT = "offline-books-v1";

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function bookDir(pdfPath: string): Directory | null {
  try {
    const d = new Directory(Paths.document, ROOT, hash(pdfPath));
    if (!d.exists) d.create({ intermediates: true });
    return d;
  } catch {
    return null;
  }
}

function readJson<T>(pdfPath: string, name: string): T | null {
  try {
    const d = bookDir(pdfPath);
    if (!d) return null;
    const f = new File(d, name);
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as T;
  } catch {
    return null;
  }
}

function writeJson(pdfPath: string, name: string, v: unknown): void {
  try {
    const d = bookDir(pdfPath);
    if (!d) return;
    const f = new File(d, name);
    if (f.exists) f.delete();
    f.create();
    f.write(JSON.stringify(v));
  } catch {
    // التخزين المحلي اختياري
  }
}

export type OfflinePage = { page: number; totalPages: number; text: string; ocr?: boolean; ver: string };

export const getOfflinePage = (pdfPath: string, page: number, ver: string): OfflinePage | null => {
  const v = readJson<OfflinePage>(pdfPath, `p${page}.json`);
  return v && v.ver === ver ? v : null;
};
export const setOfflinePage = (pdfPath: string, v: OfflinePage): void => writeJson(pdfPath, `p${v.page}.json`, v);

/** النص الدقيق (المشكول) للصفحة بمفتاح إصداره */
export const getOfflinePrecise = (pdfPath: string, page: number, key: string): string | null => {
  const v = readJson<{ key: string; text: string }>(pdfPath, `t${page}.json`);
  return v && v.key === key ? v.text : null;
};
export const setOfflinePrecise = (pdfPath: string, page: number, key: string, text: string): void =>
  writeJson(pdfPath, `t${page}.json`, { key, text });

/** مواضع كلمات الصفحة (للتظليل) */
export function getOfflineWords<T>(pdfPath: string, page: number, src: "text" | "vision"): T[] | null {
  const v = readJson<T[]>(pdfPath, `w${src[0]}${page}.json`);
  return Array.isArray(v) && v.length ? v : null;
}
export function setOfflineWords<T>(pdfPath: string, page: number, src: "text" | "vision", words: T[]): void {
  if (words.length) writeJson(pdfPath, `w${src[0]}${page}.json`, words);
}

/** حذف بيانات الكتاب من الجهاز (عند حذف الكتاب أو تسجيل الخروج) */
export function clearOfflineBook(pdfPath: string): void {
  try {
    const d = new Directory(Paths.document, ROOT, hash(pdfPath));
    if (d.exists) d.delete();
  } catch {}
}
export function clearAllOffline(): void {
  try {
    const d = new Directory(Paths.document, ROOT);
    if (d.exists) d.delete();
  } catch {}
}
