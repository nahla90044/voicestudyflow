// lib/scrubberMath.ts
// حساب الاتجاه لشريط تصفّح الصفحات — منفصل عن المكوّن عمدًا.
//
// منطق RTL/LTR أكثر ما يُخطأ فيه، واختباره بصريًا وحده غير كافٍ. وضعه هنا
// (بلا استيراد react-native) يجعله قابلًا للاختبار مباشرة.
//
// الاصطلاح: النسبة ٠ عند الصفحة الأولى دائمًا مهما كان الاتجاه، والاتجاه
// يقرّر أين تقع هذه النسبة على الشاشة (يمينًا في العربية، يسارًا في الإنجليزية).

/** موضع اللمس الأفقي → رقم الصفحة. */
export function pageAtX(x: number, width: number, totalPages: number, rtl: boolean): number {
  if (width <= 0 || totalPages < 1) return 1;
  // نقيس المسافة بالبكسل من طرف «الصفحة الأولى» ثم نقسم مرة واحدة:
  // حساب f ثم عكسه بـ 1-f يُدخل خطأ تقريب عشريًا يجعل RTL يختلف عن مرآة LTR
  // عند حدود منتصف الصفحة بالضبط.
  const px = Math.min(width, Math.max(0, x));
  const f = (rtl ? width - px : px) / width;
  return Math.min(totalPages, Math.max(1, Math.round(f * (totalPages - 1)) + 1));
}

/** رقم الصفحة → نسبة امتلاء الشريط (٠ عند الصفحة الأولى). */
export function fractionForPage(page: number, totalPages: number): number {
  if (totalPages <= 1) return 0;
  const p = Math.min(totalPages, Math.max(1, page));
  return (p - 1) / (totalPages - 1);
}
