// components/brand/usage-chip.tsx
// عدّاد الاستهلاك الموحّد (للجميع، والمالكة أيضًا) في رأس كل شاشة: الطلبات الذكية + صفحات الاستماع.
// عدّاد واحد فقط في التطبيق (قرار نهلة)، يتحدّث تلقائيًا.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useDir, useI18n } from "../../lib/i18n";
import { getPlan, getUsage, onUsageChange, planLimits, requestPaywall, type Plan, type Usage } from "../../lib/plan";
import { useScene } from "../../lib/scene";


type UsageState = { plan: Plan; usage: Usage; lim: { pages: number; ai: number } | null };

/** الاستهلاك والحدود الفعلية (كما في السيرفر)، يتحدّث عند كل طلب/صفحة وكل ٢٠ ثانية أثناء ظهور الشاشة */
function useUsageState(): UsageState | null {
  const [st, setSt] = useState<UsageState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      const load = () =>
        Promise.all([getPlan(), getUsage()]).then(async ([plan, usage]) => {
          const lim = await planLimits(plan);
          if (on) setSt({ plan, usage, lim });
        });
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
  return st;
}

/**
 * العدّاد المختصر في رأس كل شاشة: الطلبات الذكية + صفحات الاستماع («٣/٥ · ٠/١٠»).
 * الضغط يعرض التفاصيل كاملة، ومع النفاد يعرض الترقية.
 */
export function UsageBar({ light, onPaper }: { light?: boolean; onPaper?: boolean }) {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const st = useUsageState();
  if (!st) return null;
  const { ai, pages } = st.usage;
  const aiOver = !!st.lim && ai >= st.lim.ai;
  const pgOver = !!st.lim && pages >= st.lim.pages;
  const frac = (used: number, lim?: number) => (lim == null ? `${used}/∞` : `${Math.min(used, lim)}/${lim}`);
  const full = (k: "ai" | "pages") => {
    const used = k === "ai" ? ai : pages;
    const lim = st.lim ? (k === "ai" ? st.lim.ai : st.lim.pages) : null;
    return lim == null
      ? t(k === "ai" ? "usage.aiUnlimited" : "usage.pagesUnlimited", { used })
      : t(k === "ai" ? "usage.ai" : "usage.pages", { used: Math.min(used, lim), limit: lim });
  };
  const detail = `${full("ai")}\n${full("pages")}`;
  const ink = onPaper ? "#2B2B2B" : light ? "#FFFFFF" : pal.ink;
  const warn = pal.dark && !onPaper ? "#FF8A8A" : "#C0392B";
  const bg = onPaper ? "rgba(0,0,0,0.05)" : light || pal.dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.8)";
  const icon = onPaper ? "#2B2B2B" : light ? "#FFFFFF" : pal.accent;
  return (
    <Pressable
      onPress={() =>
        Alert.alert(t("usage.title"), detail, [
          { text: t("common.close"), style: "cancel" },
          ...(st.lim ? [{ text: t("sub.upgrade"), onPress: () => void requestPaywall("upgrade", true) }] : []),
        ])
      }
      hitSlop={6}
      style={[styles.bar, { flexDirection: dir.row, backgroundColor: bg }]}
      accessibilityRole="button"
      accessibilityLabel={detail}
    >
      <View style={[styles.seg, { flexDirection: dir.row }]}>
        <Ionicons name="sparkles-outline" size={12} color={aiOver ? warn : icon} />
        <Text style={[styles.barTxt, { color: aiOver ? warn : ink }]}>{frac(ai, st.lim?.ai)}</Text>
      </View>
      <View style={[styles.dot, { backgroundColor: ink, opacity: 0.25 }]} />
      <View style={[styles.seg, { flexDirection: dir.row }]}>
        <Ionicons name="headset-outline" size={12} color={pgOver ? warn : icon} />
        <Text style={[styles.barTxt, { color: pgOver ? warn : ink }]}>{frac(pages, st.lim?.pages)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { alignSelf: "center", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, flexShrink: 1 },
  seg: { alignItems: "center", gap: 4 },
  barTxt: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dot: { width: 3, height: 3, borderRadius: 2 },
});
