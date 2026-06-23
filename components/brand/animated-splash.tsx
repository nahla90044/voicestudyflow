// components/brand/animated-splash.tsx
// شاشة بداية متحرّكة (تظهر فوق التطبيق أثناء الإقلاع ثم تختفي).
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Palette } from "../../constants/design";
import { BrandMark } from "./logo";
import { ScreenBackground } from "./screen-background";

export function AnimatedSplash() {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, scale]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <ScreenBackground>
        <View style={styles.center}>
          <Animated.View
            style={{ opacity: fade, transform: [{ scale }], alignItems: "center" }}
          >
            <View style={styles.logoRing}>
              <BrandMark size={108} />
            </View>
            <Text style={styles.title}>VoiceStudyFlow</Text>
            <Text style={styles.tag}>اقرأ، استمع، وأنجز ✨</Text>
          </Animated.View>
        </View>
      </ScreenBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Palette.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logo: { width: 112, height: 112 },
  title: { color: Palette.text, fontSize: 26, fontWeight: "900" },
  tag: { color: Palette.textDim, fontSize: 14, marginTop: 8, fontWeight: "700" },
});
