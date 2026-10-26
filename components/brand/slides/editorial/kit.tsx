// components/brand/slides/editorial/kit.tsx
// أدوات شكل المجلة «حبر وذهب» المشتركة بين صفحاته:
// - الأسطح الثلاثة (حبر / ورق / ذهب) وألوان النص فوق كل منها، وصندوق المحتوى (كاملًا، أو ورقة داخلية في «منوّع»).
// - تقدير الأسطر والخط لكل خط (الكوفي أعرض من النسخ) حتى لا يُقص نص: الحجم المسبق من linesFor في النواة،
//   وكل Text له numberOfLines بعدد الأسطر المقدَّر مع التصغير التلقائي حتى ٠٫٦ احتياطًا.
// - مفردات الحركة الثماني من النموذج (نقش، خيط، ختم، صعود، دخول جانبي، انبثاق، عدّاد، تخفيت) — كلها
//   من useTrigger/useSpan/useLoop في shared (reanimated على خيط الواجهة، بلا مؤقتات).
// - مكوّنات صغيرة: الختم الدوّار، علامة الصح المرسومة بخطين، بكرات العدّاد، الرقم المفرّغ، الحرف الشبحي.
// المقاسات كلها بوحدات اللوحة ١٢٨٠×٧٢٠.
import { LinearGradient } from "expo-linear-gradient";
import React, { useContext, useMemo, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import type { FontRole } from "../../../../lib/slideFonts";
import { linesFor, toLocalDigits, type SceneModel } from "../../../../lib/slideThemeCore";
import { CANVAS_W, DIM, GOLD, GOLD_DEEP, GOLD_INK, INK, IVORY, PAPER_DIM, PAPER_INK, SlideMotion, useLoop, useTrigger, type SlideCtx } from "../shared";

// ===== الأسطح والألوان =====

export type Surf = "ink" | "paper" | "gold";

export type Tone = {
  /** النص الأساسي */
  text: string;
  /** النص الثانوي */
  dim: string;
  /** لون الإبراز (ذهب على الحبر، ذهب الورق على العاجي، حبر على الذهب) */
  accent: string;
  /** الخطوط الشعرية والفواصل */
  rule: string;
  /** مسار خيط التقدّم */
  track: string;
};

export const TONES: Record<Surf, Tone> = {
  ink: { text: IVORY, dim: DIM, accent: GOLD, rule: "rgba(245,241,255,0.14)", track: "rgba(245,241,255,0.12)" },
  paper: { text: PAPER_INK, dim: PAPER_DIM, accent: GOLD_INK, rule: "rgba(18,20,46,0.14)", track: "rgba(18,20,46,0.10)" },
  gold: { text: PAPER_INK, dim: "rgba(18,20,46,0.66)", accent: PAPER_INK, rule: "rgba(18,20,46,0.14)", track: "rgba(18,20,46,0.14)" },
};

/** ألوان النموذج الإضافية */
export const C = {
  inkTop: "#0D1130",
  inkBottom: "#090B20",
  glowNavy: "#1C2156",
  paperTop: "#F4EFE3",
  paperBottom: "#ECE4D2",
  paperLight: "#FFFDF7",
  goldA: GOLD,
  goldB: "#EEC46C",
  goldC: "#E2B158",
  goldLight: "#FCE9B9",
  goldPale: "#FAE4AA",
  spineTop: "#9C7631",
  curtainEdge: "#05071A",
  cardInk: "rgba(21,24,56,0.82)",
};

/**
 * سطح كل قالب (كما في النموذج): الحبر للافتتاح والتفرّع والأرقام والمجموعات والختام،
 * والورق للتعريف والاقتباس والمقارنة والنقاط والخلاصة، والذهب لسؤال الفهم وحده.
 */
export function surfaceOf(m: Pick<SceneModel, "template">): Surf {
  switch (m.template) {
    case "check":
      return "gold";
    case "define":
    case "quote":
    case "compare":
    case "list":
    case "steps":
    case "summary":
      return "paper";
    default:
      return "ink";
  }
}

// ===== صندوق المحتوى =====

/** صندوق المحتوى بوحدات اللوحة: top/bottom من أعلى اللوحة، وleft/right من الجانبين الفعليين */
export type Box = { top: number; bottom: number; left: number; right: number; w: number; h: number };

const mkBox = (top: number, bottom: number, side: number): Box => ({ top, bottom, left: side, right: side, w: CANVAS_W - side * 2, h: bottom - top });

/** الصفحة الكاملة: تحت خيط التقدّم (٨٤) وفوق الترجمة (٦١٠) */
export const FULL_BOX = mkBox(100, 604, 72);
/** «منوّع»: الورقة الداخلية فوق الليل — تحت الترويسة وخيطها، وفوق منطقة الترجمة */
export const SHEET = { top: 98, bottom: 614, side: 56, radius: 28 } as const;
export const SHEET_BOX = mkBox(SHEET.top + 22, SHEET.bottom - 20, SHEET.side + 28);

export function pageBox(ctx: Pick<SlideCtx, "bare">, surf: Surf): Box {
  return ctx.bare && surf !== "ink" ? SHEET_BOX : FULL_BOX;
}

/** إزاحة يسرى لصف يبدأ عند rowTop حتى يبقى مربع الزاوية العليا اليسرى (زر ملء الشاشة) خاليًا */
export function cornerPad(ctx: Pick<SlideCtx, "safe">, B: Box, rowTop: number): number {
  const c = ctx.safe.corner;
  if (!(c > 0) || rowTop > c + 8) return 0;
  return Math.max(0, c + 10 - B.left);
}

/** أعلى موضع لعنصر على الجانب الأيسر حتى لا يقع في مربع الزاوية (بالنسبة لأعلى الصندوق) */
export function belowCorner(ctx: Pick<SlideCtx, "safe">, B: Box, top: number): number {
  const c = ctx.safe.corner;
  if (!(c > 0)) return top;
  return Math.max(top, c + 10 - B.top);
}

/** موضع أفقي من جهة البداية (يمين في العربية، يسار في الإنجليزية) */
export const fromStart = (isRTL: boolean, n: number): ViewStyle => (isRTL ? { right: n } : { left: n });
export const fromEnd = (isRTL: boolean, n: number): ViewStyle => (isRTL ? { left: n } : { right: n });
/** أصل التحويل من جهة البداية / النهاية */
export const originStart = (isRTL: boolean) => (isRTL ? "100% 50%" : "0% 50%");
export const originEnd = (isRTL: boolean) => (isRTL ? "0% 50%" : "100% 50%");

// ===== تقدير الخط والأسطر =====

/**
 * عرض الحرف بالنسبة لمتوسط النواة (CHAR_EM = 0.52، ومعه هامش ١٫٠٦ في linesFor). قيس في المتصفح بالخطوط نفسها:
 * العربية ٠٫٣٥–٠٫٤٥ من الخط، واللاتينية حتى ٠٫٤٩ (Plex) و٠٫٤٩ (الكوفي) و٠٫٤٦ (أميري) — فكل معامل هنا يبقي
 * التقدير أعرض من الفعلي في اللغتين (هامش ١٠–٣٠٪ للعربية لهدر آخر السطر عند الالتفاف وخط النظام قبل التحميل).
 */
const WF: Record<FontRole, number> = {
  kufi600: 0.97,
  kufi700: 1.0,
  amiri400: 0.86,
  amiri700: 0.9,
  plex400: 0.9,
  plex500: 0.92,
  plex600: 0.94,
  plex700: 0.96,
  ruqaa700: 1.0,
};

export function nLines(text: string, w: number, size: number, role: FontRole): number {
  return linesFor(text || " ", Math.max(1, w) / WF[role], size);
}

/** خطة نص: الحجم وعدد الأسطر والارتفاع */
export type TP = { size: number; lines: number; h: number; lh: number };

/** أكبر خط بين base وmin يتسع فيه النص بعرض w وارتفاع maxH وأسطر ≤ maxLines (لا ينزل عن min) */
export function fitT(text: string, w: number, maxH: number, base: number, min: number, lh: number, maxLines: number, role: FontRole): TP {
  const hi = Math.max(Math.round(base), Math.round(min));
  const lo = Math.max(8, Math.round(Math.min(base, min)));
  for (let s = hi; s >= lo; s -= 1) {
    const L = nLines(text, w, s, role);
    if (L <= maxLines && L * s * lh <= maxH) return { size: s, lines: L, h: L * s * lh, lh };
  }
  const L = Math.min(maxLines, nLines(text, w, lo, role));
  return { size: lo, lines: L, h: L * lo * lh, lh };
}

/** خطة بحجم معطى (بلا بحث): الأسطر ≤ maxLines، والزائد يصغّره adjustsFontSizeToFit */
export function planAt(text: string, w: number, size: number, lh: number, maxLines: number, role: FontRole): TP {
  const s = Math.max(8, size);
  const L = Math.min(maxLines, nLines(text, w, s, role));
  return { size: s, lines: L, h: L * s * lh, lh };
}

/** نسبة تصغير واحدة لكتلة كاملة: أول s من 1 نزولًا يتسع فيها need(s) ≤ H */
export function fitScale(need: (s: number) => number, H: number, minS = 0.42): number {
  for (let s = 1; s >= minS; s -= 0.02) if (need(s) <= H) return s;
  return minS;
}

/** نص بخطته: لا قص (numberOfLines = الأسطر المقدّرة، والتصغير التلقائي حتى ٠٫٦ إن أخطأ التقدير) */
export function T({
  ctx,
  tp,
  color,
  role,
  align,
  style,
  children,
}: {
  ctx: Pick<SlideCtx, "ff" | "align">;
  tp: TP;
  color: string;
  role: FontRole;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={Math.max(1, tp.lines)}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={[{ color, fontSize: tp.size, lineHeight: tp.size * tp.lh, textAlign: align ?? ctx.align }, style, ctx.ff(role)]}
    >
      {children}
    </Text>
  );
}

/** رقم بأرقام الواجهة بخانتين («٠١») */
export const folio = (n: number, lang: string) => toLocalDigits(String(Math.max(0, n)).padStart(2, "0"), lang);

/** عرض تقريبي لنص قصير سطرًا واحدًا (للحبوب والشارات) */
export const textW = (s: string, size: number, role: FontRole) => (s || "").length * 0.52 * WF[role] * size * 1.04;

// ===== الحركة =====

/** منحنى النموذج cubic-bezier(.22,.9,.24,1) دالةً (لتركيب التأخير) */
export const EASE_FN = Easing.bezierFn(0.22, 0.9, 0.24, 1);
/** منحنى الستارة cubic-bezier(.76,0,.24,1) */
export const EASE_IO_FN = Easing.bezierFn(0.76, 0, 0.24, 1);
const LINEAR_FN = (t: number) => {
  "worklet";
  return t;
};

/** منحنى بتأخير: صفر حتى f من المدة ثم fn على الباقي (التأخير داخل withTiming نفسه، بلا مؤقتات) */
function delayed(f: number, fn: (t: number) => number) {
  "worklet";
  return (t: number) => {
    "worklet";
    return t <= f ? 0 : fn((t - f) / (1 - f));
  };
}

/**
 * إشارة الحركة: ٠→١ خلال ms بعد تأخير delay (مللي ثانية) لحظة بلوغ التقدّم at — تلف useTrigger.
 * at = 0: عند ظهور المشهد. عند الإيقاف أو تقليل الحركة = ١ مباشرة (الحالة النهائية).
 */
export function useCue(sv: SharedValue<number>, at: number, ms = 700, delay = 0, linear = false): SharedValue<number> {
  const d = Math.max(0, Math.round(delay));
  const total = Math.max(1, Math.round(ms) + d);
  const easing = useMemo(() => {
    const fn = linear ? LINEAR_FN : EASE_FN;
    return d > 0 ? delayed(d / total, fn) : fn;
  }, [d, total, linear]);
  return useTrigger(sv, Math.max(0, at), total, easing);
}

type CueProps = { sv: SharedValue<number>; at: number; delay?: number; ms?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode };

/** صعود (fadeUp): شفافية + ٢٨ بكسل */
export function Rise({ sv, at, delay = 0, ms = 700, dist = 28, style, children }: CueProps & { dist?: number }) {
  const v = useCue(sv, at, ms, delay);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * dist }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** ظهور هادئ (fadeIn) */
export function Fade({ sv, at, delay = 0, ms = 700, style, children }: CueProps) {
  const v = useCue(sv, at, ms, delay);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** دخول جانبي ٥٦ بكسل: من جهة البداية (fromR في العربية) أو النهاية */
export function SideIn({ sv, at, delay = 0, ms = 700, dist = 56, side = "start", isRTL, style, children }: CueProps & { dist?: number; side?: "start" | "end"; isRTL: boolean }) {
  const v = useCue(sv, at, ms, delay);
  // البداية يمين في العربية: يأتي من +x؛ وفي الإنجليزية من −x. والنهاية عكسها
  const sign = (side === "start") === isRTL ? 1 : -1;
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateX: (1 - v.value) * dist * sign }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** انبثاق من ٠٫٨٦ */
export function Pop({ sv, at, delay = 0, ms = 600, from = 0.86, style, children }: CueProps & { from?: number }) {
  const v = useCue(sv, at, ms, delay);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: from + (1 - from) * v.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** ختم: تكبير ١٫٤ مع دوران −٩° ← ٠٫٩٥ مع ١٫٥° ← ١ (٧٠٠ مللي ثانية) */
export function Stamp({ sv, at, delay = 0, ms = 700, style, children }: CueProps) {
  const v = useCue(sv, at, ms, delay, true);
  const a = useAnimatedStyle(() => {
    const t = v.value;
    const e = EASE_FN(t);
    return {
      opacity: interpolate(t, [0, 0.35], [0, 1], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(e, [0, 0.6, 1], [1.4, 0.95, 1], Extrapolation.CLAMP) },
        { rotate: `${interpolate(e, [0, 0.6, 1], [-9, 1.5, 0], Extrapolation.CLAMP)}deg` },
      ],
    };
  });
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/**
 * نقش: النص يصعد من خلف قناع (translateY من ١١٢٪ إلى ٠، ٨٥٠ مللي ثانية).
 * القناع بحشوة علوية وسفلية بنسبة الخط (size) حتى لا تُقص الهمزات والنقاط وأذيال الحروف حين يكون
 * ارتفاع السطر أصغر من ارتفاع الخط الطبيعي (iOS يقص الزائد من الأعلى)، وهامش سالب يحفظ التخطيط.
 */
export function MaskRise({ sv, at, delay = 0, ms = 850, height, size, style, children }: CueProps & { height: number; size: number }) {
  const v = useCue(sv, at, ms, delay);
  const pt = Math.round(size * 0.3);
  const pb = Math.round(size * 0.22);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - v.value) * (height + pb) * 1.12 }] }));
  return (
    <View style={[{ overflow: "hidden", paddingTop: pt, paddingBottom: pb, marginTop: -pt, marginBottom: -pb }, style]}>
      <Animated.View style={a}>{children}</Animated.View>
    </View>
  );
}

