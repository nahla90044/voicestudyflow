// components/brand/animated-splash.tsx
// شاشة البداية بجماليات «العالم الحيّ»: مشهد الوقت الحالي (حديقة الصباح، سهرة المساء،
// سماء الليل) يطلع من تحت كأنه شروق، والشعار تنتشر منه موجات صوت بلون المشهد،
// ثم الاسم والشعار اللفظي. تبدأ داكنة (امتداد لشاشة النظام) وتتلاشى العتمة لتكشف المشهد،
// وتبقى حدًا أدنى قصيرًا ثم تتلاشى بنعومة إلى التطبيق.
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { sceneGrowth } from "../../lib/sceneCore";
import { BrandMark } from "./logo";
import { SceneArt } from "./scene-art";

const MIN_MS = 1700; // أقصر مدة عرض حتى يُرى الشروق والحركة كاملين
const NATIVE_BG = "#07080D"; // لون شاشة النظام قبلها — نبدأ منه فلا يظهر قطع

type Props = {
  /** انتهى إقلاع التطبيق → نبدأ التلاشي (بعد الحد الأدنى) */
  ready: boolean;
  onHidden: () => void;
};

function Wave({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wave,
        {
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 2.2] }) }],
        },
      ]}
    />
  );
}

export function AnimatedSplash({ ready, onHidden }: Props) {
  const { t } = useI18n();
  const { id, pal } = useScene();
  const { width, height } = useWindowDimensions();
  const shownAt = useRef(Date.now()).current;
  const dawn = useRef(new Animated.Value(0)).current; // تلاشي العتمة + صعود المشهد
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(dawn, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(150),
        Animated.spring(logo, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(480),
        Animated.timing(text, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, [dawn, logo, text]);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
    const timer = setTimeout(() => {
      Animated.timing(out, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onHidden());
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, out, onHidden, shownAt]);

  // المشهد كاملًا بعرض الشاشة، مثبّت أسفلها (الشجرة/الرف/القمر في النصف السفلي)
  const artH = (width * 470) / 390;
  const growth = sceneGrowth(id, { pagesToday: 4, unitsDone: 3, unitCount: 6, readiness: 65 });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: pal.bg, opacity: out }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.art,
          {
            top: Math.max(height - artH, height * 0.32),
            opacity: dawn,
            transform: [{ translateY: dawn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
      >
        <SceneArt id={id} growth={growth} width={width} height={artH} />
        {/* أعلى المشهد يذوب في الخلفية — بلا حدّ مستطيل */}
        <LinearGradient colors={[pal.bg, pal.bg + "00"]} style={styles.fade} />
      </Animated.View>

      <View style={[styles.center, { paddingBottom: height * 0.36 }]}>
        <View style={styles.logoBox}>
          <Wave delay={300} color={pal.accent} />
          <Wave delay={900} color={pal.accent} />
          <Wave delay={1500} color={pal.accent} />
          <Animated.View
            style={{
              opacity: logo,
              transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            }}
          >
            <BrandMark size={100} />
          </Animated.View>
        </View>
        <Animated.View
          style={{
            alignItems: "center",
            opacity: text,
            transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <Text style={[styles.title, { color: pal.ink }]}>VoiceStudyFlow</Text>
          <Text style={[styles.tag, { color: pal.dim }]}>{t("splash.tagline")}</Text>
        </Animated.View>
      </View>

      {/* عتمة البداية (امتداد شاشة النظام) تتلاشى فينكشف المشهد كالشروق */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: NATIVE_BG, opacity: dawn.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100 },
  art: { position: "absolute", left: 0, right: 0 },
  fade: { position: "absolute", top: 0, left: 0, right: 0, height: 170 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24 },
  logoBox: { width: 170, height: 170, alignItems: "center", justifyContent: "center" },
  wave: {
    position: "absolute",
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 2,
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: 0.3 },
  tag: { fontSize: 14.5, marginTop: 8, fontWeight: "600" },
});
