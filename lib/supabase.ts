import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase env vars مفقودة. تأكدي من EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY في ملف .env"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // حفظ الجلسة على الجهاز حتى تبقى بعد إغلاق التطبيق
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native لا يستخدم عناوين URL لاسترجاع الجلسة
    detectSessionInUrl: false,
  },
});
