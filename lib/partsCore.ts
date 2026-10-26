// lib/partsCore.ts
// منطق العرض أولًا بأول في محرك الأجزاء (partsRunner) — خالص ومُختبَر في tests/partsCore.test.ts.

/**
 * الأجزاء التي تُعرض الآن بالترتيب: المكتمل، ثم ما يُكتب منه.
 * - جزء لم يظهر منه شيء بعد يوقف العرض (لا قفز فوقه)، والجزء الفاشل (null) يُتخطى.
 * - inOrder (الفيديو): بعد جزء غير مكتمل يتوقف العرض. كان الجزء الثاني يُعرض ناقصًا بعد الأول الناقص،
 *   فإذا كبر الأول أُزيحت مشاهد الثاني إلى أرقام أعلى، فيرجع المشغّل لموضوع تركه ويعيد ما شوهد (٢٦ أكتوبر).
 */
export function visibleParts<P>(final: (P | null | undefined)[], partial: (P | null | undefined)[], inOrder = false): P[] {
  const shown: P[] = [];
  for (let i = 0; i < final.length; i++) {
    const done = final[i] !== undefined;
    const s = done ? final[i] : partial[i];
    if (!s) {
      if (!done) break; // لم يظهر منه شيء بعد → نحافظ على الترتيب
      continue; // فشل → نتخطاه
    }
    shown.push(s);
    if (inOrder && !done) break;
  }
  return shown;
}

/**
 * عند إعادة جزء (رفض الجودة أو تعثّر المهمة): المحاولة الجديدة تبدأ من الصفر، فلا تحلّ محل المعروض
 * إلا حين تبلغ حجمه (عدد مشاهده) — فلا يرجع العرض إلى الخلف ولا تختفي مشاهد شوهدت.
 */
export function keepPartial<P>(old: P | null | undefined, next: P, size?: (p: P) => number): P {
  if (!old || !size) return next;
  return size(next) >= size(old) ? next : old;
}
