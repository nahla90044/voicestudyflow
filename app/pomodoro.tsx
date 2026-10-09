// app/pomodoro.tsx
// مؤقّت بومودورو: جلسات تركيز ٢٥ دقيقة + استراحة ٥، مع تشجيع باسمكِ.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { dropEmptyVocative, useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
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
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
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
          setTomatoes((n) => n + 1);
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
  // التركيز باللون المميّز للمشهد، والاستراحة بأخضر هادئ يُقرأ على الفاتح والداكن
  const accent = phase === "focus" ? pal.accent : pal.dark ? "#7FD9A8" : "#2F8F5B";
  const onAccent = phase === "focus" ? pal.onAccent : pal.dark ? pal.bg : "#FFFFFF";
  const phaseMsg =
    phase === "focus"
      ? dropEmptyVocative(t("pomodoro.focusMsg", { name }))
      : t("pomodoro.breakMsg");

  const RING = 236;
  const SW = 14;
  const r = (RING - SW) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <SceneScreen>
      <SceneBanner
        title={t("pomodoro.title")}
        height={140}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("common.close")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SceneCard style={styles.card}>
          <View style={[styles.phasePill, { backgroundColor: pal.soft, borderColor: accent + "66" }]}>
            <Text style={[styles.phaseTxt, { color: accent }]}>
              {phase === "focus" ? t("pomodoro.phaseFocus") : t("pomodoro.phaseBreak")}
            </Text>
          </View>

          {/* حلقة المؤقّت: المنقضي باللون المميّز فوق مسار المشهد */}
          <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
              <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={pal.track} strokeWidth={SW} fill="none" />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                stroke={accent}
                strokeWidth={SW}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={circ * (1 - pct / 100)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <Text style={[styles.time, { color: pal.ink }]}>{fmt(left)}</Text>
            <Text style={[styles.pct, { color: pal.dim }]}>{pct}%</Text>
          </View>

          <Text style={[styles.phaseMsg, { color: pal.ink }]}>{phaseMsg}</Text>

          <View style={[styles.tomatoes, { backgroundColor: pal.soft }]}>
            <Text style={[styles.tomatoTxt, { color: pal.accent }]}>{t("pomodoro.completedToday", { count: tomatoes })}</Text>
          </View>

          {/* أزرار */}
          <Pressable onPress={() => setRunning((r) => !r)} style={[styles.primary, { backgroundColor: accent, flexDirection: dir.row }]}>
            <Ionicons name={running ? "pause" : "play"} size={22} color={onAccent} />
            <Text style={[styles.primaryTxt, { color: onAccent }]}>{running ? t("pomodoro.pause") : t("pomodoro.start")}</Text>
          </Pressable>

          <View style={[styles.row, { flexDirection: dir.row }]}>
            <Pressable onPress={reset} style={[styles.secondary, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
              <Ionicons name="refresh" size={16} color={pal.ink} />
              <Text style={[styles.secondaryTxt, { color: pal.ink }]}>{t("pomodoro.reset")}</Text>
            </Pressable>
            <Pressable onPress={skip} style={[styles.secondary, { flexDirection: dir.row, backgroundColor: pal.soft, borderColor: pal.cardBorder }]}>
              <Ionicons name="play-skip-forward" size={16} color={pal.ink} />
              <Text style={[styles.secondaryTxt, { color: pal.ink }]}>{t("pomodoro.skip")}</Text>
            </Pressable>
          </View>
        </SceneCard>

        <Text style={[styles.hint, { color: pal.dim }]}>{t("pomodoro.hint")}</Text>
      </ScrollView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 40, gap: Spacing.lg },
  card: { alignItems: "center", padding: Spacing.xl, gap: 14 },
  phasePill: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1 },
  phaseTxt: { fontSize: 13, fontWeight: "900" },
  time: { fontSize: 54, fontWeight: "900", letterSpacing: 2, fontVariant: ["tabular-nums"] },
  pct: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  phaseMsg: { fontSize: 16, fontWeight: "900", textAlign: "center" },
  tomatoes: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.pill },
  tomatoTxt: { fontSize: 13, fontWeight: "800" },

  primary: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    height: 56,
    borderRadius: 20,
    marginTop: 6,
  },
  primaryTxt: { fontSize: 16, fontWeight: "900" },
  row: { gap: 10, alignSelf: "stretch" },
  secondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryTxt: { fontSize: 14, fontWeight: "800" },
  hint: { fontSize: 13, textAlign: "center", lineHeight: 21, fontWeight: "600" },
});
