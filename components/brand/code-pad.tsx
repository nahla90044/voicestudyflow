// components/brand/code-pad.tsx
// إدخال رمز (دخول/تحقق ثنائي) بلوحة أرقام داخل التطبيق بدل لوحة الجهاز:
//  - لوحة الجهاز في المنطقة العربية تكتب ٠١٢٣ ولا يمكن تبديلها، وأحيانًا تختفي فتعلق الشاشة.
//  - هنا الأرقام إنجليزية دائمًا، الأزرار كبيرة، ولا شيء يختفي. يُرسل الرمز تلقائيًا عند اكتماله.
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { Palette } from "../../constants/design";

type Props = {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  disabled?: boolean;
  /** يُستدعى مرة واحدة عند اكتمال الرمز (إرسال تلقائي) */
  onComplete?: (code: string) => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function CodePad({ value, onChange, length = 6, disabled, onComplete }: Props) {
  function press(k: string) {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    if (k === "del") return onChange(value.slice(0, -1));
    if (value.length >= length) return;
    const next = value + k;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  return (
    <View style={styles.wrap}>
      {/* خانات الرمز — من اليسار لليمين دائمًا (الأرقام لا تنقلب مع العربية) */}
      <View style={styles.boxes} accessibilityLabel={`${value.length} / ${length}`}>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          const current = i === value.length && !disabled;
          return (
            <View key={i} style={[styles.box, filled && styles.boxFilled, current && styles.boxCurrent]}>
              <Text style={styles.boxTxt}>{value[i] ?? ""}</Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.pad, disabled && { opacity: 0.5 }]}>
        {KEYS.map((k, i) =>
          k === "" ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(k)}
              onLongPress={k === "del" ? () => onChange("") : undefined}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={k === "del" ? "حذف" : k}
              style={({ pressed }) => [styles.key, styles.keyBtn, pressed && styles.keyPressed]}
            >
              {k === "del" ? (
                <Ionicons name="backspace-outline" size={26} color={Palette.text} />
              ) : (
                <Text style={styles.keyTxt}>{k}</Text>
              )}
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 18 },
  boxes: { flexDirection: "row", direction: "ltr", justifyContent: "center", gap: 8 },
  box: {
    width: 44,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFilled: { borderColor: Palette.neonViolet },
  boxCurrent: { borderColor: Palette.neonCyan },
  boxTxt: { color: Palette.text, fontSize: 24, fontWeight: "800" },
  pad: { flexDirection: "row", direction: "ltr", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  key: { width: "31%", height: 58 },
  keyBtn: {
    borderRadius: 14,
    backgroundColor: Palette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: Palette.primarySoft },
  keyTxt: { color: Palette.text, fontSize: 26, fontWeight: "700" },
});
