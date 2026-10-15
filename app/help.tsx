// app/help.tsx
// صفحة «كيف أستخدم التطبيق؟» — شرح الميزات + إعادة الجولة التعريفية.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HowToTour } from "../components/brand/howto-tour";
import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";

type Topic = { icon: keyof typeof Ionicons.glyphMap; titleKey: string; bodyKey: string };

const TOPICS: Topic[] = [
  { icon: "library", titleKey: "help.topic.library.title", bodyKey: "help.topic.library.body" },
  { icon: "hand-left", titleKey: "help.topic.longPress.title", bodyKey: "help.topic.longPress.body" },
  { icon: "list", titleKey: "help.topic.syllabus.title", bodyKey: "help.topic.syllabus.body" },
  { icon: "headset", titleKey: "help.topic.audio.title", bodyKey: "help.topic.audio.body" },
  { icon: "language", titleKey: "help.topic.pronounce.title", bodyKey: "help.topic.pronounce.body" },
  { icon: "sparkles", titleKey: "help.topic.ai.title", bodyKey: "help.topic.ai.body" },
  { icon: "timer", titleKey: "help.topic.focus.title", bodyKey: "help.topic.focus.body" },
];

export default function HelpScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [tour, setTour] = useState(false);

  return (
    <SceneScreen>
      <SceneBanner
        title={t("help.title")}
        height={150}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("common.close")}>
            <SceneIconButton>
              <Ionicons name="chevron-forward" size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => setTour(true)}
          style={[styles.tourBtn, { flexDirection: dir.row, backgroundColor: pal.accent, borderColor: pal.accent }]}
        >
          <Ionicons name="play-circle" size={22} color={pal.onAccent} />
          <Text style={[styles.tourTxt, { color: pal.onAccent }]}>{t("help.replayTour")}</Text>
        </Pressable>

        {TOPICS.map((topic, i) => (
          <SceneCard key={i} padded={false} style={[styles.card, { flexDirection: dir.row }]}>
            <View style={[styles.cardIcon, { backgroundColor: pal.soft, borderColor: pal.accent + "55" }]}>
              <Ionicons name={topic.icon} size={20} color={pal.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: pal.ink, textAlign: dir.textAlign }]}>{t(topic.titleKey)}</Text>
              <Text style={[styles.cardBody, { color: pal.dim, textAlign: dir.textAlign }]}>{t(topic.bodyKey)}</Text>
            </View>
          </SceneCard>
        ))}

        {/* جهة الاتصال */}
        <Pressable
          onPress={() => Linking.openURL("mailto:Nahlah@Nahlah.io").catch(() => {})}
          style={styles.contact}
        >
          <Text style={[styles.contactMail, { color: pal.accent }]}>{t("help.contact.mail")}</Text>
          <Text style={[styles.madeIn, { color: pal.dim }]}>{t("help.madeIn")}</Text>
        </Pressable>
      </ScrollView>

      <HowToTour visible={tour} onClose={() => setTour(false)} />
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.lg, paddingTop: 4, gap: 12, paddingBottom: 40 },
  tourBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  tourTxt: { fontSize: 16, fontWeight: "900" },
  card: { flexDirection: "row-reverse", gap: 12, padding: 14, borderRadius: Radius.lg },
  cardIcon: { width: 42, height: 42, borderRadius: Radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "900", textAlign: "right" },
  cardBody: { fontSize: 13.5, lineHeight: 23, textAlign: "right", marginTop: 4 },
  contact: { alignItems: "center", marginTop: 18, paddingVertical: 8 },
  contactMail: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  madeIn: { fontSize: 13, fontWeight: "800", marginTop: 8 },
});
