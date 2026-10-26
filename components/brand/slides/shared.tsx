// components/brand/slides/shared.tsx
// العقد المشترك لأشكال شرائح «ملخّص الفيديو» (مجلة / بصري / سينمائي) ومساعداتها:
// - الأنواع: SlideCtx (كل ما يحتاجه المشهد)، وSlideThemeModule (ما يصدّره كل شكل).
// - الألوان الثابتة (الذهبي ثابت #F6D58A لا pal.accent المتغيّر — أخضر في مشهد الحديقة).
// - هوكات الحركة المرتبطة بتقدّم الراوي: useTrigger وuseSpan وuseLoop وuseThinkRing (reanimated على خيط الواجهة،
//   بلا مؤقتات ولا setState داخل الحلقات، وكل تكرار يُلغى عند التنظيف).
// - SceneMark (أيقونة المشهد)، وKaraokeText (الكلمة المنطوقة مضيئة)، وSlideBoundary (خطأ الشكل → الرسم الحالي).
// - PlainScene: رسم بسيط وصحيح لكل القوالب الخمسة عشر — بداية كل شكل واحتياطه الصريح.
// المقاسات كلها بوحدات اللوحة ١٢٨٠×٧٢٠ (تُحجَّم للشاشة في VideoStage).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, useContext, useEffect } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type DerivedValue,
  type SharedValue,
  type WithTimingConfig,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { logAppError } from "../../../lib/errorLog";
import { SCENE_PALETTE } from "../../../lib/sceneCore";
import type { FontRole } from "../../../lib/slideFonts";
import {
  captionAt,
  captionChunk,
  fitFont,
  fitGrid,
  kindOf,
  linesFor,
  LINE_H,
  SHOW_EMOJI,
  THINK_SECONDS,
  toLocalDigits,
  type Item,
  type SceneModel,
  type SlideTheme,
} from "../../../lib/slideThemeCore";
import type { VideoScene } from "../../../lib/videoScriptCore";

export type { FontRole };

// ===== العقد =====

export type Phase = "ask" | "think" | "reveal";

export type SlideCtx = {
  m: SceneModel;
  scene: VideoScene;
  index: number;
  total: number;
  theme: SlideTheme;
  /** الاختيار «منوّع»: الخلفية والترويسة والترجمة والانتقال مشتركة (MIXED_CHROME) */
  mixed: boolean;
  /** bare: الخلفية مشتركة — لا يرسم المشهد خلفيته الكاملة ولا ترويسة ولا ترجمة */
  bare: boolean;
  /** تقدّم نطق الراوي الناعم (٠..١). في reveal يبدأ من الصفر على نص الجواب. عند الإيقاف = ١ */
  sv: SharedValue<number>;
  phase: Phase;
  thinkLeft: number;
  thinkSeconds: number;
  playing: boolean;
  reduced: boolean;
  /** عرض الإطار على الشاشة < ٦٠٠ نقطة (الجوال عموديًا): خط أكبر ×١٫١٢ وزخرفة أقل */
  compact: boolean;
  isRTL: boolean;
  row: "row" | "row-reverse";
  align: "right" | "left";
  /** corner: مربع خالٍ في الزاوية العليا اليسرى (زر ملء الشاشة) بوحدات ١٢٨٠؛ والهوامش الثابتة للمحتوى */
  safe: { corner: number; top: 56; side: 72; bottom: 110 };
  ff: (r: FontRole) => TextStyle;
  t: (k: string, v?: Record<string, string | number>) => string;
  unitTitle: string;
  /** لغة الأرقام (toLocalDigits) */
  lang: "ar" | "en";
};

export type CaptionProps = { speech: string | null; p: number; phase: Phase; ff: SlideCtx["ff"]; t: SlideCtx["t"]; isRTL: boolean };

export type SlideThemeModule = {
  id: SlideTheme;
  /** محتوى المشهد — يُركَّب من جديد مع كل مشهد (key = index|theme) */
  Scene: React.ComponentType<{ ctx: SlideCtx }>;
  /** الخلفية — دائمة طوال الفيديو (بلا key)، تتلوّن بمعنى المشهد من m */
  Backdrop: React.ComponentType<{ m: SceneModel; reduced: boolean }>;
  /** الترويسة فوق المشهد (p = تقدّم الراوي رقمًا، لخيط التقدّم) */
  Header: React.ComponentType<{ ctx: SlideCtx; p: number }>;
  /** الترجمة أسفل الإطار (من y=610) */
  Caption: React.ComponentType<CaptionProps>;
  /** الانتقال بين المشاهد — دائم، يعمل عند تغيّر index خلال ٥٥٠ مللي ثانية أو أقل */
  Transition: React.ComponentType<{ index: number; m: SceneModel; reduced: boolean; ff: SlideCtx["ff"] }>;
};

// ===== المقاسات والألوان =====

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const SAFE = { top: 56, side: 72, bottom: 110 } as const;
/** المحتوى المقروء لا ينزل تحت هذا الخط (ما بعده للترجمة) */
export const READ_BOTTOM = 610;
/** عرض المحتوى وارتفاعه داخل الهوامش */
export const CONTENT_W = CANVAS_W - SAFE.side * 2; // ١١٣٦
export const CONTENT_H = READ_BOTTOM - SAFE.top; // ٥٥٤

