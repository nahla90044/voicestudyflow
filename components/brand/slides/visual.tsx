// components/brand/slides/visual.tsx
// شكل بصري «مَرسَم المفاهيم»: كل فكرة رسمة تُفهم من نظرة — ميزان للمقارنة، وتقويم للمدد، وشجرة للأنواع،
// وطريق للخطوات، وبطاقات تنقلب، وختم للنص — تُرسم مع صوت الراوي فوق سماء الليل وذهبها.
// النموذج: docs/slides-design/٢-بصري-تفاعلي.html — وملاحظات التنفيذ في docs/slides-design/notes-for-implementation.json.
// الهوية الثابتة: شريط علوي (الوحدة، رقم المشهد، شريط تقدّمه)، وترجمة تُضيء الكلمة المنطوقة بالذهبي مع أعمدة صوت،
// وخلفية السماء بتوهّج بلون نوع المشهد يتبدّل بهدوء، وشريط ذهبي مائل يعبر بين المشاهد.
// القوالب في components/brand/slides/visual/ (لكل عائلة ملفها)، والأدوات المشتركة في visual/kit.tsx.
// قواعد الملف: يستورد فقط من ./shared و lib/slideThemeCore و lib/slideFonts والمكتبات المثبتة، والمحتوى من ctx.m وحده.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Mask, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { captionAt, captionChunk, type SceneModel } from "../../../lib/slideThemeCore";
import { KaraokeText, PlainScene, useLoop, type CaptionProps, type SlideCtx, type SlideThemeModule } from "./shared";
import { CheckScene } from "./visual/check";
import { CompareScene, TreeScene } from "./visual/compare";
import { CoverScene, QIntroScene, SummaryScene } from "./visual/cover";
import { DefineScene, PaperScene } from "./visual/define";
import { alpha, dg, fit, fitSize, nLines, sceneAcc, seeded, tx, useSvgId, V } from "./visual/kit";
import { CardsScene, ListScene, StepsScene } from "./visual/list";
import { StatScene } from "./visual/stat";

// ===== المشهد =====

/** القالب ← رسمته (أي نقص في بياناته يرجع إلى النقاط، والسؤال بلا نموذج إلى الرسم البسيط صراحةً) */
function VisualScene({ ctx }: { ctx: SlideCtx }) {
  const { m } = ctx;
  switch (m.template) {
    case "check":
      return m.check ? <CheckScene ctx={ctx} /> : <PlainScene ctx={ctx} />;
    case "qIntro":
      return <QIntroScene ctx={ctx} />;
    case "cover":
      return <CoverScene ctx={ctx} />;
    case "summary":
      return m.items.length ? <SummaryScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    case "steps":
      return <StepsScene ctx={ctx} />;
    case "cards":
    case "groups":
      return m.items.length ? <CardsScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    case "compare":
      return (m.columns?.length ?? 0) >= 2 ? <CompareScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    case "tree":
      return (m.tree?.nodes.length ?? 0) >= 2 ? <TreeScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    case "define":
      return m.define ? <DefineScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    case "stat":
    case "range":
      return m.highlight || m.range ? <StatScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    case "seal":
    case "quote":
      return m.highlight || m.items.length ? <PaperScene ctx={ctx} /> : <ListScene ctx={ctx} />;
    default:
      return <ListScene ctx={ctx} />;
  }
}

// ===== الخلفية =====

const W = 1280;
const H = 720;

/** نجوم ثابتة ببذرة، و٣ مجموعات صغيرة فقط تومض (حلقة واحدة تحرّكها بفارق طور) */
const STARS = (() => {
  const r = seeded(20251026);
  return Array.from({ length: 40 }, () => ({ x: r() * W, y: r() * H * 0.9, s: 1.2 + r() * 1.8, o: 0.18 + r() * 0.4 }));
})();
const TWINKLE = [
  [
    { x: 212, y: 96, s: 2.6, gold: false },
    { x: 980, y: 300, s: 2.2, gold: true },
  ],
  [
    { x: 640, y: 54, s: 2.4, gold: false },
    { x: 120, y: 420, s: 3, gold: true },
  ],
  [
    { x: 1150, y: 150, s: 2.6, gold: false },
    { x: 460, y: 250, s: 2.2, gold: false },
  ],
];

