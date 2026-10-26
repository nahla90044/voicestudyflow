// components/brand/slides/visual/kit.tsx
// أدوات الشكل البصري «مَرسَم المفاهيم» المشتركة بين قوالبه (docs/slides-design/٢-بصري-تفاعلي.html):
// - ألوان الأنواع الثابتة المعنى (تعريف، أنواع، شروط، مدد، نظام، سؤال، طرفا المقارنة) واستنتاج نوع كل نقطة.
// - حدود المحتوى: الإطار البصري من y=66 (أو 104 في «منوّع» تحت ترويسة المجلة) حتى y=606، ومربع الزاوية.
// - حركات الدخول من مفردات النموذج: صعود، قفزة، انزلاق، سقوط، انقلاب، كشف (wipe)، ونافذة الإبراز.
//   كلها من useTrigger/useSpan/useLoop (shared): عتبات من تقدّم الراوي ومدد بالمللي ثانية على خيط الواجهة.
// - رأس الشريحة: شارة النوع + العنوان ينكشف من جهة القراءة + تموّج ذهبي + ملصق الأيقونة المتمايل.
// - SVG كبير يُرسم بدقة مخفّضة (LoSvg): اللوحة ١٢٨٠ تُحجَّم بعد الرسم، فرسمه بحجمه الكامل يكلّف ذاكرة بلا فائدة.
import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useId, useState } from "react";
import { Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { fitFont, kindOf, LINE_H, linesFor, normText, toLatinDigits, toLocalDigits, type Item, type SceneModel } from "../../../../lib/slideThemeCore";
import { CARD, DIM, GOLD, INK, IVORY, SceneMark, SlideMotion, useLoop, useTrigger, type FontRole, type SlideCtx } from "../shared";

export type Glyph = keyof typeof Ionicons.glyphMap;

// ===== الألوان =====

/** لوحة «سماء المعرفة» وألوان الأنواع (ثابتة المعنى في كل الفيديو) */
export const V = {
  bgA: "#1A2160",
  bgB: INK,
  bgC: "#06081A",
  card: CARD,
  ink: IVORY,
  dim: DIM,
  brand: GOLD,
  onBrand: INK,
  def: "#5EE6D6",
  type: "#B4A6FF",
  cond: "#FF8FB3",
  time: "#FFB45E",
  law: "#86E3A0",
  q: "#74C6FF",
  pa: "#7FE7C4",
  pb: "#FF9A76",
} as const;

export const LINE = "rgba(255,255,255,0.10)";

/** ارتفاع السطر الآمن لكل خط: حبر الكوفي والرقعة نحو ١٫٢٤em فوق السطر وتحته، فأقل من ١٫٣ يقصّ رؤوس الحروف */
export const LH_KUFI = 1.32;
export const LH_RUQ = 1.4;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** لون بشفافية (المدخل hex) */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** مزج لونين (t = نسبة الأول) — بديل color-mix في النموذج */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const c = x.map((v, i) => Math.round(v * t + y[i] * (1 - t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ===== نوع كل نقطة =====

export type VKind = "def" | "type" | "cond" | "time" | "law";

export const KIND: Record<VKind, { color: string; icon: Glyph; label: string }> = {
  def: { color: V.def, icon: "book-outline", label: "video.s.kind.define" },
  type: { color: V.type, icon: "git-network-outline", label: "video.s.kind.types" },
  cond: { color: V.cond, icon: "shield-checkmark-outline", label: "video.s.kind.cond" },
  time: { color: V.time, icon: "time-outline", label: "video.s.kind.time" },
  law: { color: V.law, icon: "document-text-outline", label: "video.s.kind.text" },
};

const KIND_RE: [VKind, RegExp][] = [
  ["def", /^(تعريف|التعريف|معنى|معناه|مفهوم|المقصود|يقصد|يُقصد|definition|meaning|means)/i],
  ["cond", /شرط|شروط|يشترط|يُشترط|ضابط|ضوابط|condition|requirement|required/i],
  ["time", /مدة|مدّة|مهلة|يوم|أيام|ايام|يومًا|يوما|شهر|أشهر|سنة|سنوات|ساعة|أسبوع|أسابيع|وقته|توقيت|موعد|deadline|\bdays?\b|\bweeks?\b|\bmonths?\b|\byears?\b|\bhours?\b/i],
  ["type", /أنواع|انواع|نوعان|نوع|أقسام|اقسام|قسمان|ينقسم|تنقسم|من حيث|\btypes?\b|\bkinds?\b/i],
  ["law", /نظام|مادة|المادة|قانون|لائحة|مرسوم|قاعدة|مرجع|\barticle\b|\blaw\b|regulation|statute/i],
];

/** نوع النقطة من رأسها أولًا ثم نصها كله (بلا نوع = ذهبي عام) */
export function itemKind(it: Item): VKind | null {
  const head = it.head ?? "";
  if (head) for (const [k, re] of KIND_RE) if (re.test(head)) return k;
  for (const [k, re] of KIND_RE) if (re.test(it.text)) return k;
  return null;
}

/** لون المشهد (التوهج والشارة والملصق) من نوع معلومته */
export function sceneAcc(m: Pick<SceneModel, "role" | "template" | "title">): string {
  if (m.role === "finalEx") return V.time;
  if (m.role === "finalQ" || m.template === "check" || m.template === "qIntro") return V.q;
  if (m.role === "cover" || m.role === "summary") return V.brand;
  switch (kindOf(m)) {
    case "define":
      return V.def;
    case "types":
    case "compare":
      return V.type;
    case "cond":
      return V.cond;
    case "time":
    case "number":
      return V.time;
    case "text":
      return V.law;
    case "question":
      return V.q;
    default:
      return V.brand;
  }
}

const KIND_ICON: Record<string, Glyph> = {
  define: "book-outline",
  types: "git-network-outline",
  cond: "shield-checkmark-outline",
  time: "time-outline",
  compare: "git-compare-outline",
  steps: "footsteps-outline",
  points: "list-outline",
  question: "help-circle-outline",
  number: "stats-chart-outline",
  text: "document-text-outline",
};

/** شارة المشهد: النص واللون والأيقونة (الختامي والتمرين والخلاصة لها شارتها) */
export function sceneTag(ctx: SlideCtx): { label: string; icon: Glyph; color: string } {
  const { m, t } = ctx;
  const color = sceneAcc(m);
  if (m.role === "finalEx") return { label: t("video.s.exercise"), icon: "document-text-outline", color };
  if (m.role === "finalQ") return { label: t("video.s.finalQ"), icon: "school-outline", color };
  if (m.template === "check") return { label: t("video.check"), icon: "help-circle-outline", color };
  if (m.role === "summary" || m.template === "summary") return { label: t("video.s.summary"), icon: "checkmark-done-outline", color };
  const k = kindOf(m);
  return { label: t(`video.s.kind.${k}`), icon: KIND_ICON[k] ?? "ellipse-outline", color };
}

/** لون فرع/عمود بالترتيب (الشجرة ونقاط الافتتاح) */
export const BRANCH = [V.type, V.pa, V.pb, V.def, V.time, V.cond] as const;
export const AGENDA = [V.def, V.type, V.cond, V.time, V.law, V.q] as const;

// ===== حدود المحتوى =====

export const CW = 1136;
export const X0 = 72;
/** المحتوى المقروء لا ينزل تحت هذا (الترجمة من 610) */
export const BOTTOM = 606;

export type Frame = {
  top: number;
  /** ارتفاع المحتوى */
  H: number;
  /** إزاحة من اليسار تحجز مربع الزاوية (زر ملء الشاشة) */
  pad: number;
  /** ارتفاع أدنى لأول صف حتى يبدأ ما تحته أسفل مربع الزاوية */
  ctop: number;
  /** تكبير الخط على الجوال العمودي */
  k: number;
};

export function frameOf(ctx: SlideCtx): Frame {
  // في «منوّع» ترويسة المجلة (y 28..86) فوق المحتوى
  const top = ctx.bare ? 104 : 66;
  const c = ctx.safe.corner;
  return {
    top,
    H: BOTTOM - top,
    pad: c > 0 ? Math.max(0, Math.ceil(c - X0 + 10)) : 0,
    ctop: c > 0 ? Math.max(0, Math.ceil(c - top + 10)) : 0,
    k: ctx.compact ? 1.12 : 1,
  };
}

export function Content({ f, children, style }: { f: Frame; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ position: "absolute", left: X0, right: X0, top: f.top, height: f.H }, style]}>{children}</View>;
}

/** محاذاة البداية في عمود (اليمين بالعربية) */
export const startOf = (ctx: SlideCtx) => (ctx.isRTL ? "flex-end" : "flex-start") as "flex-end" | "flex-start";
/** +1 حين تكون البداية يمينًا */
export const dirSign = (ctx: SlideCtx) => (ctx.isRTL ? 1 : -1);

// ===== النص =====

/** نمط نص بالحجم وارتفاع السطر واتجاه الكتابة، والخط من ff (لا fontWeight مع خط مخصص) */
export function tx(ctx: SlideCtx, role: FontRole, size: number, color: string, lh: number = LINE_H, align?: "center" | "right" | "left", extra?: TextStyle): StyleProp<TextStyle> {
  return [
    { fontSize: size, lineHeight: Math.round(size * lh), color, textAlign: align ?? ctx.align, writingDirection: ctx.isRTL ? "rtl" : "ltr" },
    extra,
    ctx.ff(role),
  ];
}

/** لا قص: عدد الأسطر من التقدير، والتصغير التلقائي حتى ٠٫٦ لما يفلت من التقدير */
export const fit = (lines: number) => ({ numberOfLines: Math.max(1, Math.round(lines)), adjustsFontSizeToFit: true, minimumFontScale: 0.6 }) as const;

/** أكبر خط تتسع به كل النصوص في maxLines أسطر بعرض w */
export function fitSize(texts: string[], w: number, maxLines: number, base: number, min: number): number {
  const list = texts.filter(Boolean);
  return Math.round(fitFont(list.length ? list : [" "], { w: Math.max(40, w), h: 1e7, maxLines }, base, min));
}

/** عدد أسطر نص (١ للفارغ) */
export const nLines = (text: string, w: number, size: number) => (text ? linesFor(text, Math.max(40, w), size) : 0);

/** المصطلح المعروض بلا «تعريف/مفهوم/معنى» في أوله (العنوان «تعريف التنفيذ» ← «التنفيذ») */
export function bareTerm(s: string): string {
  const t = String(s ?? "").trim();
  const out = t.replace(/^(تعريف|مفهوم|معنى|المقصود ب|definition of|meaning of)\s*/i, "").trim();
  return out || t;
}

/** الجذر بلا «أنواع/أقسام» في أوله («أنواع التنفيذ» ← «التنفيذ») */
export function bareRoot(s: string): string {
  const t = String(s ?? "").trim();
  const out = t
    .replace(/^(أنواع|انواع|أقسام|اقسام|تقسيمات|تقسيم)\s+/, "")
    .replace(/^(types|kinds)\s+of\s+/i, "")
    .trim();
  return out || t;
}

/** رقم في أول النص (للعدّاد): «٩٨ مادة» ← { n: 98, rest: "مادة" } */
export function leadNumber(s: string | undefined): { n: number; rest: string } | null {
  const t = toLatinDigits(String(s ?? "")).trim();
  const m = t.match(/^(\d{1,6})(?![\d.,٫/:])\s*(.*)$/);
  if (!m) return null;
  return { n: Number(m[1]), rest: m[2].trim() };
}

/** تقسيم نص إلى مقاطع متوازنة بالكلمات (لكشف الورقة سطرًا سطرًا) */
export function chunks(text: string, max: number): string[] {
  const lines = String(text ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, Math.max(max, lines.length));
  const words = (lines[0] ?? "").split(/\s+/).filter(Boolean);
  const n = Math.max(1, Math.min(max, Math.ceil(words.join(" ").length / 34)));
  if (n <= 1) return [words.join(" ")];
  const total = words.join(" ").length;
  const out: string[] = [];
  let cur: string[] = [];
  let acc = 0;
  for (const w of words) {
    cur.push(w);
    acc += w.length + 1;
    if (acc >= (total / n) * (out.length + 1) && out.length < n - 1) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/** أرقام بلغة الواجهة */
export const dg = (ctx: SlideCtx, n: number | string) => toLocalDigits(n, ctx.lang);

/** رمز الخيار المعروض: رمزه إن وُجد، وإلا حرف بترتيبه (أ ب ج د هـ و / a b c d) */
export function optMark(ctx: SlideCtx, marker: string, i: number): string {
  if (marker) return toLocalDigits(marker, ctx.lang);
  const ar = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح"];
  const en = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return (ctx.lang === "ar" ? ar : en)[i] ?? String(i + 1);
}

// ===== الحركة =====

export const BACK = Easing.out(Easing.back(1.70158));
export const SMOOTH = Easing.inOut(Easing.quad);

export function useRise(sv: SharedValue<number>, at: number, dist = 28, ms = 520) {
  const q = useTrigger(sv, at, ms);
  return useAnimatedStyle(() => ({ opacity: q.value, transform: [{ translateY: (1 - q.value) * dist }] }));
}

export function usePop(sv: SharedValue<number>, at: number, from = 0.35, ms = 640) {
  const b = useTrigger(sv, at, ms, BACK);
  return useAnimatedStyle(() => ({ opacity: Math.min(1, b.value * 3), transform: [{ scale: from + (1 - from) * b.value }] }));
}

export function useSlideX(sv: SharedValue<number>, at: number, dx: number, ms = 560) {
  const q = useTrigger(sv, at, ms);
  return useAnimatedStyle(() => ({ opacity: q.value, transform: [{ translateX: (1 - q.value) * dx }] }));
}

export function useDrop(sv: SharedValue<number>, at: number, ms = 640) {
  const b = useTrigger(sv, at, ms, BACK);
  return useAnimatedStyle(() => ({ opacity: Math.min(1, b.value * 4), transform: [{ translateY: (1 - b.value) * -64 }] }));
}

export function useFlipIn(sv: SharedValue<number>, at: number, ms = 680) {
  const b = useTrigger(sv, at, ms, BACK);
  return useAnimatedStyle(() => ({ opacity: Math.min(1, b.value * 3), transform: [{ perspective: 900 }, { rotateX: `${(1 - b.value) * -75}deg` }] }));
}

type Box = { sv: SharedValue<number>; at: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode };

export function Rise({ sv, at, style, children, dist, ms }: Box & { dist?: number; ms?: number }) {
  const a = useRise(sv, at, dist, ms);
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

export function Pop({ sv, at, style, children, from, ms }: Box & { from?: number; ms?: number }) {
  const a = usePop(sv, at, from, ms);
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

export function SlideX({ sv, at, dx, style, children }: Box & { dx: number }) {
  const a = useSlideX(sv, at, dx);
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/**
 * كشف من جهة (بديل clip-path): حاوية overflow:hidden تتحرك والمحتوى عكسها فيبقى ثابتًا وتنكشف حدوده.
 * dir: "rtl" ينكشف من اليمين، "ltr" من اليسار، "down" من الأعلى. len: الطول المعروف سلفًا، وإلا يُقاس.
 */
export function Wipe({ q, dir, len, style, children }: { q: SharedValue<number>; dir: "rtl" | "ltr" | "down"; len?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const size = useSharedValue(len ?? 0);
  const onLayout = (e: LayoutChangeEvent) => {
    if (len) return;
    const l = e.nativeEvent.layout;
    size.set(dir === "down" ? l.height : l.width);
  };
  const outer = useAnimatedStyle(() => {
    const s = (1 - Math.min(1, Math.max(0, q.value))) * size.value;
    return { opacity: size.value > 0 ? 1 : 0, transform: dir === "down" ? [{ translateY: -s }] : [{ translateX: dir === "rtl" ? s : -s }] };
  });
  const inner = useAnimatedStyle(() => {
    const s = (1 - Math.min(1, Math.max(0, q.value))) * size.value;
    return { transform: dir === "down" ? [{ translateY: s }] : [{ translateX: dir === "rtl" ? -s : s }] };
  });
  return (
    <Animated.View onLayout={onLayout} style={[{ overflow: "hidden" }, style, outer]}>
      <Animated.View style={inner}>{children}</Animated.View>
    </Animated.View>
  );
}

/** نافذة الإبراز [a, b): ١ ما دام الراوي يقرأ العنصر، و٠ قبله وبعده (بانتقال ناعم) */
export function useWindow(sv: SharedValue<number>, a: number, b: number, ms = 320): SharedValue<number> {
  const { reduced } = useContext(SlideMotion);
  const v = useSharedValue(0);
  useAnimatedReaction(
    () => sv.value >= a && sv.value < b,
    (on, prev) => {
      if (on === prev) return;
      const to = on ? 1 : 0;
      if (prev === null || reduced) v.value = to;
      else v.value = withTiming(to, { duration: ms });
    },
    [a, b, reduced]
  );
  return v;
}

/** عبور عتبة كقيمة React (للنص المتداخل الذي لا تحرّكه reanimated) — يتبدّل مرة عند كل عبور */
export function useCrossed(sv: SharedValue<number>, at: number): boolean {
  const { playing } = useContext(SlideMotion);
  const [on, setOn] = useState(!playing);
  useAnimatedReaction(
    () => sv.value >= at,
    (cur, prev) => {
      if (cur !== prev) runOnJS(setOn)(cur);
    },
    [at]
  );
  return on;
}

/** عدّاد يُعدّ أمام العين من from إلى to (لا يُعاد الرسم إلا عند تغيّر العدد الصحيح) */
export function CountUp({ ctx, sv, at, from = 0, to, ms = 1200, style, suffix = "" }: { ctx: SlideCtx; sv: SharedValue<number>; at: number; from?: number; to: number; ms?: number; style?: StyleProp<TextStyle>; suffix?: string }) {
  const { playing } = useContext(SlideMotion);
  const q = useTrigger(sv, at, ms, Easing.out(Easing.cubic));
  const [n, setN] = useState(playing ? from : to);
  useAnimatedReaction(
    () => Math.round(from + (to - from) * Math.min(1, Math.max(0, q.value))),
    (cur, prev) => {
      if (cur !== prev) runOnJS(setN)(cur);
    },
    [from, to]
  );
  return (
    <Text style={style} {...fit(1)}>
      {dg(ctx, n)}
      {suffix}
    </Text>
  );
}

/** معرّف فريد صالح لـ url(#…) في SVG */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^A-Za-z0-9]/g, "")}`;
}

/** SVG كبير بدقة مخفّضة ثم يُكبَّر (res من الحجم) — الشكل نفسه بذاكرة أقل */
export function LoSvg({ w, h, res = 0.5, style, children }: { w: number; h: number; res?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <View style={[{ width: w, height: h }, style]} pointerEvents="none">
      <Svg width={w * res} height={h * res} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, transform: [{ scale: 1 / res }], transformOrigin: "top left" }}>
        {children}
      </Svg>
    </View>
  );
}

/** بذرة عشوائية ثابتة (النجوم والقصاصات بالمواضع نفسها في كل مرة) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===== رأس الشريحة =====

export type HeadPlan = { size: number; lines: number; subSize: number; subLines: number; h: number; w: number; tag: boolean };

/** الشارة تُخفى إن طابقت العنوان («الخلاصة» فوق «الخلاصة») */
const tagShown = (ctx: SlideCtx) => normText(sceneTag(ctx).label) !== normText(ctx.m.title);

/** تخطيط الرأس: حجم العنوان (سطران كحد أقصى) والارتفاع الكلي (حتى يُحسب ما تحته) */
export function headPlan(ctx: SlideCtx, f: Frame, opt: { sideW?: number; sub?: string; w?: number } = {}): HeadPlan {
  const sideW = opt.sideW ?? 94;
  const w = (opt.w ?? CW) - (sideW ? sideW + 24 : 0) - f.pad;
  const title = ctx.m.title;
  const size = fitSize([title], w, 2, Math.round(54 * f.k), 30);
  const lines = title ? Math.min(2, nLines(title, w, size)) : 0;
  const sub = opt.sub ?? "";
  const subSize = sub ? fitSize([sub], w, 2, Math.round(22 * f.k), 16) : 0;
  const subLines = sub ? Math.min(2, nLines(sub, w, subSize)) : 0;
  const tag = tagShown(ctx);
  const textH = (tag ? 36 + 8 : 0) + (lines ? lines * Math.round(size * LH_KUFI) + 10 : 0) + (subLines ? 6 + subLines * Math.round(subSize * 1.4) : 0);
  return { size, lines, subSize, subLines, w, tag, h: Math.ceil(Math.max(textH, sideW ? 98 : 0, f.ctop)) };
}

/** شارة النوع (h36) تقفز عند ٠٫٠٢ */
export function Tag({ ctx, label, icon, color, at = 0.02, solid, size = 19 }: { ctx: SlideCtx; label: string; icon: Glyph; color: string; at?: number; solid?: boolean; size?: number }) {
  const a = usePop(ctx.sv, at, 0.5);
  return (
    <Animated.View
      style={[
        {
          flexDirection: ctx.row,
          alignItems: "center",
          gap: 8,
          height: size * 1.9,
          paddingHorizontal: 15,
          borderRadius: 999,
          backgroundColor: solid ? color : alpha(color, 0.15),
          borderWidth: 1.5,
          borderColor: solid ? color : alpha(color, 0.45),
          alignSelf: startOf(ctx),
          transformOrigin: ctx.isRTL ? "right" : "left",
        },
        a,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 1.05)} color={solid ? V.onBrand : color} />
      <Text style={tx(ctx, "plex600", size, solid ? V.onBrand : color, 1.3)} {...fit(1)}>
        {label}
      </Text>
    </Animated.View>
  );
}

const SQUIG = "M236 8 C 214 14, 200 2, 178 9 C 156 16, 136 17, 114 9 C 92 1, 72 2, 50 9 C 28 16, 14 14, 4 10";

/** التموّج الذهبي تحت العنوان: يُرسم من جهة القراءة */
export function Squiggle({ ctx, at, w = 230, color = V.brand }: { ctx: SlideCtx; at: number; w?: number; color?: string }) {
  const q = useTrigger(ctx.sv, at, 700);
  const h = Math.round((w / 240) * 18);
  return (
    <Wipe q={q} dir={ctx.isRTL ? "rtl" : "ltr"} len={w} style={{ width: w, height: h, alignSelf: startOf(ctx) }}>
      <Svg width={w} height={h} viewBox="0 0 240 18" style={ctx.isRTL ? undefined : { transform: [{ scaleX: -1 }] }}>
        <Path d={SQUIG} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" />
      </Svg>
    </Wipe>
  );
}

/** العنوان ينكشف من جهة القراءة (٠٫٠٤٥) */
export function Title({ ctx, size, lines, at = 0.045, color = V.ink, role = "kufi600", lh = LH_KUFI }: { ctx: SlideCtx; size: number; lines: number; at?: number; color?: string; role?: FontRole; lh?: number }) {
  const q = useTrigger(ctx.sv, at, 760);
  if (!ctx.m.title) return null;
  return (
    <Wipe q={q} dir={ctx.isRTL ? "rtl" : "ltr"} style={{ alignSelf: lines > 1 ? "stretch" : startOf(ctx), maxWidth: "100%" }}>
      <Text style={tx(ctx, role, size, color, lh)} {...fit(lines || 1)}>
        {ctx.m.title}
      </Text>
    </Wipe>
  );
}

/** ملصق أيقونة المشهد ٩٤×٩٤ مائل يتمايل (الإيموجي فقط إن SHOW_EMOJI) */
export function Sticker({ ctx, color, at = 0.08, size = 94 }: { ctx: SlideCtx; color: string; at?: number; size?: number }) {
  const a = usePop(ctx.sv, at);
  const bob = useLoop(5000);
  const b = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * bob.value }, { rotate: `${-7 + 5 * bob.value}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, a]}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size * 0.28,
            backgroundColor: mix(color, V.card, 0.24),
            borderWidth: 3.5,
            borderColor: "rgba(255,255,255,0.92)",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 14px 28px -10px rgba(0,0,0,0.6)",
          },
          b,
        ]}
      >
        <SceneMark m={ctx.m} size={Math.round(size * 0.53)} color={color} />
      </Animated.View>
    </Animated.View>
  );
}

