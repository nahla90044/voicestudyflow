import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AnimatedSplash } from "../components/brand/animated-splash";
import { UpdateRequired } from "../components/brand/update-required";
import { AccountLocked } from "../components/brand/account-locked";
import { accountLocked, onSecurity } from "../lib/security";
import { checkMinVersion, onUpdateRequired } from "../lib/appVersion";
import { rescueCachedMusic } from "../lib/sfx";
import { resumeBookAudioIfRunning } from "../lib/bookAudio";
import { Palette } from "../constants/design";
import { getSession, isOwner } from "../lib/auth";
import { applyUpdateOnLaunch } from "../lib/otaUpdate";
import { initPurchases } from "../lib/purchases";
import { supabase } from "../lib/supabase";
import { resumePendingDownload } from "../lib/downloadManager";
import { getCurrentLang, LanguageProvider } from "../lib/i18n";
import { dangerAlert, FeedbackHost, isDangerAlert, setNativeAlert } from "../components/brand/feedback-host";
import { installGlobalErrorLogging } from "../lib/errorLog";
import { dict } from "../lib/i18n/strings";
import { closeReadingCard } from "../lib/readingCard";
import { ThemeProvider } from "../lib/themeContext";
import { ONBOARDING_KEY } from "./onboarding";

// نصوص خارج مزوّد اللغة (التخطيط العام يحيط به)
const tr = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;

// التنبيهات بلا أزرار يضع لها iOS زر «OK» بلغة الجهاز؛ نضيف زرًا بلغة التطبيق لكل التطبيق مرة واحدة
const nativeAlert = Alert.alert.bind(Alert);
setNativeAlert((title, msg, buttons) => nativeAlert(title, msg, buttons));
// ونوافذ الحذف (زر مدمّر) تظهر بطاقة تحذير مميزة موحّدة بدل نافذة النظام
Alert.alert = (title, message, buttons, options) =>
  isDangerAlert(buttons)
    ? dangerAlert(title, message, buttons!)
    : nativeAlert(title, message, buttons && buttons.length ? buttons : [{ text: tr("common.ok") }], options);

SplashScreen.preventAutoHideAsync().catch(() => {});
installGlobalErrorLogging(); // أي خطأ قاتل يُسجَّل على السيرفر قبل الإغلاق

// خطأ عرض في أي شاشة → رسالة هادئة بدل إغلاق التطبيق
export { RouteErrorBoundary as ErrorBoundary } from "../components/brand/error-boundary";

export default function RootLayout() {
  const router = useRouter();
  const [booting, setBooting] = useState(true); // السبلاش ظاهرة
  const [bootReady, setBootReady] = useState(false); // انتهى الإقلاع → تبدأ السبلاش بالتلاشي
  const [mustUpdate, setMustUpdate] = useState(false); // نسخة لم تعد مدعومة → قفل بشاشة التحديث
  const [locked, setLocked] = useState(false); // حساب موقوف لاستخدام غير آمن → شاشة الإيقاف
  // حماية السيرفر: محتوى غير آمن (تنبيه، ولم يُنفَّذ الطلب) أو حساب موقوف (شاشة الإيقاف)
  useEffect(
    () =>
      onSecurity((e) => {
        if (e.kind === "locked") setLocked(true);
        else if (e.strikes) Alert.alert(tr("security.askWarnTitle"), tr("security.askWarnBody").replace("{n}", String(Math.min(e.strikes, 3))));
        else Alert.alert(tr("security.unsafeTitle"), tr("security.unsafeBody"));
      }),
    []
  );
  useEffect(() => {
    const off = onUpdateRequired(() => setMustUpdate(true));
    void checkMinVersion();
    // للمالكة فقط: رفع الموسيقى القديمة المحفوظة في الجوال للسيرفر (إنقاذها)
    void isOwner().then((own) => (own ? rescueCachedMusic() : undefined)).catch(() => {});
    // حفظ صوت كتاب كان جاريًا قبل إغلاق التطبيق → يكمل تلقائيًا من حيث وقف
    setTimeout(() => void resumeBookAudioIfRunning(), 4000);
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    // التطبيق عموديّ افتراضيًا؛ نسمح بالعرض (landscape) فقط داخل عدسة القارئ.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    // بطاقة قراءة متبقية من تشغيل سابق أُغلق فيه التطبيق → نزيلها (لا قراءة الآن)
    closeReadingCard();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // تحديث هوائي جديد؟ يُطبَّق الآن أثناء السبلاش (وإلا كان يتأخر فتحتين)
        await applyUpdateOnLaunch();
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
        if (authed && (await accountLocked())) setLocked(true);
      } finally {
        // السبلاش تتلاشى بنفسها بعد حدّ أدنى قصير (انظر AnimatedSplash)
        setBootReady(true);
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
          <Stack.Screen name="glossary" />
          <Stack.Screen name="words" />
          {/* «بحث وأوامر» تُفتح كورقة من الأسفل فوق الشاشة الحالية */}
          <Stack.Screen name="command" options={{ presentation: "modal" }} />
          <Stack.Screen name="voice" options={{ presentation: "fullScreenModal", animation: "fade" }} />
          <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        </Stack>
        <FeedbackHost />
        {mustUpdate ? <UpdateRequired /> : null}
        {locked ? <AccountLocked onSignedOut={() => { setLocked(false); router.replace("/auth"); }} /> : null}
        {booting ? <AnimatedSplash ready={bootReady} onHidden={() => setBooting(false)} /> : null}
      </SafeAreaProvider>
      </ThemeProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