/** خلفية السماء: تدرّج ١٥٥°، وتوهّجان ينجرفان ببطء (الأول بلون نوع المشهد ويتبدّل بتلاشٍ)، وشبكة نقاط، ونجوم */
function VisualBackdrop({ m, reduced }: { m: SceneModel; reduced: boolean }) {
  const acc = sceneAcc(m);
  // طبقتان للتوهّج: الجديدة تظهر والقديمة تخفت (لا قفز في اللون بين المشاهد)
  const [st, setSt] = useState({ a: acc, b: acc, front: 0, key: acc });
  if (st.key !== acc) setSt(st.front === 0 ? { a: st.a, b: acc, front: 1, key: acc } : { a: acc, b: st.b, front: 0, key: acc });
  const front = useSharedValue(st.front);
  useEffect(() => {
    if (reduced) front.value = st.front;
    else front.value = withTiming(st.front, { duration: 1100, easing: Easing.inOut(Easing.quad) });
    return () => cancelAnimation(front);
  }, [st.front, reduced, front]);
  const drift = useLoop(19000);
  const tw = useLoop(1600);
  const g1 = useAnimatedStyle(() => ({ transform: [{ translateX: -90 * drift.value }, { translateY: 60 * drift.value }] }));
  const g2 = useAnimatedStyle(() => ({ transform: [{ translateX: 80 * (1 - drift.value) }, { translateY: -50 * (1 - drift.value) }] }));
  const la = useAnimatedStyle(() => ({ opacity: 1 - front.value }));
  const lb = useAnimatedStyle(() => ({ opacity: front.value }));
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: V.bgB, overflow: "hidden" }]} pointerEvents="none">
      <LinearGradient colors={[V.bgA, V.bgB, V.bgC]} locations={[0, 0.5, 1]} start={{ x: 0.29, y: 0 }} end={{ x: 0.71, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[{ position: "absolute", top: -520, right: -300, width: 980, height: 980 }, g1]}>
        <Animated.View style={[StyleSheet.absoluteFill, la]}>
          <Glow color={st.a} size={980} strength={0.3} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, lb]}>
          <Glow color={st.b} size={980} strength={0.3} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[{ position: "absolute", bottom: -520, left: -260, width: 860, height: 860 }, g2]}>
        <Glow color="#7C6CFF" size={860} strength={0.22} />
      </Animated.View>
      <Dots />
      {STARS.map((s, i) => (
        <View key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: s.s, backgroundColor: "#FFFFFF", opacity: s.o }} />
      ))}
      {TWINKLE.map((g, i) => (
        <Twinkle key={i} v={tw} phase={i / 3} stars={g} />
      ))}
    </View>
  );
}

/** توهّج دائري: تدرّج شعاعي صغير يُكبَّر (ناعم بطبيعته فلا يُرى فرق الدقة، وذاكرته زهيدة) */
function Glow({ color, size, strength }: { color: string; size: number; strength: number }) {
  const id = useSvgId("glow");
  return (
    <Svg width={50} height={50} viewBox="0 0 50 50" style={{ position: "absolute", left: 0, top: 0, transform: [{ scale: size / 50 }], transformOrigin: "top left" }}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={25} cy={25} r={25} fill={`url(#${id})`} />
    </Svg>
  );
}

/** شبكة نقاط ٣٦ بكسل تخفت نحو الأسفل (تُرسم بثلث الدقة ثم تُكبَّر) */
function Dots() {
  const p = useSvgId("dots");
  const g = useSvgId("fade");
  const k = useSvgId("mask");
  return (
    <Svg width={W / 3} height={H / 3} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, transform: [{ scale: 3 }], transformOrigin: "top left" }}>
      <Defs>
        <Pattern id={p} x={0} y={0} width={36} height={36} patternUnits="userSpaceOnUse">
          <Circle cx={18} cy={18} r={1.5} fill="#F5F1FF" fillOpacity={0.07} />
        </Pattern>
        <SvgGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.25} />
        </SvgGradient>
        <Mask id={k} x={0} y={0} width={W} height={H} maskUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={W} height={H} fill={`url(#${g})`} />
        </Mask>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#${p})`} mask={`url(#${k})`} />
    </Svg>
  );
}