/** الرأس كاملًا: [شارة + عنوان + تموّج + سطر فرعي] و[الملصق أو ما يُمرَّر في side] — يحجز مربع الزاوية */
export function Head({ ctx, f, plan, side, sub, noSticker }: { ctx: SlideCtx; f: Frame; plan: HeadPlan; side?: React.ReactNode; sub?: string; noSticker?: boolean }) {
  const tag = sceneTag(ctx);
  return (
    <View style={{ flexDirection: ctx.row, alignItems: "flex-start", gap: 24, paddingLeft: f.pad, minHeight: plan.h, marginBottom: 16 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 8, alignItems: startOf(ctx) }}>
        {plan.tag ? <Tag ctx={ctx} label={tag.label} icon={tag.icon} color={tag.color} /> : null}
        {plan.lines ? (
          <View style={{ alignSelf: "stretch", alignItems: startOf(ctx) }}>
            <Title ctx={ctx} size={plan.size} lines={plan.lines} />
            <View style={{ marginTop: -6 }}>
              <Squiggle ctx={ctx} at={0.11} />
            </View>
          </View>
        ) : null}
        {sub && plan.subLines ? (
          <Rise sv={ctx.sv} at={0.14} style={{ alignSelf: "stretch" }}>
            <Text style={tx(ctx, "plex500", plan.subSize, V.dim, 1.4)} {...fit(plan.subLines)}>
              {sub}
            </Text>
          </Rise>
        ) : null}
      </View>
      {side ?? (noSticker ? null : <Sticker ctx={ctx} color={tag.color} />)}
    </View>
  );
}

