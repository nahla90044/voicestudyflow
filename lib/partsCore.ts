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

// ===== إعادة الجزء بعد خطأ (٢٦ أكتوبر) =====
/** محاولات الجزء الفاشلة قبل أن يُعدّ فاشلًا في هذا التوليد */
export const MAX_TRIES = 3;
/** مرات «خرج التطبيق من الواجهة» المسموحة للجزء قبل أن تُحسب محاولة (كانت تُعاد بلا حد ولا انتظار) */
export const MAX_AWAY = 5;

export type PartErrorStep = {
  tries: number;
  aways: number;
  /** stop: يتوقف كل شيء (الحصة/المحتوى/الحساب)، fail: الجزء فاشل الآن، retry: إعادة بعد delayMs، waitActive: إعادة بعد الرجوع للواجهة */
  verdict: "stop" | "fail" | "retry" | "waitActive";
  delayMs: number;
};

/** ماذا يفعل محرك الأجزاء بعد خطأ في جزء (خالص — مُختبَر في tests/partsCore.test.ts) */
export function afterPartError(code: string, tries: number, aways: number): PartErrorStep {
  if (code === "USER_QUOTA" || code === "UNSAFE_CONTENT" || code === "ACCOUNT_LOCKED") return { tries, aways, verdict: "stop", delayMs: 0 };
  // السيرفر بلغ سقف الإعادات المجانية لهذا الجزء: لا فائدة من الإعادة الآن (ولا خصم عليها)
  if (code === "RETRY_LIMIT") return { tries, aways, verdict: "fail", delayMs: 0 };
  if (code === "WENT_AWAY" && aways < MAX_AWAY) return { tries, aways: aways + 1, verdict: "waitActive", delayMs: 0 };
  const t = tries + 1;
  if (t >= MAX_TRIES) return { tries: t, aways, verdict: "fail", delayMs: 0 };
  return { tries: t, aways, verdict: "retry", delayMs: 1500 * t };
}
