import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { Platform } from "react-native";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase env vars مفقودة. تأكدي من EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY في ملف .env"
  );
}

// على الجهاز (iOS/Android) نستخدم AsyncStorage لحفظ الجلسة. على الويب/بيئة Node
// (بناء static أو التقديم المسبق للنفق) AsyncStorage يستدعي window ويسقط الخادم،
// فنترك التخزين الافتراضي لـsupabase-js لأنه يتعامل مع غياب window بأمان.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native لا يستخدم عناوين URL لاسترجاع الجلسة
    detectSessionInUrl: false,
  },
  // رقم نسخة التطبيق مع كل طلب: السيرفر يرفض النسخ القديمة (قبل 2.0) في الخدمات المكلفة
  global: { headers: { "x-vsf-version": Constants.expoConfig?.version ?? "0" } },
});

/** رقم نسخة التطبيق الحالية (من app.json) */
/** للطلبات المباشرة (البثّ) التي لا تمرّ بعميل supabase */
export const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
export const SUPABASE_PUBLIC_KEY = SUPABASE_ANON_KEY as string;
export const APP_VERSION = Constants.expoConfig?.version ?? "0";
