// lib/pageImage.ts
// يجلب صورة صفحة PDF عالية الدقة (عبر دالة page-image) ويخزّنها محليًا،
// فتُعرض في القارئ قابلة للتكبير والتحريك وتتابع القراءة.
import { Directory, File, Paths } from "expo-file-system";

import { supabase } from "./supabase";

const DIR = "page-img";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const outLen = Math.floor((clean.length * 3) / 4) - pad;
  const bytes = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
    if (p < outLen) bytes[p++] = (n >> 16) & 255;
    if (p < outLen) bytes[p++] = (n >> 8) & 255;
    if (p < outLen) bytes[p++] = n & 255;
  }
  return bytes;
}

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

/** يُرجع مسار صورة الصفحة محليًا (من التخزين أو يجلبها ويخزّنها). */
export async function getPageImage(pdfPath: string, page: number): Promise<string | null> {
  if (!pdfPath) return null;
  const file = new File(cacheDir(), `${hashKey(pdfPath)}_${page}.png`);
  if (file.exists && (file.size ?? 0) > 0) return file.uri;

  const { data, error } = await supabase.functions.invoke("page-image", {
    body: { pdfPath, page },
  });
  const img = (data as { image?: string })?.image;
  if (error || !img) return null;
  try {
    file.write(base64ToBytes(img));
    return file.uri;
  } catch {
    return null;
  }
}
