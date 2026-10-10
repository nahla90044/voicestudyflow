// components/brand/tour-pager.tsx
// صفحات الجولة التعريفية بألوان مشهد الوقت الحالي — تُستخدم في شاشة الترحيب وفي «المساعدة».
import React, { useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { PressableScale } from "./motion";
import { TOUR } from "./tour-scenes";

const { width } = Dimensions.get("window");

export function TourPager({ onDone, doneLabel }: { onDone: () => void; doneLabel: string }) {
  const { t } = useI18n();
  const { pal } = useScene();
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
          <Text style={[styles.skip, { color: pal.dim }]}>{t("onboarding.skip")}</Text>
        </Pressable>
        <Text style={[styles.counter, { color: pal.dim }]}>
          {index + 1} / {TOUR.length}
        </Text>
      </View>

      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {TOUR.map(({ key, Scene }, i) => (
          <View key={key} style={[styles.slide, { width }]}>
            <Scene active={i === index} />
            <View style={styles.textBox}>
              <Text style={[styles.eyebrow, { color: pal.accent }]}>{t(`tour.${key}.eyebrow`)}</Text>
              <Text style={[styles.title, { color: pal.ink }]}>{t(`tour.${key}.title`)}</Text>
              <Text style={[styles.body, { color: pal.dim }]}>{t(`tour.${key}.body`)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {TOUR.map((s, i) => (
          <View key={s.key} style={[styles.dot, { backgroundColor: pal.track }, i === index && { width: 24, backgroundColor: pal.accent }]} />
        ))}
      </View>

      <View style={styles.footer}>
        <PressableScale onPress={next}>
          <View style={[styles.cta, { backgroundColor: pal.accent }]}>
            <Text style={[styles.ctaTxt, { color: pal.onAccent }]}>{isLast ? doneLabel : t("common.next")}</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 22, paddingTop: 8 },
  skip: { fontWeight: "700", fontSize: 14 },
  counter: { fontSize: 13, fontWeight: "600" },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 30 },
  textBox: { alignItems: "center", gap: 10 },
  eyebrow: { fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 26, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, marginBottom: 18 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  footer: { paddingHorizontal: 22, paddingBottom: 14 },
  cta: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  ctaTxt: { fontSize: 16.5, fontWeight: "800" },
});