/** عنوان الصفحة منقوشًا (يصعد من خلف قناعه عند ظهور المشهد) */
export function PageTitle({ ctx, tp, text, color, role = "kufi700", delay = 150, style, align }: { ctx: Pick<SlideCtx, "ff" | "align" | "sv">; tp: TP; text: string; color: string; role?: FontRole; delay?: number; style?: StyleProp<ViewStyle>; align?: TextStyle["textAlign"] }) {
  if (!text) return null;
  return (
    <MaskRise sv={ctx.sv} at={0} delay={delay} height={tp.h} size={tp.size} style={style}>
      <T ctx={ctx} tp={tp} color={color} role={role} align={align}>
        {text}
      </T>
    </MaskRise>
  );
}

/** خيط يُمدّ: scaleX من جهة البداية (أو scaleY من الأعلى/الوسط) */
export function Grow({
  sv,
  at,
  delay = 0,
  ms = 850,
  axis = "x",
  origin,
  style,
  children,
}: CueProps & { axis?: "x" | "y"; origin: string }) {
  const v = useCue(sv, at, ms, delay);
  const a = useAnimatedStyle(() => ({ transform: axis === "x" ? [{ scaleX: v.value }] : [{ scaleY: v.value }] }));
  return <Animated.View style={[style, { transformOrigin: origin }, a]}>{children}</Animated.View>;
}

