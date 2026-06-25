// app/pomodoro.tsx
// مؤقّت بومودورو: جلسات تركيز ٢٥ دقيقة + استراحة ٥، مع تشجيع باسمكِ.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "../components/brand/glass-card";
import { ScreenBackground } from "../components/brand/screen-background";
import { Palette, Radius, Spacing } from "../constants/design";
import { getUserName } from "../lib/settings";
import { recordActivity } from "../lib/stats";

const FOCUS = 25 * 60;
const BREAK = 5 * 60;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function PomodoroScreen() {
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [left, setLeft] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [tomatoes, setTomatoes] = useState(0);
  const [name, setName] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getUserName().then((n) => setName(n.trim()));
  }, []);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s > 1) return s - 1;
        // انتهت المرحلة
        Vibration.vibrate(600);
        if (phase === "focus") {
          recordActivity({ minutes: 25 }).catch(() => {});
          setTomatoes((t) => t + 1);
          setPhase("break");
          return BREAK;
        } else {
          setPhase("focus");
          return FOCUS;
        }
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running, phase]);

  function reset() {
    setRunning(false);
    setPhase("focus");
    setLeft(FOCUS);
  }
  function skip() {
    if (phase === "focus") {
      setPhase("break");
      setLeft(BREAK);
    } else {
      setPhase("focus");
      setLeft(FOCUS);
    }
  }

  const total = phase === "focus" ? FOCUS : BREAK;
  const pct = Math.round(((total - left) / total) * 100);
  const accent = phase === "focus" ? Palette.neonCyan : Palette.success;
  const phaseMsg =
    phase === "focus"
      ? `ركّزي يا ${name || "بطلة"} 🎯`
      : "استراحة قصيرة ☕";

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>مؤقّت التركيز</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.center}>
          <GlassCard glow={accent} radius={Radius.xl} style={{ width: "100%" }} contentStyle={styles.card}>
            <View style={[styles.phasePill, { backgroundColor: accent + "22", borderColor: accent }]}>
              <Text style={[styles.phaseTxt, { color: accent }]}>
                {phase === "focus" ? "🎯 جلسة تركيز" : "☕ استراحة"}
              </Text>
            </View>

            <Text style={[styles.time, { color: accent }]}>{fmt(left)}</Text>
            <Text style={styles.phaseMsg}>{phaseMsg}</Text>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: accent }]} />
            </View>

            <View style={styles.tomatoes}>
              <Text style={styles.tomatoTxt}>🍅 {tomatoes} جلسة مكتملة اليوم</Text>
            </View>

            {/* أزرار */}
            <Pressable onPress={() => setRunning((r) => !r)} style={[styles.primary, { backgroundColor: accent }]}>
              <Ionicons name={running ? "pause" : "play"} size={22} color="#0b1220" />
              <Text style={styles.primaryTxt}>{running ? "إيقاف مؤقّت" : "ابدئي"}</Text>
            </Pressable>

            <View style={styles.row}>
              <Pressable onPress={reset} style={styles.secondary}>
                <Ionicons name="refresh" size={16} color={Palette.text} />
                <Text style={styles.secondaryTxt}>إعادة</Text>
              </Pressable>
              <Pressable onPress={skip} style={styles.secondary}>
                <Ionicons name="play-skip-forward" size={16} color={Palette.text} />
                <Text style={styles.secondaryTxt}>تخطّي</Text>
              </Pressable>
            </View>
          </GlassCard>

          <Text style={styles.hint}>
            ٢٥ دقيقة تركيز ثم ٥ دقائق راحة. الجلسات المكتملة تُحتسب في نشاطك وسلسلتك 🔥
          </Text>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: Palette.text, fontSize: 18, fontWeight: "900" },

  center: { flex: 1, justifyContent: "center", paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  card: { alignItems: "center", padding: Spacing.xl, gap: 14 },
  phasePill: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1 },
  phaseTxt: { fontSize: 13, fontWeight: "900" },
  time: { fontSize: 68, fontWeight: "900", letterSpacing: 2 },
  phaseMsg: { color: Palette.textMuted, fontSize: 16, fontWeight: "800" },
  track: { width: "100%", height: 10, borderRadius: 5, backgroundColor: Palette.surface, overflow: "hidden", marginTop: 4 },
  fill: { height: "100%", borderRadius: 5 },
  tomatoes: { marginTop: 2 },
  tomatoTxt: { color: Palette.textDim, fontSize: 13, fontWeight: "800" },

  primary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    paddingVertical: 15,
    borderRadius: Radius.lg,
    marginTop: 6,
  },
  primaryTxt: { color: "#0b1220", fontSize: 16, fontWeight: "900" },
  row: { flexDirection: "row-reverse", gap: 10, alignSelf: "stretch" },
  secondary: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  secondaryTxt: { color: Palette.text, fontSize: 14, fontWeight: "800" },
  hint: { color: Palette.textDim, fontSize: 13, textAlign: "center", lineHeight: 21 },
});
