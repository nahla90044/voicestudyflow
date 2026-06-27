// app/paywall.tsx
// شاشة الاشتراك (Paywall) — خطط بعدد الكتب. الدفع الفعلي عبر آبل/قوقل يُربط لاحقًا.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { getCurrentPlan, PLANS, setCurrentPlan, type Plan, type PlanKey } from "../lib/subscription";

export default function PaywallScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState<PlanKey>("free");

  useEffect(() => {
    getCurrentPlan().then(setCurrent);
  }, []);

  function onChoose(plan: Plan) {
    if (plan.key === "free") {
      setCurrentPlan("free").then(() => setCurrent("free"));
      return;
    }
    // الدفع الحقيقي عبر آبل/قوقل يُربط لاحقًا — الآن نعرض رسالة واضحة فقط
    Alert.alert(
      `خطة ${plan.name}`,
      `سيُفعَّل الدفع الآمن عبر آبل وقوقل قريبًا 🌟\nالسعر: ${plan.priceSar} ﷼ شهريًا`,
      [{ text: "تمام", style: "default" }]
    );
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.restore}>استرجاع الشراء</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="sparkles" size={26} color="#fff" />
            </View>
            <Text style={styles.title}>اختاري خطتك</Text>
            <Text style={styles.subtitle}>ادفعي حسب عدد الكتب — وألغي وقت ما تبين</Text>
          </View>

          {PLANS.map((plan) => {
            const isCurrent = plan.key === current;
            const free = plan.key === "free";
            return (
              <View
                key={plan.key}
                style={[
                  styles.card,
                  plan.recommended && styles.cardRecommended,
                  isCurrent && styles.cardCurrent,
                ]}
              >
                {plan.recommended ? (
                  <LinearGradient
                    colors={plan.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.badge}
                  >
                    <Ionicons name="star" size={11} color="#fff" />
                    <Text style={styles.badgeTxt}>الأكثر اختيارًا</Text>
                  </LinearGradient>
                ) : null}

                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planTag}>{plan.tagline}</Text>
                  </View>
                  <LinearGradient colors={plan.gradient} style={styles.planDot}>
                    <Ionicons name="book" size={16} color="#fff" />
                  </LinearGradient>
                </View>

                <View style={styles.priceRow}>
                  {free ? (
                    <Text style={styles.priceFree}>مجاني</Text>
                  ) : (
                    <>
                      <Text style={styles.price}>{plan.priceSar}</Text>
                      <Text style={styles.priceUnit}> ﷼ / شهر</Text>
                    </>
                  )}
                </View>

                <View style={styles.features}>
                  {plan.features.map((f, i) => (
                    <View key={i} style={styles.featRow}>
                      <Ionicons name="checkmark-circle" size={17} color={Palette.neonCyan} />
                      <Text style={styles.featTxt}>{f}</Text>
                    </View>
                  ))}
                </View>

                {isCurrent ? (
                  <View style={styles.currentTag}>
                    <Ionicons name="checkmark-done" size={16} color={Palette.neonCyan} />
                    <Text style={styles.currentTxt}>خطتك الحالية</Text>
                  </View>
                ) : (
                  <Pressable onPress={() => onChoose(plan)}>
                    <LinearGradient
                      colors={free ? ["#2b3346", "#2b3346"] : plan.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cta}
                    >
                      <Text style={styles.ctaTxt}>{free ? "ابدئي مجانًا" : `اشتركي بـ ${plan.name}`}</Text>
                    </LinearGradient>
                  </Pressable>
                )}
              </View>
            );
          })}

          <Text style={styles.note}>
            الدفع الآمن عبر آبل و قوقل · يتجدّد شهريًا · يمكنك الإلغاء في أي وقت.{"\n"}الأسعار تشمل ضريبة القيمة المضافة.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: 6,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  restore: { color: Palette.textDim, fontSize: 13, fontWeight: "700" },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40, gap: 14 },
  hero: { alignItems: "center", gap: 8, marginTop: 8, marginBottom: 6 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.neonViolet,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: Palette.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  subtitle: { color: Palette.textDim, fontSize: 14, fontWeight: "700", textAlign: "center" },

  card: {
    backgroundColor: Palette.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 18,
    gap: 12,
  },
  cardRecommended: { borderColor: Palette.neonViolet, borderWidth: 2 },
  cardCurrent: { borderColor: Palette.neonCyan },
  badge: {
    position: "absolute",
    top: -11,
    alignSelf: "center",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  planName: { color: Palette.text, fontSize: 20, fontWeight: "900", textAlign: "right" },
  planTag: { color: Palette.textDim, fontSize: 13, fontWeight: "700", textAlign: "right" },
  planDot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  priceRow: { flexDirection: "row-reverse", alignItems: "flex-end" },
  price: { color: Palette.text, fontSize: 32, fontWeight: "900" },
  priceUnit: { color: Palette.textDim, fontSize: 14, fontWeight: "800", marginBottom: 6 },
  priceFree: { color: Palette.neonCyan, fontSize: 26, fontWeight: "900" },
  features: { gap: 8 },
  featRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  featTxt: { color: Palette.textMuted, fontSize: 14, fontWeight: "700", textAlign: "right", flex: 1 },
  cta: { borderRadius: Radius.md, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
  currentTag: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: "rgba(34,211,238,0.12)",
  },
  currentTxt: { color: Palette.neonCyan, fontSize: 14, fontWeight: "900" },
  note: { color: Palette.textDim, fontSize: 11.5, fontWeight: "600", textAlign: "center", lineHeight: 18, marginTop: 6 },
});
