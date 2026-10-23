// components/brand/card-deck.tsx
// رصّة بطاقات بإحساس فرز الورق (طلب نهلة: «مثل البلوت»): بطاقتان خلف الحالية مائلتان، والحالية تميل مع
// الإصبع وتطير جانبًا عند الإفلات بعيدًا ثم تصعد التالية. السحب للتنقل فقط (لا تقييم).
// بمكتبة الإيماءات الأصلية فلا يخطف تمرير الصفحة السحب: الأفقي للبطاقة، والعمودي للصفحة.
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

type Props = {
  /** يتغيّر مع كل بطاقة (لإعادة البطاقة لمكانها) */
  cardKey: string;
  canPrev: boolean;
  canNext: boolean;
  /** +1 التالية، −1 السابقة */
  onMove: (d: 1 | -1) => void;
  isRTL: boolean;
  height: number;
  backColor: string;
  borderColor: string;
  children: React.ReactNode;
};

export function CardDeck({ cardKey, canPrev, canNext, onMove, isRTL, height, backColor, borderColor, children }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);

  // بطاقة جديدة: تدخل من الرصّة بهدوء
  useEffect(() => {
    x.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  const settle = (d: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    onMove(d);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 600;
      // بالعربية: السحب لليمين = التالية (كتقليب صفحة كتاب عربي)
      const d: 1 | -1 = (e.translationX > 0) === isRTL ? 1 : -1;
      const allowed = d === 1 ? canNext : canPrev;
      if (far && allowed) {
        x.value = withTiming(Math.sign(e.translationX) * width * 1.2, { duration: 180 }, () => {
          runOnJS(settle)(d);
        });
      } else {
        x.value = withSpring(0, { damping: 16, stiffness: 180 });
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${interpolate(x.value, [-width, 0, width], [-14, 0, 14])}deg` }],
  }));
  // البطاقتان الخلفيتان تقتربان أثناء السحب (تصعد التالية)
  // (الحساب داخل كل نمط: دالة عادية لا تُستدعى من خيط الحركة — كانت تُسقط التطبيق)
  const back1 = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / 160);
    return { transform: [{ scale: 0.95 + 0.05 * p }, { translateY: 14 - 14 * p }, { rotate: "-2.5deg" }] };
  });
  const back2 = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / 160);
    return { transform: [{ scale: 0.9 + 0.05 * p }, { translateY: 26 - 12 * p }, { rotate: "3deg" }] };
  });

  return (
    <View style={{ height }}>
      {canNext ? <Animated.View style={[styles.back, back2, { backgroundColor: backColor, borderColor }]} /> : null}
      {canNext ? <Animated.View style={[styles.back, back1, { backgroundColor: backColor, borderColor }]} /> : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[StyleSheet.absoluteFill, topStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { ...StyleSheet.absoluteFillObject, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, opacity: 0.85 },
});
