// components/brand/progress-ring.tsx
// حلقة تقدّم متدرّجة اللون (لهدف اليوم) تمتلئ بحركة ناعمة عند كل فتح للشاشة.
import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  stroke?: number;
  /** 0..1 */
  progress: number;
  colors?: readonly [string, string];
  trackColor?: string;
  children?: React.ReactNode;
};

export function ProgressRing({
  size = 112,
  stroke = 11,
  progress,
  colors = ["#22d3ee", "#a855f7"],
  trackColor = "rgba(255,255,255,0.10)",
  children,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  const v = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    v.setValue(0);
    const anim = Animated.timing(v, {
      toValue: p,
      duration: 900,
      delay: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // خصائص SVG لا تدعم المشغّل الأصلي
    });
    anim.start();
    return () => anim.stop();
  }, [isFocused, p, v]);

  const offset = v.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {p > 0 && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#ringGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