/** حبة صغيرة (وسم نوع النقطة) */
export function Pill({ ctx, label, color, size = 16 }: { ctx: SlideCtx; label: string; color: string; size?: number }) {
  return (
    <View style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999, backgroundColor: alpha(color, 0.12) }}>
      <Text style={tx(ctx, "plex600", size, color, 1.3, "center")} {...fit(1)}>
        {label}
      </Text>
    </View>
  );
}

export const pillW = (label: string, size = 16) => Math.ceil(label.length * 0.56 * size + 30);

/** رأس النقطة ملوّنًا ثم شرحها (Text متداخل واحد فلا ينكسر السطر) */
export function ItemLine({ ctx, it, size, lines, color, ink = V.ink, role = "plex400", headRole = "plex600", lh = LINE_H, align }: { ctx: SlideCtx; it: Item; size: number; lines: number; color: string; ink?: string; role?: FontRole; headRole?: FontRole; lh?: number; align?: "center" | "right" | "left" }) {
  return (
    <Text style={[tx(ctx, role, size, ink, lh, align), { flexShrink: 1 }]} {...fit(lines)}>
      {it.head ? <Text style={[{ color }, ctx.ff(headRole)]}>{it.head}: </Text> : null}
      {it.head ? it.body : it.text}
    </Text>
  );
}

