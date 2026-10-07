// components/brand/week-bars.tsx
// أعمدة نشاط آخر ٧ أيام (بالدقائق) — اليوم مميّز بتدرّج، والأيام الفارغة نقطة خافتة.
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Palette } from "../../constants/design";

type Props = {
  /** ٧ أيام، الأقدم أولًا */
  days: { iso: string; minutes: number }[];
  /** أسماء الأيام المختصرة: الأحد أولًا (getDay) */
  dayLabels: string[];
  accent: readonly [string, string];
  height?: number;
  isRTL?: boolean;
};

export function WeekBars({ days, dayLabels, accent, height = 56, isRTL }: Props) {
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const ordered = isRTL ? [...days].reverse() : days;
  const todayIso = days.at(-1)?.iso;

  return (
    <View style={styles.row}>
      {ordered.map((d) => {
        const isToday = d.iso === todayIso;
        const h = d.minutes > 0 ? Math.max(6, (d.minutes / max) * height) : 4;
        const dow = new Date(d.iso + "T00:00:00").getDay();
        return (
          <View key={d.iso} style={styles.col}>
            <View style={[styles.track, { height }]}>
              {d.minutes > 0 ? (
                <LinearGradient
                  colors={isToday ? accent : ["rgba(255,255,255,0.38)", "rgba(255,255,255,0.18)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={[styles.bar, { height: h }]}
                />
              ) : (
                <View style={styles.empty} />
              )}
            </View>
            <Text style={[styles.lbl, isToday && styles.lblToday]}>{dayLabels.at(dow) ?? ""}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  col: { alignItems: "center", gap: 6, flex: 1 },
  track: { justifyContent: "flex-end", alignItems: "center" },
  bar: { width: 12, borderRadius: 6 },
  empty: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  lbl: { color: Palette.textDim, fontSize: 10.5, fontWeight: "700" },
  lblToday: { color: Palette.text },
});