/** ذهبي «سماء المعرفة» ثابتًا (#F6D58A) — لا pal.accent */
export const GOLD = SCENE_PALETTE.sky.accent;
export const GOLD_DEEP = "#E3B65C";
/** ذهبي داكن للنص على الورق */
export const GOLD_INK = "#7E5C1E";
/** حبر الليل (#0B0E26) وأعمق منه */
export const INK = SCENE_PALETTE.sky.bg;
export const INK_DEEP = "#070920";
/** بطاقة على الليل */
export const CARD = SCENE_PALETTE.sky.card;
/** النص العاجي على الليل (#F5F1FF) والثانوي (#A9A5CC) */
export const IVORY = SCENE_PALETTE.sky.ink;
export const DIM = SCENE_PALETTE.sky.dim;
/** ورق المجلة العاجي ونصه */
export const PAPER = "#F2ECDF";
export const PAPER_INK = "#12142E";
export const PAPER_DIM = "#5E5B70";
/** أخضر الجواب الصحيح */
export const RIGHT = "#86E3A0";

/** منحنى الدخول المعتمد في النماذج cubic-bezier(.22,.9,.24,1) */
export const EASE_OUT = Easing.bezier(0.22, 0.9, 0.24, 1);

// ===== الحركة =====

/** reduced: تقليل الحركة؛ playing: التشغيل جارٍ (عند الإيقاف التقدّم = ١ فتظهر الحالة النهائية فورًا) */
export const SlideMotion = createContext<{ reduced: boolean; playing: boolean }>({ reduced: false, playing: false });

/**
 * قيمة ٠→١ تتحرك بالزمن (ms) لحظة تجاوز التقدّم sv العتبة at، وترجع إلى الصفر فورًا إن نزل تحتها.
 * العتبة من التقدّم والمدة بالمللي ثانية، فلا تتأثر بسرعة الراوي. مع تقليل الحركة = ١ مباشرة.
 * عند التركيب والفيديو متوقف تبدأ ١ (القفز بين المشاهد بلا وميض).
 */
export function useTrigger(sv: SharedValue<number>, at: number, ms = 520, easing: WithTimingConfig["easing"] = EASE_OUT): SharedValue<number> {
  const { reduced, playing } = useContext(SlideMotion);
  const v = useSharedValue(reduced || !playing ? 1 : 0);
  useAnimatedReaction(
    () => sv.value >= at,
    (on, prev) => {
      if (on === prev) return;
      if (!on) {
        cancelAnimation(v);
        v.value = 0;
      } else if (reduced) v.value = 1;
      else v.value = withTiming(1, { duration: ms, easing });
    },
    [at, ms, reduced]
  );
  return v;
}

/** قيمة مستمرة ٠..١ مرتبطة بالتقدّم بين a وb (للأشرطة والرسم والمؤشرات) */
export function useSpan(sv: SharedValue<number>, a: number, b: number): DerivedValue<number> {
  return useDerivedValue(() => {
    const d = b - a;
    if (d <= 0) return sv.value >= a ? 1 : 0;
    return Math.min(1, Math.max(0, (sv.value - a) / d));
  }, [a, b]);
}

/**
 * حلقة دائمة ٠→١ (ms للدورة)، ذهابًا وإيابًا افتراضيًا (reverse:false للدوران). تُلغى عند التنظيف،
 * وتتوقف عند تقليل الحركة (القيمة ٠). لا تزيد الحلقات المتزامنة على ٨ في المشهد.
 */
export function useLoop(ms: number, opts: { reverse?: boolean; delay?: number; easing?: WithTimingConfig["easing"]; enabled?: boolean } = {}): SharedValue<number> {
  const { reduced } = useContext(SlideMotion);
  const v = useSharedValue(0);
  const on = (opts.enabled ?? true) && !reduced && ms > 0;
  const reverse = opts.reverse ?? true;
  const delay = opts.delay ?? 0;
  const easing = opts.easing;
  useEffect(() => {
    if (!on) {
      cancelAnimation(v);
      v.value = 0;
      return;
    }
    v.value = 0;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: easing ?? Easing.inOut(Easing.sin) }), -1, reverse));
    return () => cancelAnimation(v);
    // easing خارج الاعتماديات عمدًا: كائن جديد في كل رسم
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ms, reverse, delay, v]);
  return v;
}

/** حلقة التفكير: الباقي من وقت التفكير ١→٠ خطيًا خلال seconds أثناء think، و١ في ask، و٠ في reveal؛ تتجمّد عند الإيقاف */
export function useThinkRing(phase: Phase, playing: boolean, seconds: number = THINK_SECONDS): SharedValue<number> {
  const v = useSharedValue(phase === "reveal" ? 0 : 1);
  useEffect(() => {
    if (phase === "think" && playing) {
      v.value = 1;
      v.value = withTiming(0, { duration: Math.max(0, seconds) * 1000, easing: Easing.linear });
    } else if (phase === "think") cancelAnimation(v);
    else {
      cancelAnimation(v);
      v.value = phase === "reveal" ? 0 : 1;
    }
    return () => cancelAnimation(v);
  }, [phase, playing, seconds, v]);
  return v;
}

// ===== مكوّنات صغيرة =====

type GlyphName = keyof typeof Ionicons.glyphMap;

