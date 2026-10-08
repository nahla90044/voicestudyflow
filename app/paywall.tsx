// app/paywall.tsx
// شاشة الاشتراك (تصميم 2.0): شهري/سنوي، برو (الأكثر اختيارًا) وبلس، تجربة مجانية إن
// كان للمنتج عرض تجريبي في المتجر. الأسعار من المتجر بعملة المستخدم (لا أرقام مكتوبة).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../components/brand/motion";
import { Gradients, Palette } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { getPlan, invalidatePlan } from "../lib/plan";
import { buy, PRIVACY_URL, restore, storePrice, TERMS_URL, type ProductKey, type StorePrice } from "../lib/purchases";

type Tier = "pro" | "plus";

export default function PaywallScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const { reason, preview } = useLocalSearchParams<{ reason?: string; preview?: string }>();
  // للمعاينة أثناء التطوير فقط: حساب المالكة يُعاد من الشاشة عادةً
  const devPreview = __DEV__ && preview === "1";

  const [yearly, setYearly] = useState(true);
  const [tier, setTier] = useState<Tier>("pro");
  const [prices, setPrices] = useState<Partial<Record<ProductKey, StorePrice | null>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // المالكة لا ترى الاشتراك أبدًا
      if (!devPreview && (await getPlan()) === "owner") return router.back();
      const keys: ProductKey[] = ["pro_month", "pro_year", "plus_month", "plus_year"];
      const got = await Promise.all(keys.map((k) => storePrice(k)));
      setPrices(Object.fromEntries(keys.map((k, i) => [k, got[i]])));
    })();
  }, [router, devPreview]);

  const key = (tr: Tier): ProductKey => `${tr}_${yearly ? "year" : "month"}` as ProductKey;
  const selected = prices[key(tier)];
  const priceText = (tr: Tier) => prices[key(tr)]?.text ?? "…";
  const trialDays = selected?.trialDays ?? 0;
  const loaded = Object.keys(prices).length > 0;
  const unavailable = loaded && !selected;

  async function onBuy() {
    setBusy(true);
    const r = await buy(key(tier));
    setBusy(false);
    if (r === "ok") {
      invalidatePlan();
      Alert.alert(t("pay.thanksTitle"), t("pay.thanksBody"));
      router.back();
    } else if (r === "failed" || r === "unavailable") {
      Alert.alert(t("pay.failTitle"), t("pay.failBody"));
    }
  }

  async function onRestore() {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    invalidatePlan();
    Alert.alert(ok ? t("pay.restoredTitle") : t("pay.noRestoreTitle"), ok ? t("pay.restoredBody") : t("pay.noRestoreBody"));
    if (ok) router.back();
  }

  const headline = reason === "voice" ? t("pay.reason.voice") : reason === "ai" ? t("pay.reason.ai") : reason === "books" ? t("pay.reason.books") : reason === "voiceAsk" ? t("pay.reason.voiceAsk") : "";

  const Feat = ({ text }: { text: string }) => (
    <View style={[styles.feat, { flexDirection: dir.row }]}>
      <Ionicons name="checkmark" size={16} color="#6CF3C5" />
      <Text style={[styles.featTxt, { textAlign: dir.textAlign }]}>{text}</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={["rgba(124,108,255,0.40)", "rgba(63,208,255,0.10)", "rgba(7,8,13,0)"]} style={styles.glow} />
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 10 }]} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: dir.row }}>
          <PressableScale onPress={() => router.back()} style={styles.ghost}>
            <Ionicons name="close" size={18} color={Palette.text} accessibilityLabel={t("common.close")} />
          </PressableScale>
        </View>

        {!!headline && <Text style={[styles.reason, { textAlign: dir.textAlign }]}>{headline}</Text>}
        <Text style={[styles.title, { textAlign: dir.textAlign }]}>
          {t("pay.title1")}
          {"\n"}
          <Text style={styles.titleAccent}>{t("pay.title2")}</Text>
        </Text>
        <Text style={[styles.sub, { textAlign: dir.textAlign }]}>{t("pay.sub")}</Text>

        <View style={[styles.seg, { flexDirection: dir.row }]}>
          <Pressable onPress={() => setYearly(false)} style={[styles.segItem, !yearly && styles.segOn]}>
            <Text style={[styles.segTxt, !yearly && styles.segTxtOn]}>{t("pay.monthly")}</Text>
          </Pressable>
          <Pressable onPress={() => setYearly(true)} style={[styles.segItem, yearly && styles.segOn]}>
            <Text style={[styles.segTxt, yearly && styles.segTxtOn]}>{t("pay.yearly")}</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => setTier("pro")} style={[styles.plan, styles.planPro, tier === "pro" && styles.planOn]}>
          <View style={[styles.planHead, { flexDirection: dir.row }]}>
            <View style={[{ flexDirection: dir.row, alignItems: "center", gap: 8 }]}>
              <Text style={styles.planName}>{t("pay.pro")}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{t("pay.popular")}</Text>
              </View>
            </View>
            <Text style={styles.price}>
              {priceText("pro")}
              <Text style={styles.per}> / {yearly ? t("pay.year") : t("pay.month")}</Text>
            </Text>
          </View>
          <Feat text={t("pay.pro.f1")} />
          <Feat text={t("pay.pro.f2")} />
          <Feat text={t("pay.pro.f3")} />
        </Pressable>

        <Pressable onPress={() => setTier("plus")} style={[styles.plan, tier === "plus" && styles.planOn]}>
          <View style={[styles.planHead, { flexDirection: dir.row }]}>
            <Text style={styles.planName}>{t("pay.plus")}</Text>
            <Text style={styles.price}>
              {priceText("plus")}
              <Text style={styles.per}> / {yearly ? t("pay.year") : t("pay.month")}</Text>
            </Text>
          </View>
          <Feat text={t("pay.plus.f1")} />
          <Feat text={t("pay.plus.f2")} />
        </Pressable>
        <View style={{ height: 170 }} />
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <PressableScale onPress={onBuy} disabled={busy || !selected} style={{ alignSelf: "stretch" }}>
          <LinearGradient colors={Gradients.neon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cta, (busy || !selected) && { opacity: 0.55 }]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaTxt}>
                {unavailable ? t("pay.unavailable") : trialDays > 0 ? t("pay.trial", { n: trialDays }) : t("pay.subscribe")}
              </Text>
            )}
          </LinearGradient>
        </PressableScale>
        <Text style={styles.foot}>
          {t("pay.cancelAnytime")}
          {selected
            ? " · " + (trialDays > 0 ? t("pay.afterTrial", { price: selected.text }) : yearly ? t("pay.renewYear") : t("pay.renewMonth"))
            : ""}
        </Text>
        <View style={[styles.links, { flexDirection: dir.row }]}>
          <Pressable onPress={onRestore} hitSlop={6}>
            <Text style={styles.link}>{t("pay.restore")}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={6}>
            <Text style={styles.link}>{t("pay.terms")}</Text>
          </Pressable>
          {!!PRIVACY_URL && (
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={6}>
              <Text style={styles.link}>{t("pay.privacy")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#07080D" },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
  body: { paddingHorizontal: 18, gap: 14 },
  ghost: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  reason: { color: "#FFB38A", fontSize: 13.5, fontWeight: "700" },
  title: { color: Palette.text, fontSize: 30, fontWeight: "800", lineHeight: 42 },
  titleAccent: { color: "#7FD8FF" },
  sub: { color: "#A3A9BE", fontSize: 14, lineHeight: 23, marginTop: -4 },
  seg: { padding: 4, borderRadius: 16, backgroundColor: "#10121B", gap: 4 },
  segItem: { flex: 1, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: "#262A3D" },
  segTxt: { color: "#8E95AB", fontSize: 13.5, fontWeight: "600" },
  segTxtOn: { color: Palette.text },
  plan: { padding: 16, borderRadius: 24, backgroundColor: "#10121B", borderWidth: 2, borderColor: "rgba(255,255,255,0.07)", gap: 9 },
  planPro: { backgroundColor: "rgba(124,108,255,0.14)" },
  planOn: { borderColor: "#B9AFFF" },
  planHead: { alignItems: "center", justifyContent: "space-between" },
  planName: { color: Palette.text, fontSize: 19, fontWeight: "800" },
  badge: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: "#F3F4F8" },
  badgeTxt: { color: "#07080D", fontSize: 11, fontWeight: "800" },
  price: { color: Palette.text, fontSize: 19, fontWeight: "800" },
  per: { color: "#8E95AB", fontSize: 12, fontWeight: "500" },
  feat: { alignItems: "center", gap: 8 },
  featTxt: { flex: 1, color: "#C4C9D8", fontSize: 13.5, lineHeight: 21 },
  bottom: { position: "absolute", left: 18, right: 18, bottom: 0, alignItems: "center", gap: 10, paddingTop: 12, backgroundColor: "rgba(7,8,13,0.96)" },
  cta: { height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: "#fff", fontSize: 17, fontWeight: "800" },
  foot: { color: "#8E95AB", fontSize: 12, textAlign: "center" },
  links: { gap: 16 },
  link: { color: "#B9AFFF", fontSize: 12 },
});
