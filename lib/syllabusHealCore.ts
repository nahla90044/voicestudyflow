// lib/syllabusHealCore.ts
// الإصلاح الذاتي للمنهج (منطق خالص، مُختبَر): إن وجد وكيل الوحدات تقسيمًا متحقَّقًا منه (مطابقًا لفهرس الكتاب)
// يخالف المنهج المحفوظ، يُبنى منهج مصحَّح بلا طلب ذكاء: العناوين والصفحات من الوكيل، والأهداف منقولة
// حرفيًا من صفحة «أهداف الوحدة»، ومحتوى الوحدة القديمة يبقى فقط إن كانت نفس الوحدة بنفس صفحاتها.
import { unitKey, type StructUnit } from "./unitStructure.ts";

export type HealUnit = { title: string; topics: string[]; outcome?: string; about?: string; objectives?: string[] };
export type HealSyllabus = { title?: string; units: HealUnit[]; tips?: string[]; ranges?: { from: number; to: number }[] };

/** هل المنهج المحفوظ يطابق التقسيم المتحقَّق منه (نفس الوحدات بالترتيب وبنفس الصفحات)؟ */
export function sameStructure(syl: HealSyllabus, units: StructUnit[]): boolean {
  return (
    syl.units.length === units.length &&
    units.every((u, i) => unitKey(syl.units[i].title) === unitKey(u.title) && syl.ranges?.[i]?.from === u.page && syl.ranges?.[i]?.to === u.to)
  );
}

/** أهداف الوحدة حرفيًا من صفحتها («يتوقع من الطالب … الأهداف التالية: أن يشرح … . أن يوضح …») */
export function objectivesFrom(pages: { page: number; text: string }[], u: StructUnit): string[] {
  const p = pages.find((x) => x.page >= u.page && x.page <= Math.min(u.to, u.page + 3) && /أهداف الوحدة|اهداف الوحدة/.test(x.text));
  if (!p) return [];
  const t = p.text.replace(/\s+/g, " ");
  const at = t.search(/الأهداف التالية\s*:|الاهداف التالية\s*:/);
  const tail = at >= 0 ? t.slice(at).replace(/^[^:]*:/, "") : t.slice(t.search(/أهداف الوحدة|اهداف الوحدة/) + 12);
  return tail
    .split(/(?:^|[\s.•\-–]+)(?=أن\s)/)
    .map((x) => x.replace(/[\s.•:،\-–]+$/, "").trim())
    .filter((x) => /^أن\s/.test(x) && x.length >= 8 && x.length <= 220)
    .slice(0, 12);
}

/** المنهج المصحَّح من التقسيم المتحقَّق منه */
export function healedSyllabus(syl: HealSyllabus, units: StructUnit[], pages: { page: number; text: string }[]): HealSyllabus {
  return {
    ...syl,
    units: units.map((u) => {
      const i = syl.units.findIndex((o) => unitKey(o.title) === unitKey(u.title));
      const old = i >= 0 ? syl.units[i] : null;
      const samePages = !!old && syl.ranges?.[i]?.from === u.page && syl.ranges?.[i]?.to === u.to;
      const objectives = objectivesFrom(pages, u);
      if (samePages && old) return { ...old, title: u.title, objectives: old.objectives?.length ? old.objectives : objectives.length ? objectives : undefined };
      return { title: u.title, topics: [], objectives: objectives.length ? objectives : undefined };
    }),
    ranges: units.map((u) => ({ from: u.page, to: u.to })),
  };
}
