// app/onboarding.tsx
// الجولة التعريفية (تصميم 2.0): أربع شاشات بمشاهد متحرّكة من الواجهة الحقيقية.
// تظهر مرة واحدة بعد التسجيل (وبعد تحديث 2.0 للمستخدمين الحاليين)، ومتاحة من المساعدة.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TourPager } from "../components/brand/tour-pager";
import { useI18n } from "../lib/i18n";

// v2: الجولة الجديدة تظهر مرة لكل المستخدمين بعد التحديث
export const ONBOARDING_KEY = "vsf_onboarded_v2";

export default function Onboarding() {
  const router = useRouter();
  const { t } = useI18n();

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={["rgba(124,108,255,0.30)", "rgba(7,8,13,0)"]} style={styles.glow} />
      <SafeAreaView style={{ flex: 1 }}>
        <TourPager onDone={finish} doneLabel={t("onboarding.start")} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#07080D" },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
});
