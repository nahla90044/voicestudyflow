// lib/slideCore.ts
// منطق الشرائح الخالص (بلا supabase ولا React) ليُختبر في node: التخطيط الفعلي للشريحة
// وتقسيم «عنوان: شرح». نُقل من lib/ai.ts كما هو، وما زال ai.ts يعيد تصديره لكل المستعملين القدامى.
import type { Slide, SlideLayout } from "./ai";

/** التخطيط الفعلي: المحدد من الذكاء، أو مستنتج للعروض القديمة */
export function resolveLayout(s: Slide, index: number, total: number): SlideLayout {
  if (s.layout) return s.layout;
  if (index === 0 && total > 1) return "cover";
  if (index === total - 1 && total > 2) return "summary";
  if (s.bullets.filter((b) => splitHead(b).head).length >= 2) return "cards";
  return "list";
}

/** «عنوان: شرح» → جزآن (النقطتان في أول ٤٠ حرفًا فقط) */
export function splitHead(b: string): { head: string; body: string } {
  const i = b.search(/[:：]/);
  if (i > 0 && i <= 40) return { head: b.slice(0, i).trim(), body: b.slice(i + 1).trim() };
  return { head: "", body: b };
}
