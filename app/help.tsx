// app/help.tsx
// صفحة «كيف أستخدم التطبيق؟» — شرح الميزات + إعادة الجولة التعريفية.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import { HowToTour } from "../components/brand/howto-tour";
import { Palette, Radius, Spacing } from "../constants/design";

type Topic = { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body: string };

const TOPICS: Topic[] = [
  { icon: "library", color: Palette.neonViolet, title: "📚 المكتبة", body: "اضغطي كتابًا لفتح منهجه ثم «ابدأ القراءة». الضغط المطوّل يفتح المجلدات والأرشفة وتعديل العنوان." },
  { icon: "list", color: Palette.neonCyan, title: "📋 المنهج الدراسي", body: "وحدات بقائمة متابعة، ولكل وحدة اختبار وخريطة ذهنية وملخّص صوتي. اطبعي المنهج أو الخريطة متى شئتِ." },
  { icon: "headset", color: Palette.neonPink, title: "🎧 القراءة الصوتية", body: "القارئ يقرأ ويشرح بصوت طبيعي. تحكّمي بالسرعة (حتى ×0.5)، وتنقّلي بين المقاطع — والضغط المتكرر يسرّع التخطّي (×2 ×3)." },
  { icon: "search", color: Palette.neonViolet, title: "🔍 العدسة المكبّرة", body: "تكبّر النص المقروء وتتابع الكلمة سطرًا بسطر مع الصوت — مفيدة للتركيز ودقّة المتابعة." },
  { icon: "language", color: Palette.neonCyan, title: "🗣️ النطق والترجمة", body: "نطق دقيق بالتشكيل، وترجمة فورية، وأصوات عربية وإنجليزية وفرنسية." },
  { icon: "sparkles", color: Palette.neonPink, title: "🛠️ أدوات الذكاء", body: "تلخيص الصفحة، الأسئلة، بطاقات المراجعة، الخريطة الذهنية، والعرض التقديمي — كلها بضغطة." },
  { icon: "timer", color: Palette.neonViolet, title: "⏱️ التركيز والمتابعة", body: "مؤقّت تركيز (بومودورو)، سلسلة أيام، ودرجات لوضع التركيز تخفّف المشتّتات أثناء القراءة." },
];

export default function HelpScreen() {
  const router = useRouter();
  const [tour, setTour] = useState(false);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>كيف أستخدم التطبيق؟</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setTour(true)} style={styles.tourBtn}>
            <Ionicons name="play-circle" size={22} color={Palette.neonViolet} />
            <Text style={styles.tourTxt}>إعادة الجولة التعريفية ✨</Text>
          </Pressable>

          {TOPICS.map((t, i) => (
            <View key={i} style={styles.card}>
              <View style={[styles.cardIcon, { backgroundColor: t.color + "22", borderColor: t.color + "55" }]}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t.title}</Text>
                <Text style={styles.cardBody}>{t.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      <HowToTour visible={tour} onClose={() => setTour(false)} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: Palette.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 40 },
  tourBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    borderColor: Palette.neonViolet + "66",
    marginBottom: 4,
  },
  tourTxt: { color: Palette.text, fontSize: 16, fontWeight: "900" },
  card: {
    flexDirection: "row-reverse",
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
  },
  cardIcon: { width: 42, height: 42, borderRadius: Radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: Palette.text, fontSize: 16, fontWeight: "900", textAlign: "right" },
  cardBody: { color: Palette.textMuted, fontSize: 13.5, lineHeight: 23, textAlign: "right", marginTop: 4 },
});
