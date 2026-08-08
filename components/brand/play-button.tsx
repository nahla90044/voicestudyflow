// components/brand/play-button.tsx
// زر التشغيل الرئيسي — الفعل الأهم في التطبيق كله.
//
// النسخة السابقة كانت دائرة خضراء ٥٦px بأيقونة فقط: لا كلمة تشرحها، ولا لون
// من هوية التطبيق، ولا وزن بصري يميّزها عن زرّي التنقّل بجانبها. هنا نعالج
// ذلك بأربعة أشياء: حجم أكبر، تدرّج الهوية، كلمة صريحة، وتوهّج يفصلها عن الخلفية.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { Gradients, Palette } from "../../constants/design";
import { useI18n } from "../../lib/i18n";

type Props = {
  playing: boolean;
  busy?: boolean;
  onPress: () => void;
  /** قطر الدائرة */
  size?: number;
  /** إظهار الكلمة تحت الزر */
  showLabel?: boolean;
  /**
   * نبضة تلفت الانتباه — تُعرض فقط قبل أول تشغيل في هذا الكتاب.
   * توقف فور بدء التشغيل حتى لا تتحوّل إلى إزعاج دائم.
   */
  hint?: boolean;
};

export function PlayButton({
  playing,
  busy = false,
  onPress,
  size = 72,
  showLabel = true,
  hint = false,
}: Props) {
  const { t } = useI18n();

  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  // حلقة النبض: تعمل فقط عند hint، وتتوقّف وتُصفَّر عند التشغيل
  useEffect(() => {
    if (!hint || playing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [hint, playing, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  }

  const r = size / 2;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {/* حلقة النبض خلف الزر */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: r,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />

        <Pressable
          onPress={handlePress}
          onPressIn={() =>
            Animated.spring(press, { toValue: 0.93, useNativeDriver: true, speed: 40 }).start()
          }
          onPressOut={() =>
            Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 40 }).start()
          }
          accessibilityRole="button"
          accessibilityLabel={playing ? t("reader.play.pause") : t("reader.play.listen")}
          hitSlop={8}
        >
          <Animated.View style={{ transform: [{ scale: press }] }}>
            <LinearGradient
              // متوقّف = تدرّج نيون لافت، شغّال = تدرّج هادئ يدلّ على تغيّر الحالة
              colors={playing ? Gradients.brand : Gradients.neon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.circle, { width: size, height: size, borderRadius: r }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name={playing ? "pause" : "play"}
                  size={Math.round(size * 0.42)}
                  color="#fff"
                  // أيقونة التشغيل تبدو مزاحة لليسار بصريًا — نصحّحها يدويًا
                  style={playing ? undefined : { marginLeft: Math.round(size * 0.04) }}
                />
              )}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>

      {showLabel && (
        <Text style={styles.label} numberOfLines={1}>
          {playing ? t("reader.play.pause") : t("reader.play.listen")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 6 },
  ring: { position: "absolute", backgroundColor: Palette.neonCyan },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    // التوهّج يفصل الزر عن الخلفية الداكنة ويمنحه ثقلًا بصريًا
    shadowColor: Palette.neonViolet,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  label: { color: Palette.text, fontSize: 12.5, fontWeight: "900", letterSpacing: 0.2 },
});
