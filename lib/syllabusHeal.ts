// lib/syllabusHeal.ts
// الإصلاح الذاتي عند فتح المنهج (بالخلفية، بلا طلب ذكاء ولا تدخل من المستخدم): يقرأ الوكيل صفحات الكتاب،
// وإن وجد تقسيمًا متحقَّقًا منه يخالف المحفوظ يصحّحه ويحفظه، ثم يُمسح ما بُني على الوحدات القديمة.
// يُفحص كل كتاب مرة لكل نسخة منهج (البصمة)، ولا يُفحص كتاب لم تُقرأ صفحاته كلها بعد.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { recordPerf } from "./perf";
import { healedSyllabus, sameStructure, type HealSyllabus } from "./syllabusHealCore";
import { supabase } from "./supabase";

// v2 (٢٧ أكتوبر): كاشف «عنوان الوحدة أول الصفحة» — كل كتاب يُعاد فحصه مرة
const KEY = (p: string) => `vsf:heal:v2:${p}`;
const sig = (s: HealSyllabus) => JSON.stringify([s.units.map((u) => u.title), s.ranges ?? []]);
const inflight = new Map<string, Promise<HealSyllabus | null>>();

/** يُرجع المنهج المصحَّح إن صُحِّح، وإلا null (فحص واحد في وقت واحد لكل كتاب) */
export function healSyllabus(pdfPath: string, syl: HealSyllabus, done: boolean[]): Promise<HealSyllabus | null> {
  const cur = inflight.get(pdfPath);
  if (cur) return cur;
  const p = heal(pdfPath, syl, done).finally(() => inflight.delete(pdfPath));
  inflight.set(pdfPath, p);
  return p;
}

async function heal(pdfPath: string, syl: HealSyllabus, done: boolean[]): Promise<HealSyllabus | null> {
  try {
    if (!pdfPath || pdfPath.startsWith("samples/")) return null;
    const s0 = sig(syl);
    if ((await AsyncStorage.getItem(KEY(pdfPath))) === s0) return null;
    const { data: book } = await supabase.from("books").select("page_count").eq("pdf_path", pdfPath).limit(1).maybeSingle();
    const total = Number(book?.page_count) || 0;
    const { bookPages } = await import("./glossary");
    const pages = await bookPages(pdfPath);
    if (!total) return null;
    if (pages.length < total * 0.9) {
      // لم يُقرأ الكتاب كله بعد: يُقرأ بالخلفية (يُستأنف بعد الإغلاق) ويُعاد الفحص عند الفتح التالي
      const { getDownloadState, startDownload } = await import("./downloadManager");
      if (!getDownloadState()?.running) {
        const { data: b } = await supabase.from("books").select("title").eq("pdf_path", pdfPath).limit(1).maybeSingle();
        void startDownload(pdfPath, b?.title ?? "", total);
      }
      return null;
    }
    const { structureFromPages } = await import("./unitStructure");
    const v = structureFromPages(pages, total);
    // الفاحص الآلي (٢٧ أكتوبر): منهج فيه علامة خلل يراها الطالب ولا تقسيم متحقَّق منه يصلحه → يُسجَّل في المراقبة
    const { suspectSyllabus } = await import("./unitStructure");
    const suspect = suspectSyllabus(syl.units, syl.ranges, total);
    if (suspect.length && !v.verified) recordPerf(`syllabus.suspect.${suspect.length}`, 0, false, syl.units.length);
    if (!v.verified || sameStructure(syl, v.units)) {
      await AsyncStorage.setItem(KEY(pdfPath), s0);
      return null;
    }
    const next = healedSyllabus(syl, v.units, pages);
    const keep = next.units.map((u) => {
      const i = syl.units.findIndex((o) => o.title === u.title);
      return i >= 0 ? !!done[i] : false;
    });
    const { error } = await supabase.from("book_syllabus").update({ data: next, done: keep }).eq("pdf_path", pdfPath);
    if (error) return null;
    const { syncSyllabus } = await import("./syllabusSync");
    await syncSyllabus(pdfPath, next.units.map((u) => u.title)).catch(() => {});
    const { setUnitRanges } = await import("./glossary");
    await setUnitRanges(pdfPath, next.ranges!.map((r) => ({ ...r, found: true })));
    await AsyncStorage.setItem(KEY(pdfPath), sig(next));
    recordPerf("syllabus.healed", 0, true, next.units.length);
    return next;
  } catch {
    return null;
  }
}
