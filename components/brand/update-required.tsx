// components/brand/update-required.tsx
// شاشة «تحديث مطلوب»: تغطي التطبيق كاملًا بمشهد الوقت ورابط App Store، ولا تُغلق.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { APP_STORE_URL } from "../../lib/appVersion";
import { useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { BrandMark } from "./logo";

export function UpdateRequired() {
  const { t } = useI18n();
  const { pal } = useScene();
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: pal.bg }]}>
      <BrandMark size={88} />
      <Text style={[styles.title, { color: pal.ink }]}>{t("update.title")}</Text>
      <Text style={[styles.body, { color: pal.dim }]}>{t("update.body")}</Text>
      <Pressable onPress={() => Linking.openURL(APP_STORE_URL).catch(() => {})} style={[styles.btn, { backgroundColor: pal.accent }]}>
        <Ionicons name="logo-apple-appstore" size={20} color={pal.onAccent} />
        <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("update.cta")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 200, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { fontSize: 26, fontWeight: "900", textAlign: "center", marginTop: 8 },
  body: { fontSize: 15, lineHeight: 25, textAlign: "center", maxWidth: 360 },
  btn: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, paddingHorizontal: 26, height: 54, borderRadius: 18 },
  btnTxt: { fontSize: 16.5, fontWeight: "800" },
});
