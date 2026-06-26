// components/brand/app-drawer.tsx
// قائمة جانبية (☰) تنفتح من اليمين، فيها: الإعدادات، الأرشيف.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Palette, Radius, Spacing } from "../../constants/design";
import { BrandMark } from "./logo";

type Item = { icon: keyof typeof Ionicons.glyphMap; label: string; route: "/more" | "/explore" | "/pomodoro" | "/help"; color: string };

const ITEMS: Item[] = [
  { icon: "timer", label: "مؤقّت التركيز", route: "/pomodoro", color: Palette.neonCyan },
  { icon: "settings", label: "الإعدادات", route: "/more", color: Palette.neonViolet },
  { icon: "file-tray-full", label: "الأرشيف", route: "/explore", color: Palette.neonPink },
  { icon: "help-circle", label: "كيف أستخدم التطبيق؟", route: "/help", color: Palette.neonCyan },
];

export function AppDrawer({ tint = Palette.text }: { tint?: string }) {
  const router = useRouter();
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
            <View style={styles.head}>
              <BrandMark size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.appName}>VoiceStudyFlow</Text>
                <Text style={styles.appSub}>ذاكر بذكاء ✨</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={Palette.textMuted} />
              </Pressable>
            </View>

            <View style={{ gap: 10, marginTop: Spacing.xl }}>
              {ITEMS.map((it) => (
                <Pressable key={it.route} onPress={() => go(it.route)} style={styles.item}>
                  <View style={[styles.itemIcon, { backgroundColor: it.color + "22", borderColor: it.color + "55" }]}>
                    <Ionicons name={it.icon} size={20} color={it.color} />
                  </View>
                  <Text style={styles.itemTxt}>{it.label}</Text>
                  <Ionicons name="chevron-back" size={18} color={Palette.textDim} />
                </Pressable>
              ))}
            </View>

            <View style={{ flex: 1 }} />
            <Text style={styles.footer}>تصميم: Nahla Bin Shablan</Text>
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
  footer: { color: Palette.textDim, fontSize: 12, textAlign: "center", marginBottom: Spacing.sm },
});
