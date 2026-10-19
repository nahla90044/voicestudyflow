// components/brand/account-locked.tsx
// شاشة «الحساب موقوف»: تغطي التطبيق كاملًا عند إيقاف الحساب لاستخدام غير آمن. لا تُغلق؛
// فيها التواصل لطلب المراجعة وتسجيل الخروج فقط.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { signOut } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";

export function AccountLocked({ onSignedOut }: { onSignedOut: () => void }) {
  const { t } = useI18n();
  const { pal } = useScene();
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: pal.bg }]}>
      <View style={[styles.icon, { backgroundColor: pal.dark ? "#3B1D1D" : "#FDECEC" }]}>
        <Ionicons name="shield-half-outline" size={42} color="#C0392B" />
      </View>
      <Text style={[styles.title, { color: pal.ink }]}>{t("security.lockedTitle")}</Text>
      <Text style={[styles.body, { color: pal.dim }]}>{t("security.lockedBody")}</Text>
      <Pressable
        onPress={() => Linking.openURL("mailto:Nahlah@Nahlah.io?subject=VoiceStudyFlow%20account%20review").catch(() => {})}
        style={[styles.btn, { backgroundColor: pal.accent }]}
      >
        <Ionicons name="mail-outline" size={20} color={pal.onAccent} />
        <Text style={[styles.btnTxt, { color: pal.onAccent }]}>{t("security.contact")}</Text>
      </Pressable>
      <Pressable
        onPress={async () => {
          await signOut().catch(() => {});
          onSignedOut();
        }}
        hitSlop={8}
      >
        <Text style={[styles.link, { color: pal.dim }]}>{t("security.signOut")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 210, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  icon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 8 },
  body: { fontSize: 15, lineHeight: 25, textAlign: "center", maxWidth: 380 },
  btn: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, paddingHorizontal: 26, height: 54, borderRadius: 18 },
  btnTxt: { fontSize: 16.5, fontWeight: "800" },
  link: { fontSize: 14.5, fontWeight: "700", marginTop: 6, textDecorationLine: "underline" },
});
