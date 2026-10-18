// components/brand/app-drawer.tsx
// قائمة جانبية (☰): الملف الشخصي، الخطة، مؤقت التركيز، الإعدادات، الأرشيف، المساعدة.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Palette, Radius, Spacing } from "../../constants/design";
import { signOut } from "../../lib/auth";
import { useDir, useI18n } from "../../lib/i18n";
import { requestPaywall } from "../../lib/plan";
import { purchasesAvailable } from "../../lib/purchases";
import { openStoreReview } from "../../lib/review";
import { LanguageSwitcher } from "./language-switcher";
import { BrandMark } from "./logo";

type Route = "/more" | "/explore" | "/pomodoro" | "/help" | "/profile" | "/calendar";
type Item = { icon: keyof typeof Ionicons.glyphMap; labelKey: string; route: Route; color: string };

const ITEMS: Item[] = [
  { icon: "person-circle", labelKey: "drawer.profile", route: "/profile", color: Palette.neonBlue },
  { icon: "calendar", labelKey: "tabs.plan", route: "/calendar", color: Palette.neonCyan },
  { icon: "timer", labelKey: "drawer.focusTimer", route: "/pomodoro", color: Palette.success },
  { icon: "settings", labelKey: "drawer.settings", route: "/more", color: Palette.neonViolet },
  { icon: "file-tray-full", labelKey: "drawer.archive", route: "/explore", color: Palette.neonPink },
  { icon: "help-circle", labelKey: "drawer.help", route: "/help", color: Palette.neonCyan },
];

