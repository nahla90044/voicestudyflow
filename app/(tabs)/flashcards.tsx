import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GradientButton } from "../../components/brand/gradient-button";
import { ScreenBackground } from "../../components/brand/screen-background";
import { ScreenHeader } from "../../components/brand/screen-header";
import { Gradients, Palette, Radius, Spacing } from "../../constants/design";
import { getCards, reviewCard, type Card, type Rating } from "../../lib/flashcards";

const ALL = "__all__";
const NONE = "__none__";

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type BookGroup = { key: string; title: string; total: number; due: number };

export default function FlashcardsScreen() {
  const [all, setAll] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"picker" | "review">("picker");
  const [queue, setQueue] = useState<Card[]>([]);
  const [bookName, setBookName] = useState("");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;

  const reload = useCallback(() => {
    setLoading(true);
    getCards().then((c) => {
      setAll(c);
      setLoading(false);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setMode("picker");
      reload();
    }, [reload])
  );

  const books = useMemo<BookGroup[]>(() => {
    const today = todayISO();
    const map = new Map<string, BookGroup>();
    for (const c of all) {
      const key = c.bookId ?? NONE;
      const g = map.get(key) ?? { key, title: c.bookTitle || "بطاقات عامة", total: 0, due: 0 };
      g.total += 1;
      if (c.due <= today) g.due += 1;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.due - a.due);
  }, [all]);

  const totalDue = useMemo(() => {
    const today = todayISO();
    return all.filter((c) => c.due <= today).length;
  }, [all]);

  function startBook(key: string, title: string) {
    const today = todayISO();
    const inBook = (c: Card) => key === ALL || (c.bookId ?? NONE) === key;
    let q = all.filter((c) => inBook(c) && c.due <= today);
    if (q.length === 0) q = all.filter(inBook); // لا مستحقّ؟ راجعي كل بطاقات الكتاب
    setQueue(q);
    setBookName(title);
    setIdx(0);
    setFlipped(false);
    flip.setValue(0);
    setMode("review");
  }

  function toggleFlip() {
    Animated.spring(flip, { toValue: flipped ? 0 : 180, useNativeDriver: true, friction: 9, tension: 12 }).start();
    setFlipped((f) => !f);
  }

  async function rate(r: Rating) {
    const card = queue[idx];
    if (card) await reviewCard(card.id, r);
    flip.setValue(0);
    setFlipped(false);
    setIdx((i) => i + 1);
  }

  const card = queue[idx];
  const reviewDone = mode === "review" && idx >= queue.length;

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
          subtitle={mode === "review" ? bookName : "اختاري الكتاب الذي تريدين مراجعته"}
          color={Palette.neonPink}
        />

        {/* ====== اختيار الكتاب ====== */}
        {mode === "picker" ? (
          loading ? (
            <View style={styles.center}>
              <Text style={styles.dim}>جارٍ التحميل…</Text>
            </View>
          ) : books.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="albums-outline" size={64} color={Palette.textDim} />
              <Text style={styles.doneTitle}>لا توجد بطاقات بعد</Text>
              <Text style={styles.dim}>ولّدي بطاقات من زر «ذكاء» داخل القارئ، أو من «حوّلي تحديداتي إلى بطاقات».</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.pickerWrap} showsVerticalScrollIndicator={false}>
              {books.length > 1 ? (
                <Pressable onPress={() => startBook(ALL, "كل الكتب")} style={[styles.bookRow, styles.allRow]}>
                  <View style={styles.bookInfo}>
                    <Text style={styles.bookTitle}>📚 كل الكتب</Text>
                    <Text style={styles.bookSub}>{all.length} بطاقة</Text>
                  </View>
                  <View style={[styles.dueBadge, totalDue === 0 && styles.dueBadge0]}>
                    <Text style={styles.dueBadgeTxt}>{totalDue}</Text>
                  </View>
                </Pressable>
              ) : null}

              {books.map((b) => (
                <Pressable key={b.key} onPress={() => startBook(b.key, b.title)} style={styles.bookRow}>
                  <View style={styles.bookInfo}>
                    <Text style={styles.bookTitle} numberOfLines={1}>📖 {b.title}</Text>
                    <Text style={styles.bookSub}>{b.total} بطاقة · {b.due} مستحقّة</Text>
                  </View>
                  <View style={[styles.dueBadge, b.due === 0 && styles.dueBadge0]}>
                    <Text style={styles.dueBadgeTxt}>{b.due}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )
        ) : reviewDone ? (
          /* ====== انتهت المراجعة ====== */
          <View style={styles.center}>
            <Ionicons name="checkmark-done-circle" size={72} color={Palette.success} />
            <Text style={styles.doneTitle}>أنهيتِ مراجعة «{bookName}» 🎉</Text>
            <GradientButton title="رجوع للكتب" icon="arrow-back" onPress={() => setMode("picker")} style={{ alignSelf: "stretch", marginTop: Spacing.lg }} />
          </View>
        ) : (
          /* ====== المراجعة ====== */
          <View style={styles.body}>
            <View style={styles.reviewTop}>
              <Pressable onPress={() => setMode("picker")} hitSlop={8} style={styles.backChip}>
                <Ionicons name="chevron-forward" size={16} color={Palette.text} />
                <Text style={styles.backChipTxt}>الكتب</Text>
              </Pressable>
              <Text style={styles.counter}>{idx + 1} / {queue.length}</Text>
            </View>

            <View style={styles.cardArea}>
              <Pressable onPress={toggleFlip} style={styles.press}>
                <Animated.View style={[styles.face, frontStyle]}>
                  <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.faceGrad}>
                    <Ionicons name="help" size={150} color="rgba(255,255,255,0.08)" style={styles.watermark} />
                    <Text style={styles.faceLabel}>السؤال</Text>
                    <Text style={styles.faceText}>{card?.front}</Text>
                    <View style={styles.tapHintRow}>
                      <Ionicons name="sync" size={13} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.tapHint}>اضغطي لقلب البطاقة</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
                <Animated.View style={[styles.face, backStyle]}>
                  <LinearGradient colors={Gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.faceGrad}>
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

  pickerWrap: { paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: 10 },
  bookRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  allRow: { borderColor: Palette.neonPink + "66", backgroundColor: Palette.neonPink + "14" },
  bookInfo: { flex: 1 },
  bookTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", textAlign: "right" },
  bookSub: { color: Palette.textDim, fontSize: 12, fontWeight: "700", textAlign: "right", marginTop: 3 },
  dueBadge: { minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: 17, backgroundColor: Palette.neonPink, alignItems: "center", justifyContent: "center" },
  dueBadge0: { backgroundColor: Palette.surfaceStrong ?? "rgba(255,255,255,0.12)" },
  dueBadgeTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },

  body: { flex: 1, paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: Spacing.lg },
  reviewTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  backChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.glassBorder },
  backChipTxt: { color: Palette.text, fontSize: 13, fontWeight: "800" },
  counter: { color: Palette.textDim, fontSize: 13, fontWeight: "800" },

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
  faceGrad: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xxl, gap: 14 },
  watermark: { position: "absolute", top: 18, left: 14 },
  faceLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  faceText: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center", lineHeight: 38 },
  faceLabelDark: { color: "rgba(11,18,32,0.7)", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  faceTextDark: { color: "#0b1220", fontSize: 24, fontWeight: "900", textAlign: "center", lineHeight: 38 },
  tapHintRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 10 },
  tapHint: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },

  ratings: { flexDirection: "row-reverse", gap: 8 },
});
