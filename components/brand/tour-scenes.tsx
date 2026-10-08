// components/brand/tour-scenes.tsx
// مشاهد الجولة التعريفية (تصميم 2.0): كل مشهد نسخة مصغّرة متحرّكة من واجهة حقيقية
// بدل الرموز التعبيرية — استماع مع هايلايتر، صفحة كتاب بوحدات وقاموس، «كتابك يجيب»،
// والجاهزية مع مسار اليوم.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { Gradients, Palette } from "../../constants/design";
import { useI18n } from "../../lib/i18n";
import { ProgressRing } from "./progress-ring";

const W = 280;

function useLoop(duration: number, active: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    const l = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [v, duration, active]);
  return v;
}

/** خطوة متكرّرة ٠..n-1 كل ms (للمشاهد المتسلسلة) */
function useStep(n: number, ms: number, active: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    setS(0);
    const id = setInterval(() => setS((x) => (x + 1) % n), ms);
    return () => clearInterval(id);
  }, [n, ms, active]);
  return s;
}

/** ١) استماع: صفحة بأسطر، هايلايتر يتنقّل سطرًا سطرًا، وموجة صوت */
export function ListenScene({ active }: { active: boolean }) {
  const line = useStep(5, 900, active);
  const wave = useLoop(900, active);
  return (
    <View style={styles.frame}>
      <View style={styles.paper}>
        {[0.92, 0.84, 0.95, 0.7, 0.88].map((w, i) => (
          <View key={i} style={styles.lineWrap}>
            {i === line && <View style={[styles.hl, { width: `${w * 100 + 4}%` }]} />}
            <View style={[styles.line, styles.inkLine, { width: `${w * 100}%` }]}>
              {i === line && <View style={styles.word} />}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.player}>
        <LinearGradient colors={Gradients.neon} style={styles.playBtn}>
          <Ionicons name="pause" size={16} color="#fff" />
        </LinearGradient>
        <View style={styles.waveRow}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                {
                  transform: [
                    {
                      scaleY: wave.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: i % 2 ? [0.3, 1, 0.3] : [1, 0.35, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** ٢) صفحة الكتاب: وحدات بصفحاتها + بطاقات القاموس تظهر تباعًا */
export function BookScene({ active }: { active: boolean }) {
  const { t } = useI18n();
  const s = useStep(4, 800, active);
  const chips = [t("glossary.k.term"), t("glossary.k.def"), t("glossary.k.word")];
  return (
    <View style={styles.frame}>
      {[1, 2, 3].map((n, i) => (
        <View key={n} style={[styles.unitRow, i === 0 && styles.unitRowOn]}>
          <View style={styles.unitNum}>
            <Text style={styles.unitNumTxt}>{n}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.line, { width: `${80 - i * 12}%`, backgroundColor: "rgba(255,255,255,0.28)" }]} />
            <Text style={styles.range}>{t("glossary.pages", { from: [6, 20, 35][i], to: [19, 34, 48][i] })}</Text>
          </View>
          <View style={styles.miniIcon}>
            <Ionicons name="book" size={13} color="#6CF3C5" />
          </View>
        </View>
      ))}
      <View style={styles.chipRow}>
        {chips.map((c, i) => (
          <View key={c} style={[styles.gChip, { opacity: s > i ? 1 : 0.15 }]}>
            <Text style={styles.gChipTxt}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** ٣) كتابك يجيب: سؤال ← إجابة بأرقام صفحات، وكرة الصوت تنبض */
export function AskScene({ active }: { active: boolean }) {
  const s = useStep(4, 900, active);
  const pulse = useLoop(1400, active);
  return (
    <View style={styles.frame}>
      <View style={[styles.qBubble, { opacity: s >= 0 ? 1 : 0 }]}>
        <View style={[styles.line, { width: 120, backgroundColor: "rgba(255,255,255,0.85)" }]} />
      </View>
      <View style={[styles.aBubble, { opacity: s >= 1 ? 1 : 0.1 }]}>
        <View style={[styles.line, { width: "92%" }]} />
        <View style={[styles.line, { width: "80%" }]} />
        <View style={[styles.line, { width: "64%" }]} />
        <View style={styles.citeRow}>
          {[20, 37].map((p, i) => (
            <View key={p} style={[styles.cite, { opacity: s >= 2 + i ? 1 : 0.1 }]}>
              <Ionicons name="document-text" size={11} color="#D9D3FF" />
              <Text style={styles.citeTxt}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.orbBox}>
        <Animated.View
          style={[
            styles.orbRing,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
            },
          ]}
        />
        <LinearGradient colors={Gradients.neon} style={styles.orb}>
          <Ionicons name="mic" size={18} color="#fff" />
        </LinearGradient>
      </View>
    </View>
  );
}

/** ٤) الجاهزية: الحلقة ترتفع وخطوات مسار اليوم تُشطب تباعًا */
export function ReadyScene({ active }: { active: boolean }) {
  const s = useStep(5, 800, active);
  const pct = [0.38, 0.5, 0.61, 0.72, 0.72][s];
  return (
    <View style={[styles.frame, { flexDirection: "row", alignItems: "center", gap: 16 }]}>
      <ProgressRing progress={pct} colors={[Gradients.neon[0], Gradients.neon[2]]} size={104}>
        <Text style={styles.ringNum}>{Math.round(pct * 100)}%</Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: 10 }}>
        {[0, 1, 2].map((i) => {
          const done = s > i;
          return (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepDot, done && styles.stepDone]}>{done && <Ionicons name="checkmark" size={12} color="#6CF3C5" />}</View>
              <View style={[styles.line, { flex: 1, opacity: done ? 0.4 : 1 }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: W,
    padding: 16,
    gap: 10,
    borderRadius: 26,
    backgroundColor: "#10121B",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.30)",
    shadowColor: "#7C6CFF",
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  paper: { padding: 14, gap: 12, borderRadius: 16, backgroundColor: "#F6F1E7" },
  lineWrap: { height: 10, justifyContent: "center", alignItems: "flex-end" },
  line: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "flex-end" },
  inkLine: { backgroundColor: "rgba(42,38,34,0.32)" },
  hl: { position: "absolute", height: 16, right: -4, borderRadius: 5, backgroundColor: "rgba(233,179,95,0.45)" },
  word: { position: "absolute", right: "30%", width: 26, height: 9, top: -1, borderRadius: 3, backgroundColor: "#7C6CFF" },
  player: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  playBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  waveRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 26 },
  waveBar: { width: 4, height: 24, borderRadius: 2, backgroundColor: Palette.neonViolet },
  unitRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)" },
  unitRowOn: { backgroundColor: "rgba(124,108,255,0.12)" },
  unitNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  unitNumTxt: { color: Palette.textMuted, fontSize: 11, fontWeight: "700" },
  range: { color: "#8E95AB", fontSize: 10.5, textAlign: "right" },
  miniIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(108,243,197,0.12)", alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row-reverse", gap: 6, marginTop: 2 },
  gChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(108,243,197,0.14)" },
  gChipTxt: { color: "#6CF3C5", fontSize: 11.5, fontWeight: "700" },
  qBubble: { alignSelf: "flex-start", padding: 12, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: "#7C6CFF" },
  aBubble: { alignSelf: "flex-end", width: "88%", padding: 12, gap: 8, borderRadius: 16, borderBottomRightRadius: 4, backgroundColor: "rgba(255,255,255,0.05)" },
  citeRow: { flexDirection: "row-reverse", gap: 6, marginTop: 2 },
  cite: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(124,108,255,0.22)" },
  citeTxt: { color: "#D9D3FF", fontSize: 11, fontWeight: "700" },
  orbBox: { alignSelf: "center", width: 56, height: 56, alignItems: "center", justifyContent: "center", marginTop: 4 },
  orbRing: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "#7C6CFF" },
  orb: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  ringNum: { color: "#D9D3FF", fontSize: 22, fontWeight: "800" },
  stepRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  stepDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  stepDone: { borderColor: "transparent", backgroundColor: "rgba(108,243,197,0.16)" },
});

export const TOUR = [
  { key: "listen", Scene: ListenScene },
  { key: "book", Scene: BookScene },
  { key: "ask", Scene: AskScene },
  { key: "ready", Scene: ReadyScene },
] as const;
