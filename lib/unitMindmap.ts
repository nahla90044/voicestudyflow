// lib/unitMindmap.ts
// مصدر الخريطة الذهنية المتفرعة لوحدة (٢٥ أكتوبر): إن وُجد مختصرها الجدولي تُبنى منه مجانًا (موضوع ←
// عنوان فرعي ← نقاطه ← عناصرها)، وإلا من **نص الوحدة كاملًا** بالذكاء (كانت تُبنى من عناوين المنهج فقط
// فلا تتفرع). مشترك بين شاشة المنهج وشاشة القراءة.
import { mindmapFromSummary } from "./studySummary";
import { generateMindmap, type MindMap } from "./syllabus";
import { getCachedSummary, summaryParts, type SummarySource } from "./unitSummary";

/** الخريطة من المختصر الجدولي المحفوظ (بلا ذكاء ولا طلب)، أو null */
export async function mindmapFromTable(pdfPath: string, src: SummarySource, title: string): Promise<MindMap | null> {
  for (const level of ["brief", "final"] as const) {
    const s = await getCachedSummary(pdfPath, { ...src, level }).catch(() => null);
    if (s?.table) {
      const m = mindmapFromSummary(s, title);
      if (m) return m;
    }
  }
  return null;
}

export async function makeUnitMindmap(pdfPath: string, src: SummarySource, title: string): Promise<MindMap | null> {
  const fromTable = await mindmapFromTable(pdfPath, src, title);
  if (fromTable) return fromTable;
  const parts = await summaryParts(pdfPath, { ...src, level: "brief" }).catch(() => [] as string[]);
  // نص الأجزاء بلا تعليمات التقسيم التي يضيفها الملخّص
  const body = parts.map((p) => (/^عنوان الوحدة|^هذا الجزء/.test(p) ? p.slice(p.indexOf("\n\n") + 2) : p)).join("\n\n");
  const ctx = `${title ? `عنوان الوحدة (الفكرة المركزية): ${title}\n\n` : ""}${body}`.slice(0, 18000);
  return ctx.trim() ? generateMindmap(ctx) : null;
}

/** الخريطة القديمة (قبل التفرّع): نقاط بلا شجرة في كل فروعها */
export function isFlatMindmap(m: MindMap | null | undefined): boolean {
  return !!m && !m.branches.some((b) => b.tree?.length);
}
