// components/brand/tour-scenes.tsx
// مشاهد الجولة التعريفية بجماليات «العالم الحيّ»: كل مشهد نسخة مصغّرة متحرّكة من واجهة
// حقيقية بألوان مشهد الوقت الحالي — استماع مع هايلايتر، القارئ وأدواته (ضغطتان للقراءة
// من جملة، والتقليب بالإصبع)، صفحة الكتاب بوحداتها وقاموسها، «كتابك يجيب»، الجاهزية،
// وعالم يكبر مع القراءة.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { useI18n } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import { sceneGrowth, type ScenePalette } from "../../lib/sceneCore";
import { ProgressRing } from "./progress-ring";
import { SceneArt } from "./scene-art";

const W = 290;
const INK = "rgba(42,38,34,0.32)"; // أسطر النص على ورق الكتاب
const HL = "rgba(246,213,138,0.6)"; // هايلايتر الجملة (ذهبي القارئ)

function useLoop(duration: number, active: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    const l = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [v, duration, active]);
  return v;
}

/** خطوة متكرّرة ٠..n-1 كل ms (للمشاهد المتسلسلة) */
function useStep(n: number, ms: number, active: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    setS(0);
    const id = setInterval(() => setS((x) => (x + 1) % n), ms);
    return () => clearInterval(id);
  }, [n, ms, active]);
  return s;
}

/** إطار المشهد المصغّر بألوان المشهد الحالي */
function useFrame() {
  const { pal } = useScene();
  return useMemo(() => frameStyles(pal), [pal]);
}

function frameStyles(pal: ScenePalette) {
  const line = pal.dark ? "rgba(255,255,255,0.20)" : "rgba(31,53,39,0.16)";
  return {
    pal,
    line,
    frame: {
      width: W,
      padding: 16,
      gap: 10,
      borderRadius: 26,
      backgroundColor: pal.card,
      borderWidth: 1,
      borderColor: pal.cardBorder,
      shadowColor: "#000",
      shadowOpacity: pal.dark ? 0.35 : 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    } as const,
  };
}