function Twinkle({ v, phase, stars }: { v: ReturnType<typeof useLoop>; phase: number; stars: { x: number; y: number; s: number; gold: boolean }[] }) {
  const a = useAnimatedStyle(() => ({ opacity: 0.18 + 0.77 * Math.abs(Math.sin(Math.PI * (v.value * 0.5 + phase))) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, a]}>
      {stars.map((s, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            width: s.s * (s.gold ? 2.2 : 1),
            height: s.s * (s.gold ? 2.2 : 1),
            borderRadius: s.s * 2,
            backgroundColor: s.gold ? V.brand : "#FFFFFF",
            boxShadow: s.gold ? `0 0 8px ${V.brand}` : undefined,
            transform: s.gold ? [{ rotate: "45deg" }] : undefined,
          }}
        />
      ))}
    </Animated.View>
  );
}

// ===== الشريط العلوي =====

/** الوحدة يمينًا (بالعربية)، ورقم المشهد وشريط تقدّمه يسارًا — ويحجز مربع زر ملء الشاشة */
function VisualHeader({ ctx }: { ctx: SlideCtx; p: number }) {
  if (ctx.bare) return null;
  const c = ctx.safe.corner;
  const left = c > 0 ? Math.max(36, Math.ceil(c + 10)) : 36;
  const unit = ctx.unitTitle || ctx.t("video.s.brand");
  return (
    <View style={{ position: "absolute", top: 18, left, right: 36, height: 34, flexDirection: ctx.row, alignItems: "center", justifyContent: "space-between", gap: 16 }} pointerEvents="none">
      <View style={{ flexShrink: 1, flexDirection: ctx.row, alignItems: "center", gap: 8, height: 34, paddingHorizontal: 15, borderRadius: 999, backgroundColor: alpha(V.ink, 0.06), borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
        <Ionicons name="book-outline" size={18} color={V.brand} />
        <Text style={[tx(ctx, "plex500", 17, V.ink, 1.2), { flexShrink: 1 }]} {...fit(1)}>
          {unit}
        </Text>
      </View>
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 12 }}>
        <SceneNo key={ctx.index} ctx={ctx} />
        <Bar ctx={ctx} />
      </View>
    </View>
  );
}

/** رقم المشهد يتبدّل بالتلاشي */
function SceneNo({ ctx }: { ctx: SlideCtx }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = ctx.reduced ? 1 : withTiming(1, { duration: 360 });
    return () => cancelAnimation(v);
  }, [v, ctx.reduced]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.Text style={[tx(ctx, "plex500", 17, V.dim, 1.2), a]} {...fit(1)}>
      {ctx.t("video.s.scene", { n: dg(ctx, ctx.index + 1) })}
    </Animated.Text>
  );
}

function Bar({ ctx }: { ctx: SlideCtx }) {
  const sv = ctx.sv;
  const a = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.min(1, Math.max(0, sv.value)) }] }));
  return (
    <View style={{ width: 150, height: 6, borderRadius: 9, backgroundColor: alpha(V.ink, 0.12), overflow: "hidden" }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 9, backgroundColor: V.brand, transformOrigin: ctx.isRTL ? "right" : "left" }, a]} />
    </View>
  );
}

// ===== الترجمة =====

/** الترجمة: بطاقة داكنة في الوسط، وأعمدة صوت ذهبية، والكلمة الحالية ذهبية والمنطوقة بيضاء والقادمة باهتة (سطران، فوق y=610) */
function VisualCaption(props: CaptionProps) {
  if (!props.speech) return null;
  return <CaptionBox {...props} speech={props.speech} />;
}

