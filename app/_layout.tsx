import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "../components/brand/animated-splash";
import { Palette } from "../constants/design";
import { resumePendingDownload } from "../lib/downloadManager";
import { ThemeProvider } from "../lib/themeContext";
import { ONBOARDING_KEY } from "./onboarding";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
        await SplashScreen.hideAsync().catch(() => {});
        if (seen !== "1") router.replace("/onboarding");
        // أكمل أي تحميل كتاب لم يكتمل (يستأنف تلقائيًا حتى لو سُكِّر التطبيق سابقًا)
        resumePendingDownload();
      } finally {
        // سبلاش قصير جدًا فقط (لا نؤخّر فتح التطبيق)
        setTimeout(() => setBooting(false), 250);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="reader/[id]" />
        </Stack>
        {booting ? <AnimatedSplash /> : null}
      </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