/** ١) استماع: صفحة بأسطر، هايلايتر يتنقّل سطرًا سطرًا، وموجة صوت */
export function ListenScene({ active }: { active: boolean }) {
  const f = useFrame();
  const line = useStep(5, 900, active);
  const wave = useLoop(900, active);
  return (
    <View style={f.frame}>
      <View style={styles.paper}>
        {[0.92, 0.84, 0.95, 0.7, 0.88].map((w, i) => (
          <View key={i} style={styles.lineWrap}>
            {i === line && <View style={[styles.hl, { width: `${w * 100 + 4}%` }]} />}
            <View style={[styles.line, { backgroundColor: INK, width: `${w * 100}%` }]}>
              {i === line && <View style={[styles.word, { backgroundColor: "#D9A43A" }]} />}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.player}>
        <View style={[styles.playBtn, { backgroundColor: f.pal.accent }]}>
          <Ionicons name="pause" size={16} color={f.pal.onAccent} />
        </View>
        <View style={styles.waveRow}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                {
                  backgroundColor: f.pal.accent,
                  transform: [{ scaleY: wave.interpolate({ inputRange: [0, 0.5, 1], outputRange: i % 2 ? [0.3, 1, 0.3] : [1, 0.35, 1] }) }],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** ٢) القارئ: الصفحة تنزلق بالإصبع، ضغطتان على سطر تبدأ القراءة منه، والأدوات بثلاث مجموعات */
export function ReaderScene({ active }: { active: boolean }) {
  const { t } = useI18n();
  const f = useFrame();
  const s = useStep(6, 1000, active); // 0-1 سحب، 2-3 ضغطتان، 4-5 تبديل المجموعات
  const slide = useRef(new Animated.Value(0)).current;
  const tap = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    if (s === 0) {
      slide.setValue(0);
      Animated.sequence([
        Animated.timing(slide, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]).start();
    }
    if (s === 2) {
      tap.setValue(0);
      Animated.sequence([
        Animated.timing(tap, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(tap, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(tap, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(tap, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [s, active, slide, tap]);
  const reading = s >= 3 && s <= 5 ? 2 : -1; // بعد الضغطتين: السطر الثالث يُقرأ
  const tab = s >= 4 ? (s === 4 ? 1 : 2) : 0;
  const tabs = [t("reader.tools.listen"), t("reader.tools.study"), t("reader.tools.view")];
  return (
    <View style={f.frame}>
      <View style={[styles.paper, { overflow: "hidden", height: 118 }]}>
        <Animated.View style={{ gap: 12, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 260] }) }] }}>
          {[0.9, 0.82, 0.95, 0.74, 0.86].map((w, i) => (
            <View key={i} style={styles.lineWrap}>
              {i === reading && <View style={[styles.hl, { width: `${w * 100 + 4}%` }]} />}
              <View style={[styles.line, { backgroundColor: INK, width: `${w * 100}%` }]} />
            </View>
          ))}
        </Animated.View>
        {/* إصبع: سحب ثم ضغطتان */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.finger,
            {
              borderColor: f.pal.accent,
              opacity: s <= 1 ? slide.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.9, 0.9, 0] }) : tap,
              transform: [
                { translateX: s <= 1 ? slide.interpolate({ inputRange: [0, 1], outputRange: [40, 200] }) : 120 },
                { translateY: s <= 1 ? 50 : 54 },
                { scale: s <= 1 ? 1 : tap.interpolate({ inputRange: [0, 1], outputRange: [1.4, 0.9] }) },
              ],
            },
          ]}
        />
      </View>
      <View style={styles.tabsRow}>
        {tabs.map((label, i) => (
          <View key={label} style={[styles.tab, { backgroundColor: i === tab ? f.pal.accent : f.pal.soft }]}>
            <Text style={[styles.tabTxt, { color: i === tab ? f.pal.onAccent : f.pal.dim }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.toolRow}>
        {(["speedometer-outline", "moon-outline", "musical-notes-outline", "mic-outline"] as const).map((ic) => (
          <View key={ic} style={[styles.tool, { backgroundColor: f.pal.soft, borderColor: f.pal.cardBorder }]}>
            <Ionicons name={ic} size={16} color={f.pal.ink} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** ٣) صفحة الكتاب: وحدات بصفحاتها + بطاقات القاموس تظهر تباعًا */
export function BookScene({ active }: { active: boolean }) {
  const { t } = useI18n();
  const f = useFrame();
  const s = useStep(4, 800, active);
  const chips = [t("glossary.k.term"), t("glossary.k.def"), t("glossary.k.word")];
  return (
    <View style={f.frame}>
      {[1, 2, 3].map((n, i) => (
        <View key={n} style={[styles.unitRow, { backgroundColor: i === 0 ? f.pal.soft : "transparent" }]}>
          <View style={[styles.unitNum, { borderColor: f.pal.accent }]}>
            <Text style={[styles.unitNumTxt, { color: f.pal.ink }]}>{n}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.line, { width: `${80 - i * 12}%`, backgroundColor: f.line }]} />
            <Text style={[styles.range, { color: f.pal.dim }]}>{t("glossary.pages", { from: [6, 20, 35][i], to: [19, 34, 48][i] })}</Text>
          </View>
          <View style={[styles.miniIcon, { backgroundColor: f.pal.soft }]}>
            <Ionicons name="book" size={13} color={f.pal.accent} />
          </View>
        </View>
      ))}
      <View style={styles.chipRow}>
        {chips.map((c, i) => (
          <View key={c} style={[styles.gChip, { backgroundColor: f.pal.soft, opacity: s > i ? 1 : 0.2 }]}>
            <Text style={[styles.gChipTxt, { color: f.pal.accent }]}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** ٤) كتابك يجيب: سؤال ← إجابة بأرقام صفحات، وكرة الصوت تنبض */
export function AskScene({ active }: { active: boolean }) {
  const f = useFrame();
  const s = useStep(4, 900, active);
  const pulse = useLoop(1400, active);
  return (
    <View style={f.frame}>
      <View style={[styles.qBubble, { backgroundColor: f.pal.accent }]}>
        <View style={[styles.line, { width: 120, backgroundColor: f.pal.onAccent, opacity: 0.85 }]} />
      </View>
      <View style={[styles.aBubble, { backgroundColor: f.pal.soft, opacity: s >= 1 ? 1 : 0.15 }]}>
        <View style={[styles.line, { width: "92%", backgroundColor: f.line }]} />
        <View style={[styles.line, { width: "80%", backgroundColor: f.line }]} />
        <View style={[styles.line, { width: "64%", backgroundColor: f.line }]} />
        <View style={styles.citeRow}>
          {[20, 37].map((p, i) => (
            <View key={p} style={[styles.cite, { borderColor: f.pal.accent, opacity: s >= 2 + i ? 1 : 0.15 }]}>
              <Ionicons name="document-text" size={11} color={f.pal.accent} />
              <Text style={[styles.citeTxt, { color: f.pal.accent }]}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.orbBox}>
        <Animated.View
          style={[
            styles.orbRing,
            {
              borderColor: f.pal.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
            },
          ]}
        />
        <View style={[styles.orb, { backgroundColor: f.pal.accent }]}>
          <Ionicons name="mic" size={18} color={f.pal.onAccent} />
        </View>
      </View>
    </View>
  );
}

/** ٥) الجاهزية: الحلقة ترتفع وخطوات مسار اليوم تُشطب تباعًا */
export function ReadyScene({ active }: { active: boolean }) {
  const f = useFrame();
  const s = useStep(5, 800, active);
  const pct = [0.38, 0.5, 0.61, 0.72, 0.72][s];
  return (
    <View style={[f.frame, { flexDirection: "row", alignItems: "center", gap: 16 }]}>
      <ProgressRing progress={pct} colors={[f.pal.accent, f.pal.accent]} trackColor={f.pal.track} size={104}>
        <Text style={[styles.ringNum, { color: f.pal.ink }]}>{Math.round(pct * 100)}%</Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: 10 }}>
        {[0, 1, 2].map((i) => {
          const done = s > i;
          return (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepDot, { borderColor: done ? "transparent" : f.line, backgroundColor: done ? f.pal.soft : "transparent" }]}>
                {done && <Ionicons name="checkmark" size={12} color={f.pal.accent} />}
              </View>
              <View style={[styles.line, { flex: 1, backgroundColor: f.line, opacity: done ? 0.45 : 1 }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** ٦) عالمك يكبر: أوراق الشجرة تزيد وثمرة لكل وحدة (نجوم في الليل، كتب على الرف في المساء) */
export function GrowScene({ active }: { active: boolean }) {
  const { id, pal } = useScene();
  const s = useStep(4, 1100, active);
  const growth = sceneGrowth(id, { pagesToday: 2 + s * 2, unitsDone: s + 1, unitCount: 6, readiness: 20 + s * 25 });
  return (
    <View style={[styles.growFrame, { borderColor: pal.cardBorder, backgroundColor: pal.card }]}>
      {/* نقصّ أسفل الرسم (أرض فارغة) ليبقى قلب المشهد في الإطار */}
      <View style={styles.growArt}>
        <SceneArt id={id} growth={growth} width={W} height={(W * 470) / 390} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { padding: 14, gap: 12, borderRadius: 16, backgroundColor: "#F6F1E7" },
  lineWrap: { height: 10, justifyContent: "center", alignItems: "flex-end" },
  line: { height: 7, borderRadius: 4, alignSelf: "flex-end" },
  hl: { position: "absolute", height: 16, right: -4, borderRadius: 5, backgroundColor: HL },
  word: { position: "absolute", right: "30%", width: 26, height: 9, top: -1, borderRadius: 3 },
  player: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  playBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  waveRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 26 },
  waveBar: { width: 4, height: 24, borderRadius: 2 },
  finger: { position: "absolute", top: 0, left: 0, width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, backgroundColor: "rgba(255,255,255,0.55)" },
  tabsRow: { flexDirection: "row-reverse", gap: 6 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 999 },
  tabTxt: { fontSize: 11, fontWeight: "800" },
  toolRow: { flexDirection: "row-reverse", gap: 6 },
  tool: { flex: 1, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  unitRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14 },
  unitNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  unitNumTxt: { fontSize: 11, fontWeight: "700" },
  range: { fontSize: 10.5, textAlign: "right" },
  miniIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row-reverse", gap: 6, marginTop: 2 },
  gChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  gChipTxt: { fontSize: 11.5, fontWeight: "700" },
  qBubble: { alignSelf: "flex-start", padding: 12, borderRadius: 16, borderBottomLeftRadius: 4 },
  aBubble: { alignSelf: "flex-end", width: "88%", padding: 12, gap: 8, borderRadius: 16, borderBottomRightRadius: 4 },
  citeRow: { flexDirection: "row-reverse", gap: 6, marginTop: 2 },
  cite: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  citeTxt: { fontSize: 11, fontWeight: "700" },
  orbBox: { alignSelf: "center", width: 56, height: 56, alignItems: "center", justifyContent: "center", marginTop: 4 },
  orbRing: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  orb: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  ringNum: { fontSize: 22, fontWeight: "800" },
  stepRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  stepDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  growFrame: { width: W, height: 260, borderRadius: 26, overflow: "hidden", borderWidth: 1 },
  growArt: { position: "absolute", left: 0, right: 0, bottom: -84 },
});

export const TOUR = [
  { key: "listen", Scene: ListenScene },
  { key: "reader", Scene: ReaderScene },
  { key: "book", Scene: BookScene },
  { key: "ask", Scene: AskScene },
  { key: "ready", Scene: ReadyScene },
  { key: "grow", Scene: GrowScene },
] as const;
