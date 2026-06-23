// components/brand/gradient-button.tsx
// زر موحّد بطابع Web3: متدرّج نيون (solid) أو زجاجي (ghost).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { Gradients, Palette, Radius } from "../../constants/design";

type Props = {
  title: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  colors?: readonly [string, string, ...string[]];
  loading?: boolean;
  disabled?: boolean;
  variant?: "solid" | "ghost";
  style?: ViewStyle;
};

export function GradientButton({
  title,
  onPress,
  icon,
  colors = Gradients.brand,
  loading = false,
  disabled = false,
  variant = "solid",
  style,
}: Props) {
  const off = disabled || loading;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === "solid" ? "#fff" : Palette.text} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={variant === "solid" ? "#fff" : Palette.text}
            />
          ) : null}
          <Text style={[styles.txt, variant === "ghost" && styles.txtGhost]}>{title}</Text>
        </>
      )}
    </>
  );

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.wrap,
        { opacity: off ? 0.5 : pressed ? 0.9 : 1 },
        style,
      ]}
    >
      {variant === "ghost" ? (
        <View style={[styles.inner, styles.ghost]}>{content}</View>
      ) : (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.inner}
        >
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: Radius.lg, overflow: "hidden" },
  inner: {
    minHeight: 52,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  ghost: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  txt: { color: "#fff", fontSize: 16, fontWeight: "900" },
  txtGhost: { color: Palette.text },
});
