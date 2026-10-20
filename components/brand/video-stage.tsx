// components/brand/video-stage.tsx
// إطار «ملخّص الفيديو» بمقاس فيديو حقيقي (١٦:٩): يُرسم بمقاس تصميم ثابت ١٢٨٠×٧٢٠ ثم يُحجَّم
// ليملأ أي شاشة (آيفون/آيباد، عمودي/أفقي) — فكل المحتوى يظهر كاملًا دائمًا بلا تمرير.
// حركة مستمرة كالفيديو: خلفية تتحرك ببطء، والنقاط تظهر واحدة بعد الأخرى لحظة نطق الراوي لها
// (من تقدّم الصوت الفعلي)، وترجمة نصية أسفل الإطار.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { resolveLayout, splitHead, type SlideLayout } from "../../lib/ai";
import { useDir, useI18n } from "../../lib/i18n";
import type { VideoScene } from "../../lib/videoScriptCore";
import { SLIDE_GRADIENTS } from "./slide-view";

export const DW = 1280;
export const DH = 720;

const ICON: Record<SlideLayout | "check", keyof typeof Ionicons.glyphMap> = {
  cover: "sparkles-outline",
  list: "list-outline",
  cards: "grid-outline",
  steps: "footsteps-outline",
  compare: "git-compare-outline",
  stat: "stats-chart-outline",
  quote: "chatbox-ellipses-outline",
  summary: "checkmark-done-outline",
  check: "help-circle-outline",
};

type Props = {
  scene: VideoScene;
  index: number;
  total: number;
  /** تقدّم نطق الراوي في المشهد (٠..١) — يحدد ظهور النقاط */
  progress: number;
  /** مشهد السؤال السريع: السؤال ← التفكير ← الجواب */
  stage: "ask" | "think" | "reveal";
  thinkLeft: number;
  caption: string | null;
  /** عرض الإطار الفعلي على الشاشة (الارتفاع = العرض × ٩/١٦) */
  width: number;
};

/** عنصر يظهر بحركة ناعمة متى صار visible */
function Reveal({ visible, children, delay = 0, style }: { visible: boolean; children: React.ReactNode; delay?: number; style?: object }) {
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: visible ? 520 : 0, delay: visible ? delay : 0, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }] }]}>{children}</Animated.View>
  );
}

