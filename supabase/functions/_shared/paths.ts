// supabase/functions/_shared/paths.ts
// التحقق من ملكية مسار ملف الكتاب قبل أي تنزيل بمفتاح الخدمة: مجلّد المستخدم نفسه أو العيّنات فقط،
// ومقطعان بالضبط بلا «..» أو ترميز أو شرطات خلفية — يمنع الوصول لملف مستخدم آخر عبر التلاعب بالمسار.
export function canAccessPdf(pdfPath: unknown, userId: string): boolean {
  if (typeof pdfPath !== "string" || pdfPath.length > 300) return false;
  if (/(\.\.|%|\\|[\u0000-\u001f])/.test(pdfPath) || pdfPath.startsWith("/")) return false;
  const parts = pdfPath.split("/");
  if (parts.length !== 2 || !parts[1] || parts[1] === "." ) return false;
  return parts[0] === userId || parts[0] === "samples";
}
