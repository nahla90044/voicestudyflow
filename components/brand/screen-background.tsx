// components/brand/screen-background.tsx
// خلفية متدرّجة مع "بقع" ضوئية ناعمة تعطي إحساس احترافي عميق.
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { useTheme } from "../../lib/themeContext";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function ScreenBackground({ children, style }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.bg[0] }, style]}>
      <LinearGradient
        colors={theme.bg}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* بقع توهّج بألوان الثيم */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="glowA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.glow1} stopOpacity="0.40" />
            <Stop offset="1" stopColor={theme.glow1} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.glow2} stopOpacity="0.34" />
            <Stop offset="1" stopColor={theme.glow2} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowC" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.glow3} stopOpacity="0.22" />
            <Stop offset="1" stopColor={theme.glow3} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="12%" cy="6%" r="170" fill="url(#glowA)" />
        <Circle cx="95%" cy="18%" r="200" fill="url(#glowB)" />
        <Circle cx="80%" cy="92%" r="190" fill="url(#glowC)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
