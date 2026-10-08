// components/brand/animated-splash.tsx
// شاشة البداية (تصميم 2.0): خلفية الشفق، شعار يدخل بنابض وموجات صوت تنتشر منه،
// ثم الاسم والشعار اللفظي. تبقى حدًا أدنى قصيرًا ثم تتلاشى بنعومة (لا قطع مفاجئ).
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { Palette } from "../../constants/design";
import { useI18n } from "../../lib/i18n";
import { BrandMark } from "./logo";

const MIN_MS = 1300; // أقصر مدة عرض حتى تُرى الحركة كاملة

type Props = {
  /** انتهى إقلاع التطبيق → نبدأ التلاشي (بعد الحد الأدنى) */
  ready: boolean;
  onHidden: () => void;
};

function Wave({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] }) }],
        },
      ]}
    />
  );
}

export function AnimatedSplash({ ready, onHidden }: Props) {
  const { t } = useI18n();
  const shownAt = useRef(Date.now()).current;
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logo, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(280),
        Animated.timing(text, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, [logo, text, glow]);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
    const id = setTimeout(() => {
      Animated.timing(out, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onHidden());
    }, wait);
    return () => clearTimeout(id);
  }, [ready, out, onHidden, shownAt]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: out }]}>
      {/* هالات الشفق */}
      <Animated.View style={[styles.aurora, styles.auroraA, { opacity: glow }]}>
        <LinearGradient colors={["rgba(124,108,255,0.55)", "rgba(124,108,255,0)"]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.aurora, styles.auroraB, { opacity: glow }]}>
        <LinearGradient colors={["rgba(63,208,255,0.35)", "rgba(63,208,255,0)"]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={styles.center}>
        <View style={styles.logoBox}>
          <Wave delay={0} />
          <Wave delay={520} />
          <Wave delay={1040} />
          <Animated.View
            style={{
              opacity: logo,
              transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            }}
          >
            <BrandMark size={104} />
          </Animated.View>
        </View>
        <Animated.View
          style={{
            alignItems: "center",
            opacity: text,
            transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <Text style={styles.title}>VoiceStudyFlow</Text>
          <Text style={styles.tag}>{t("splash.tagline")}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#07080D", zIndex: 100 },
  aurora: { position: "absolute", borderRadius: 400, overflow: "hidden" },
  auroraA: { width: 520, height: 520, top: -180, right: -160 },
  auroraB: { width: 420, height: 420, bottom: -140, left: -150 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 26 },
  logoBox: { width: 170, height: 170, alignItems: "center", justifyContent: "center" },
  wave: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: "rgba(124,108,255,0.85)",
  },
  title: { color: Palette.text, fontSize: 28, fontWeight: "800", letterSpacing: 0.3 },
  tag: { color: "#A3A9BE", fontSize: 14.5, marginTop: 8, fontWeight: "600" },
});
