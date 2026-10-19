// components/brand/ambient-sheet.tsx
// 🎧 أصوات الأجواء أثناء المذاكرة (مطر، بحر، موسيقى…) — نفس مكتبة القارئ (lib/sfx)،
// تُمزج مع صوت الراوي. مشتركة بين شاشة الملخّص وملخّص الفيديو.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Spacing } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { MUSIC_ICON, MUSIC_OPTIONS, startAmbient, stopAmbient } from "../../lib/sfx";

/** حالة الأجواء للشاشة: تتوقف عند مغادرتها */
export function useAmbient() {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  async function pick(k: string | null) {
    setKey(k);
    if (!k) {
      stopAmbient();
      return;
    }
    setLoading(k);
    try {
      await startAmbient(k);
    } finally {
      setLoading((x) => (x === k ? null : x));
    }
  }
  useEffect(() => () => stopAmbient(), []);
  return { key, loading, pick };
}

export function AmbientSheet({ visible, onClose, amb }: { visible: boolean; onClose: () => void; amb: ReturnType<typeof useAmbient> }) {
  const { t } = useI18n();
  const dir = useDir();
  const { pal } = useScene();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} supportedOrientations={["portrait", "landscape"]}>
      <View style={styles.mask}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: pal.bg, borderColor: pal.cardBorder }]}>
          <View style={{ flexDirection: dir.row, alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.title, { color: pal.ink }]}>
              <Ionicons name="headset-outline" size={18} color={pal.accent} /> {t("summary.ambient.title")}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t("common.close")}>
              <Ionicons name="close" size={22} color={pal.dim} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: pal.dim, textAlign: dir.textAlign }]}>{t("summary.ambient.hint")}</Text>
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={[styles.grid, { flexDirection: dir.row }]}>
            {[{ key: null as string | null }, ...MUSIC_OPTIONS].map((m) => {
              const on = amb.key === m.key;
              const label =
                m.key === null ? t("reader.music.none") : amb.loading === m.key ? t("reader.music.loading") : t(`music.${m.key}`);
              return (
                <Pressable
                  key={m.key ?? "none"}
                  onPress={() => void amb.pick(m.key)}
                  style={[styles.chip, { backgroundColor: on ? pal.accent : pal.soft, borderColor: pal.cardBorder }]}
                >
                  <Text style={[styles.chipTxt, { color: on ? pal.onAccent : pal.ink }]}>
                    {m.key ? <Ionicons name={(MUSIC_ICON[m.key] ?? "musical-notes-outline") as keyof typeof Ionicons.glyphMap} size={14} color={on ? pal.onAccent : pal.accent} /> : null}
                    {m.key ? " " : ""}
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg, paddingBottom: 34, gap: 10 },
  title: { fontSize: 17, fontWeight: "900" },
  hint: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  grid: { flexWrap: "wrap", gap: 8, paddingTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  chipTxt: { fontSize: 14, fontWeight: "800" },
});
