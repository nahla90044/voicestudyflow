// components/brand/heatmap.tsx
// خريطة حرارية لأيام المذاكرة (مثل GitHub) — آخر ~13 أسبوعًا.
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Palette } from "../../constants/design";

type Props = { days: Record<string, { m: number }>; weeks?: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function levelColor(min: number): string {
  if (min <= 0) return "rgba(255,255,255,0.06)";
  if (min < 10) return "rgba(46,204,113,0.30)";
  if (min < 20) return "rgba(46,204,113,0.52)";
  if (min < 40) return "rgba(46,204,113,0.76)";
  return "#2ecc71";
}

export function StudyHeatmap({ days, weeks = 13 }: Props) {
  // نهاية الشبكة: نهاية الأسبوع الحالي (السبت)؛ البداية: أحد قبل (weeks-1) أسبوع
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - today.getDay() - (weeks - 1) * 7); // أحد البداية

  const cols: { iso: string; min: number; future: boolean }[][] = [];
  const todayISO = toLocalISO(today);
  for (let w = 0; w < weeks; w++) {
    const col: { iso: string; min: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const iso = toLocalISO(date);
      col.push({ iso, min: days?.[iso]?.m ?? 0, future: iso > todayISO });
    }
    cols.push(col);
  }

  return (
    <View>
      <View style={styles.grid}>
        {cols.map((col, ci) => (
          <View key={ci} style={styles.col}>
            {col.map((cell) => (
              <View
                key={cell.iso}
                style={[
                  styles.cell,
                  {
                    backgroundColor: cell.future ? "transparent" : levelColor(cell.min),
                    opacity: cell.future ? 0 : 1,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendTxt}>أقل</Text>
        {[0, 9, 19, 39, 50].map((m, i) => (
          <View key={i} style={[styles.cell, { backgroundColor: levelColor(m) }]} />
        ))}
        <Text style={styles.legendTxt}>أكثر</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", justifyContent: "space-between" },
  col: { gap: 3 },
  cell: { width: 13, height: 13, borderRadius: 3 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, justifyContent: "flex-end" },
  legendTxt: { color: Palette.textDim, fontSize: 11, fontWeight: "700" },
});