/** شبكة ارتفاعات صفوف (الأعمدة cols) من ارتفاعات العناصر */
export function gridH(hs: number[], cols: number, gap: number): number {
  let total = 0;
  for (let r = 0; r < hs.length; r += cols) total += Math.max(...hs.slice(r, r + cols));
  return total + gap * Math.max(0, Math.ceil(hs.length / cols) - 1);
}

export { CARD, DIM, GOLD, INK, IVORY, LINE_H };

// ===== رسمة الوسام (الافتتاح والأرقام) =====

/**
 * أيقونة المشهد في قرص ذهبي داخل هالة، ومدار متقطع يدور ببطء عليه ثلاث نقاط ملوّنة، والرسمة كلها تطفو.
 * impact: لحظة «الهبوط» في الافتتاح — موجتان تتسعان وشرر قصير (بديل المطرقة في النموذج، صالح لكل المواد).
 */
export function Medallion({ ctx, size, at = 0, impact = false }: { ctx: SlideCtx; size: number; at?: number; impact?: boolean }) {
  const pop = usePop(ctx.sv, at, 0.35, 700);
  const spin = useLoop(46000, { reverse: false, easing: Easing.linear });
  const float = useLoop(6000);
  const spinA = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const floatA = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * float.value }] }));
  const orbit = Math.round(size * 0.77);
  const disk = Math.round(size * 0.45);
  const haloId = useSvgId("halo");
  const dots = [
    { x: orbit, y: orbit / 2, r: 7, c: V.type },
    { x: 0, y: orbit / 2, r: 5, c: V.def },
    { x: orbit / 2, y: 0, r: 4.5, c: V.cond },
  ];
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, pop]}>
      <Animated.View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, floatA]}>
        <View style={{ position: "absolute", width: size, height: size }}>
          <Svg width={48} height={48} viewBox="0 0 48 48" style={{ transform: [{ scale: size / 48 }], transformOrigin: "top left" }}>
            <Defs>
              <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={V.brand} stopOpacity={0.34} />
                <Stop offset="0.55" stopColor={V.brand} stopOpacity={0.08} />
                <Stop offset="1" stopColor={V.brand} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={24} cy={24} r={24} fill={`url(#${haloId})`} />
          </Svg>
        </View>
        <Animated.View style={[{ position: "absolute", width: orbit, height: orbit, borderRadius: orbit / 2, borderWidth: 2, borderStyle: "dashed", borderColor: alpha(V.brand, 0.32) }, spinA]}>
          {dots.map((d, i) => (
            <View key={i} style={{ position: "absolute", left: d.x - d.r - 1, top: d.y - d.r - 1, width: d.r * 2, height: d.r * 2, borderRadius: d.r, backgroundColor: d.c }} />
          ))}
        </Animated.View>
        {impact ? <Impact ctx={ctx} disk={disk} /> : null}
        <View
          style={{
            width: disk,
            height: disk,
            borderRadius: disk / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: mix(V.brand, V.card, 0.16),
            borderWidth: 3,
            borderColor: alpha(V.brand, 0.85),
            boxShadow: `0 0 54px -6px ${alpha(V.brand, 0.55)}`,
          }}
        >
          <SceneMark m={ctx.m} size={Math.round(disk * 0.5)} color={V.brand} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Impact({ ctx, disk }: { ctx: SlideCtx; disk: number }) {
  const r1 = useTrigger(ctx.sv, 0.1, 900);
  const r2 = useTrigger(ctx.sv, 0.135, 1000);
  const sp = useTrigger(ctx.sv, 0.098, 700);
  const ring = (v: SharedValue<number>) => {
    "worklet";
    return { opacity: Math.min(1, v.value * 10) * (1 - v.value), transform: [{ scale: 0.6 + 1.2 * v.value }] };
  };
  const a1 = useAnimatedStyle(() => ring(r1));
  const a2 = useAnimatedStyle(() => ring(r2));
  const sA = useAnimatedStyle(() => ({ opacity: sp.value < 1 ? Math.min(1, sp.value * 4) * (1 - sp.value) : 0, transform: [{ scale: 0.7 + 0.5 * sp.value }] }));
  const base = { position: "absolute" as const, width: disk, height: disk, borderRadius: disk / 2, borderWidth: 3, borderColor: V.brand };
  return (
    <>
      <Animated.View style={[base, a1]} />
      <Animated.View style={[base, a2]} />
      <Animated.View style={[{ position: "absolute", width: disk * 1.7, height: disk * 1.7 }, sA]}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <View key={deg} style={{ position: "absolute", left: disk * 0.85 - 2, top: 0, width: 4.5, height: disk * 0.85, transform: [{ rotate: `${deg}deg` }], transformOrigin: [2.25, disk * 0.85, 0] }}>
            <View style={{ width: 4.5, height: disk * 0.18, borderRadius: 3, backgroundColor: V.brand }} />
          </View>
        ))}
      </Animated.View>
    </>
  );
}
