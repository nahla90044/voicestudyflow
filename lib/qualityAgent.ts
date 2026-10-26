// lib/qualityAgent.ts
// وكيل الجودة للتوليد على أجزاء (الملخّص والفيديو): يفحص كل جزء فور اكتماله، فإن كان معيبًا يطلب
// إعادة توليده مرة واحدة مجانًا. المجانية يقرّرها السيرفر برصيد الجزء (نفس الجزء حرفيًا = إعادة لا تُخصم)،
// سواء جاءت النتيجة الأولى من مهمة أو من بثّ؛ ورقم المهمة السابقة يُرسل أيضًا للتوافق مع السيرفر السابق.
// المرة الثانية تُقبل كما هي (لا حلقة تكلفة)، وكل رفض يُسجَّل داخليًا للمراجعة.
import { lastJobId } from "./aiJobs";
import { recordPerf } from "./perf";

export async function qaPart<P>(
  key: string,
  action: "studysummary" | "videoscript",
  ctx: string,
  make: (key: string, qaRetryOf?: string) => Promise<P>,
  check: (p: P, ctx: string) => string | null
): Promise<P> {
  const first = await make(key);
  const why = check(first, ctx);
  if (!why) return first;
  const prev = lastJobId(key);
  recordPerf(`qa.${action}.${why}`, 0, false, ctx.length);
  // (كانت النتيجة من غير مهمة سيرفر لا تُعاد خشية الخصم؛ رصيد الجزء على السيرفر يجعلها مجانية دائمًا)
  try {
    const second = await make(`${key}:qa`, prev);
    const why2 = check(second, ctx);
    if (why2) recordPerf(`qa.${action}.${why2}.again`, 0, false, ctx.length);
    return why2 ? first : second;
  } catch (e) {
    const m = (e as Error).message;
    if (m === "USER_QUOTA" || m === "UNSAFE_CONTENT" || m === "ACCOUNT_LOCKED") throw e;
    return first; // ومنها RETRY_LIMIT: سقف الإعادات المجانية لهذا الجزء → تُقبل الأولى
  }
}
