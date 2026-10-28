// app/support-inbox.tsx
// «رسائل الدعم» للمالكة (قرار ٢٨ أكتوبر): ما لم يحلّه وكيل الدعم، بسؤال صاحبه وإجابة الوكيل ونسخته وباقته،
// و«الرد بالبريد» يفتح رسالة لبريده، و«تم» يغلقها. الخادم لا يُرجع شيئًا لغير المالكة.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SceneBanner, SceneCard, SceneIconButton, SceneScreen } from "../components/brand/scene-screen";
import { Radius, Spacing } from "../constants/design";
import { useDir, useI18n } from "../lib/i18n";
import { useScene } from "../lib/scene";
import { closeTicket, ownerTickets, type Ticket } from "../lib/support";

export default function SupportInbox() {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  const [list, setList] = useState<Ticket[] | null>(null);
  const load = useCallback(() => {
    ownerTickets().then(setList).catch(() => setList([]));
  }, []);
  useFocusEffect(load);

  return (
    <SceneScreen>
      <SceneBanner
        title={t("inbox.title")}
        height={140}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={t("common.back")}>
            <SceneIconButton>
              <Ionicons name={dir.isRTL ? "chevron-forward" : "chevron-back"} size={20} color={pal.ink} />
            </SceneIconButton>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {list === null ? (
          <ActivityIndicator color={pal.accent} style={{ marginTop: 30 }} />
        ) : !list.length ? (
          <Text style={[styles.dim, { color: pal.dim, textAlign: "center" }]}>{t("inbox.empty")}</Text>
        ) : (
          list.map((tk) => (
            <SceneCard key={tk.id} style={{ gap: 8, opacity: tk.status === "done" ? 0.55 : 1 }}>
              <Text style={[styles.meta, { color: pal.dim, textAlign: dir.textAlign }]}>
                {new Date(tk.created_at).toLocaleString()} · {tk.plan || "—"} · {tk.app_version || "—"}
              </Text>
              <Text style={[styles.q, { color: pal.ink, textAlign: dir.textAlign }]}>{tk.question}</Text>
              {tk.answer ? <Text style={[styles.a, { color: pal.dim, textAlign: dir.textAlign }]}>🤖 {tk.answer}</Text> : null}
              <View style={{ flexDirection: dir.row, gap: 8, flexWrap: "wrap" }}>
                {tk.email ? (
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${tk.email}?subject=${encodeURIComponent("VoiceStudyFlow")}`).catch(() => {})}
                    style={[styles.btn, { backgroundColor: pal.accent }]}
                  >
                    <Text style={[styles.btnTxt, { color: pal.onAccent }]}>✉️ {t("inbox.reply")}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.dim, { color: pal.dim }]}>{t("inbox.noEmail")}</Text>
                )}
                {tk.status === "open" ? (
                  <Pressable onPress={() => void closeTicket(tk.id).then(load)} style={[styles.btn, { backgroundColor: pal.soft, borderWidth: 1, borderColor: pal.cardBorder }]}>
                    <Text style={[styles.btnTxt, { color: pal.ink }]}>✓ {t("inbox.close")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </SceneCard>
          ))
        )}
      </ScrollView>
    </SceneScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 40 },
  dim: { fontSize: 14, lineHeight: 22 },
  meta: { fontSize: 12, fontWeight: "600" },
  q: { fontSize: 15.5, fontWeight: "800", lineHeight: 24 },
  a: { fontSize: 13.5, lineHeight: 22 },
  btn: { borderRadius: Radius.pill, paddingHorizontal: 14, height: 38, alignItems: "center", justifyContent: "center" },
  btnTxt: { fontSize: 13.5, fontWeight: "800" },
});
