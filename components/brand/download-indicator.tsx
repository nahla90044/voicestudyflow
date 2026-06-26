// components/brand/download-indicator.tsx
// شريط صغير يظهر في أي شاشة أثناء تحميل كتاب في الخلفية (مع نسبة التقدّم).
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Palette, Radius } from "../../constants/design";
import { getDownloadState, subscribeDownload, type DownloadState } from "../../lib/downloadManager";

export function DownloadIndicator() {
  const [s, setS] = useState<DownloadState | null>(getDownloadState());
  useEffect(() => subscribeDownload(setS), []);

  if (!s || !s.running) return null;
  const pct = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;

  return (
    <View style={styles.chip}>
      <ActivityIndicator size="small" color={Palette.neonCyan} />
      <Text style={styles.txt} numberOfLines={1}>
        يحمّل «{s.title}» في الخلفية — {s.done}/{s.total} ({pct}%)
      </Text>
      <Ionicons name="cloud-download" size={15} color={Palette.neonCyan} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.neonCyan + "44",
  },
  txt: { flex: 1, color: Palette.textMuted, fontSize: 12.5, fontWeight: "700", textAlign: "right" },
});
