// components/brand/usage-chip.tsx
// عدّاد الاستهلاك الموحّد (للجميع، والمالكة أيضًا): «الطلبات ١٢ من ٥٠» أو «الصفحات ٣٠ من ١٠٠».
// يظهر حيث يُستهلك الشيء (نافذة المساعد، الملخّص، الفيديو، التوليد المخصّص…) ويتحدّث تلقائيًا.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useDir, useI18n } from "../../lib/i18n";
import { getPlan, getUsage, LIMITS, onUsageChange, requestPaywall, type Plan, type Usage } from "../../lib/plan";
import { useScene } from "../../lib/scene";


export function UsageChip({ kind, light }: { kind: "ai" | "pages"; light?: boolean }) {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [st, setSt] = useState<{ plan: Plan; usage: Usage } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      const load = () => Promise.all([getPlan(), getUsage()]).then(([plan, usage]) => on && setSt({ plan, usage }));
      void load();
      const off = onUsageChange(load);
      const id = setInterval(load, 20000);
      return () => {
        on = false;
        off();
        clearInterval(id);
      };
    }, [])
  );
  if (!st) return null;
  const used = kind === "ai" ? st.usage.ai : st.usage.pages;
  const limit = st.plan === "owner" ? null : kind === "ai" ? LIMITS[st.plan].ai : LIMITS[st.plan].pages;
  const over = limit != null && used >= limit;
  const fg = light ? "#FFFFFF" : over ? (pal.dark ? "#FF8A8A" : "#C0392B") : pal.ink;
  const label =
    limit == null
      ? t(kind === "ai" ? "usage.aiUnlimited" : "usage.pagesUnlimited", { used })
      : t(kind === "ai" ? "usage.ai" : "usage.pages", { used: Math.min(used, limit), limit });
  return (
    <Pressable
      onPress={() => over && requestPaywall("upgrade", true)}
      style={[styles.chip, { flexDirection: dir.row, backgroundColor: light ? "rgba(255,255,255,0.18)" : pal.soft, borderColor: light ? "transparent" : pal.cardBorder }]}
      accessibilityLabel={label}
    >
      <Ionicons name={kind === "ai" ? "sparkles-outline" : "headset-outline"} size={13} color={light ? "#FFFFFF" : pal.accent} />
      <Text style={[styles.txt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "center", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6 },
  txt: { fontSize: 12.5, fontWeight: "800" },
});
