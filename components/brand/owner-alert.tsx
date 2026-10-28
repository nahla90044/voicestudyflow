// components/brand/owner-alert.tsx
// تنبيه المالكة في الرئيسية (٢٨ أكتوبر: نفد رصيد الذكاء مرتين ولم تعرف إلا من التطبيق): يظهر لحساب المالكة وحده
// حين تتوقف خدمة الذكاء خلال آخر ساعة، أو يتجاوز صرف اليوم الحد (owner_alerts على السيرفر). الضغط يفتح صفحة الفوترة.
// ويسجّل رمز الإشعارات الفورية لجهازها (مرة لكل تشغيل) فيصلها التنبيه والتطبيق مغلق (ops-alert).
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { isOwner } from "../../lib/auth";
import { useDir, useI18n } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";

type Alerts = { ai_down_at: string | null; spend_today: number; spend_limit: number };
const BILLING = "https://platform.claude.com/settings/billing";
let registered = false;

async function registerPush(): Promise<void> {
  if (registered) return;
  registered = true;
  try {
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (perm.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (token) await supabase.rpc("register_owner_push", { p_token: token });
  } catch {
    registered = false; // يُعاد في التشغيل التالي
  }
}

export function OwnerAlertCard() {
  const { t } = useI18n();
  const dir = useDir();
  const [a, setA] = useState<Alerts | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      (async () => {
        if (!(await isOwner().catch(() => false))) return;
        void registerPush();
        const { data } = await supabase.rpc("owner_alerts");
        if (on) setA((data as Alerts | null) ?? null);
      })().catch(() => {});
      return () => {
        on = false;
      };
    }, [])
  );

  if (!a) return null;
  const down = !!a.ai_down_at;
  const over = Number(a.spend_today) > Number(a.spend_limit);
  if (!down && !over) return null;
  return (
    <Pressable onPress={() => void Linking.openURL(BILLING)} style={({ pressed }) => [styles.card, { flexDirection: dir.row, opacity: pressed ? 0.85 : 1 }]}>
      <Ionicons name={down ? "warning" : "cash-outline"} size={24} color="#B42318" />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.title, { textAlign: dir.textAlign }]}>{down ? t("owner.alert.downTitle") : t("owner.alert.spendTitle")}</Text>
        <Text style={[styles.body, { textAlign: dir.textAlign }]}>
          {down ? t("owner.alert.downBody") : t("owner.alert.spendBody", { n: a.spend_today, limit: a.spend_limit })}
        </Text>
      </View>
      <Ionicons name="open-outline" size={18} color="#B42318" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: "#F04438", backgroundColor: "#FEF3F2", alignItems: "center", gap: 12 },
  title: { color: "#912018", fontSize: 15.5, fontWeight: "900" },
  body: { color: "#7A271A", fontSize: 13, fontWeight: "600", lineHeight: 20 },
});