/** تخفيت ما سبق إلى النصف حين تبدأ النقطة التالية (أثناء التشغيل فقط — الإيقاف يعرض كل شيء واضحًا) */
export function DimAfter({ sv, at, on, style, children }: { sv: SharedValue<number>; at: number | null; on: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useCue(sv, at ?? 2, 500);
  const k = on && at !== null ? 0.5 : 0;
  const a = useAnimatedStyle(() => ({ opacity: 1 - k * v.value }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// ===== مكوّنات صغيرة =====

/** علامة صح تُرسم بخطين (بلا animatedProps): الأول القصير ثم الطويل — مسار النموذج M17 29 l7.5 7.5 L39 21 في ٥٦ */
export function Tick({ sv, at, delay = 0, size, color, width = 3, ms = 600 }: { sv: SharedValue<number>; at: number; delay?: number; size: number; color: string; width?: number; ms?: number }) {
  const v = useCue(sv, at, ms, delay, true);
  const k = size / 56;
  const p0 = { x: 17 * k, y: 29 * k };
  const p1 = { x: 24.5 * k, y: 36.5 * k };
  const p2 = { x: 39 * k, y: 21 * k };
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { len: Math.hypot(dx, dy) + width / 2, ang: Math.atan2(dy, dx) };
  };
  const s1 = seg(p0, p1);
  const s2 = seg(p1, p2);
  const a1 = useAnimatedStyle(() => ({ transform: [{ rotate: `${s1.ang}rad` }, { scaleX: interpolate(v.value, [0, 0.38], [0, 1], Extrapolation.CLAMP) }] }));
  const a2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${s2.ang}rad` }, { scaleX: interpolate(v.value, [0.38, 1], [0, 1], Extrapolation.CLAMP) }] }));
  const base: ViewStyle = { position: "absolute", height: width, borderRadius: width / 2, backgroundColor: color, transformOrigin: "0% 50%" };
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Animated.View style={[base, { left: p0.x - width / 2, top: p0.y - width / 2, width: s1.len }, a1]} />
      <Animated.View style={[base, { left: p1.x - width / 2, top: p1.y - width / 2, width: s2.len }, a2]} />
    </View>
  );
}

/** الختم: ثلاث حلقات (الخارجية منقّطة تدور ٤٦ ثانية) وفي وسطه الأيقونة أو السنة */
export function SealRing({ size, spin, color = GOLD, children }: { size: number; spin: boolean; color?: string; children?: React.ReactNode }) {
  const loop = useLoop(46000, { reverse: false, easing: Easing.linear, enabled: spin });
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${loop.value * 360}deg` }] }));
  const k = size / 200;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[StyleSheet.absoluteFill, a]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Circle cx={100} cy={100} r={96} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="2 7.5" />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        <Circle cx={100} cy={100} r={82} fill="rgba(246,213,138,0.06)" stroke="rgba(246,213,138,0.7)" strokeWidth={1.4} />
        <Circle cx={100} cy={100} r={74} fill="none" stroke="rgba(246,213,138,0.35)" strokeWidth={1} />
      </Svg>
      <View style={{ width: 140 * k, alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

/**
 * العدّاد: الرقم الصحيح يعدّ من الصفر بالأرقام العربية خلال ms (١٫١–١٫٣ ثانية).
 * القيمة من إشارة الحركة على خيط الواجهة، والنص يُحدَّث عند تغيّر الرقم فقط (≤ ٢٤ مرة في العدّة كلها)
 * — نص عادي بلا قناع، فلا تُقص الأرقام بخط أميري الطويل. عند الإيقاف وتقليل الحركة يظهر الرقم النهائي فورًا.
 */
export function Counter({ sv, at, delay = 0, ms = 1200, to, lang, style }: { sv: SharedValue<number>; at: number; delay?: number; ms?: number; to: number; lang: string; style: StyleProp<TextStyle> }) {
  const { reduced, playing } = useContext(SlideMotion);
  const v = useCue(sv, at, ms, delay);
  const target = Math.max(0, Math.round(to));
  const [n, setN] = useState(reduced || !playing ? target : 0);
  useAnimatedReaction(
    () => Math.round((Math.round(v.value * 24) / 24) * target),
    (cur, prev) => {
      if (cur !== prev) runOnJS(setN)(cur);
    },
    [target]
  );
  return (
    <Text allowFontScaling={false} numberOfLines={1} style={style}>
      {toLocalDigits(n, lang)}
    </Text>
  );
}

/** عرض العدّاد التقريبي (يُثبَّت حتى لا يتحرك ما بجانبه أثناء العد) */
export const counterW = (n: number, size: number) => Math.max(1, String(Math.max(0, Math.round(n))).length) * size * 0.56 + size * 0.12;

/** رقم مفرّغ (خط ذهبي بلا تعبئة) — Svg Text للأرقام فقط (تشكيل الحروف في Svg غير مضمون) */
export function OutlineNum({ text, size, color, width = 3, ff }: { text: string; size: number; color: string; width?: number; ff: SlideCtx["ff"] }) {
  const f = ff("amiri700");
  const w = Math.max(size * 0.6, text.length * size * 0.58) + width * 2;
  const h = size * 1.18;
  return (
    <Svg width={w} height={h}>
      <SvgText
        x={w / 2}
        y={size * 0.92}
        fontSize={size}
        fontFamily={f.fontFamily}
        fontWeight={f.fontWeight as never}
        fill="none"
        stroke={color}
        strokeWidth={width}
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </Svg>
  );
}

/** حرف شبحي ضخم ينجرف ببطء (±٢٤/١٤ خلال ١٦ ثانية) — زخرفة خلف المحتوى */
export function Ghost({ glyph, size, color, style, drift = true, ff, role = "amiri700", sway = false }: { glyph: string; size: number; color: string; style: StyleProp<ViewStyle>; drift?: boolean; ff: SlideCtx["ff"]; role?: FontRole; sway?: boolean }) {
  const loop = useLoop(sway ? 3500 : 8000, { enabled: drift });
  const a = useAnimatedStyle(() =>
    sway
      ? { transform: [{ rotate: `${-4 + 8 * loop.value}deg` }] }
      : { transform: [{ translateX: -24 * loop.value }, { translateY: 14 * loop.value }] }
  );
  return (
    <Animated.View style={[{ position: "absolute", transformOrigin: "50% 70%" }, style, a]} pointerEvents="none">
      <Text allowFontScaling={false} numberOfLines={1} style={[{ color, fontSize: size, lineHeight: size * 1.1 }, ff(role)]}>
        {glyph}
      </Text>
    </Animated.View>
  );
}

/** الحرف الأول ذو المعنى (بلا «ال») للحرف الشبحي */
export function ghostOf(s: string): string {
  const t = (s || "").trim().replace(/^ال/, "");
  const ch = [...t].find((c) => /[A-Za-zء-ي]/.test(c));
  return ch ? ch.toUpperCase() : "";
}

/** توهّج شعاعي (radial-gradient في النموذج) بإحداثيات نسبية للصندوق: المركز ونصفا القطر بالنسبة المئوية */
function Glow({ id, cx, cy, rx, ry, color, alpha, stop }: { id: string; cx: string; cy: string; rx: string; ry: string; color: string; alpha: number; stop: number }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} rx={rx} ry={ry} fx={cx} fy={cy} gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={color} stopOpacity={alpha} />
          <Stop offset={String(stop)} stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * سطح ملوّن بملء الصندوق المعطى (للخلفية وللورقة الداخلية في «منوّع»):
 * الحبر: تدرّج ١٨٠° وتوهّج ذهبي أعلى البداية وتوهّج نيلي أسفل النهاية؛ الورق: عاجي دافئ بإشراقة؛ الذهب: تدرّج ١٦٠°.
 */
export function SurfaceFill({ surf, style, uid = "f" }: { surf: Surf; style?: StyleProp<ViewStyle>; uid?: string }) {
  if (surf === "paper") {
    return (
      <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        <LinearGradient colors={[C.paperTop, C.paperBottom]} style={StyleSheet.absoluteFill} />
        <Glow id={`${uid}p`} cx="85%" cy="-10%" rx="86%" ry="86%" color={C.paperLight} alpha={1} stop={0.65} />
      </View>
    );
  }
  if (surf === "gold") {
    return (
      <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        <LinearGradient colors={[C.goldA, C.goldB, C.goldC]} locations={[0, 0.6, 1]} start={{ x: 0.33, y: 0.03 }} end={{ x: 0.67, y: 0.97 }} style={StyleSheet.absoluteFill} />
        <Glow id={`${uid}g`} cx="82%" cy="-4%" rx="70%" ry="83%" color={C.goldLight} alpha={1} stop={0.6} />
      </View>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient colors={[C.inkTop, INK, C.inkBottom]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Glow id={`${uid}a`} cx="88%" cy="-8%" rx="70%" ry="72%" color={GOLD} alpha={0.1} stop={0.62} />
      <Glow id={`${uid}b`} cx="8%" cy="118%" rx="86%" ry="97%" color={C.glowNavy} alpha={1} stop={0.6} />
    </View>
  );
}

/** حبة صغيرة: نص بلون على خلفية (أو بحد فقط) */
export function Pill({
  ctx,
  text,
  size,
  color,
  bg,
  border,
  role = "plex600",
  icon,
}: {
  ctx: Pick<SlideCtx, "ff" | "row">;
  text: string;
  size: number;
  color: string;
  bg?: string;
  border?: string;
  role?: FontRole;
  icon?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: ctx.row,
        alignItems: "center",
        gap: size * 0.5,
        paddingHorizontal: size * 0.85,
        height: size * 2.1,
        borderRadius: 999,
        backgroundColor: bg ?? "transparent",
        borderWidth: border ? 1.5 : 0,
        borderColor: border,
      }}
    >
      {icon}
      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ color, fontSize: size, lineHeight: size * 1.4 }, ctx.ff(role)]}>
        {text}
      </Text>
    </View>
  );
}

export { GOLD, GOLD_DEEP, GOLD_INK, INK, IVORY, PAPER_DIM, PAPER_INK, DIM };
