// components/brand/book-cover.tsx
// غلاف كتاب مولَّد من عنوانه: لونان ثابتان لكل عنوان + زخرفة خطوط + الحرف الأول.
// يعطي كل كتاب هوية بصرية بدل أيقونة PDF رمادية.
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const PAIRS: readonly (readonly [string, string])[] = [
  ["#4f8cff", "#7c5cff"],
  ["#22d3ee", "#3b82f6"],
  ["#ec4899", "#a855f7"],
  ["#f59e0b", "#ef4444"],
  ["#2ecc71", "#14b8a6"],
  ["#f472b6", "#fb7185"],
  ["#8b5cf6", "#06b6d4"],
];

/** بصمة ثابتة للنص (FNV-1a مبسّطة) — نفس العنوان = نفس الألوان دائمًا. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function coverColors(title: string): readonly [string, string] {
  return PAIRS.at(hash(title || "?") % PAIRS.length) ?? PAIRS[0];
}

type Props = { title: string; width?: number; height?: number };

export function BookCover({ title, width = 64, height = 88 }: Props) {
  const colors = coverColors(title);
  const initial = (title || "?").trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.wrap, { width, height }]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Circle cx={width * 0.85} cy={height * 0.12} r={width * 0.45} fill="rgba(255,255,255,0.14)" />
        <Path
          d={`M0 ${height * 0.72} Q ${width * 0.5} ${height * 0.55} ${width} ${height * 0.78} L ${width} ${height} L 0 ${height} Z`}
          fill="rgba(0,0,0,0.18)"
        />
      </Svg>
      {/* كعب الكتاب */}
      <View style={styles.spine} />
      <Text style={[styles.initial, { fontSize: width * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  spine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5, backgroundColor: "rgba(0,0,0,0.22)" },
  initial: { color: "#fff", fontWeight: "900", textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 6 },
});