/** أيقونة المشهد (Ionicons حسب m.icon)؛ الإيموجي فقط إن SHOW_EMOJI (قرار ١٨ أكتوبر: لا إيموجي) */
export function SceneMark({ m, size = 40, color = GOLD, style }: { m: Pick<SceneModel, "icon" | "emoji">; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  if (SHOW_EMOJI && m.emoji) {
    return (
      <Text style={[{ fontSize: size * 0.9, lineHeight: size * 1.1 }, style]} numberOfLines={1}>
        {m.emoji}
      </Text>
    );
  }
  const name = (m.icon in Ionicons.glyphMap ? m.icon : "ellipse-outline") as GlyphName;
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

/** نص كلمةً كلمة: ما نُطق، والكلمة الحالية مضيئة، وما بعدها — في Text واحد (لا يُكسر سطر الكلمة) */
export function KaraokeText({
  words,
  current,
  style,
  spokenStyle,
  activeStyle,
  upcomingStyle,
  numberOfLines = 2,
  minimumFontScale = 0.6,
}: {
  words: string[];
  current: number;
  style?: StyleProp<TextStyle>;
  spokenStyle?: StyleProp<TextStyle>;
  activeStyle?: StyleProp<TextStyle>;
  upcomingStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  minimumFontScale?: number;
}) {
  return (
    <Text style={style} numberOfLines={numberOfLines} adjustsFontSizeToFit minimumFontScale={minimumFontScale}>
      {words.map((w, i) => (
        <Text key={i} style={i < current ? spokenStyle : i === current ? activeStyle : upcomingStyle}>
          {i ? " " : ""}
          {w}
        </Text>
      ))}
    </Text>
  );
}

/** عنصر يظهر (شفافية + صعود) لحظة بلوغ التقدّم عتبته */
export function Reveal({ sv, at, children, style, rise = 22, ms = 520 }: { sv: SharedValue<number>; at: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; rise?: number; ms?: number }) {
  const v = useTrigger(sv, at, ms);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * rise }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// ===== حاجز الأخطاء =====

const loggedWhere = new Set<string>();

type BoundaryProps = { resetKey: string; fallback: React.ReactNode; where: string; children: React.ReactNode };

/**
 * خطأ في رسم شكل → يُعرض fallback (الرسم الحالي LegacyStage) لهذا المشهد فقط، ويحاول الشكل من جديد
 * مع تغيّر resetKey (المشهد التالي أو تغيير الشكل). يُسجَّل بـ logAppError مرة واحدة لكل where في الجلسة.
 * ملاحظة: أخطاء الـ worklets على خيط الواجهة لا يلتقطها الحاجز — تُكتب الحركات بحذر.
 */
export class SlideBoundary extends React.Component<BoundaryProps, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(p: BoundaryProps, s: { failed: boolean; key: string }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const where = `slides:${this.props.where}`;
    if (loggedWhere.has(where)) return;
    loggedWhere.add(where);
    const e = new Error(error?.message ?? String(error));
    e.stack = `${error?.stack ?? ""}\n--component--${info?.componentStack ?? ""}`;
    void logAppError(e, where, false);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ===== الخلفية والترويسة والترجمة والانتقال البسيطة =====

/** خلفية ليلية ثابتة (بداية الأشكال قبل أن يرسم كلٌّ خلفيته) */
export function PlainBackdrop(_: { m: SceneModel; reduced: boolean }) {
  return <LinearGradient colors={["#151A45", INK, INK_DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />;
}

export function PlainHeader(_: { ctx: SlideCtx; p: number }) {
  return null;
}

export function PlainTransition(_: { index: number; m: SceneModel; reduced: boolean; ff: SlideCtx["ff"] }) {
  return null;
}

/** الترجمة: الجملة المنطوقة الآن، والكلمة الحالية بالذهبي (سطران كحد أقصى، تحت y=610) */
export function PlainCaption({ speech, p, ff }: CaptionProps) {
  if (!speech) return null;
  const c = captionChunk(captionAt(speech, p), 18);
  if (!c.words.length) return null;
  return (
    <View style={styles.capWrap} pointerEvents="none">
      <View style={styles.capBox}>
        <KaraokeText
          words={c.words}
          current={c.current}
          style={[styles.cap, ff("plex600")]}
          spokenStyle={{ color: IVORY }}
          activeStyle={{ color: GOLD }}
          upcomingStyle={{ color: "rgba(245,241,255,0.7)" }}
        />
      </View>
    </View>
  );
}

// ===== PlainScene: رسم بسيط وصحيح لكل القوالب =====

type Tone = { ink: string; dim: string; accent: string; card: string; line: string; onAccent: string };
const DARK: Tone = { ink: IVORY, dim: DIM, accent: GOLD, card: "rgba(255,255,255,0.06)", line: "rgba(246,213,138,0.24)", onAccent: INK };
const LIGHT: Tone = { ink: PAPER_INK, dim: PAPER_DIM, accent: GOLD_INK, card: "rgba(18,20,46,0.05)", line: "rgba(18,20,46,0.14)", onAccent: PAPER };

/** خصائص كل نص: لا قص (تصغير حتى ٠٫٦ ثم أسطر أكثر بالحجم المسبق من fitFont) */
const fitText = (lines: number) => ({ numberOfLines: lines, adjustsFontSizeToFit: true, minimumFontScale: 0.6 }) as const;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** حلقة التفكير والعدد الباقي */
function ThinkRing({ ctx, tone, size = 120 }: { ctx: SlideCtx; tone: Tone; size?: number }) {
  const left = useThinkRing(ctx.phase, ctx.playing, ctx.thinkSeconds);
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const ap = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - left.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={tone.line} strokeWidth={6} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={tone.accent} strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={ap} />
      </Svg>
      <Text style={[{ color: tone.ink, fontSize: size * 0.42, lineHeight: size * 0.56 }, ctx.ff("kufi700")]} {...fitText(1)}>
        {toLocalDigits(ctx.thinkLeft, ctx.lang)}
      </Text>
    </View>
  );
}

/** شارة نوع المشهد (سؤال ختامي / تمرين / سؤال سريع / نوع المعلومة) */
function Badge({ ctx, tone, label, icon }: { ctx: SlideCtx; tone: Tone; label: string; icon?: GlyphName }) {
  return (
    <View style={[styles.badge, { flexDirection: ctx.row, borderColor: tone.line, backgroundColor: tone.card }]}>
      {icon ? <Ionicons name={icon} size={24} color={tone.accent} /> : null}
      <Text style={[{ color: tone.accent, fontSize: 24, lineHeight: 32 }, ctx.ff("kufi600")]} {...fitText(1)}>
        {label}
      </Text>
    </View>
  );
}

function badgeOf(ctx: SlideCtx): { label: string; icon: GlyphName } {
  const { m, t } = ctx;
  if (m.role === "finalEx") return { label: t("video.s.exercise"), icon: "document-text-outline" };
  if (m.role === "finalQ") return { label: t("video.s.finalQ"), icon: "school-outline" };
  if (m.template === "check") return { label: t("video.check"), icon: "help-circle-outline" };
  if (m.role === "summary") return { label: t("video.s.summary"), icon: "checkmark-done-outline" };
  return { label: t(`video.s.kind.${kindOf(m)}`), icon: "ellipse-outline" };
}

/** النص «رأس: شرح» برأس ملوّن */
function ItemText({ ctx, it, tone, size, lines }: { ctx: SlideCtx; it: Item; tone: Tone; size: number; lines: number }) {
  return (
    <Text style={[{ flex: 1, color: tone.ink, fontSize: size, lineHeight: size * LINE_H, textAlign: ctx.align }, ctx.ff("plex500")]} {...fitText(lines)}>
      {it.head ? <Text style={[{ color: tone.accent }, ctx.ff("plex700")]}>{it.head}: </Text> : null}
      {it.head ? it.body : it.text}
    </Text>
  );
}

/** الترويسة الداخلية: أيقونة + شارة + عنوان (تحترم مربع الزاوية) */
function TitleRow({ ctx, tone, size, extra, cornerPad, minH }: { ctx: SlideCtx; tone: Tone; size: number; extra?: React.ReactNode; cornerPad: number; minH: number }) {
  const b = badgeOf(ctx);
  return (
    <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 18, paddingLeft: cornerPad, minHeight: minH }}>
      <View style={[styles.iconTile, { backgroundColor: tone.card, borderColor: tone.line }]}>
        <SceneMark m={ctx.m} size={40} color={tone.accent} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[{ color: tone.dim, fontSize: 22, lineHeight: 30, textAlign: ctx.align }, ctx.ff("plex600")]} {...fitText(1)}>
          {b.label}
        </Text>
        {ctx.m.title ? (
          <Text style={[{ color: tone.ink, fontSize: size, lineHeight: size * 1.3, textAlign: ctx.align }, ctx.ff("kufi700")]} {...fitText(2)}>
            {ctx.m.title}
          </Text>
        ) : null}
      </View>
      {extra}
    </View>
  );
}

/** مربع الزاوية بوحدات المحتوى: إزاحة الترويسة أفقيًا، وارتفاعها الأدنى حتى يبدأ ما تحتها أسفل الزاوية */
function cornerBox(ctx: SlideCtx) {
  const c = ctx.safe.corner;
  return { pad: c > 0 ? Math.max(0, c - SAFE.side + 8) : 0, top: c > 0 ? Math.max(0, c - SAFE.top + 8) : 0 };
}

/**
 * رسم بسيط وصحيح لكل قالب من ctx.m فقط (لا يعيد تحليل scene). tone: "dark" فوق الليل، "light" فوق الورق.
 * الحجم المسبق من fitFont/fitGrid، والطول الزائد بعمودين، وكل نص له numberOfLines مع التصغير حتى ٠٫٦.
 */
export function PlainScene({ ctx, tone: toneName = "dark" }: { ctx: SlideCtx; tone?: "dark" | "light" }) {
  const tone = toneName === "light" ? LIGHT : DARK;
  const { m } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const cb = cornerBox(ctx);
  let body: React.ReactNode;
  switch (m.template) {
    case "check":
      body = <PlainCheck ctx={ctx} tone={tone} k={k} pad={cb.pad} />;
      break;
    case "cover":
    case "stat":
    case "range":
    case "seal":
    case "quote":
    case "define":
      body = <PlainCentered ctx={ctx} tone={tone} k={k} pad={cb.pad} />;
      break;
    case "compare":
      body = <PlainCompare ctx={ctx} tone={tone} k={k} cb={cb} />;
      break;
    case "tree":
      body = <PlainTree ctx={ctx} tone={tone} k={k} cb={cb} />;
      break;
    default:
      // list / steps / cards / summary / groups / qIntro
      body = <PlainList ctx={ctx} tone={tone} k={k} cb={cb} />;
  }
  return <View style={styles.content}>{body}</View>;
}

/** ارتفاع الترويسة المتوقع (للحجم المسبق لما تحتها) */
function titlePlan(ctx: SlideCtx, k: number, cb: { pad: number; top: number }, extraW = 0) {
  const w = CONTENT_W - 76 - 18 - cb.pad - extraW;
  const size = fitFont([ctx.m.title || " "], { w, h: 400, maxLines: 2 }, 50 * k, 32);
  const lines = ctx.m.title ? Math.min(2, linesFor(ctx.m.title, w, size)) : 0;
  const h = Math.max(cb.top, 30 + lines * size * 1.3, 76);
  return { size, h };
}

function PlainList({ ctx, tone, k, cb }: { ctx: SlideCtx; tone: Tone; k: number; cb: { pad: number; top: number } }) {
  const { m } = ctx;
  const extra =
    m.template === "groups" && m.count ? (
      <View style={[styles.countBox, { borderColor: tone.accent }]}>
        <Text style={[{ color: tone.accent, fontSize: 64, lineHeight: 80 }, ctx.ff("amiri700")]} {...fitText(1)}>
          {toLocalDigits(m.count, ctx.lang)}
        </Text>
      </View>
    ) : m.template === "seal" && m.seal ? (
      <View style={[styles.countBox, { borderColor: tone.accent, width: 150 }]}>
        <Text style={[{ color: tone.accent, fontSize: 40, lineHeight: 56 }, ctx.ff("amiri700")]} {...fitText(1)}>
          {toLocalDigits(m.seal.year, ctx.lang)}
          {ctx.lang === "ar" ? "هـ" : " AH"}
        </Text>
      </View>
    ) : null;
  const head = titlePlan(ctx, k, cb, extra ? 150 : 0);
  const cards = m.template === "cards";
  const H = CONTENT_H - head.h - 22;
  const numW = cards ? 0 : 46 + 16;
  const g = fitGrid(
    m.items.map((it) => it.text),
    { w: CONTENT_W, h: H, gap: 12, colGap: 18, padX: 20 + numW / 2, padY: 12, maxLines: 4 },
    30 * k,
    19,
    2
  );
  const cellW = g.cols === 1 ? CONTENT_W : (CONTENT_W - 18) / 2;
  return (
    <View style={{ flex: 1, gap: 22 }}>
      <TitleRow ctx={ctx} tone={tone} size={head.size} extra={extra} cornerPad={cb.pad} minH={cb.top} />
      <View style={{ flexDirection: ctx.row, flexWrap: "wrap", gap: 12, columnGap: 18 }}>
        {m.items.map((it, i) => (
          <Reveal key={i} sv={ctx.sv} at={it.at} style={[styles.row, { width: cellW, flexDirection: ctx.row, backgroundColor: tone.card, borderColor: tone.line }]}>
            {cards ? null : (
              <View style={[styles.num, { backgroundColor: m.template === "summary" ? "transparent" : tone.accent, borderColor: tone.accent }]}>
                {m.template === "summary" ? (
                  <Ionicons name="checkmark" size={26} color={tone.accent} />
                ) : (
                  <Text style={[{ color: tone.onAccent, fontSize: 22, lineHeight: 30 }, ctx.ff("kufi700")]} {...fitText(1)}>
                    {toLocalDigits(i + 1, ctx.lang)}
                  </Text>
                )}
              </View>
            )}
            <ItemText ctx={ctx} it={it} tone={tone} size={g.size} lines={4} />
          </Reveal>
        ))}
      </View>
    </View>
  );
}

function PlainCompare({ ctx, tone, k, cb }: { ctx: SlideCtx; tone: Tone; k: number; cb: { pad: number; top: number } }) {
  const cols = ctx.m.columns ?? [];
  const head = titlePlan(ctx, k, cb);
  const colW = (CONTENT_W - 22) / 2;
  const H = CONTENT_H - head.h - 22 - 66;
  const size = Math.min(
    ...cols.map((c) => fitFont(c.items.map((it) => it.text), { w: colW - 36, h: H - 20, gap: 8, maxLines: 4 }, 28 * k, 18)),
    28 * k
  );
  return (
    <View style={{ flex: 1, gap: 22 }}>
      <TitleRow ctx={ctx} tone={tone} size={head.size} cornerPad={cb.pad} minH={cb.top} />
      <View style={{ flex: 1, flexDirection: ctx.row, gap: 22 }}>
        {cols.map((c, ci) => (
          <Reveal key={ci} sv={ctx.sv} at={c.items[0]?.at ?? 0.05} style={[styles.col, { borderColor: tone.line, backgroundColor: tone.card }]}>
            <View style={[styles.colHead, { backgroundColor: ci ? "transparent" : tone.accent, borderColor: tone.accent }]}>
              <Text style={[{ color: ci ? tone.accent : tone.onAccent, fontSize: 28, lineHeight: 38, textAlign: "center" }, ctx.ff("kufi700")]} {...fitText(1)}>
                {c.title}
              </Text>
            </View>
            <View style={{ gap: 8, paddingHorizontal: 18 }}>
              {c.items.map((it, i) => (
                <Reveal key={i} sv={ctx.sv} at={it.at} style={{ flexDirection: ctx.row, gap: 10 }}>
                  <Text style={[{ color: tone.accent, fontSize: size, lineHeight: size * LINE_H }, ctx.ff("plex700")]}>•</Text>
                  <ItemText ctx={ctx} it={it} tone={tone} size={size} lines={4} />
                </Reveal>
              ))}
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

function PlainTree({ ctx, tone, k, cb }: { ctx: SlideCtx; tone: Tone; k: number; cb: { pad: number; top: number } }) {
  const nodes = ctx.m.tree?.nodes ?? [];
  const head = titlePlan(ctx, k, cb);
  const n = Math.max(1, nodes.length);
  const w = (CONTENT_W - 18 * (n - 1)) / n;
  const H = CONTENT_H - head.h - 22 - 70;
  const size = Math.min(...nodes.map((nd) => fitFont(nd.leaves.length ? nd.leaves : [" "], { w: w - 32, h: H - 30, gap: 6, maxLines: 4 }, 26 * k, 17)), 26 * k);
  return (
    <View style={{ flex: 1, gap: 22 }}>
      <TitleRow ctx={ctx} tone={tone} size={head.size} cornerPad={cb.pad} minH={cb.top} />
      <View style={{ flex: 1, flexDirection: ctx.row, gap: 18 }}>
        {nodes.map((nd, i) => (
          <Reveal key={i} sv={ctx.sv} at={ctx.m.items[i]?.at ?? 0.05} style={[styles.col, { borderColor: tone.line, backgroundColor: tone.card }]}>
            <View style={[styles.colHead, { borderColor: tone.accent, backgroundColor: "transparent" }]}>
              <Text style={[{ color: tone.accent, fontSize: 26, lineHeight: 36, textAlign: "center" }, ctx.ff("kufi700")]} {...fitText(2)}>
                {nd.title}
              </Text>
            </View>
            <View style={{ gap: 6, paddingHorizontal: 16 }}>
              {nd.leaves.map((l, j) => (
                <Text key={j} style={[{ color: tone.ink, fontSize: size, lineHeight: size * LINE_H, textAlign: ctx.align }, ctx.ff("plex500")]} {...fitText(4)}>
                  {l}
                </Text>
              ))}
            </View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

/** قطعة في عمود: نص بحجم أساسي (يُصغَّر بنسبة واحدة مع البقية حتى min)، أو ارتفاع ثابت */
type Piece = { text?: string; w?: number; size?: number; lh?: number; min?: number; lines?: number; fixed?: number; extra?: number };

/** نسبة تصغير واحدة لكل القطع حتى يتسع العمود كله في H (تقدير حتمي بـ linesFor) — تعيد الأحجام */
function fitStack(pieces: Piece[], H: number, gap: number): number[] {
  let sizes: number[] = [];
  for (let s = 1; s >= 0.36; s -= 0.04) {
    sizes = pieces.map((p) => (p.size ? Math.max(p.min ?? 16, p.size * s) : 0));
    const used =
      pieces.reduce((n, p, i) => {
        if (p.fixed !== undefined) return n + p.fixed;
        const l = Math.min(p.lines ?? 3, linesFor(p.text ?? "", p.w ?? CONTENT_W, sizes[i]));
        return n + l * sizes[i] * (p.lh ?? LINE_H) + (p.extra ?? 0);
      }, 0) +
      gap * Math.max(0, pieces.length - 1);
    if (used <= H) return sizes;
  }
  return sizes;
}

/**
 * القوالب المتمركزة: الافتتاح، والرقم، والمدى، والختم، والاقتباس، والتعريف.
 * مربع الزاوية يُحجز بإزاحة يسرى للعمود كله (pad) لا بشريط علوي — أقل هدرًا للارتفاع على الجوال.
 */
function PlainCentered({ ctx, tone, k, pad }: { ctx: SlideCtx; tone: Tone; k: number; pad: number }) {
  const { m, ff, t } = ctx;
  const H = CONTENT_H;
  const W = CONTENT_W - pad;
  const tight = ctx.compact || m.density === "l";
  const gap = tight ? 10 : 18;
  const items = m.items;
  const itemPieces: Piece[] = items.map((it) => ({ text: it.text, w: W, size: 28 * k, min: 15, lines: 3 }));
  const centered = (size: number, lh: number, color: string, role: FontRole, lines: number, extra?: TextStyle): StyleProp<TextStyle> => [
    { color, fontSize: size, lineHeight: size * lh, textAlign: "center", alignSelf: "stretch" },
    extra,
    ff(role),
  ];
  let hero: React.ReactNode = null;
  let sizes: number[] = [];
  if (m.template === "cover") {
    const mark = tight ? 0 : 72;
    sizes = fitStack([{ fixed: mark }, { text: m.title, w: W, size: 68 * k, lh: 1.3, min: 30, lines: 3 }, { text: m.highlight ?? "", w: W, size: m.highlight ? 30 * k : 0, min: 17, lines: 2 }, ...itemPieces], H, gap);
    hero = (
      <>
        {mark ? <SceneMark m={m} size={mark} color={tone.accent} /> : null}
        <Text style={centered(sizes[1], 1.3, tone.ink, "kufi700", 3)} {...fitText(3)}>
          {m.title}
        </Text>
        {m.highlight ? (
          <Reveal sv={ctx.sv} at={0.02} style={{ alignSelf: "stretch" }}>
            <Text style={centered(sizes[2], LINE_H, tone.dim, "plex500", 2)} {...fitText(2)}>
              {m.highlight}
            </Text>
          </Reveal>
        ) : null}
      </>
    );
    sizes = sizes.slice(3);
  } else if (m.template === "define" && m.define) {
    const d = m.define;
    const w = W - 192;
    sizes = fitStack(
      [
        { text: d.term, w: W, size: 60 * k, lh: 1.35, min: 30, lines: 2 },
        { text: d.lugha ?? "", size: d.lugha ? 32 * k : 0, min: 18, lines: 4, w, extra: d.lugha ? 16 : 0 },
        { text: d.istilah, size: 32 * k, min: 18, lines: 5, w, extra: 16 },
        ...itemPieces,
      ],
      H,
      gap
    );
    const row = (label: string, text: string, size: number, at: number) => (
      <Reveal sv={ctx.sv} at={at} style={[styles.defRow, { flexDirection: ctx.row, borderColor: tone.line }]}>
        <Text style={[styles.defLabel, { color: tone.accent }, ff("kufi600")]} {...fitText(1)}>
          {label}
        </Text>
        <Text style={[{ flex: 1, color: tone.ink, fontSize: size, lineHeight: size * LINE_H, textAlign: ctx.align }, ff("amiri400")]} {...fitText(5)}>
          {text}
        </Text>
      </Reveal>
    );
    hero = (
      <>
        <Text style={centered(sizes[0], 1.35, tone.accent, "amiri700", 2)} {...fitText(2)}>
          {d.term}
        </Text>
        {d.lugha ? row(t("video.s.lugha"), d.lugha, sizes[1], 0.08) : null}
        {row(t("video.s.istilah"), d.istilah, sizes[2], d.lugha ? 0.35 : 0.08)}
      </>
    );
    sizes = sizes.slice(3);
  } else {
    // stat / range / seal / quote: رقم أو نص بارز ثم العنوان
    const quote = m.template === "quote";
    const seal = m.template === "seal";
    const big =
      m.template === "range" && m.range
        ? `${toLocalDigits(m.range.from, ctx.lang)}–${toLocalDigits(m.range.to, ctx.lang)}`
        : seal && m.seal
          ? `${toLocalDigits(m.seal.year, ctx.lang)}${ctx.lang === "ar" ? "هـ" : " AH"}`
          : (m.highlight ?? "");
    const unit = m.template === "range" && m.range?.unit ? m.range.unit : "";
    const ruler = m.template === "range" && !!m.range?.ruler;
    const bigH = tight ? 110 : 150;
    // السنة داخل الختم: حجم يتسع لقطره بلا اعتماد على التصغير التلقائي (غير متاح على كل المنصات)
    const sealSize = Math.min(52, ((tight ? 170 : 230) - 44) / Math.max(1, big.length * 0.56));
    sizes = fitStack(
      [
        { fixed: quote ? 74 : seal ? (tight ? 170 : 230) : bigH },
        { text: quote ? big : "", w: W, size: quote ? 40 * k : 0, min: 20, lines: 4 },
        { fixed: unit ? 42 : 0 },
        { fixed: ruler ? 64 : 0 },
        { text: m.title, w: W, size: 40 * k, lh: 1.3, min: 22, lines: 2 },
        { text: seal ? (m.highlight ?? "") : "", w: W, size: seal && m.highlight ? 28 * k : 0, min: 16, lines: 2 },
        ...itemPieces,
      ],
      H,
      gap
    );
    hero = (
      <>
        {quote ? (
          <Text style={[{ color: tone.accent, fontSize: 110, lineHeight: 110, marginBottom: -36 }, ff("amiri700")]} {...fitText(1)}>
            “
          </Text>
        ) : seal ? (
          <View style={[styles.seal, tight && { width: 170, height: 170, borderRadius: 85 }, { borderColor: tone.accent }]}>
            <Text style={[{ color: tone.accent, fontSize: sealSize, lineHeight: sealSize * 1.35 }, ff("amiri700")]} {...fitText(1)}>
              {big}
            </Text>
          </View>
        ) : (
          <Text style={centered(bigH / 1.15, 1.15, tone.accent, "amiri700", 1)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.35}>
            {big}
          </Text>
        )}
        {quote ? (
          <Text style={centered(sizes[1], LINE_H, tone.ink, "amiri700", 4)} {...fitText(4)}>
            {big}
          </Text>
        ) : null}
        {unit ? (
          <Text style={[{ color: tone.dim, fontSize: 30, lineHeight: 42, textAlign: "center" }, ff("plex600")]} {...fitText(1)}>
            {unit}
          </Text>
        ) : null}
        {ruler ? <RangeBar ctx={ctx} tone={tone} /> : null}
        {m.title ? (
          <Text style={centered(sizes[4], 1.3, quote ? tone.accent : tone.ink, "kufi700", 2)} {...fitText(2)}>
            {m.title}
          </Text>
        ) : null}
        {seal && m.highlight ? (
          <Text style={centered(sizes[5], LINE_H, tone.dim, "plex500", 2)} {...fitText(2)}>
            {m.highlight}
          </Text>
        ) : null}
      </>
    );
    sizes = sizes.slice(6);
  }
  return (
    <View style={[styles.centerCol, { paddingLeft: pad, gap }]}>
      {hero}
      {items.map((it, i) => (
        <Reveal key={i} sv={ctx.sv} at={m.template === "define" ? Math.max(it.at, 0.55) : it.at} style={{ alignSelf: "stretch" }}>
          <Text style={centered(sizes[i] ?? 17, LINE_H, m.template === "cover" ? tone.ink : tone.dim, m.template === "cover" ? "plex600" : "plex500", 3)} {...fitText(3)}>
            {m.template === "cover" ? `${toLocalDigits(i + 1, ctx.lang)} · ${it.text}` : it.text}
          </Text>
        </Reveal>
      ))}
    </View>
  );
}

/** مسطرة المدى: نافذة from→to على مسار يمتلئ مع الكلام */
function RangeBar({ ctx, tone }: { ctx: SlideCtx; tone: Tone }) {
  const r = ctx.m.range!;
  const max = Math.max(r.to, Math.ceil(r.to / 10) * 10);
  const fill = useSpan(ctx.sv, 0.1, 0.5);
  const W = 900;
  const a = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  const from = (r.from / max) * W;
  const width = ((r.to - r.from) / max) * W;
  return (
    <View style={{ width: W, gap: 8 }}>
      <View style={[styles.track, { backgroundColor: tone.card, borderColor: tone.line }]}>
        <Animated.View
          style={[
            { position: "absolute", top: 0, bottom: 0, width, backgroundColor: tone.accent, borderRadius: 10, transformOrigin: ctx.isRTL ? "right" : "left" },
            ctx.isRTL ? { right: from } : { left: from },
            a,
          ]}
        />
      </View>
      <View style={{ flexDirection: ctx.row, justifyContent: "space-between" }}>
        <Text style={[{ color: tone.dim, fontSize: 22, lineHeight: 30 }, ctx.ff("plex500")]} {...fitText(1)}>
          {ctx.t("video.s.min")} {toLocalDigits(r.from, ctx.lang)}
        </Text>
        <Text style={[{ color: tone.dim, fontSize: 22, lineHeight: 30 }, ctx.ff("plex500")]} {...fitText(1)}>
          {ctx.t("video.s.max")} {toLocalDigits(r.to, ctx.lang)}
        </Text>
      </View>
    </View>
  );
}

/** السؤال بمراحله: السؤال والخيارات، ثم حلقة التفكير، ثم الجواب (مكانه محجوز من البداية فلا يقفز التخطيط) */
function PlainCheck({ ctx, tone, k, pad }: { ctx: SlideCtx; tone: Tone; k: number; pad: number }) {
  const { m, ff } = ctx;
  const q = m.check ?? { stem: m.title, options: [], answer: "", correct: -1, long: false };
  const b = badgeOf(ctx);
  const H = CONTENT_H - 56 - 16 * 3;
  const W = CONTENT_W - pad;
  const two = q.options.length > 3;
  const optW = two ? (W - 14) / 2 : W;
  // تصغير متناسب حتى يتسع السؤال والخيارات والجواب معًا (الجواب محجوز من البداية)
  let plan = { stem: 16, opt: 14, ans: 14, stemH: 0, optH: 0, ansH: 0 };
  for (let s = 1; s >= 0.2; s -= 0.04) {
    const stem = Math.max(16, 44 * k * s);
    const opt = Math.max(14, 30 * k * s);
    const ans = Math.max(14, 30 * k * s);
    const stemH = linesFor(q.stem, W, stem) * stem * LINE_H;
    const rows = two ? Math.ceil(q.options.length / 2) : q.options.length;
    let optH = 0;
    for (let r = 0; r < rows; r++) {
      const row = two ? q.options.slice(r * 2, r * 2 + 2) : [q.options[r]];
      optH += Math.max(...row.map((o) => linesFor(o.text, optW - 90, opt))) * opt * LINE_H + 20 + 10;
    }
    const ansH = q.answer ? Math.max(130, 46 + linesFor(q.answer, W - 56, ans) * ans * LINE_H + 32) : 130;
    plan = { stem, opt, ans, stemH, optH, ansH };
    if (stemH + optH + ansH + 32 <= H) break;
  }
  const reveal = ctx.phase === "reveal";
  return (
    <View style={[styles.checkCol, { paddingLeft: pad }]}>
      <Badge ctx={ctx} tone={tone} label={b.label} icon={b.icon} />
      <Text style={[{ color: tone.ink, fontSize: plan.stem, lineHeight: plan.stem * LINE_H, textAlign: "center", alignSelf: "stretch" }, ff(q.stem.length > 140 ? "plex600" : "kufi700")]} {...fitText(12)}>
        {q.stem}
      </Text>
      {q.options.length ? (
        <View style={{ alignSelf: "stretch", flexDirection: ctx.row, flexWrap: "wrap", gap: 10, columnGap: 14 }}>
          {q.options.map((o, i) => {
            const right = reveal && q.correct === i;
            return (
              <View key={i} style={[styles.opt, { width: optW, flexDirection: ctx.row, borderColor: right ? RIGHT : tone.line, backgroundColor: right ? "rgba(134,227,160,0.16)" : tone.card }]}>
                {o.marker ? (
                  <View style={[styles.optMark, { borderColor: right ? RIGHT : tone.accent }]}>
                    <Text style={[{ color: right ? RIGHT : tone.accent, fontSize: 22, lineHeight: 30 }, ff("kufi700")]} {...fitText(1)}>
                      {toLocalDigits(o.marker, ctx.lang)}
                    </Text>
                  </View>
                ) : null}
                <Text style={[{ flex: 1, color: tone.ink, fontSize: plan.opt, lineHeight: plan.opt * LINE_H, textAlign: ctx.align }, ff("plex500")]} {...fitText(4)}>
                  {o.text}
                </Text>
                {right ? <Ionicons name="checkmark-circle" size={30} color={RIGHT} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={{ alignSelf: "stretch", minHeight: plan.ansH, alignItems: "center", justifyContent: "center" }}>
        {ctx.phase === "think" ? (
          <View style={{ alignItems: "center", gap: 6 }}>
            <ThinkRing ctx={ctx} tone={tone} size={104} />
            <Text style={[{ color: tone.dim, fontSize: 22, lineHeight: 30 }, ff("plex500")]} {...fitText(1)}>
              {ctx.t("video.s.thinking")}
            </Text>
          </View>
        ) : null}
        {reveal && q.answer ? (
          <Reveal sv={ctx.sv} at={0} style={[styles.answerBox, { borderColor: RIGHT }]}>
            <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 10 }}>
              <Ionicons name="checkmark-circle" size={28} color={RIGHT} />
              <Text style={[{ color: RIGHT, fontSize: 24, lineHeight: 32 }, ff("kufi700")]} {...fitText(1)}>
                {ctx.t("video.answer")}
              </Text>
            </View>
            <Text style={[{ color: tone.ink, fontSize: plan.ans, lineHeight: plan.ans * LINE_H, textAlign: ctx.align }, ff("plex500")]} {...fitText(10)}>
              {q.answer}
            </Text>
          </Reveal>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { position: "absolute", top: SAFE.top, left: SAFE.side, right: SAFE.side, height: CONTENT_H },
  centerCol: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  checkCol: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  iconTile: { width: 76, height: 76, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  badge: { alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  row: { alignItems: "center", gap: 16, borderRadius: 22, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 20 },
  num: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  countBox: { minWidth: 110, height: 110, borderRadius: 26, borderWidth: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  col: { flex: 1, borderWidth: 1.5, borderRadius: 24, overflow: "hidden", gap: 12, paddingBottom: 16 },
  colHead: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1.5 },
  defRow: { alignSelf: "stretch", alignItems: "flex-start", gap: 22, borderTopWidth: 1.5, paddingTop: 14 },
  defLabel: { width: 170, fontSize: 30, lineHeight: 44, textAlign: "center" },
  seal: { width: 230, height: 230, borderRadius: 115, borderWidth: 4, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  track: { height: 26, borderRadius: 13, borderWidth: 1.5, overflow: "hidden" },
  opt: { alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 18 },
  optMark: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  answerBox: { alignSelf: "stretch", borderWidth: 2, borderRadius: 24, paddingVertical: 16, paddingHorizontal: 28, gap: 6, backgroundColor: "rgba(134,227,160,0.10)" },
  capWrap: { position: "absolute", left: 120, right: 120, bottom: 22, alignItems: "center" },
  capBox: { backgroundColor: "rgba(0,0,0,0.62)", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 8 },
  cap: { fontSize: 25, lineHeight: 36, textAlign: "center" },
});
