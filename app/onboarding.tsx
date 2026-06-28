// app/onboarding.tsx
// توتوريال ترحيبي يظهر أول مرة فقط.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import {
  PlanArt,
  ReadListenArt,
  SecureArt,
  VoiceWaveArt,
} from "../components/brand/illustrations";
import { Gradients, Palette, Radius, Spacing } from "../constants/design";
import { useI18n } from "../lib/i18n";

export const ONBOARDING_KEY = "vsf_onboarded_v1";

const { width } = Dimensions.get("window");

type Slide = {
  key: string;
  titleKey: string;
  bodyKey: string;
  Art: React.ComponentType<{ size?: number }>;
};

const SLIDES: Slide[] = [
  {
    key: "read",
    titleKey: "onboarding.read.title",
    bodyKey: "onboarding.read.body",
    Art: ReadListenArt,
  },
  {
    key: "voice",
    titleKey: "onboarding.voice.title",
    bodyKey: "onboarding.voice.body",
    Art: VoiceWaveArt,
  },
  {
    key: "plan",
    titleKey: "onboarding.plan.title",
    bodyKey: "onboarding.plan.body",
    Art: PlanArt,
  },
  {
    key: "secure",
    titleKey: "onboarding.secure.title",
    bodyKey: "onboarding.secure.body",
    Art: SecureArt,
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }

  function goNext() {
    if (isLast) return finish();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    router.replace("/(tabs)");
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        {/* تخطّي */}
        <View style={styles.topBar}>
          <Pressable onPress={finish} hitSlop={12}>
            <Text style={styles.skip}>{t("onboarding.skip")}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {SLIDES.map(({ key, titleKey, bodyKey, Art }) => (
            <View key={key} style={[styles.slide, { width }]}>
              <View style={styles.artWrap}>
                <Art size={240} />
              </View>
              <Text style={styles.title}>{t(titleKey)}</Text>
              <Text style={styles.body}>{t(bodyKey)}</Text>
            </View>
          ))}
        </ScrollView>

        {/* النقاط */}
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>

        {/* زر المتابعة */}
        <View style={styles.footer}>
          <Pressable onPress={goNext} style={styles.cta}>
            <LinearGradient
              colors={Gradients.neon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGrad}
            >
              <Text style={styles.ctaTxt}>
                {isLast ? t("onboarding.start") : t("common.next")}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  skip: { color: Palette.textDim, fontWeight: "800", fontSize: 14 },

  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xxl,
  },
  artWrap: { marginBottom: Spacing.xxl },
  title: {
    color: Palette.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  body: {
    color: Palette.textDim,
    fontSize: 15,
    lineHeight: 26,
    textAlign: "center",
  },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surfaceStrong,
  },
  dotActive: { width: 22, backgroundColor: Palette.primary },

  footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg },
  cta: { borderRadius: Radius.lg, overflow: "hidden" },
  ctaGrad: { height: 54, alignItems: "center", justifyContent: "center" },
  ctaTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
