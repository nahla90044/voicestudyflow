// components/brand/tour-pager.tsx
// صفحات الجولة التعريفية (تصميم 2.0) — تُستخدم في شاشة الترحيب وفي «المساعدة».
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { Gradients, Palette } from "../../constants/design";
import { useI18n } from "../../lib/i18n";
import { PressableScale } from "./motion";
import { TOUR } from "./tour-scenes";

const { width } = Dimensions.get("window");

export function TourPager({ onDone, doneLabel }: { onDone: () => void; doneLabel: string }) {
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === TOUR.length - 1;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }
  function next() {
    if (isLast) return onDone();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onDone} hitSlop={12}>
          <Text style={styles.skip}>{t("onboarding.skip")}</Text>
        </Pressable>
        <Text style={styles.counter}>
          {index + 1} / {TOUR.length}
        </Text>
      </View>

      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {TOUR.map(({ key, Scene }, i) => (
          <View key={key} style={[styles.slide, { width }]}>
            <Scene active={i === index} />
            <View style={styles.textBox}>
              <Text style={styles.eyebrow}>{t(`tour.${key}.eyebrow`)}</Text>
              <Text style={styles.title}>{t(`tour.${key}.title`)}</Text>
              <Text style={styles.body}>{t(`tour.${key}.body`)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {TOUR.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.footer}>
        <PressableScale onPress={next}>
          <LinearGradient colors={Gradients.neon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Text style={styles.ctaTxt}>{isLast ? doneLabel : t("common.next")}</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 22, paddingTop: 8 },
  skip: { color: Palette.textDim, fontWeight: "700", fontSize: 14 },
  counter: { color: "#6F7690", fontSize: 13, fontWeight: "600" },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 34 },
  textBox: { alignItems: "center", gap: 10 },
  eyebrow: { color: "#B9AFFF", fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5 },
  title: { color: Palette.text, fontSize: 26, fontWeight: "800", textAlign: "center" },
  body: { color: "#A3A9BE", fontSize: 15, lineHeight: 26, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, marginBottom: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  dotOn: { width: 24, backgroundColor: "#B9AFFF" },
  footer: { paddingHorizontal: 22, paddingBottom: 14 },
  cta: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: "#fff", fontSize: 16.5, fontWeight: "800" },
});
