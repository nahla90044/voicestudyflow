// components/brand/fade-in.tsx
// غلاف يطبّق حركة دخول ناعمة (تلاشٍ + انزلاق للأعلى).
// يعيد تشغيل الحركة كل مرة تُفتح/تُركّز فيها الشاشة (مو مرة وحدة فقط).
import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";

type Props = {
  children: React.ReactNode;
  delay?: number;
  offset?: number;
  duration?: number;
  style?: ViewStyle;
};

export function FadeIn({
  children,
  delay = 0,
  offset = 22,
  duration = 450,
  style,
}: Props) {
  const v = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    v.setValue(0);
    const anim = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [isFocused, v, delay, duration]);

  const translateY = v.interpolate({
    inputRange: [0, 1],
    outputRange: [offset, 0],
  });

  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
