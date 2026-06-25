import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { getDueCards, reviewCard, type Card, type Rating } from "../../lib/flashcards";

export default function FlashcardsScreen() {
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const flip = useRef(new Animated.Value(0)).current; // 0 = أمام، 180 = خلف

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setIdx(0);
      setFlipped(false);
      flip.setValue(0);
      getDueCards().then((c) => {
        setCards(c);
        setLoading(false);
      });
    }, [flip])
  );

  const card = cards[idx];
  const done = !loading && idx >= cards.length;

  function toggleFlip() {
    const to = flipped ? 0 : 180;
    Animated.spring(flip, { toValue: to, useNativeDriver: true, friction: 9, tension: 12 }).start();
    setFlipped((f) => !f);
  }

  async function rate(r: Rating) {
    if (!card) return;
    await reviewCard(card.id, r);
    flip.setValue(0);
    setFlipped(false);
    setIdx((i) => i + 1);
  }

  const frontStyle = {
    transform: [
      { perspective: 1200 },
      { rotateY: flip.interpolate({ inputRange: [0, 180], outputRange: ["0deg", "180deg"] }) },
    ],
  };
  const backStyle = {
    transform: [
      { perspective: 1200 },
      { rotateY: flip.interpolate({ inputRange: [0, 180], outputRange: ["180deg", "360deg"] }) },
    ],
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ScreenHeader
          icon="albums"
          title="البطاقات"
          subtitle={!loading && !done ? `${idx + 1} من ${cards.length}` : "مراجعة بالتكرار المتباعد"}
          color={Palette.neonPink}
        />

        {loading ? (
          <View style={styles.center}>
            <Text style={styles.dim}>جارٍ التحميل…</Text>
          </View>
        ) : done ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-done-circle" size={72} color={Palette.success} />
            <Text style={styles.doneTitle}>
              {cards.length === 0 ? "لا توجد بطاقات مستحقّة اليوم 🎉" : "أنهيتِ مراجعة اليوم! 🎉"}
            </Text>
            <Text style={styles.dim}>
              {cards.length === 0
                ? "ولّدي بطاقات من زر «ذكاء» داخل القارئ."
                : "ارجعي غدًا للمراجعة التالية."}
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            {card?.bookTitle ? (
              <Text style={styles.bookTag} numberOfLines={1}>📖 {card.bookTitle}</Text>
            ) : (
              <View style={{ height: 18 }} />
            )}

            <View style={styles.cardArea}>
              <Pressable onPress={toggleFlip} style={styles.press}>
                {/* الوجه الأمامي — السؤال */}
                <Animated.View style={[styles.face, frontStyle]}>
                  <LinearGradient
                    colors={Gradients.brand}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.faceGrad}
                  >
                    <Ionicons name="help" size={150} color="rgba(255,255,255,0.08)" style={styles.watermark} />
                    <Text style={styles.faceLabel}>السؤال</Text>
                    <Text style={styles.faceText}>{card?.front}</Text>
                    <View style={styles.tapHintRow}>
                      <Ionicons name="sync" size={13} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.tapHint}>اضغطي لقلب البطاقة</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>

                {/* الوجه الخلفي — الإجابة */}
                <Animated.View style={[styles.face, styles.faceBack, backStyle]}>
                  <LinearGradient
                    colors={Gradients.success}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.faceGrad}
                  >
                    <Ionicons name="bulb" size={150} color="rgba(255,255,255,0.10)" style={styles.watermark} />
                    <Text style={styles.faceLabelDark}>الإجابة</Text>
                    <Text style={styles.faceTextDark}>{card?.back}</Text>
                  </LinearGradient>
                </Animated.View>
              </Pressable>
            </View>

            {flipped ? (
              <View style={styles.ratings}>
                <GradientButton title="مرة ثانية" colors={["#ff5d6c", "#ff8a5c"]} onPress={() => rate("again")} style={{ flex: 1 }} />
                <GradientButton title="جيد" colors={Gradients.brand} onPress={() => rate("good")} style={{ flex: 1 }} />
                <GradientButton title="سهل" colors={Gradients.success} onPress={() => rate("easy")} style={{ flex: 1 }} />
              </View>
            ) : (
              <GradientButton title="اكشفي الإجابة" icon="eye" colors={Gradients.neon} onPress={toggleFlip} />
            )}
          </View>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: 10 },
  dim: { color: Palette.textDim, fontSize: 14, textAlign: "center", lineHeight: 22 },
  doneTitle: { color: Palette.text, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 8 },

  body: { flex: 1, paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: Spacing.lg },
  bookTag: { color: Palette.textDim, fontSize: 13, fontWeight: "700", textAlign: "center" },

  cardArea: { flex: 1 },
  press: { flex: 1 },
  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xl,
    overflow: "hidden",
    backfaceVisibility: "hidden",
    shadowColor: Palette.neonViolet,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  faceBack: {},
  faceGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl,
    gap: 14,
  },
  watermark: { position: "absolute", top: 18, left: 14 },
  faceLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  faceText: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center", lineHeight: 38 },
  faceLabelDark: { color: "rgba(11,18,32,0.7)", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  faceTextDark: { color: "#0b1220", fontSize: 24, fontWeight: "900", textAlign: "center", lineHeight: 38 },
  tapHintRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 10 },
  tapHint: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },

  ratings: { flexDirection: "row-reverse", gap: 8 },
});