export function AppDrawer({ tint = Palette.text, light = false }: { tint?: string; light?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // فتح شاشة منبثقة (الاشتراك) أثناء إغلاق القائمة يتجاهله iOS بصمت، فيبدو الزر لا يعمل.
  // نؤجّل الفتح حتى تُغلق القائمة تمامًا (onDismiss)، ومؤقّت احتياطي إن لم يُستدعَ.
  const afterClose = useRef<(() => void) | null>(null);
  function closeThen(fn: () => void) {
    afterClose.current = fn;
    setOpen(false);
    setTimeout(runAfterClose, 650);
  }
  function runAfterClose() {
    const fn = afterClose.current;
    afterClose.current = null;
    fn?.();
  }

  function go(route: Route) {
    setOpen(false);
    router.push(route);
  }

  function onSignOut() {
    Alert.alert(t("profile.signOut"), t("profile.signOutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.signOut"),
        style: "destructive",
        onPress: async () => {
          setOpen(false);
          await signOut().catch(() => {});
          router.replace("/auth");
        },
      },
    ]);
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.trigger, light && styles.triggerLight]} hitSlop={8}>
        <Ionicons name="menu" size={22} color={tint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} onDismiss={runAfterClose}>
        <View style={{ flex: 1 }}>
          {/* خلفية معتمة — اضغط للإغلاق */}
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={() => setOpen(false)} />

          {/* اللوحة على اليمين */}
          <View style={[styles.panel, { paddingTop: insets.top + 14 }]}>
            {/* محتوى قابل للتمرير: على الشاشات القصيرة (أو مع خط كبير) كان زر الخروج يُقصّ ولا يمكن الوصول إليه */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 14 }}
              showsVerticalScrollIndicator={false}
            >
            <View style={[styles.head, { flexDirection: dir.row }]}>
              <BrandMark size={42} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.appName, { textAlign: dir.textAlign }]}>VoiceStudyFlow</Text>
                <Text style={[styles.appSub, { textAlign: dir.textAlign }]}>{t("drawer.subtitle")}</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={Palette.textMuted} />
              </Pressable>
            </View>

            {/* اللغة — تبديل سريع بدون الدخول للإعدادات */}
            <View style={styles.langWrap}>
              <LanguageSwitcher />
            </View>

            {/* الاشتراكات — أول عنصر وبلون ذهبي: مراجع أبل لم يجد المشتريات حين كانت داخل الملف الشخصي فقط */}
            {purchasesAvailable() ? (
              <Pressable
                onPress={() => closeThen(() => requestPaywall("upgrade", true))}
                accessibilityRole="button"
                accessibilityLabel={t("drawer.subscriptions")}
                style={[styles.item, styles.subItem, { flexDirection: dir.row, marginTop: Spacing.lg }]}
              >
                <View style={[styles.itemIcon, { backgroundColor: "#F6C34A", borderColor: "#F6C34A" }]}>
                  <Ionicons name="diamond" size={20} color="#2A1E00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTxt, { textAlign: dir.textAlign, flex: 0 }]}>{t("drawer.subscriptions")}</Text>
                  <Text style={[styles.subHint, { textAlign: dir.textAlign }]}>{t("drawer.subscriptionsHint")}</Text>
                </View>
                <Ionicons name="chevron-back" size={18} color="#F6C34A" />
              </Pressable>
            ) : null}

            <View style={{ gap: 10, marginTop: Spacing.lg }}>
              {ITEMS.map((it) => (
                <Pressable key={it.route} onPress={() => go(it.route)} style={[styles.item, { flexDirection: dir.row }]}>
                  <View style={[styles.itemIcon, { backgroundColor: it.color + "22", borderColor: it.color + "55" }]}>
                    <Ionicons name={it.icon} size={20} color={it.color} />
                  </View>
                  <Text style={[styles.itemTxt, { textAlign: dir.textAlign }]}>{t(it.labelKey)}</Text>
                  <Ionicons name="chevron-back" size={18} color={Palette.textDim} />
                </Pressable>
              ))}
            </View>

            {/* تقييم التطبيق في App Store */}
            <Pressable
              onPress={() => {
                setOpen(false);
                void openStoreReview();
              }}
              style={[styles.item, { flexDirection: dir.row, marginTop: 10 }]}
            >
              <View style={[styles.itemIcon, { backgroundColor: "#F6C34A22", borderColor: "#F6C34A55" }]}>
                <Ionicons name="star" size={20} color="#F6C34A" />
              </View>
              <Text style={[styles.itemTxt, { textAlign: dir.textAlign }]}>{t("rate.button")}</Text>
              <Ionicons name="chevron-back" size={18} color={Palette.textDim} />
            </Pressable>

            {/* يدفع زر الخروج للأسفل حين يتّسع المكان، ولا يقصّه حين يضيق */}
            <View style={{ flex: 1, minHeight: 20 }} />

            {/* تسجيل الخروج — واضح وسريع */}
            <Pressable onPress={onSignOut} style={[styles.signOut, { flexDirection: dir.row }]}>
              <Ionicons name="log-out-outline" size={20} color={Palette.danger} />
              <Text style={[styles.signOutTxt, { textAlign: dir.textAlign }]}>{t("profile.signOut")}</Text>
            </Pressable>

            <Text style={styles.footerMail}>Nahlah@Nahlah.io</Text>
            <Text style={styles.madeIn}>{t("drawer.madeIn")}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  // فوق مشهد فاتح (حديقة الصباح): زر أبيض شبه معتم بدل الزجاج الداكن
  triggerLight: { backgroundColor: "rgba(255,255,255,0.75)", borderColor: "transparent", borderRadius: 20 },
  backdrop: { backgroundColor: "rgba(0,0,0,0.6)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: "80%",
    maxWidth: 330,
    backgroundColor: Palette.bgElevated,
    borderLeftWidth: 1,
    borderLeftColor: Palette.border,
    paddingHorizontal: Spacing.lg,
  },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  appName: { color: Palette.text, fontSize: 18, fontWeight: "900", textAlign: "right" },
  appSub: { color: Palette.textDim, fontSize: 12, textAlign: "right", marginTop: 2 },
  subCard: {
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
  },
  subLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  subPlan: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 1 },
  langWrap: { marginTop: Spacing.lg },
  subItem: { borderWidth: 1.5, borderColor: "#F6C34A", backgroundColor: "#F6C34A1A" },
  subHint: { color: Palette.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  item: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTxt: { flex: 1, color: Palette.text, fontWeight: "900", fontSize: 16, textAlign: "right" },
  signOut: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.danger + "18",
    borderWidth: 1,
    borderColor: Palette.danger + "55",
    marginBottom: Spacing.md,
  },
  signOutTxt: { color: Palette.danger, fontWeight: "900", fontSize: 16 },
  footer: { color: Palette.textDim, fontSize: 12, textAlign: "center", marginBottom: 2 },
  footerMail: { color: Palette.neonCyan, fontSize: 12, textAlign: "center", marginBottom: 4, fontWeight: "700" },
  madeIn: { color: Palette.textDim, fontSize: 12, textAlign: "center", marginBottom: Spacing.sm, fontWeight: "800" },
});
