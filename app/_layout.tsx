import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "../components/brand/animated-splash";
import { Palette } from "../constants/design";
import { getSession } from "../lib/auth";
import { initPurchases } from "../lib/purchases";
import { supabase } from "../lib/supabase";
import { resumePendingDownload } from "../lib/downloadManager";
import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/themeContext";
import { ONBOARDING_KEY } from "./onboarding";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // التطبيق عموديّ افتراضيًا؛ نسمح بالعرض (landscape) فقط داخل عدسة القارئ.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        // التسجيل إلزامي: لازم حساب ببريد مؤكّد قبل الدخول للتطبيق
        const session = await getSession().catch(() => null);
        const authed = !!session?.user?.email;
        await SplashScreen.hideAsync().catch(() => {});
        if (session?.user?.id) void initPurchases(session.user.id);
        if (!authed) {
          router.replace("/auth"); // الصفحة الأولى بعد السبلاش = التسجيل/الدخول
        } else if (seen !== "1") {
          router.replace("/onboarding");
        }
        // أكمل أي تحميل كتاب لم يكتمل (يستأنف تلقائيًا حتى لو سُكِّر التطبيق سابقًا)
        resumePendingDownload();
      } finally {
        // سبلاش قصير جدًا فقط (لا نؤخّر فتح التطبيق)
        setTimeout(() => setBooting(false), 250);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // بعد تسجيل الدخول لاحقًا: نربط مشتريات المتجر بهوية المستخدم
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user?.id) void initPurchases(s.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
      <ThemeProvider>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Palette.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="reader/[id]" />
          <Stack.Screen name="book/[id]" />
          <Stack.Screen name="ask/[id]" />
          {/* «بحث وأوامر» تُفتح كورقة من الأسفل فوق الشاشة الحالية */}
          <Stack.Screen name="command" options={{ presentation: "modal" }} />
          <Stack.Screen name="voice" options={{ presentation: "fullScreenModal", animation: "fade" }} />
          <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        </Stack>
        {booting ? <AnimatedSplash /> : null}
      </SafeAreaProvider>
      </ThemeProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
