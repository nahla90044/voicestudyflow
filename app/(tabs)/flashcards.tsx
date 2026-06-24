import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setIdx(0);
      setFlipped(false);
      getDueCards().then((c) => {
        setCards(c);
        setLoading(false);
      });
    }, [])
  );

  const card = cards[idx];
  const done = !loading && idx >= cards.length;

  async function rate(r: Rating) {
    if (!card) return;
    await reviewCard(card.id, r);
    setFlipped(false);
    setIdx((i) => i + 1);
  }

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
            {card?.bookTitle ? <Text style={styles.bookTag}>📖 {card.bookTitle}</Text> : null}

            <Pressable onPress={() => setFlipped((f) => !f)} style={styles.cardBox}>
              <Text style={styles.faceLabel}>{flipped ? "الإجابة" : "السؤال"}</Text>
              <Text style={styles.faceText}>{flipped ? card?.back : card?.front}</Text>
              {!flipped ? <Text style={styles.tapHint}>اضغطي لكشف الإجابة</Text> : null}
            </Pressable>

            {flipped ? (
              <View style={styles.ratings}>
                <GradientButton title="مرة ثانية" colors={["#ff5d6c", "#ff8a5c"]} onPress={() => rate("again")} style={{ flex: 1 }} />
                <GradientButton title="جيد" colors={Gradients.brand} onPress={() => rate("good")} style={{ flex: 1 }} />
                <GradientButton title="سهل" colors={Gradients.success} onPress={() => rate("easy")} style={{ flex: 1 }} />
              </View>
            ) : (
              <GradientButton title="اكشفي الإجابة" icon="eye" colors={Gradients.neon} onPress={() => setFlipped(true)} />
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
  bookTag: { color: Palette.textDim, fontSize: 13, fontWeight: "700", textAlign: "right" },
  cardBox: {
    flex: 1,
    borderRadius: Radius.xl,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl,
    gap: 14,
  },
  faceLabel: { color: Palette.primary, fontSize: 13, fontWeight: "900" },
  faceText: { color: Palette.text, fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 34 },
  tapHint: { color: Palette.textDim, fontSize: 12, marginTop: 8 },
  ratings: { flexDirection: "row-reverse", gap: 8 },
});
