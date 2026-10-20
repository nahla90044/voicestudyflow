// lib/qualityAgent.ts
// وكيل الجودة للتوليد على أجزاء (الملخّص والفيديو): يفحص كل جزء فور اكتماله، فإن كان معيبًا يطلب
// إعادة توليده مرة واحدة مجانًا (المهمة المرفوضة تُعلَّم على السيرفر فلا يُخصم من المستخدم).
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
  if (!prev) return first; // نتيجة من غير مهمة سيرفر: لا إعادة تُحسب على المستخدم
  try {
    const second = await make(`${key}:qa`, prev);
    const why2 = check(second, ctx);
    if (why2) recordPerf(`qa.${action}.${why2}.again`, 0, false, ctx.length);
    return why2 ? first : second;
  } catch (e) {
    const m = (e as Error).message;
    if (m === "USER_QUOTA" || m === "UNSAFE_CONTENT" || m === "ACCOUNT_LOCKED") throw e;
    return first;
  }
}