function CaptionBox({ speech, p, phase, ff, isRTL }: CaptionProps & { speech: string }) {
  const eq = useLoop(1050, { reverse: false, easing: Easing.linear });
  const c = captionChunk(captionAt(speech, p), 16);
  const base = [{ fontSize: 26, lineHeight: 37, textAlign: "center" as const, writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const), color: "rgba(255,255,255,0.52)" }, ff("plex500")];
  const think = phase === "think";
  if (!think && !c.words.length) return null;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 22, alignItems: "center" }} pointerEvents="none">
      <View
        style={{
          maxWidth: 1060,
          minWidth: 560,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 16,
          paddingVertical: 7,
          paddingHorizontal: 24,
          borderRadius: 24,
          backgroundColor: "rgba(6,8,24,0.74)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.09)",
          boxShadow: "0 12px 30px -12px rgba(0,0,0,0.65)",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 28 }}>
          {[0, 0.67, 0.33, 0.81].map((o, i) => (
            <EqBar key={i} v={eq} off={o} />
          ))}
        </View>
        <View style={{ flexShrink: 1 }}>
          {think ? (
            <Text style={[base, { letterSpacing: 6 }]} numberOfLines={1}>
              • • •
            </Text>
          ) : (
            <KaraokeText words={c.words} current={c.current} style={base} spokenStyle={{ color: "#FFFFFF" }} activeStyle={{ color: V.brand }} upcomingStyle={{ color: "rgba(255,255,255,0.52)" }} numberOfLines={2} />
          )}
        </View>
      </View>
    </View>
  );
}

function EqBar({ v, off }: { v: ReturnType<typeof useLoop>; off: number }) {
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (v.value + off))) }] }));
  return <Animated.View style={[{ width: 5, height: 26, borderRadius: 3, backgroundColor: V.brand }, a]} />;
}

// ===== الانتقال =====

/** اتجاه المشهد من نصه (الانتقال لا يصله اتجاه الواجهة) */
const isArabic = (m: SceneModel) => /[؀-ۿ]/.test(`${m.title} ${m.check?.stem ?? ""} ${m.items[0]?.text ?? ""}`);

/** شريط ذهبي مائل يعبر باتجاه القراءة عند كل مشهد جديد، يحمل عنوانه (≤ ٥٦٠ مللي ثانية) */
function VisualTransition({ index, m, reduced, ff }: { index: number; m: SceneModel; reduced: boolean; ff: SlideCtx["ff"] }) {
  const x = useSharedValue(1);
  const last = useRef(index);
  useEffect(() => {
    if (last.current === index) return;
    last.current = index;
    if (reduced) return;
    x.value = 0;
    x.value = withTiming(1, { duration: 560, easing: Easing.inOut(Easing.cubic) });
    return () => cancelAnimation(x);
  }, [index, reduced, x]);
  const rtl = isArabic(m);
  const a = useAnimatedStyle(() => {
    const t = x.value;
    const from = rtl ? W + 300 : -780;
    const to = rtl ? -780 : W + 300;
    return { opacity: t > 0 && t < 1 ? 1 : 0, transform: [{ translateX: from + (to - from) * t }, { skewX: "-12deg" }] };
  });
  const title = m.title || m.check?.stem || "";
  // عرض النص داخل الشريط ٣٣٠: أكبر خط يتسع في ٣ أسطر (لا قص)
  const size = title ? fitSize([title], 330, 3, 30, 16) : 30;
  const lines = title ? Math.min(3, nLines(title, 330, size)) : 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", top: -80, bottom: -80, left: 0, width: 480, alignItems: "center", justifyContent: "center" }, a]}>
        <LinearGradient
          colors={["rgba(246,213,138,0)", "rgba(246,213,138,0.92)", V.brand, "rgba(246,213,138,0.92)", "rgba(246,213,138,0)"]}
          locations={[0, 0.22, 0.5, 0.78, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ transform: [{ skewX: "12deg" }], flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
          <Ionicons name={rtl ? "arrow-back" : "arrow-forward"} size={30} color={V.onBrand} />
          {title ? (
            <Text style={[{ fontSize: size, lineHeight: Math.round(size * 1.32), color: V.onBrand, textAlign: "center", width: 330 }, ff("kufi700")]} {...fit(lines)}>
              {title}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

export const visual: SlideThemeModule = {
  id: "visual",
  Scene: VisualScene,
  Backdrop: VisualBackdrop,
  Header: VisualHeader,
  Caption: VisualCaption,
  Transition: VisualTransition,
};
