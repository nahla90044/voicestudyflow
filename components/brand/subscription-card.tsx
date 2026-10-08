// components/brand/subscription-card.tsx
// بطاقة الاشتراك في الملف الشخصي: الخطة الحالية، استهلاك الشهر، وترقية/إدارة/استعادة.
// للمالكة: «كل المزايا مجانًا» بلا أي زر شراء. وبلا متجر مفعّل: الخطة والاستهلاك فقط.
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { getPlan, getUsage, invalidatePlan, LIMITS, requestPaywall, type Plan, type Usage } from "../../lib/plan";
import { MANAGE_URL, purchasesAvailable, restore } from "../../lib/purchases";

export function SubscriptionCard() {
  const { t } = useI18n();
  const dir = useDir();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getPlan(true), getUsage()]).then(([p, u]) => {
        if (!on) return;
        setPlan(p);
        setUsage(u);
      });
      return () => {
        on = false;
      };
    }, [])
  );

  if (!plan) return null;
  const limits = plan === "owner" ? null : LIMITS[plan];
  const store = purchasesAvailable();

  return (
    <View style={styles.card}>
      <Text style={[styles.plan, { textAlign: dir.textAlign }]}>{t(`sub.plan.${plan}`)}</Text>
      {limits && usage && (
        <>
          <Bar label={t("sub.voice", { used: Math.min(usage.voiceMin, limits.voiceMin), limit: limits.voiceMin })} frac={usage.voiceMin / limits.voiceMin} />
          <Bar label={t("sub.ai", { used: Math.min(usage.ai, limits.ai), limit: limits.ai })} frac={usage.ai / limits.ai} />
        </>
      )}
      {store && plan !== "owner" && (
        <View style={[styles.row, { flexDirection: dir.row }]}>
          {plan !== "pro" && (
            <Pressable onPress={() => requestPaywall("upgrade", true)} style={[styles.btn, styles.btnMain]}>
              <Text style={styles.btnMainTxt}>{t("sub.upgrade")}</Text>
            </Pressable>
          )}
          {plan !== "free" && (
            <Pressable onPress={() => Linking.openURL(MANAGE_URL)} style={styles.btn}>
              <Text style={styles.btnTxt}>{t("sub.manage")}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={async () => {
              const ok = await restore();
              invalidatePlan();
              setPlan(await getPlan(true));
              Alert.alert(ok ? t("pay.restoredTitle") : t("pay.noRestoreTitle"), ok ? t("pay.restoredBody") : t("pay.noRestoreBody"));
            }}
            style={styles.btn}
          >
            <Text style={styles.btnTxt}>{t("pay.restore")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Bar({ label, frac }: { label: string; frac: number }) {
  const dir = useDir();
  const f = Math.max(0.02, Math.min(1, frac || 0));
  const color = frac >= 1 ? "#FF6B81" : frac >= 0.8 ? "#FFB38A" : "#6CF3C5";
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { textAlign: dir.textAlign }]}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${f * 100}%`, backgroundColor: color }, dir.isRTL ? { alignSelf: "flex-end" } : null]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    borderRadius: Radius.xl,
    backgroundColor: "rgba(124,108,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.30)",
  },
  plan: { color: Palette.text, fontSize: 17, fontWeight: "800" },
  label: { color: Palette.textMuted, fontSize: 12.5 },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  row: { flexWrap: "wrap", gap: 8, marginTop: 2 },
  btn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" },
  btnMain: { backgroundColor: "#F3F4F8" },
  btnTxt: { color: Palette.text, fontSize: 13, fontWeight: "700" },
  btnMainTxt: { color: "#07080D", fontSize: 13, fontWeight: "800" },
});
