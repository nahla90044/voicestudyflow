// components/brand/now-playing-dock.tsx
// الشريط العائم (تصميم 2.0): الكتاب المسموع يبقى فوق شريط التنقّل في كل الشاشات.
// ضغطة على الشريط تفتح القارئ (ويكمل من نفس الجملة)، وزر للإيقاف/التشغيل، وزر إغلاق.
// يظهر فقط عندما يقرأ المشغّل العام كتابًا (بعد مغادرة القارئ والصوت شغّال).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { Gradients, Palette } from "../../constants/design";
import { useDir, useI18n } from "../../lib/i18n";
import { close, getPlayer, pause, resume, subscribePlayer, type PlayerState } from "../../lib/player";
import { BookCover } from "./book-cover";
import { PressableScale } from "./motion";

/** موجة صوت صغيرة تتحرّك أثناء القراءة */
function Wave({ on }: { on: boolean }) {
  const bars = useRef([0, 1, 2, 3].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!on) {
      bars.forEach((b) => b.setValue(0.3));
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 380 + i * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.3, duration: 380 + i * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [on, bars]);
  return (
    <View style={styles.wave}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: b }] }]} />
      ))}
    </View>
  );
}

export function NowPlayingDock() {
  const router = useRouter();
  const { t } = useI18n();
  const dir = useDir();
  const [s, setS] = useState<PlayerState | null>(getPlayer());
  useEffect(() => subscribePlayer(setS), []);

  if (!s) return null;
  const progress = s.totalPages > 0 ? Math.min(1, s.page / s.totalPages) : 0;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/reader/[id]", params: { id: s.bookId, title: s.title, pdf_path: s.pdfPath } })}
      accessibilityLabel={t("dock.open")}
      style={[styles.dock, { flexDirection: dir.row }]}
    >
      <BookCover title={s.title} width={38} height={50} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { textAlign: dir.textAlign }]} numberOfLines={1}>
          {s.title}
        </Text>
        <Text style={[styles.sub, { textAlign: dir.textAlign }]} numberOfLines={1}>
          {s.loading ? t("dock.loading") : s.sentence || t("dock.page", { page: s.page })}
        </Text>
      </View>
      <Wave on={s.playing && !s.loading} />
      <PressableScale onPress={() => (s.playing ? pause() : resume())} style={styles.play}>
        {s.loading && s.playing ? (
          <ActivityIndicator color={Palette.bg} />
        ) : (
          <Ionicons
            name={s.playing ? "pause" : "play"}
            size={19}
            color={Palette.bg}
            accessibilityLabel={s.playing ? t("dock.pause") : t("dock.play")}
          />
        )}
      </PressableScale>
      <PressableScale onPress={close} style={styles.x}>
        <Ionicons name="close" size={18} color={Palette.textDim} accessibilityLabel={t("dock.close")} />
      </PressableScale>
      {/* شريط تقدّم الكتاب على الحافة السفلية */}
      <View style={styles.track}>
        <LinearGradient
          colors={Gradients.neon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${Math.max(3, progress * 100)}%` }, dir.isRTL ? { alignSelf: "flex-end" } : null]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    alignItems: "center",
    gap: 10,
    height: 64,
    marginBottom: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: "#181A28",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { color: Palette.text, fontSize: 13.5, fontWeight: "700" },
  sub: { color: Palette.textDim, fontSize: 11.5, marginTop: 1 },
  wave: { flexDirection: "row", alignItems: "center", gap: 2.5, height: 20 },
  bar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Palette.neonViolet },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.text, alignItems: "center", justifyContent: "center" },
  x: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  track: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: "rgba(255,255,255,0.06)" },
  fill: { height: 2.5 },
});
