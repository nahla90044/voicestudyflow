// components/brand/motion.tsx
// لبنات الحركة المشتركة: ضغطة نابضة (spring) + رقم يعدّ تصاعديًا.
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

type PressProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  /** اهتزاز خفيف عند الضغط (iOS/Android) */
  haptic?: boolean;
};

// Pressable نفسه متحرّك: الأبعاد (flex/width) والانكماش على نفس العنصر،
// حتى يأخذ الزر مساحته الصحيحة داخل الصفوف والشبكات.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** زر ينكمش قليلًا ويرتدّ بنابض — إحساس ملموس بدل تغيير الشفافية فقط. */
export function PressableScale({ onPress, onLongPress, disabled, style, children, haptic = true }: PressProps) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(s, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 7 }).start();
  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => to(0.965)}
      onPressOut={() => to(1)}
      onPress={() => {
        if (haptic && Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      onLongPress={
        onLongPress
          ? () => {
              if (haptic && Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onLongPress();
            }
          : undefined
      }
      style={[style, { transform: [{ scale: s }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** رقم يعدّ من الصفر إلى قيمته عند كل فتح للشاشة. */
export function CountUp({ value, style, duration = 800 }: { value: number; style?: StyleProp<TextStyle>; duration?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  const isFocused = useIsFocused();

  useEffect(() => {
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    return () => v.removeListener(id);
  }, [v]);

  useEffect(() => {
    if (!isFocused) return;
    v.setValue(0);
    const anim = Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [isFocused, value, duration, v]);

  return <Text style={style}>{shown.toLocaleString()}</Text>;
}
