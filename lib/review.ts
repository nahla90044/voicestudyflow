// lib/review.ts
// طلب تقييم التطبيق عبر نافذة آبل الأصلية.
//
// قواعد آبل التي يلتزم بها هذا الملف:
//  • النافذة الأصلية فقط — النوافذ المخصّصة ممنوعة.
//  • لا يُربط التقييم بأي مكافأة أو محتوى. المكافأة في perks.ts تُمنح دائمًا
//    وبلا شرط، وهذا الطلب يأتي بعدها منفصلًا تمامًا.
//  • النظام نفسه يحدّ الظهور بثلاث مرات سنويًا، ونحن نطلبها مرة واحدة فقط
//    لكل مستخدم حتى لا نزعجه.
//
// ملاحظة مهمة: requestReview() لا يُرجع أي نتيجة — لا يمكن معرفة هل ظهرت
// النافذة أو هل قيّم المستخدم فعلًا. لذلك لا يصحّ بناء أي منطق على "هل قيّم".
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";

const ASKED_KEY = "vsf:review:asked:v1";

/**
 * يطلب التقييم مرة واحدة فقط في عمر التطبيق على هذا الجهاز.
 * صامت تمامًا عند الفشل — التقييم ميزة ثانوية لا يجوز أن تقاطع المستخدم بخطأ.
 */
export async function askForReviewOnce(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    if (!(await StoreReview.hasAction())) return; // المتجر غير متاح على هذا الجهاز

    // نُعلّم قبل الطلب: لو تعطّل شيء بعدها لا نريد إزعاج المستخدم مجددًا
    await AsyncStorage.setItem(ASKED_KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch {
    // تجاهل — لا شيء هنا يستحق مقاطعة المستخدم
  }
}