export function VideoStage({ scene, index, total, progress, stage, thinkLeft, caption, width }: Props) {
  const dir = useDir();
  const { t } = useI18n();
  const scale = width / DW;
  const height = width * (DH / DW);
  const [c1, c2] = SLIDE_GRADIENTS[index % SLIDE_GRADIENTS.length];
  const layout: SlideLayout | "check" = scene.kind === "check" ? "check" : resolveLayout(scene, index, total);
  const ta = { textAlign: dir.textAlign } as const;

  // حركة الخلفية المستمرة (تكبير بطيء + انجراف الدوائر) — تُعاد مع كل مشهد
  const drift = useMemo(() => new Animated.Value(0), [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const enter = useMemo(() => new Animated.Value(0), [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, enter]);

  // النقاط تظهر بالترتيب مع تقدّم الكلام (الأولى مبكرًا، والأخيرة قبل نهاية المشهد)
  const items = layout === "compare" ? (scene.columns ?? []).length : scene.bullets.length;
  const shown = (i: number) => progress >= (items <= 1 ? 0.05 : 0.05 + (i / items) * 0.8);

  // لا تُقصّ النقاط أبدًا (كان العرض يقتطع ٢–٥ والراوي يذكرها كلها): الحجم يتكيّف مع عددها
  const fit = (n: number, base: number) => (n <= 3 ? base : n <= 5 ? base * 0.9 : base * 0.78);

  const bold = layout === "cover" || layout === "stat" || layout === "summary" || layout === "check";
  const ink = bold ? "#FFFFFF" : "#0F172A";
  const sub = bold ? "rgba(255,255,255,0.86)" : "#475569";

  const title = (size = 54) => (
    <Text style={[styles.title, { fontSize: size, lineHeight: size * 1.3, color: ink }, ta]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
      {scene.title}
    </Text>
  );

  let content: React.ReactNode;
  if (layout === "check") {
    const hasOpts = /\n/.test(scene.question ?? "");
    content = (
      <View style={[styles.centerCol, hasOpts && { gap: 14 }]}>
        <View style={[styles.tag, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="help-circle-outline" size={26} color="#FFFFFF" />
          <Text style={styles.tagTxt}>{t("video.check")}</Text>
        </View>
        {(() => {
          // السؤال كاملًا، والخيارات (كل خيار في سطر) تحته
          const [q, ...opts] = (scene.question ?? "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
          const long = (scene.question ?? "").length > 160 || opts.length > 0;
          return (
            <>
              <Text style={[styles.question, long && { fontSize: 34, lineHeight: 48 }, ta]} numberOfLines={opts.length ? 3 : 7} adjustsFontSizeToFit minimumFontScale={0.5}>
                {q}
              </Text>
              {opts.length ? (
                <View style={[styles.opts, opts.length > 3 && { flexDirection: dir.row, flexWrap: "wrap" }]}>
                  {opts.map((o, i) => (
                    <View key={i} style={[styles.opt, opts.length > 3 && { width: "48.8%" }]}>
                      <Text style={[styles.optTxt, ta]} numberOfLines={opts.length > 3 ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.55}>
                        {o}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          );
        })()}
        {stage === "think" ? (
          <View style={styles.think}>
            <Text style={styles.thinkNum}>{thinkLeft}</Text>
          </View>
        ) : null}
        <Reveal visible={stage === "reveal"} style={styles.answerBox}>
          <Text style={[styles.answerHead, ta]}>
            <Ionicons name="checkmark-circle" size={26} color="#047857" /> {t("video.answer")}
          </Text>
          <Text style={[styles.answerTxt, hasOpts && { fontSize: 27, lineHeight: 40 }, ta]} numberOfLines={hasOpts ? 3 : 6} adjustsFontSizeToFit minimumFontScale={0.5}>
            {scene.answer}
          </Text>
        </Reveal>
      </View>
    );
  } else if (layout === "cover") {
    content = (
      <View style={styles.centerCol}>
        <Ionicons name="play-circle-outline" size={84} color="rgba(255,255,255,0.9)" />
        {title(68)}
        {scene.highlight ? (
          <Reveal visible={progress >= 0.02}>
            <Text style={[styles.lead, { color: sub }, ta]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {scene.highlight}
            </Text>
          </Reveal>
        ) : null}
        <View style={[styles.chips, { flexDirection: dir.row }]}>
          {scene.bullets.map((b, i) => (
            <Reveal key={i} visible={shown(i)} style={[styles.chip, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Text style={[styles.chipTxt, { fontSize: fit(scene.bullets.length, 24) }]} numberOfLines={2}>
                {b}
              </Text>
            </Reveal>
          ))}
        </View>
      </View>
    );
  } else if (layout === "stat") {
    content = (
      <View style={styles.centerCol}>
        <Text style={styles.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
          {scene.highlight}
        </Text>
        {title(46)}
        {scene.bullets.map((b, i) => (
          <Reveal key={i} visible={shown(i)}>
            <Text style={[styles.bulletW, { fontSize: fit(scene.bullets.length, 28), lineHeight: fit(scene.bullets.length, 42) }, ta]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {b}
            </Text>
          </Reveal>
        ))}
      </View>
    );
  } else if (layout === "quote") {
    content = (
      <View style={styles.centerCol}>
        <Text style={[styles.quoteMark, { color: c1 }]}>“</Text>
        <Text style={[styles.quote, { color: "#0F172A" }, ta]} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.6}>
          {scene.highlight}
        </Text>
        <Text style={[styles.quoteBy, { color: c1 }, ta]} numberOfLines={1}>
          {scene.title}
        </Text>
        {scene.bullets.map((b, i) => (
          <Reveal key={i} visible={shown(i)}>
            <Text style={[styles.bullet, { color: "#334155", fontSize: fit(scene.bullets.length + 1, 29), lineHeight: fit(scene.bullets.length + 1, 42) }, ta]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {b}
            </Text>
          </Reveal>
        ))}
      </View>
    );
  } else if (layout === "compare") {
    const cols = (scene.columns ?? []).slice(0, 2);
    const most = Math.max(0, ...cols.map((c) => c.bullets.length));
    content = (
      <View style={{ flex: 1, gap: 22 }}>
        {title(48)}
        <View style={[{ flex: 1, gap: 22, flexDirection: dir.row }]}>
          {cols.map((col, ci) => (
            <Reveal key={ci} visible={shown(ci)} style={[styles.col, { borderColor: ci ? c2 : c1 }]}>
              <View style={[styles.colHead, { backgroundColor: ci ? c2 : c1 }]}>
                <Text style={styles.colHeadTxt} numberOfLines={1} adjustsFontSizeToFit>
                  {col.title}
                </Text>
              </View>
              {col.bullets.map((b, i) => (
                <Text key={i} style={[styles.colTxt, { fontSize: fit(most, 26), lineHeight: fit(most, 38) }, ta]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                  • {b}
                </Text>
              ))}
            </Reveal>
          ))}
        </View>
      </View>
    );
  } else {
    // list / cards / steps / summary
    const list = scene.bullets;
    // بطاقات (٣ فأكثر) أو قائمة طويلة (٦ فأكثر) → عمودان، فتظهر كل النقاط بحجم مقروء
    const grid = (layout === "cards" && list.length >= 3) || list.length >= 6;
    const fs = fit(grid ? Math.ceil(list.length / 2) + 2 : list.length, 29);
    content = (
      <View style={{ flex: 1, gap: 24 }}>
        <View style={[{ alignItems: "center", gap: 18, flexDirection: dir.row }]}>
          <View style={[styles.iconTile, { backgroundColor: bold ? "rgba(255,255,255,0.2)" : c1 + "1A" }]}>
            <Ionicons name={ICON[layout]} size={40} color={bold ? "#FFFFFF" : c1} />
          </View>
          <View style={{ flex: 1 }}>{title(50)}</View>
        </View>
        <View style={[{ flex: 1, gap: list.length > 5 ? 12 : 16 }, grid && { flexDirection: dir.row, flexWrap: "wrap" }]}>
          {list.map((x, i) => {
            const { head: h, body: b } = splitHead(x);
            return (
              <Reveal
                key={i}
                visible={shown(i)}
                style={[
                  styles.row,
                  { flexDirection: dir.row, backgroundColor: bold ? "rgba(255,255,255,0.14)" : "#F8FAFC", borderColor: bold ? "rgba(255,255,255,0.22)" : c1 + "33" },
                  grid && { width: "48.6%", alignItems: "flex-start" },
                ]}
              >
                <View style={[styles.num, { backgroundColor: bold ? "#FFFFFF" : c1 }]}>
                  {layout === "summary" ? (
                    <Ionicons name="checkmark" size={24} color={c1} />
                  ) : (
                    <Text style={[styles.numTxt, { color: bold ? c1 : "#FFFFFF" }]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.bullet, { color: ink, flex: 1, fontSize: fs, lineHeight: fs * 1.45 }, ta]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.55}>
                  {h ? <Text style={{ fontWeight: "900", color: bold ? "#FFFFFF" : c1 }}>{h}: </Text> : null}
                  {b}
                </Text>
              </Reveal>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { width, height }]}>
      <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: "top left" }]}>
        {/* الخلفية: تدرّج جريء للمشاهد البارزة، وأبيض أنيق للبقية — مع حركة بطيئة مستمرة */}
        {bold ? (
          <LinearGradient colors={layout === "check" ? ["#0F766E", "#1D4ED8"] : [c1, c2]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }]} />
        )}
        <Animated.View
          style={[
            styles.orb,
            {
              backgroundColor: bold ? "rgba(255,255,255,0.10)" : c1 + "14",
              transform: [
                { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-40, 60] }) },
                { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) },
                { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb2,
            {
              backgroundColor: bold ? "rgba(255,255,255,0.07)" : c2 + "12",
              transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [40, -50] }) }, { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.content,
            {
              opacity: enter,
              transform: [
                { scale: Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }), drift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.015] })) },
              ],
            },
          ]}
        >
          {content}
        </Animated.View>
        {/* ترجمة نصية أسفل الإطار، كالفيديو */}
        {caption ? (
          <View style={styles.capWrap} pointerEvents="none">
            <Text style={styles.cap} numberOfLines={2}>
              {caption}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 18, backgroundColor: "#000000" },
  canvas: { position: "absolute", top: 0, left: 0, width: DW, height: DH, overflow: "hidden" },
  orb: { position: "absolute", width: 620, height: 620, borderRadius: 310, top: -220, right: -160 },
  orb2: { position: "absolute", width: 480, height: 480, borderRadius: 240, bottom: -220, left: -120 },
  content: { position: "absolute", top: 56, left: 72, right: 72, bottom: 110 },
  centerCol: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22 },
  title: { fontWeight: "900", alignSelf: "stretch" },
  lead: { fontSize: 32, lineHeight: 46, fontWeight: "700", textAlign: "center" },
  chips: { flexWrap: "wrap", justifyContent: "center", gap: 14 },
  chip: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999 },
  chipTxt: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  stat: { color: "#FFFFFF", fontSize: 150, fontWeight: "900", alignSelf: "stretch", textAlign: "center" },
  bulletW: { color: "rgba(255,255,255,0.92)", fontSize: 28, lineHeight: 42, fontWeight: "700", textAlign: "center" },
  quoteMark: { fontSize: 140, lineHeight: 140, fontWeight: "900", marginBottom: -40 },
  quote: { fontSize: 40, lineHeight: 60, fontWeight: "800", alignSelf: "stretch", textAlign: "center" },
  quoteBy: { fontSize: 26, fontWeight: "900", alignSelf: "stretch", textAlign: "center" },
  iconTile: { width: 76, height: 76, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  row: { alignItems: "center", gap: 18, borderRadius: 22, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 20 },
  num: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  numTxt: { fontSize: 24, fontWeight: "900" },
  bullet: { fontSize: 29, lineHeight: 42, fontWeight: "700" },
  col: { flex: 1, borderWidth: 2, borderRadius: 22, overflow: "hidden", gap: 12, paddingBottom: 16, backgroundColor: "#FFFFFF" },
  colHead: { paddingVertical: 14, paddingHorizontal: 18 },
  colHeadTxt: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", textAlign: "center" },
  colTxt: { fontSize: 26, lineHeight: 38, fontWeight: "700", color: "#0F172A", paddingHorizontal: 18 },
  tag: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999 },
  tagTxt: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  question: { color: "#FFFFFF", fontSize: 46, lineHeight: 66, fontWeight: "900", alignSelf: "stretch", textAlign: "center" },
  think: { width: 120, height: 120, borderRadius: 60, borderWidth: 5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  thinkNum: { color: "#FFFFFF", fontSize: 56, fontWeight: "900" },
  opts: { alignSelf: "stretch", gap: 10 },
  opt: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.3)", borderWidth: 1.5, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 20 },
  optTxt: { color: "#FFFFFF", fontSize: 28, lineHeight: 40, fontWeight: "800" },
  answerBox: { backgroundColor: "#FFFFFF", borderRadius: 26, paddingVertical: 20, paddingHorizontal: 28, gap: 8, alignSelf: "stretch" },
  answerHead: { color: "#047857", fontSize: 26, fontWeight: "900" },
  answerTxt: { color: "#0F172A", fontSize: 32, lineHeight: 48, fontWeight: "800" },
  capWrap: { position: "absolute", left: 120, right: 120, bottom: 22, alignItems: "center" },
  cap: { backgroundColor: "rgba(0,0,0,0.72)", color: "#FFFFFF", fontSize: 25, lineHeight: 36, fontWeight: "700", paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12, textAlign: "center", overflow: "hidden" },
});
