// components/brand/slide-view.tsx
// شريحة العرض التقديمي (القارئ + «محفوظات الكتاب») بأسلوب Gamma: لكل شريحة تخطيط
// يناسب محتواها — غلاف، بطاقات، خطوات، مقارنة، رقم بارز، اقتباس، قائمة، خلاصة.
// الغلاف/الرقم/الخلاصة على تدرّج لوني جريء، والبقية بطاقات بيضاء أنيقة بلون مميّز لكل شريحة.
// كل شيء يدخل بحركة: الشريحة تظهر بتكبير خفيف ثم عناصرها واحدًا بعد الآخر.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";

import { resolveLayout, splitHead, type Slide, type SlideLayout } from "../../lib/ai";
import { useDir, useI18n } from "../../lib/i18n";

/** أيقونة خطّية لكل نوع شريحة (بدل الإيموجي) */
const LAYOUT_ICON: Record<SlideLayout, keyof typeof Ionicons.glyphMap> = {
  cover: "sparkles-outline",
  list: "list-outline",
  cards: "grid-outline",
  steps: "footsteps-outline",
  compare: "git-compare-outline",
  stat: "stats-chart-outline",
  quote: "chatbox-ellipses-outline",
  summary: "checkmark-done-outline",
};

/** أزواج تدرّج (من → إلى) بتباين كافٍ للنص الأبيض */
export const SLIDE_GRADIENTS: [string, string][] = [
  ["#5B4BF5", "#2A9DF4"],
  ["#E8505B", "#B8338C"],
  ["#0E8F7E", "#2563EB"],
  ["#E07A1F", "#C2410C"],
  ["#7C3AED", "#DB2777"],
  ["#0369A1", "#4F46E5"],
  ["#15803D", "#0E7490"],
  ["#9D174D", "#6D28D9"],
];

const INK = "#0F172A";
const MUTED = "#475569";

type Props = { slide: Slide; index: number; total: number; maxBulletsHeight?: number };

