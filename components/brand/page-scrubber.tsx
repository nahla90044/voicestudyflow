// components/brand/page-scrubber.tsx
// شريط تنقّل سريع بين صفحات الكتاب: المستخدم يلمس أي موضع أو يسحب إصبعه،
// فتظهر فقاعة برقم الصفحة، وعند رفع الإصبع ينتقل إليها.
//
// كان الانتقال قبلها يتطلّب فتح نافذة وكتابة الرقم يدويًا — بطيء لمن يريد
// التقليب. وأثناء القراءة يتتبّع الشريط الصفحة المقروءة تلقائيًا.
//
// نستعمل PanResponder المدمج في React Native: لا تبعية جديدة، ويعمل داخل
// ScrollView بأمان لأننا نحجز الإيماءة عند بدء اللمس.
import React, { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { fractionForPage, pageAtX } from "../../lib/scrubberMath";

type Props = {
  page: number;
  totalPages: number;
  /** يُستدعى عند رفع الإصبع فقط — لا نُحمّل صفحة مع كل حركة إصبع */
  onSeek: (page: number) => void;
  /** اتجاه الواجهة: في العربية الصفحة الأولى يمين الشريط */
  rtl?: boolean;
  /** القارئ في الوضع الورقي (خلفية فاتحة) → ألوان داكنة واضحة */
  paper?: boolean;
};

// ألوان الشريط بهوية التطبيق (ذهبي على كحلي)، بنسخة واضحة على الورق الفاتح
const GOLD = "#F6D58A";
const GOLD_DEEP = "#C9922E";
const NAVY = "#14213D";

const BAR_H = 6;
const TOUCH_H = 34; // مساحة لمس مريحة حول الشريط الرفيع

export function PageScrubber({ page, totalPages, onSeek, rtl = true, paper = false }: Props) {
  const [width, setWidth] = useState(0);
  const [dragPage, setDragPage] = useState<number | null>(null);
  const widthRef = useRef(0);
  const bubble = useRef(new Animated.Value(0)).current;

  // نسبة الصفحة المعروضة: أثناء السحب نتبع الإصبع، وإلا نتبع القارئ
  const shown = dragPage ?? page;
  const frac = fractionForPage(shown, totalPages);

  const atX = (x: number): number => pageAtX(x, widthRef.current, totalPages, rtl);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => totalPages > 1,
        onMoveShouldSetPanResponder: () => totalPages > 1,
        // نمنع ScrollView الأب من خطف الإيماءة أثناء السحب الأفقي
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          setDragPage(atX(e.nativeEvent.locationX));
          Animated.timing(bubble, { toValue: 1, duration: 120, useNativeDriver: true }).start();
        },
        onPanResponderMove: (e) => {
          setDragPage(atX(e.nativeEvent.locationX));
        },
        onPanResponderRelease: (e) => {
          const target = atX(e.nativeEvent.locationX);
          setDragPage(null);
          Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start();
          onSeek(target); // التحميل يحدث مرة واحدة عند الرفع
        },
        onPanResponderTerminate: () => {
          setDragPage(null);
          Animated.timing(bubble, { toValue: 0, duration: 160, useNativeDriver: true }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totalPages, rtl],
  );

  if (totalPages < 2) return null;

  const pct = `${Math.round(frac * 100)}%`;
  // موضع الفقاعة يتبع الإصبع مع مراعاة اتجاه الواجهة
  const bubbleLeft = rtl ? `${Math.round((1 - frac) * 100)}%` : pct;

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bubble,
          { left: bubbleLeft as any, opacity: bubble, transform: [{ translateX: -22 }] },
        ]}
      >
        <Text style={styles.bubbleTxt}>{shown}</Text>
      </Animated.View>

      <View
        style={styles.touch}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setWidth(w);
        }}
        {...pan.panHandlers}
      >
        <View style={[styles.track, paper ? styles.trackPaper : null]}>
          <View
            style={[
              styles.fill,
              { width: pct as any, backgroundColor: paper ? GOLD_DEEP : GOLD },
              rtl ? { right: 0 } : { left: 0 },
            ]}
          />
        </View>
        {width > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.knob,
              paper ? styles.knobPaper : null,
              rtl
                ? { right: Math.max(0, frac * width - 7) }
                : { left: Math.max(0, frac * width - 7) },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginHorizontal: 4 },
  touch: { height: TOUCH_H, justifyContent: "center" },
  track: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  trackPaper: { backgroundColor: "rgba(20,33,61,0.16)", borderColor: "rgba(20,33,61,0.30)" },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  knob: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: GOLD,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  knobPaper: { backgroundColor: NAVY, borderColor: GOLD_DEEP },
  bubble: {
    position: "absolute",
    bottom: TOUCH_H - 2,
    minWidth: 44,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: Palette.bgElevated,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    alignItems: "center",
  },
  bubbleTxt: { color: Palette.text, fontSize: 13, fontWeight: "900" },
});
