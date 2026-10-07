// components/brand/study-tab-bar.tsx
// شريط التنقّل في تصميم 2.0: كبسولة بأربع وجهات (اليوم · مكتبتي · المراجعة · التقدّم)
// وزر «الشفق» في المنتصف يفتح «بحث وأوامر».
// الشريط داخل تدفّق الصفحة (لا يطفو فوقها) حتى لا يغطّي أسفل أي شاشة قائمة.
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Gradients, Palette } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/themeContext";
import { PressableScale } from "./motion";

type Dest = { route: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap };

const LEFT: Dest[] = [
  { route: "index", labelKey: "nav.today", icon: "sunny-outline", iconOn: "sunny" },
  { route: "library", labelKey: "nav.library", icon: "library-outline", iconOn: "library" },
];
const RIGHT: Dest[] = [
  { route: "flashcards", labelKey: "nav.review", icon: "albums-outline", iconOn: "albums" },
  { route: "activity", labelKey: "nav.progress", icon: "stats-chart-outline", iconOn: "stats-chart" },
];

export function StudyTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useI18n();
  const dir = useDir();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  const item = (d: Dest) => {
    const on = current === d.route;
    return (
      <PressableScale
        key={d.route}
        style={styles.item}
        onPress={() => {
          const target = state.routes.find((r) => r.name === d.route);
          if (!target) return;
          const ev = navigation.emit({ type: "tabPress", target: target.key, canPreventDefault: true });
          if (!on && !ev.defaultPrevented) navigation.navigate(d.route);
        }}
      >
        <Ionicons name={on ? d.iconOn : d.icon} size={22} color={on ? theme.accent : Palette.placeholder} />
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
          {t(d.labelKey)}
        </Text>
      </PressableScale>
    );
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.pill, { flexDirection: dir.row }]}>
        {LEFT.map(item)}
        <PressableScale onPress={() => router.push("/command")} style={styles.orbWrap}>
          <LinearGradient colors={Gradients.neon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orb}>
            <Ionicons name="sparkles" size={24} color="#fff" accessibilityLabel={t("nav.orb")} />
          </LinearGradient>
        </PressableScale>
        {RIGHT.map(item)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Palette.bg, paddingHorizontal: 12, paddingTop: 6 },
  pill: {
    height: 64,
    borderRadius: 24,
    backgroundColor: "#10121B",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 4,
  },
  item: { alignItems: "center", gap: 3, width: 62, paddingVertical: 6 },
  label: { fontSize: 10.5, fontWeight: "600", color: Palette.placeholder },
  labelOn: { color: Palette.text },
  orbWrap: { marginTop: -2 },
  orb: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3FD0FF",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