export function SlideView({ slide, index, total, maxBulletsHeight = 360 }: Props) {
  const dir = useDir();
  const { t } = useI18n();
  const [c1, c2] = SLIDE_GRADIENTS[index % SLIDE_GRADIENTS.length];
  const layout = resolveLayout(slide, index, total);
  const bold = layout === "cover" || layout === "stat" || layout === "summary";
  const items = layout === "compare" ? (slide.columns ?? []).length : slide.bullets.length;

  const card = useMemo(() => new Animated.Value(0), [index, slide]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => Array.from({ length: Math.max(1, items) }, () => new Animated.Value(0)), [index, slide, items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(card, { toValue: 1, duration: 420, easing: ease, useNativeDriver: true }),
      Animated.stagger(110, rows.map((v) => Animated.timing(v, { toValue: 1, duration: 380, delay: 180, easing: ease, useNativeDriver: true }))),
    ]).start();
  }, [card, rows]);

  const shift = dir.isRTL ? 22 : -22;
  const enter = (i: number) => ({
    opacity: rows[i] ?? 1,
    transform: [{ translateY: (rows[i] ?? card).interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });
  const enterSide = (i: number) => ({
    opacity: rows[i] ?? 1,
    transform: [{ translateX: (rows[i] ?? card).interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }],
  });
  const ta = { textAlign: dir.textAlign } as const;
  const counter = t("reader.present.slideOf", { n: index + 1, total });

  /* ---------- الأجزاء المشتركة ---------- */
  const progress = (
    <View style={[styles.progressTrack, { backgroundColor: bold ? "rgba(255,255,255,0.2)" : c1 + "1F" }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${((index + 1) / Math.max(1, total)) * 100}%`, alignSelf: dir.isRTL ? "flex-end" : "flex-start", backgroundColor: bold ? "#FFFFFF" : c1 },
        ]}
      />
    </View>
  );
  const header = (
    <View style={[styles.head, { flexDirection: dir.row }]}>
      <View style={[styles.emojiTile, { backgroundColor: c1 + "18", borderColor: c1 + "40" }]}>
        <Ionicons name={LAYOUT_ICON[layout]} size={26} color={c1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.kicker, { color: c1 }, ta]}>{counter}</Text>
        <Text style={[styles.titleInk, ta]}>{slide.title}</Text>
      </View>
    </View>
  );
  const accentBar = (
    <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.accentBar, { alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]} />
  );
  const body = (children: React.ReactNode) => (
    <ScrollView style={{ maxHeight: maxBulletsHeight, flexGrow: 0, alignSelf: "stretch" }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );

  /* ---------- التخطيطات ---------- */
  let content: React.ReactNode;
  switch (layout) {
    case "cover":
      content = (
        <View style={styles.center}>
          <View style={styles.medalBig}>
            <View style={styles.medalRing} />
            <Ionicons name="book-outline" size={56} color="#FFFFFF" />
          </View>
          <Text style={[styles.chipTxtW, styles.chipW]}>{t("reader.present.kindCover")}</Text>
          <Text style={styles.titleCover}>{slide.title}</Text>
          {slide.highlight ? <Text style={styles.subW}>{slide.highlight}</Text> : null}
          <View style={[styles.tagWrap, { flexDirection: dir.row }]}>
            {slide.bullets.map((b, i) => (
              <Animated.View key={i} style={[styles.tagW, enter(i)]}>
                <Text style={styles.tagTxtW}>{b}</Text>
              </Animated.View>
            ))}
          </View>
        </View>
      );
      break;

    case "stat":
      content = (
        <View style={styles.center}>
          <Text style={[styles.chipTxtW, styles.chipW]}>{counter}</Text>
          <Text style={styles.statBig} adjustsFontSizeToFit numberOfLines={2}>
            {slide.highlight}
          </Text>
          <Text style={styles.titleW}>{slide.title}</Text>
          <View style={styles.dividerW} />
          {body(
            <View style={{ gap: 9 }}>
              {slide.bullets.map((b, i) => (
                <Animated.View key={i} style={[styles.rowW, { flexDirection: dir.row }, enterSide(i)]}>
                  <Text style={styles.dotW}>●</Text>
                  <Text style={[styles.txtW, ta]}>{b}</Text>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      );
      break;

    case "summary":
      content = (
        <>
          <View style={[styles.head, { flexDirection: dir.row }]}>
            <View style={styles.emojiTileW}>
              <Ionicons name={LAYOUT_ICON[layout]} size={26} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              {slide.title.trim() !== t("reader.present.kindSummary") ? <Text style={[styles.kickerW, ta]}>{t("reader.present.kindSummary")}</Text> : null}
              <Text style={[styles.titleW, ta]}>{slide.title}</Text>
            </View>
          </View>
          {body(
            <View style={{ gap: 9 }}>
              {slide.bullets.map((b, i) => (
                <Animated.View key={i} style={[styles.rowW, { flexDirection: dir.row }, enterSide(i)]}>
                  <View style={styles.checkCircle}>
                    <Text style={[styles.checkTxt, { color: c1 }]}>✓</Text>
                  </View>
                  <Text style={[styles.txtW, ta]}>{b}</Text>
                </Animated.View>
              ))}
            </View>
          )}
        </>
      );
      break;

    case "cards":
      content = (
        <>
          {header}
          {accentBar}
          {body(
            <View style={[styles.grid, { flexDirection: dir.row }]}>
              {slide.bullets.map((b, i) => {
                const { head, body: txt } = splitHead(b);
                const [g1, g2] = SLIDE_GRADIENTS[(index + i + 1) % SLIDE_GRADIENTS.length];
                return (
                  <Animated.View key={i} style={[styles.cardItem, { borderColor: g1 + "33", backgroundColor: g1 + "0D" }, enter(i)]}>
                    <LinearGradient colors={[g1, g2]} style={[styles.cardNum, { alignSelf: dir.isRTL ? "flex-end" : "flex-start" }]}>
                      <Text style={styles.cardNumTxt}>{i + 1}</Text>
                    </LinearGradient>
                    {head ? <Text style={[styles.cardHead, { color: g1 }, ta]}>{head}</Text> : null}
                    <Text style={[head ? styles.cardBody : styles.cardHeadInk, ta]}>{txt}</Text>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </>
      );
      break;

    case "steps":
      content = (
        <>
          {header}
          {accentBar}
          {body(
            <View>
              {slide.bullets.map((b, i) => {
                const { head, body: txt } = splitHead(b);
                const last = i === slide.bullets.length - 1;
                return (
                  <Animated.View key={i} style={[styles.stepRow, { flexDirection: dir.row }, enterSide(i)]}>
                    <View style={styles.stepRail}>
                      <LinearGradient colors={[c1, c2]} style={styles.stepNum}>
                        <Text style={styles.stepNumTxt}>{i + 1}</Text>
                      </LinearGradient>
                      {!last ? <View style={[styles.stepLine, { backgroundColor: c1 + "40" }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
                      {head ? <Text style={[styles.stepHead, ta]}>{head}</Text> : null}
                      <Text style={[head ? styles.stepBody : styles.stepHead, ta]}>{txt}</Text>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </>
      );
      break;

    case "compare": {
      const cols = (slide.columns ?? []).slice(0, 2);
      content = (
        <>
          {header}
          {accentBar}
          {body(
            <View style={[styles.compare, { flexDirection: dir.row }]}>
              {cols.map((col, ci) => {
                const cc = ci === 0 ? c1 : c2;
                return (
                  <Animated.View key={ci} style={[styles.compareCol, { borderColor: cc + "40" }, enter(ci)]}>
                    <View style={[styles.compareHead, { backgroundColor: cc }]}>
                      <Text style={styles.compareHeadTxt}>{col.title}</Text>
                    </View>
                    <View style={{ padding: 10, gap: 7 }}>
                      {col.bullets.map((b, bi) => (
                        <View key={bi} style={[{ flexDirection: dir.row, gap: 6 }]}>
                          <Text style={{ color: cc, fontWeight: "900", fontSize: 14, lineHeight: 22 }}>•</Text>
                          <Text style={[styles.compareTxt, ta]}>{b}</Text>
                        </View>
                      ))}
                    </View>
                  </Animated.View>
                );
              })}
              <View style={[styles.vs, { borderColor: c1 }]}>
                <Text style={[styles.vsTxt, { color: c1 }]}>⇄</Text>
              </View>
            </View>
          )}
        </>
      );
      break;
    }

    case "quote":
      content = (
        <>
          <Text style={[styles.quoteMark, { color: c1 }]}>“</Text>
          <Text style={[styles.quoteTxt, ta]}>{slide.highlight}</Text>
          <View style={[styles.quoteBy, { flexDirection: dir.row }]}>
            <View style={[styles.quoteDash, { backgroundColor: c1 }]} />
            <Text style={[styles.quoteTitle, { color: c1 }]}>{slide.title}</Text>
          </View>
          {body(
            <View style={{ gap: 8, marginTop: 12 }}>
              {slide.bullets.map((b, i) => (
                <Animated.View key={i} style={[styles.quoteNote, { borderColor: c1 + "33", backgroundColor: c1 + "0D" }, enter(i)]}>
                  <Text style={[styles.listTxt, ta]}>{b}</Text>
                </Animated.View>
              ))}
            </View>
          )}
        </>
      );
      break;

    default: // list
      content = (
        <>
          {header}
          {accentBar}
          {body(
            <View style={{ gap: 9 }}>
              {slide.bullets.map((b, i) => {
                const { head, body: txt } = splitHead(b);
                return (
                  <Animated.View
                    key={i}
                    style={[styles.listRow, { flexDirection: dir.row, [dir.isRTL ? "borderRightColor" : "borderLeftColor"]: c1, [dir.isRTL ? "borderRightWidth" : "borderLeftWidth"]: 4 }, enterSide(i)]}
                  >
                    <Text style={[styles.listTxt, ta]}>
                      {head ? <Text style={{ fontWeight: "900", color: c1 }}>{head}: </Text> : null}
                      {txt}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </>
      );
  }

  return (
    <Animated.View
      style={[
        styles.card,
        { shadowColor: c1, backgroundColor: bold ? c1 : "#FFFFFF" },
        { opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] },
      ]}
    >
      {bold ? (
        <>
          <LinearGradient colors={layout === "summary" ? [c2, c1] : [c1, c2]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.orb, { width: 230, height: 230, borderRadius: 115, top: -80, [dir.isRTL ? "left" : "right"]: -70 }]} />
          <View style={[styles.orb, { width: 170, height: 170, borderRadius: 85, bottom: -60, [dir.isRTL ? "right" : "left"]: -50, opacity: 0.6 }]} />
        </>
      ) : (
        <>
          {/* لمسة لونية ناعمة في الزاوية + رقم الشريحة الكبير الشفاف */}
          <LinearGradient
            colors={[c1 + "26", c2 + "00"]}
            start={{ x: dir.isRTL ? 0 : 1, y: 0 }}
            end={{ x: dir.isRTL ? 0.6 : 0.4, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={[styles.watermark, { color: c1 + "10", [dir.isRTL ? "left" : "right"]: 12 }]}>{index + 1}</Text>
        </>
      )}
      {progress}
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 20,
    paddingTop: 24,
    overflow: "hidden",
    minHeight: 360,
    justifyContent: "center",
    shadowOpacity: 0.4,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  orb: { position: "absolute", backgroundColor: "rgba(255,255,255,0.13)" },
  watermark: { position: "absolute", bottom: -34, fontSize: 180, fontWeight: "900" },
  progressTrack: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  progressFill: { height: 5, borderRadius: 3 },
  center: { alignItems: "center" },

  // رأس الشرائح البيضاء
  head: { alignItems: "center", gap: 12, marginBottom: 10 },
  emojiTile: { width: 54, height: 54, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emojiTileW: { width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  emojiSm: { fontSize: 28 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3, marginBottom: 2 },
  kickerW: { fontSize: 12, fontWeight: "900", color: "rgba(255,255,255,0.85)", marginBottom: 2 },
  titleInk: { color: INK, fontSize: 22, lineHeight: 32, fontWeight: "900" },
  accentBar: { width: 64, height: 5, borderRadius: 3, marginBottom: 14 },

  // نص أبيض (الشرائح الجريئة)
  chipW: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", overflow: "hidden", marginBottom: 12 },
  chipTxtW: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  titleCover: { color: "#FFFFFF", fontSize: 31, lineHeight: 46, fontWeight: "900", textAlign: "center", textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  titleW: { color: "#FFFFFF", fontSize: 22, lineHeight: 33, fontWeight: "900", textAlign: "center" },
  subW: { color: "rgba(255,255,255,0.92)", fontSize: 16, lineHeight: 27, fontWeight: "600", textAlign: "center", marginTop: 8 },
  tagWrap: { flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 16 },
  tagW: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  tagTxtW: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  medalBig: { width: 116, height: 116, borderRadius: 58, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.22)", marginBottom: 16 },
  medalRing: { ...StyleSheet.absoluteFillObject, borderRadius: 999, borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", margin: -7 },
  statBig: { color: "#FFFFFF", fontSize: 64, lineHeight: 78, fontWeight: "900", textAlign: "center", textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 14, textShadowOffset: { width: 0, height: 3 } },
  dividerW: { width: 56, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.85)", alignSelf: "center", marginVertical: 14 },
  rowW: { alignItems: "flex-start", gap: 10, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 16, paddingVertical: 11, paddingHorizontal: 12 },
  dotW: { color: "#FFFFFF", fontSize: 10, lineHeight: 26 },
  txtW: { flex: 1, color: "#FFFFFF", fontSize: 16, lineHeight: 26, fontWeight: "700" },
  checkCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  checkTxt: { fontSize: 15, fontWeight: "900" },

  // بطاقات
  grid: { flexWrap: "wrap", gap: 10 },
  cardItem: { width: "48%", flexGrow: 1, borderRadius: 18, borderWidth: 1, padding: 12, gap: 6 },
  cardNum: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  cardNumTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  cardHead: { fontSize: 15.5, lineHeight: 23, fontWeight: "900" },
  cardHeadInk: { color: INK, fontSize: 15, lineHeight: 23, fontWeight: "800" },
  cardBody: { color: MUTED, fontSize: 13.5, lineHeight: 21, fontWeight: "600" },

  // خطوات
  stepRow: { gap: 12 },
  stepRail: { alignItems: "center", width: 34 },
  stepNum: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  stepLine: { width: 3, flex: 1, borderRadius: 2, marginVertical: 4 },
  stepHead: { color: INK, fontSize: 16, lineHeight: 25, fontWeight: "900", marginTop: 4 },
  stepBody: { color: MUTED, fontSize: 14.5, lineHeight: 23, fontWeight: "600" },

  // مقارنة
  compare: { gap: 10, alignItems: "stretch" },
  compareCol: { flex: 1, borderRadius: 18, borderWidth: 1, overflow: "hidden", backgroundColor: "#FFFFFF" },
  compareHead: { paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" },
  compareHeadTxt: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", textAlign: "center" },
  compareTxt: { flex: 1, color: INK, fontSize: 13.5, lineHeight: 22, fontWeight: "600" },
  vs: { position: "absolute", top: 8, alignSelf: "center", left: "50%", marginLeft: -15, width: 30, height: 30, borderRadius: 15, borderWidth: 2, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  vsTxt: { fontSize: 15, fontWeight: "900" },

  // اقتباس
  quoteMark: { fontSize: 110, lineHeight: 110, fontWeight: "900", opacity: 0.3, textAlign: "center", marginBottom: -40 },
  quoteTxt: { color: INK, fontSize: 21, lineHeight: 36, fontWeight: "800", fontStyle: "italic" },
  quoteBy: { alignItems: "center", gap: 10, marginTop: 14 },
  quoteDash: { width: 28, height: 3, borderRadius: 2 },
  quoteTitle: { fontSize: 14.5, fontWeight: "900" },
  quoteNote: { borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12 },

  // قائمة
  listRow: { backgroundColor: "#F8FAFC", borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13 },
  listTxt: { flex: 1, color: INK, fontSize: 15.5, lineHeight: 26, fontWeight: "600" },
});
