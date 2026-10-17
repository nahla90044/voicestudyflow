// components/brand/upgrade-banner.tsx
// بطاقة «الاشتراكات» في أعلى الصفحة الرئيسية للخطة المجانية: الطريق الأوضح لصفحة الشراء.
// (رفضت أبل مرتين بـ 2.1(b) لأن المراجع لم يجد المشتريات حين كانت داخل الملف الشخصي فقط)
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDir, useI18n } from "../../lib/i18n";
import { getPlan, requestPaywall } from "../../lib/plan";
import { purchasesAvailable } from "../../lib/purchases";

export function UpgradeBanner() {
  const { t } = useI18n();
  const dir = useDir();
  const [show, setShow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!purchasesAvailable()) return;
      getPlan()
        .then((p) => on && setShow(p === "free"))
        .catch(() => on && setShow(true)); // تعذّر معرفة الخطة → نُظهر الطريق للشراء
      return () => {
        on = false;
      };
    }, [])
  );

  if (!show) return null;
  return (
    <Pressable
      onPress={() => requestPaywall("upgrade", true)}
      accessibilityRole="button"
      accessibilityLabel={t("home.upgrade.title")}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.9 : 1 }]}
    >
      <LinearGradient colors={["#F6C34A", "#E8913A"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.card, { flexDirection: dir.row }]}>
        <View style={styles.icon}>
          <Ionicons name="diamond" size={22} color="#2A1E00" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { textAlign: dir.textAlign }]}>{t("home.upgrade.title")}</Text>
          <Text style={[styles.sub, { textAlign: dir.textAlign }]}>{t("home.upgrade.sub")}</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaTxt}>{t("sub.upgrade")}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: { borderRadius: 20, padding: 14, alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.45)", alignItems: "center", justifyContent: "center" },
  title: { color: "#2A1E00", fontSize: 16, fontWeight: "900" },
  sub: { color: "#4A3500", fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  cta: { backgroundColor: "#2A1E00", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  ctaTxt: { color: "#F6C34A", fontSize: 13.5, fontWeight: "900" },
});
