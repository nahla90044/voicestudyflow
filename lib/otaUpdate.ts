// lib/otaUpdate.ts
// التحديثات الهوائية (EAS Update): الافتراضي أن التحديث يُنزَّل بالخلفية ولا يُطبَّق إلا في المرة
// التالية لفتح التطبيق — فكان التعديل يتأخر فتحتين. هنا نتحقق أثناء السبلاش: إن وُجد تحديث
// نُنزّله ونعيد التشغيل فورًا (قبل أن يبدأ المستخدم شيئًا). بحد أقصى للانتظار حتى لا تطول السبلاش.
import * as Updates from "expo-updates";

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** يطبّق تحديثًا هوائيًا متاحًا الآن (يعيد تشغيل التطبيق). لا يفعل شيئًا في التطوير أو بلا شبكة. */
export async function applyUpdateOnLaunch(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const check = await within(Updates.checkForUpdateAsync(), 2500);
    if (!check?.isAvailable) return;
    const fetched = await within(Updates.fetchUpdateAsync(), 8000);
    if (fetched?.isNew) await Updates.reloadAsync();
  } catch {
    // غير حرج: يُطبَّق التحديث في الفتح التالي كالمعتاد
  }
}
