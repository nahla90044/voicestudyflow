// app/paywall.tsx
// شاشة الاشتراك (تصميم «العالم الحيّ»): رأس بمشهد اليوم، شهري/سنوي، برو (الأكثر اختيارًا)
// وبلس، تجربة مجانية إن كان للمنتج عرض تجريبي في المتجر. الأسعار من المتجر بعملة
// المستخدم (لا أرقام مكتوبة). الألوان كلها من لوحة المشهد فتُقرأ على الحديقة الفاتحة والمشاهد الداكنة.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../components/brand/motion";
import { SceneArt } from "../components/brand/scene-art";
import { SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { isAppleAccount, signInWithApple, signOut } from "../lib/auth";
import { useDir, useI18n } from "../lib/i18n";
import { getPlan, invalidatePlan, PAGE_PACK } from "../lib/plan";
import { buy, buyPages, pagesPrice, PRIVACY_URL, restore, storePrice, TERMS_URL, type ProductKey, type StorePrice } from "../lib/purchases";
import { useScene } from "../lib/scene";
import { sceneGrowth } from "../lib/sceneCore";

type Tier = "premium" | "pro" | "plus";

const HERO_H = 260;
// نقطة الارتكاز في كل رسم (بإحداثيات 390×470) — كما في SceneBanner
const FOCUS = { garden: 270, study: 250, sky: 215 } as const;

export default function PaywallScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { id, pal } = useScene();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { reason, preview } = useLocalSearchParams<{ reason?: string; preview?: string }>();
  // للمعاينة أثناء التطوير فقط: حساب المالكة يُعاد من الشاشة عادةً
  const devPreview = __DEV__ && preview === "1";

  // شهري فقط حتى ٢٠٢٧ (قرار ١٠ أكتوبر): تكلفة الصوت قد تتغيّر، والشهري يسمح بتعديل السعر
  // بلا التزام سنوي بسعر قديم. المنتجات السنوية باقية في الكود لاستعادة أي اشتراك قديم فقط.
  const yearly = false;
  const [tier, setTier] = useState<Tier>("pro");
  const [prices, setPrices] = useState<Partial<Record<ProductKey, StorePrice | null>>>({});
  const [busy, setBusy] = useState(false);
  // التجربة المجانية مشروطة بحساب Apple: نعرض الدعوة لمن هو مجاني بلا Apple
  const [needApple, setNeedApple] = useState(false);
  useEffect(() => {
    void (async () => {
      if ((await getPlan()) === "free" && !(await isAppleAccount())) setNeedApple(true);
    })();
  }, []);

  function onAppleTrial() {
    Alert.alert(t("trial.apple.confirmTitle"), t("trial.apple.confirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("trial.apple.cta"),
        onPress: async () => {
          try {
            await signOut();
            const r = await signInWithApple();
            if (r === "ok") {
              invalidatePlan();
              router.replace("/");
            } else router.replace("/auth");
          } catch {
            Alert.alert(t("pay.failTitle"), t("trial.apple.failed"));
            router.replace("/auth");
          }
        },
      },
    ]);
  }
  const [packPrice, setPackPrice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // المالكة لا ترى الاشتراك أبدًا
      if (!devPreview && (await getPlan()) === "owner") return router.back();
      const keys: ProductKey[] = ["premium_month", "pro_month", "plus_month"];
      const got = await Promise.all(keys.map((k) => storePrice(k)));
      // معاينة التطوير (لصور المراجعة فقط): الأسعار المسجّلة في المتجر بدل «…»
      const demo: Record<ProductKey, StorePrice> = {
        premium_month: { text: "59.99 SAR", amount: 59.99, perMonth: null, trialDays: 7 },
        premium_year: { text: "599.00 SAR", amount: 599, perMonth: "49.92 SAR", trialDays: 7 },
        pro_month: { text: "39.99 SAR", amount: 39.99, perMonth: null, trialDays: 7 },
        pro_year: { text: "399.00 SAR", amount: 399, perMonth: "33.25 SAR", trialDays: 7 },
        plus_month: { text: "19.99 SAR", amount: 19.99, perMonth: null, trialDays: 7 },
        plus_year: { text: "199.00 SAR", amount: 199, perMonth: "16.58 SAR", trialDays: 7 },
      };
      setPrices(Object.fromEntries(keys.map((k, i) => [k, got[i] ?? (devPreview ? demo[k] : null)])));
      // معاينة التطوير (لصورة المراجعة): سعر الباقة المسجّل في المتجر
      setPackPrice((await pagesPrice()) ?? (devPreview ? "6.99 SAR" : null));
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

  async function onBuyPages() {
    setBusy(true);
    const r = await buyPages();
    setBusy(false);
    if (r === "ok") {
      invalidatePlan();
      Alert.alert(t("sub.pagesAddedTitle"), t("sub.pagesAddedBody", { n: PAGE_PACK.pages }));
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

  // رسم المشهد بارتفاعه الكامل مُزاحًا ليظهر قلبه (الشجرة/الرف/القمر) في الرأس
  const heroH = HERO_H + insets.top;
  const fullH = (width * 470) / 390;
  const growth = sceneGrowth(id, { pagesToday: 3, unitsDone: 2, unitCount: 6, readiness: 50 });
  const artTop = Math.min(0, Math.max(heroH - fullH, heroH * 0.45 - FOCUS[id] * (fullH / 470)));

  const Feat = ({ text }: { text: string }) => (
    <View style={[styles.feat, { flexDirection: dir.row }]}>
      <View style={[styles.featDot, { backgroundColor: pal.soft }]}>
        <Ionicons name="checkmark" size={14} color={pal.accent} />
      </View>
      <Text style={[styles.featTxt, { color: pal.ink, textAlign: dir.textAlign }]}>{text}</Text>
    </View>
  );

  const PlanCard = ({ tr, children }: { tr: Tier; children: React.ReactNode }) => {
    const on = tier === tr;
    const p = prices[key(tr)];
    return (
      <Pressable onPress={() => setTier(tr)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
        <SceneCard style={[styles.plan, on ? { borderWidth: 2, borderColor: pal.accent, backgroundColor: pal.soft } : { borderWidth: 2, borderColor: pal.cardBorder }]}>
          <View style={[styles.planHead, { flexDirection: dir.row }]}>
            <View style={{ flexDirection: dir.row, alignItems: "center", gap: 8, flexShrink: 1 }}>
              <View style={[styles.radio, { borderColor: on ? pal.accent : pal.dim }]}>{on && <View style={[styles.radioIn, { backgroundColor: pal.accent }]} />}</View>
              <Text style={[styles.planName, { color: pal.ink }]}>{t(`pay.${tr}`)}</Text>
              {tr === "pro" && (
                <View style={[styles.badge, { backgroundColor: pal.accent }]}>
                  <Text style={[styles.badgeTxt, { color: pal.onAccent }]}>{t("pay.popular")}</Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: dir.isRTL ? "flex-start" : "flex-end" }}>
              <Text style={[styles.price, { color: pal.ink }]}>
                {priceText(tr)}
                <Text style={[styles.per, { color: pal.dim }]}> / {yearly ? t("pay.year") : t("pay.month")}</Text>
              </Text>
              {yearly && !!p?.perMonth && (
                <Text style={[styles.perMonth, { color: pal.dim }]}>
                  ≈ {p.perMonth} / {t("pay.month")}
                </Text>
              )}
            </View>
          </View>
          {!!p && p.trialDays > 0 && (
            <View style={[styles.trialPill, { backgroundColor: pal.soft, borderColor: pal.accent, alignSelf: dir.isRTL ? "flex-end" : "flex-start", flexDirection: dir.row }]}>
              <Ionicons name="gift-outline" size={13} color={pal.accent} />
              <Text style={[styles.trialTxt, { color: pal.accent }]}>{t("pay.trial", { n: p.trialDays })}</Text>
            </View>
          )}
          <View style={[styles.divider, { backgroundColor: pal.track }]} />
          {children}
        </SceneCard>
      </Pressable>
    );
  };

  return (
    <SceneScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* الرأس: مقطع من مشهد اليوم يتلاشى في الخلفية، وفوقه زر الإغلاق والعنوان */}
        <View style={{ height: heroH }}>
          <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: pal.dark ? 0.9 : 1 }]}>
            <View style={{ position: "absolute", left: 0, right: 0, top: artTop }}>
              <SceneArt id={id} growth={growth} width={width} height={fullH} />
            </View>
          </View>
          <LinearGradient colors={[pal.bg + "00", pal.bg + "CC", pal.bg]} locations={[0.3, 0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.heroInner, { paddingTop: insets.top + 6 }]}>
            <View style={{ flexDirection: dir.row }}>
              <PressableScale onPress={() => router.back()}>
                <SceneIconButton>
                  <Ionicons name="close" size={20} color={pal.ink} accessibilityLabel={t("common.close")} />
                </SceneIconButton>
              </PressableScale>
            </View>
            <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]}>
              {t("pay.title1")}
              {"\n"}
              <Text style={{ color: pal.accent }}>{t("pay.title2")}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {needApple && (
            <Pressable onPress={onAppleTrial} accessibilityRole="button">
              <SceneCard style={[styles.appleCard, { flexDirection: dir.row }]}>
                <View style={styles.appleIcon}>
                  <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.appleTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("trial.apple.title")}</Text>
                  <Text style={[styles.appleSub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("trial.apple.sub")}</Text>
                </View>
                <Ionicons name={dir.isRTL ? "chevron-back" : "chevron-forward"} size={18} color={pal.dim} />
              </SceneCard>
            </Pressable>
          )}
          {!!headline && (
            <View style={[styles.reasonBox, { backgroundColor: pal.soft, borderColor: pal.cardBorder, flexDirection: dir.row }]}>
              <Ionicons name="information-circle" size={18} color={pal.accent} />
              <Text style={[styles.reason, { color: pal.ink, textAlign: dir.textAlign }]}>{headline}</Text>
            </View>
          )}
          <Text style={[styles.sub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("pay.sub")}</Text>


          <PlanCard tr="premium">
            <Feat text={t("pay.premium.f1")} />
            <Feat text={t("pay.premium.f2")} />
            <Feat text={t("pay.pro.f3")} />
          </PlanCard>

          <PlanCard tr="pro">
            <Feat text={t("pay.pro.f1")} />
            <Feat text={t("pay.pro.f2")} />
            <Feat text={t("pay.pro.f3")} />
          </PlanCard>

          <PlanCard tr="plus">
            <Feat text={t("pay.plus.f1")} />
            <Feat text={t("pay.plus.f2")} />
          </PlanCard>

          {!!packPrice && (
            <Pressable onPress={onBuyPages} disabled={busy} accessibilityRole="button">
              <SceneCard style={[styles.pack, { flexDirection: dir.row, borderColor: pal.cardBorder }]}>
                <View style={[styles.packIcon, { backgroundColor: pal.soft }]}>
                  <Ionicons name="albums-outline" size={18} color={pal.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.packTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t("pay.pack.title", { n: PAGE_PACK.pages })}</Text>
                  <Text style={[styles.packSub, { color: pal.dim, textAlign: dir.textAlign }]}>{t("pay.pack.sub")}</Text>
                </View>
                <Text style={[styles.packPrice, { color: pal.accent }]}>{packPrice}</Text>
              </SceneCard>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12, backgroundColor: pal.bg, borderTopColor: pal.cardBorder }]}>
        <PressableScale onPress={onBuy} disabled={busy || !selected} style={{ alignSelf: "stretch" }}>
          <View style={[styles.cta, { backgroundColor: pal.accent }, (busy || !selected) && { opacity: 0.55 }]}>
            {busy ? (
              <ActivityIndicator color={pal.onAccent} />
            ) : (
              <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>
                {unavailable ? t("pay.unavailable") : trialDays > 0 ? t("pay.trial", { n: trialDays }) : t("pay.subscribe")}
              </Text>
            )}
          </View>
        </PressableScale>
        <Text style={[styles.foot, { color: pal.dim }]}>
          {t("pay.cancelAnytime")}
          {selected
            ? " · " + (trialDays > 0 ? t("pay.afterTrial", { price: selected.text }) : yearly ? t("pay.renewYear") : t("pay.renewMonth"))
            : ""}
        </Text>
        {trialDays > 0 && <Text style={[styles.foot, { color: pal.dim }]}>{t("pay.trialLimits")}</Text>}
        <View style={[styles.links, { flexDirection: dir.row }]}>
          <Pressable onPress={onRestore} hitSlop={6} accessibilityRole="button">
            <Text style={[styles.link, styles.linkStrong, { color: pal.accent }]}>{t("pay.restore")}</Text>
          </Pressable>
          <Text style={[styles.sep, { color: pal.dim }]}>·</Text>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={6} accessibilityRole="link">
            <Text style={[styles.link, { color: pal.dim }]}>{t("pay.terms")}</Text>
          </Pressable>
          {!!PRIVACY_URL && (
            <>
              <Text style={[styles.sep, { color: pal.dim }]}>·</Text>
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={6} accessibilityRole="link">
                <Text style={[styles.link, { color: pal.dim }]}>{t("pay.privacy")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  appleCard: { alignItems: "center", gap: 12 },
  appleIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  appleTitle: { fontSize: 15.5, fontWeight: "800" },
  appleSub: { fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
  heroInner: { flex: 1, paddingHorizontal: 20, paddingBottom: 10, justifyContent: "space-between" },
  title: { fontSize: 30, fontWeight: "900", lineHeight: 42 },
  body: { paddingHorizontal: 18, gap: 14 },
  reasonBox: { alignItems: "center", gap: 8, padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  reason: { flex: 1, fontSize: 13.5, fontWeight: "700", lineHeight: 21 },
  sub: { fontSize: 14, lineHeight: 23 },
  seg: { padding: 4, gap: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  segItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 999 },
  segTxt: { fontSize: 14, fontWeight: "800" },
  plan: { gap: 10, overflow: "hidden" },
  planHead: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioIn: { width: 10, height: 10, borderRadius: 5 },
  planName: { fontSize: 19, fontWeight: "900" },
  pack: { alignItems: "center", gap: 12, borderWidth: 2 },
  packIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  packTitle: { fontSize: 15.5, fontWeight: "800" },
  packSub: { fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
  packPrice: { fontSize: 16, fontWeight: "900" },
  badge: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: "800" },
  price: { fontSize: 18, fontWeight: "900" },
  per: { fontSize: 12, fontWeight: "600" },
  perMonth: { fontSize: 11.5, fontWeight: "600", marginTop: 2 },
  trialPill: { alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  trialTxt: { fontSize: 12, fontWeight: "800" },
  divider: { height: StyleSheet.hairlineWidth * 2, marginVertical: 2 },
  feat: { alignItems: "center", gap: 10 },
  featDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  featTxt: { flex: 1, fontSize: 13.5, lineHeight: 21, fontWeight: "600" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 10, paddingTop: 12, paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  ctaTxt: { fontSize: 17, fontWeight: "900" },
  foot: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  links: { alignItems: "center", gap: 10 },
  sep: { fontSize: 12 },
  link: { fontSize: 12.5, fontWeight: "600" },
  linkStrong: { fontWeight: "800" },
});
