// components/brand/subscription-card.tsx
// بطاقة الاشتراك في الملف الشخصي: الخطة الحالية، استهلاك الشهر، وترقية/إدارة/استعادة.
// للمالكة: «كل المزايا مجانًا» بلا أي زر شراء. وبلا متجر مفعّل: الخطة والاستهلاك فقط.
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useDir, useI18n } from "../../lib/i18n";
import { getPlan, getUsage, invalidatePlan, LIMITS, PAGE_PACK, requestPaywall, type Plan, type Usage } from "../../lib/plan";
import { buyPages, MANAGE_URL, purchasesAvailable, restore } from "../../lib/purchases";
import { useScene } from "../../lib/scene";
import { SceneCard } from "./scene-screen";

export function SubscriptionCard() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
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
    <SceneCard style={styles.card}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <View style={[styles.icon, { backgroundColor: pal.soft }]}>
          <Ionicons name={plan === "free" ? "leaf-outline" : "sparkles"} size={18} color={pal.accent} />
        </View>
        <Text style={[styles.plan, { color: pal.ink, textAlign: dir.textAlign }]}>{t(`sub.plan.${plan}`)}</Text>
      </View>
      {limits && usage && (
        <>
          <Bar label={t(plan === "free" ? "sub.pagesTrial" : "sub.pages", { used: Math.min(usage.pages, limits.pages), limit: limits.pages })} frac={usage.pages / limits.pages} />
          {limits.premium > 0 && (
            <Bar label={t("sub.premium", { used: Math.min(usage.premium, limits.premium), limit: limits.premium })} frac={usage.premium / limits.premium} />
          )}
          <Bar label={t("sub.ai", { used: Math.min(usage.ai, limits.ai), limit: limits.ai })} frac={usage.ai / limits.ai} />
          {usage.credits > 0 && (
            <Text style={[styles.label, { color: pal.accent, textAlign: dir.textAlign }]}>{t("sub.credits", { n: usage.credits })}</Text>
          )}
        </>
      )}
      {store && plan !== "owner" && (
        <View style={[styles.row, { flexDirection: dir.row }]}>
          {plan !== "premium" && (
            <Pressable onPress={() => requestPaywall("upgrade", true)} style={[styles.btn, { backgroundColor: pal.accent, borderColor: pal.accent }]}>
              <Text style={[styles.btnMainTxt, { color: pal.onAccent }]}>{t("sub.upgrade")}</Text>
            </Pressable>
          )}
          {plan !== "free" && (
            <Pressable
              onPress={async () => {
                const r = await buyPages();
                if (r === "ok") {
                  setUsage(await getUsage());
                  Alert.alert(t("sub.pagesAddedTitle"), t("sub.pagesAddedBody", { n: PAGE_PACK.pages }));
                }
              }}
              style={[styles.btn, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}
            >
              <Text style={[styles.btnTxt, { color: pal.ink }]}>{t("sub.buyPages", { n: PAGE_PACK.pages })}</Text>
            </Pressable>
          )}
          {plan !== "free" && (
            <Pressable onPress={() => Linking.openURL(MANAGE_URL)} style={[styles.btn, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
              <Text style={[styles.btnTxt, { color: pal.ink }]}>{t("sub.manage")}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={async () => {
              const ok = await restore();
              invalidatePlan();
              setPlan(await getPlan(true));
              Alert.alert(ok ? t("pay.restoredTitle") : t("pay.noRestoreTitle"), ok ? t("pay.restoredBody") : t("pay.noRestoreBody"));
            }}
            style={[styles.btn, { backgroundColor: pal.soft, borderColor: pal.cardBorder }]}
          >
            <Text style={[styles.btnTxt, { color: pal.ink }]}>{t("pay.restore")}</Text>
          </Pressable>
        </View>
      )}
    </SceneCard>
  );
}

function Bar({ label, frac }: { label: string; frac: number }) {
  const dir = useDir();
  const { pal } = useScene();
  const f = Math.max(0.02, Math.min(1, frac || 0));
  // نفاد الحصة يُبرز بلون تحذير واضح على الفاتح والداكن؛ غير ذلك لون المشهد
  const color = frac >= 1 ? (pal.dark ? "#FF8A8A" : "#C0392B") : pal.accent;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: pal.dim, textAlign: dir.textAlign }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: pal.track }]}>
        <View style={[styles.fill, { width: `${f * 100}%`, backgroundColor: color }, dir.isRTL ? { alignSelf: "flex-end" } : null]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { alignItems: "center", gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  plan: { flex: 1, fontSize: 17, fontWeight: "900" },
  label: { fontSize: 12.5, fontWeight: "600" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  row: { flexWrap: "wrap", gap: 8, marginTop: 2 },
  btn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  btnTxt: { fontSize: 13, fontWeight: "700" },
  btnMainTxt: { fontSize: 13, fontWeight: "800" },
});
