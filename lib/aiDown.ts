// lib/aiDown.ts
// توقف خدمة الذكاء من جهتنا (بلاغ نهلة ٢٨ أكتوبر: نفد رصيد المزوّد فقال التطبيق «لا يوجد اتصال» وأعاد المحاولة مئات المرات):
// السيرفر يُرجع AI_UNAVAILABLE، فيتوقف المحرك عن الإعادة وتظهر رسالة صادقة مرة واحدة كل عشر دقائق —
// للطالب: الخدمة متوقفة مؤقتًا وليست مشكلة في اتصاله وما اكتمل محفوظ؛ وللمالكة: السبب الحقيقي (الرصيد) لتشحنه.
import { Alert } from "react-native";

import { isOwner } from "./auth";
import { getCurrentLang } from "./i18n";
import { dict } from "./i18n/strings";
import { recordPerf } from "./perf";

export const AI_DOWN = "AI_UNAVAILABLE";
const isDown = (m: unknown) => typeof m === "string" && (m === AI_DOWN || /credit balance|billing/i.test(m));
export const aiDownError = isDown;

const t = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;
let lastShown = 0;

/** يُبلغ عن التوقف (رسالة واحدة كل ١٠ دقائق) ويُرجع خطأ AI_UNAVAILABLE ليُرمى */
export function reportAiDown(): Error {
  recordPerf("ai.down", 0, false);
  if (Date.now() - lastShown > 10 * 60_000) {
    lastShown = Date.now();
    void isOwner()
      .catch(() => false)
      .then((owner) => Alert.alert(t(owner ? "aiDown.ownerTitle" : "aiDown.title"), t(owner ? "aiDown.ownerBody" : "aiDown.body")));
  }
  return new Error(AI_DOWN);
}
