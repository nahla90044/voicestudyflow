// lib/genId.ts
// معرّف «جلسة التوليد» لكل فيديو/ملخّص وحدة محفوظ على الجهاز (المنطق الخالص في genIdCore.ts).
// يُجدَّد عند الحذف لإعادة التوليد اليدوية فقط، ويُرسل مع كل طلب لأجزاء ذلك المحتوى.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { newGenId } from "./genIdCore";

const key = (scope: string) => `vsf:gen:${scope}`;

/** معرّف الجلسة الحالية (undefined = أول توليد لهذا المحتوى على هذا الجهاز) */
export async function getGenId(scope: string): Promise<string | undefined> {
  try {
    return (await AsyncStorage.getItem(key(scope))) || undefined;
  } catch {
    return undefined;
  }
}

/** جلسة جديدة: يُستدعى حين يحذف الطالب المحتوى ليعيد توليده (إعادة التوليد اليدوية تُخصم) */
export async function renewGenId(scope: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(scope), newGenId());
  } catch {
    // بلا تخزين: تبقى الجلسة السابقة (الإعادة قد تُحسب مجانية — لصالح الطالب)
  }
}
