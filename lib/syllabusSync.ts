// lib/syllabusSync.ts
// إذا تغيّرت وحدات المنهج (من أي مكان: إعادة إنشاء، أو إصلاح على السيرفر، أو جهاز آخر)، يُمسح على هذا الجهاز
// كل ما بُني على الوحدات القديمة: الملخصات والفيديو والاختبارات والخرائط والمصطلحات (مرقّمة بترتيب الوحدة)،
// ومهام التوليد العالقة، وحدود الصفحات، وذاكرة الفهرس — فلا يظهر ملخص وحدة قديمة تحت عنوان وحدة جديدة.
import AsyncStorage from "@react-native-async-storage/async-storage";

const SIG = (p: string) => `vsf:sylsig:v1:${p}`;

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const running = new Map<string, Promise<void>>();

/** يُستدعى بعد جلب المنهج: يقارن بصمة عناوين الوحدات بآخر بصمة على الجهاز */
export function syncSyllabus(pdfPath: string, titles: string[]): Promise<void> {
  const sig = hash(titles.join("\n"));
  const busy = running.get(pdfPath);
  if (busy) return busy;
  const job = (async () => {
    const prev = await AsyncStorage.getItem(SIG(pdfPath)).catch(() => null);
    if (prev === sig) return;
    // أول مرة على هذا الجهاز (قبل وجود البصمة): الحدود المحفوظة بعدد وحدات مختلف تدل على منهج قديم
    let stale = prev !== null;
    if (!stale) {
      try {
        const { getCachedUnitRanges } = await import("./glossary");
        const anyRanges = await AsyncStorage.getItem(`unitranges:last:${hash(pdfPath)}`);
        stale = !!anyRanges && !(await getCachedUnitRanges(pdfPath, titles.length));
      } catch {}
    }
    if (stale) {
      const { resetUnitContent } = await import("./syllabusEdit");
      const { clearUnitRanges } = await import("./glossary");
      await resetUnitContent(pdfPath).catch(() => {});
      await clearUnitRanges(pdfPath).catch(() => {});
      try {
        const keys = (await AsyncStorage.getAllKeys()).filter(
          (k) => (/^vsf:aijob:(sum|vid):/.test(k) && k.includes(pdfPath)) || k === `vsf:toc:v3:${pdfPath}`
        );
        if (keys.length) await AsyncStorage.multiRemove(keys);
      } catch {}
    }
    await AsyncStorage.setItem(SIG(pdfPath), sig).catch(() => {});
  })().finally(() => running.delete(pdfPath));
  running.set(pdfPath, job);
  return job;
}

/** تغيير مقصود عالجت آثاره الشاشة نفسها (حذف وحدات بإعادة ترقيم، إعادة إنشاء وحدة): تُحدَّث البصمة بلا مسح */
export async function markSynced(pdfPath: string, titles: string[]): Promise<void> {
  await AsyncStorage.setItem(SIG(pdfPath), hash(titles.join("\n"))).catch(() => {});
}
