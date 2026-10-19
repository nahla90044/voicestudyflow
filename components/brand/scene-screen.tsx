// components/brand/scene-screen.tsx
// قطع مشتركة لشاشات «العالم الحيّ»: خلفية بلون المشهد، شريط علوي بمقطع من المشهد
// تحت العنوان، وبطاقة بألوان المشهد. كل الشاشات تستخدمها حتى يبقى الشكل موحّدًا
// ويتبدّل مع وقت اليوم (صباح/مساء/ليل) تلقائيًا.
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDir } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { sceneGrowth } from "../../lib/sceneCore";
import { SceneArt } from "./scene-art";
import { UsageBar } from "./usage-chip";

// نقطة الارتكاز في كل رسم (بإحداثيات 390×470): قلب الشجرة، الرف، القمر
const FOCUS = { garden: 270, study: 250, sky: 215 } as const;

/** خلفية الشاشة بلون المشهد + لون شريط الحالة المناسب */
export function SceneScreen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { pal } = useScene();
  return (
    <View style={[{ flex: 1, backgroundColor: pal.bg }, style]}>
      <StatusBar style={pal.dark ? "light" : "dark"} />
      {children}
    </View>
  );
}

/**
 * رأس الشاشة: مقطع من المشهد (أسفل الرسم — الأرض/الرف/الكثبان) يتلاشى في لون الخلفية،
 * وفوقه العنوان والوصف وأزرار اختيارية. يملأ أعلى الشاشة تحت شريط الحالة.
 */
export function SceneBanner({
  title,
  subtitle,
  left,
  right,
  height = 210,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode; // عنصر في بداية السطر (مثل زر القائمة)
  right?: React.ReactNode; // أزرار في نهاية السطر
  height?: number;
}) {
  const { id, pal } = useScene();
  const dir = useDir();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const h = height + insets.top;
  const fullH = (width * 470) / 390;
  const growth = sceneGrowth(id, { pagesToday: 3, unitsDone: 2, unitCount: 6, readiness: 50 });
  return (
    <View style={{ height: h }}>
      {/* نعرض «قلب» المشهد (الشجرة/الرف/القمر) لا أسفله فقط: الرسم بارتفاعه الكامل مُزاحًا للأعلى */}
      <View style={[StyleSheet.absoluteFill, { overflow: "hidden", opacity: pal.dark ? 0.9 : 1 }]}>
        <View style={{ position: "absolute", left: 0, right: 0, top: Math.min(0, Math.max(h - fullH, h * 0.5 - FOCUS[id] * (fullH / 470))) }}>
          <SceneArt id={id} growth={growth} width={width} height={fullH} />
        </View>
      </View>
      <LinearGradient
        colors={[pal.bg + "00", pal.bg + "CC", pal.bg]}
        locations={[0.35, 0.75, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.bannerInner, { paddingTop: insets.top + 6 }]}>
        <View style={[styles.bannerTop, { flexDirection: dir.row }]}>
          {left}
          {/* عدّاد الاستهلاك في رأس كل شاشة */}
          <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 6 }}>
            <UsageBar />
          </View>
          {right}
        </View>
        <View>
          <Text style={[styles.title, { color: pal.ink, textAlign: dir.textAlign }]} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={[styles.subtitle, { color: pal.dim, textAlign: dir.textAlign }]} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

/** بطاقة بألوان المشهد (بديل GlassCard في الشاشات الجديدة) */
export function SceneCard({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { pal } = useScene();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: pal.card, borderColor: pal.cardBorder, shadowColor: pal.dark ? "#000" : "#3C5028" },
        padded && { padding: 16 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** زر دائري صغير بألوان المشهد (للرؤوس) */
export function SceneIconButton({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  const { pal } = useScene();
  return (
    <View
      style={[
        styles.iconBtn,
        { backgroundColor: accent ? pal.accent : pal.dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.8)" },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerInner: { flex: 1, paddingHorizontal: 20, paddingBottom: 12, justifyContent: "space-between" },
  bannerTop: { alignItems: "center", gap: 8 },
  title: { fontSize: 30, fontWeight: "900", lineHeight: 42 },
  subtitle: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
  card: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
