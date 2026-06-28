// components/brand/app-drawer.tsx
// قائمة جانبية (☰) تنفتح من اليمين، فيها: الإعدادات، الأرشيف.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Palette, Radius, Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { BrandMark } from "./logo";

type Item = { icon: keyof typeof Ionicons.glyphMap; labelKey: string; route: "/more" | "/explore" | "/pomodoro" | "/help" | "/auth"; color: string };

const ITEMS: Item[] = [
  { icon: "person-circle", labelKey: "drawer.account", route: "/auth", color: Palette.neonBlue },
  { icon: "timer", labelKey: "drawer.focusTimer", route: "/pomodoro", color: Palette.neonCyan },
  { icon: "settings", labelKey: "drawer.settings", route: "/more", color: Palette.neonViolet },
  { icon: "file-tray-full", labelKey: "drawer.archive", route: "/explore", color: Palette.neonPink },
  { icon: "help-circle", labelKey: "drawer.help", route: "/help", color: Palette.neonCyan },
];

export function AppDrawer({ tint = Palette.text }: { tint?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  function go(route: Item["route"]) {
    setOpen(false);
    router.push(route);
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.trigger} hitSlop={8}>
        <Ionicons name="menu" size={22} color={tint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1 }}>
          {/* خلفية معتمة — اضغط للإغلاق */}
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={() => setOpen(false)} />

          {/* اللوحة على اليمين */}
          <View style={[styles.panel, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]}>
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

            <View style={{ gap: 10, marginTop: Spacing.xl }}>
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

            <View style={{ flex: 1 }} />
            <Text style={styles.footer}>{t("drawer.credit", { name: "Nahla" })}</Text>
            <Text style={styles.footerMail}>Nahlah@Nahlah.io</Text>
            <Text style={styles.madeIn}>{t("drawer.madeIn")}</Text>
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
  footer: { color: Palette.textDim, fontSize: 12, textAlign: "center", marginBottom: 2 },
  footerMail: { color: Palette.neonCyan, fontSize: 12, textAlign: "center", marginBottom: 4, fontWeight: "700" },
  madeIn: { color: Palette.textDim, fontSize: 12, textAlign: "center", marginBottom: Spacing.sm, fontWeight: "800" },
});
