// lib/pageImage.ts
// يجلب صورة صفحة PDF عالية الدقة (عبر دالة page-image) ويخزّنها محليًا،
// فتُعرض في القارئ قابلة للتكبير والتحريك وتتابع القراءة.
import { Directory, File, Paths } from "expo-file-system";

import { base64ToBytes } from "./base64";
import { supabase } from "./supabase";

const DIR = "page-img";

function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function cacheDir(): Directory {
  const d = new Directory(Paths.cache, DIR);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

// حد أقصى لانتظار السيرفر/التنزيل: طلب عالق كان يُبقي الصفحة «تُحمَّل» حتى الخروج من الكتاب
const TIMEOUT_MS = 30_000;
function within<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms))]);
}

// طلب واحد فقط لكل صفحة في نفس الوقت (الصفحة الحالية والتحميل المسبق كانا يطلبان نفس الصفحة مرتين)
const inflight = new Map<string, Promise<string | null>>();

/** يُرجع مسار صورة الصفحة محليًا (من التخزين أو يجلبها ويخزّنها). */
export function getPageImage(pdfPath: string, page: number): Promise<string | null> {
  if (!pdfPath) return Promise.resolve(null);
  const key = `${pdfPath}#${page}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = fetchPageImage(pdfPath, page).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function fetchPageImage(pdfPath: string, page: number): Promise<string | null> {
  const dir = cacheDir();
  const base = `${hashKey(pdfPath)}_${page}`;
  // صور محفوظة سابقًا (PNG القديمة أو JPEG الجديدة)
  for (const ext of ["jpg", "png"]) {
    const f = new File(dir, `${base}.${ext}`);
    if (f.exists && (f.size ?? 0) > 0) return f.uri;
  }

  // الطريقة السريعة: رابط مباشر يُنزَّل خارج واجهة التطبيق (بلا base64 في JavaScript)
  try {
    const { data, error } = await within(supabase.functions.invoke("page-image", { body: { pdfPath, page, format: "url" } }));
    const d = data as { url?: string; image?: string; mime?: string } | null;
    if (!error && d?.url) {
      const target = new File(dir, `${base}.jpg`);
      if (target.exists) target.delete();
      const got = await within(File.downloadFileAsync(d.url, target));
      if (got.exists && (got.size ?? 0) > 0) return got.uri;
    } else if (!error && d?.image) {
      // السيرفر تعذّر عليه الحفظ فأرسلها مباشرة
      const f = new File(dir, `${base}.${d.mime === "image/jpeg" ? "jpg" : "png"}`);
      f.write(base64ToBytes(d.image));
      return f.uri;
    }
  } catch {
    // نكمل بالطريقة القديمة
  }

  // احتياط: الطريقة القديمة (base64 PNG) بفكّ سريع
  try {
    const { data, error } = await within(supabase.functions.invoke("page-image", { body: { pdfPath, page } }));
    const img = (data as { image?: string })?.image;
    if (error || !img) return null;
    const file = new File(dir, `${base}.png`);
    file.write(base64ToBytes(img));
    return file.uri;
  } catch {
    return null;
  }
}
