// app/help.tsx
// صفحة «كيف أستخدم التطبيق؟» — شرح الميزات + إعادة الجولة التعريفية.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "../components/brand/screen-background";
import { HowToTour } from "../components/brand/howto-tour";
import { Palette, Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";

type Topic = { icon: keyof typeof Ionicons.glyphMap; color: string; titleKey: string; bodyKey: string };

const TOPICS: Topic[] = [
  { icon: "library", color: Palette.neonViolet, titleKey: "help.topic.library.title", bodyKey: "help.topic.library.body" },
  { icon: "hand-left", color: Palette.neonBlue, titleKey: "help.topic.longPress.title", bodyKey: "help.topic.longPress.body" },
  { icon: "list", color: Palette.neonCyan, titleKey: "help.topic.syllabus.title", bodyKey: "help.topic.syllabus.body" },
  { icon: "headset", color: Palette.neonPink, titleKey: "help.topic.audio.title", bodyKey: "help.topic.audio.body" },
  { icon: "language", color: Palette.neonCyan, titleKey: "help.topic.pronounce.title", bodyKey: "help.topic.pronounce.body" },
  { icon: "sparkles", color: Palette.neonPink, titleKey: "help.topic.ai.title", bodyKey: "help.topic.ai.body" },
  { icon: "timer", color: Palette.neonViolet, titleKey: "help.topic.focus.title", bodyKey: "help.topic.focus.body" },
];

export default function HelpScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const [tour, setTour] = useState(false);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={Palette.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("help.title")}</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setTour(true)} style={[styles.tourBtn, { flexDirection: dir.row }]}>
            <Ionicons name="play-circle" size={22} color={Palette.neonViolet} />
            <Text style={styles.tourTxt}>{t("help.replayTour")}</Text>
          </Pressable>

          {TOPICS.map((topic, i) => (
            <View key={i} style={[styles.card, { flexDirection: dir.row }]}>
              <View style={[styles.cardIcon, { backgroundColor: topic.color + "22", borderColor: topic.color + "55" }]}>
                <Ionicons name={topic.icon} size={20} color={topic.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { textAlign: dir.textAlign }]}>{t(topic.titleKey)}</Text>
                <Text style={[styles.cardBody, { textAlign: dir.textAlign }]}>{t(topic.bodyKey)}</Text>
              </View>
            </View>
          ))}

          {/* جهة الاتصال */}
          <Pressable
            onPress={() => Linking.openURL("mailto:Nahlah@Nahlah.io").catch(() => {})}
            style={styles.contact}
          >
            <Text style={styles.contactName}>{t("help.contact.design")}</Text>
            <Text style={styles.contactMail}>{t("help.contact.mail")}</Text>
            <Text style={styles.madeIn}>{t("help.madeIn")}</Text>
          </Pressable>
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
  contact: { alignItems: "center", marginTop: 18, paddingVertical: 8 },
  contactName: { color: Palette.text, fontSize: 14, fontWeight: "900" },
  contactMail: { color: Palette.neonCyan, fontSize: 13, fontWeight: "700", marginTop: 4 },
  madeIn: { color: Palette.textMuted, fontSize: 13, fontWeight: "800", marginTop: 8 },
});
