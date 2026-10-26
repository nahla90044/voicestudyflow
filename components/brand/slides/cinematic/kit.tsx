// components/brand/slides/cinematic/kit.tsx
// أدوات الشكل السينمائي «ضوءٌ على المعنى» المشتركة بين مشاهده:
// - الألوان (ليل، ذهب، قمري، جمري، بنفسجي، فيروزي، وردي الفجر) — والذهبي الأساسي هو GOLD الثابت (#F6D58A) لا pal.accent.
// - Blob: توهّج شعاعي (سُدُم، هالات، ومضات) يُرسم SVG صغيرًا ثم يُكبَّر — التوهّج ناعم أصلًا فلا يضره التكبير،
//   ويوفّر ذاكرة الرسم (SVG بحجم اللوحة كاملة يكلّف عشرات الميغابايت على آيفون).
// - Appear: دخول العنصر لحظة بلوغ الراوي عتبته (صعود، انبثاق، دخول جانبي، إضاءة، طبعة ختم، دفع بالعمق).
// - Words: النص يظهر كلمةً كلمة مع الراوي في Text واحد (فلا يُكسر سطر ولا يتغير التخطيط، والتصغير التلقائي يعمل)،
//   والكلمة المفتاحية تتوهج ذهبًا لحظتها.
// - planStack: تقدير حتمي لأحجام الخطوط حتى يتسع العمود كله بلا قص ولا تداخل.
// كل الحركة من useTrigger وuseSpan وuseLoop (shared) أو withTiming في useEffect — بلا مؤقتات ولا setState داخل الحلقات.
import React, { useContext, useEffect, useId, useMemo, useState } from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
  type WithTimingConfig,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { CHAR_EM, LINE_H, linesFor, normText, type SceneModel } from "../../../../lib/slideThemeCore";
import { GOLD, SceneMark, SlideMotion, useTrigger, type FontRole, type SlideCtx } from "../shared";

// ===== الألوان =====

export const C = {
  night0: "#050816",
  night1: "#0C1440",
  night2: "#151049",
  indigo: "#2A2370",
  gold: GOLD,
  gold2: "#D9A54A",
  gold3: "#FFF1C9",
  goldHi: "#FFE3A3",
  goldLo: "#E2AF56",
  ivory: "#F6F0E1",
  mist: "#A8B3D6",
  mist2: "#6E7AA6",
  moon: "#8DB7FF",
  ember: "#FF9B71",
  violet: "#A99BFF",
  lilac: "#DCD5FF",
  teal: "#6FE3C8",
  rose: "#F59AB5",
  /** ما لم يُنطق بعد في الترجمة */
  unspoken: "#5B678F",
  /** النص فوق الذهب */
  onGold: "#1A1405",
  panel: "#0A0E26",
} as const;

/** شفافية لون سداسي: alpha("#F6D58A", .4) ← rgba(…) */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** منحنيات النموذج: دخول (.16,1,.3,1)، وانتقال (.65,0,.35,1)، وقفزة (.34,1.56,.64,1) */
export const EO = Easing.bezier(0.16, 1, 0.3, 1);
export const EIO = Easing.bezier(0.65, 0, 0.35, 1);
export const BACK = Easing.bezier(0.34, 1.56, 0.64, 1);

/** قيمة مشتقة تُقرأ فقط ← تُمرَّر لهوكات shared (التي تقرأ ولا تكتب) */
export const asSV = (d: DerivedValue<number>): SharedValue<number> => d as unknown as SharedValue<number>;

// ===== التوهّج الشعاعي =====

/** [الموضع ٠..١، اللون، الشفافية] */
export type GlowStop = [number, string, number];

/**
 * توهّج شعاعي بمقاس w×h (بوحدات اللوحة) يُرسم SVG أصغر res مرة ثم يُكبَّر.
 * cx/cy مركز التدرج و rx/ry نصف قطره (نسبة من الصندوق)، وfx/fy البؤرة (لمعة جانبية).
 */
export function Blob({
  w,
  h,
  stops,
  res = 8,
  cx = 0.5,
  cy = 0.5,
  rx = 0.5,
  ry = 0.5,
  fx,
  fy,
  style,
}: {
  w: number;
  h: number;
  stops: GlowStop[];
  res?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  fx?: number;
  fy?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = "g" + useId().replace(/[^A-Za-z0-9]/g, "");
  const sw = Math.max(2, Math.round(w / res));
  const sh = Math.max(2, Math.round(h / res));
  const pc = (x: number) => `${Math.round(x * 1000) / 10}%`;
  return (
    <View pointerEvents="none" style={[{ position: "absolute", width: w, height: h }, style]}>
      <Svg
        width={sw}
        height={sh}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", left: (w - sw) / 2, top: (h - sh) / 2, transform: [{ scaleX: w / sw }, { scaleY: h / sh }] }}
      >
        <Defs>
          <RadialGradient id={id} cx={pc(cx)} cy={pc(cy)} rx={pc(rx)} ry={pc(ry)} fx={pc(fx ?? cx)} fy={pc(fy ?? cy)}>
            {stops.map(([o, c, a], i) => (
              <Stop key={i} offset={o} stopColor={c} stopOpacity={a} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** هالة ذهبية خلف عنصر (closest-side: لون في المركز ← شفاف عند الحافة) */
export const halo = (color: string, a: number): GlowStop[] => [
  [0, color, a],
  [0.55, color, a * 0.35],
  [1, color, 0],
];

// ===== الحركة =====

/** قيمة ٠→١ بالزمن تبدأ لحظة صار on صحيحًا (لمراحل السؤال)، وترجع ٠ إن صار خطأ. الإيقاف/تقليل الحركة = ١ فورًا */
export function usePhaseOn(on: boolean, ms = 520, easing: WithTimingConfig["easing"] = EO): SharedValue<number> {
  const { reduced, playing } = useContext(SlideMotion);
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    if (!on) {
      cancelAnimation(v);
      v.value = 0;
      return;
    }
    if (v.value >= 1) return;
    if (reduced || !playing) v.value = 1;
    else v.value = withTiming(1, { duration: ms, easing });
    // easing خارج الاعتماديات عمدًا: كائن ثابت من الثوابت أعلاه
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, playing, reduced, ms, v]);
  return v;
}

/** مسار زمني ٠→١ خلال ms أثناء التشغيل فقط (تكبير بطيء، انسياب الشريط) — يتجمّد عند الإيقاف، ويبقى ٠ مع تقليل الحركة */
export function useRun(ms: number): SharedValue<number> {
  const { reduced, playing } = useContext(SlideMotion);
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(v);
      v.value = 0;
      return;
    }
    if (!playing) {
      cancelAnimation(v);
      return;
    }
    const left = Math.max(0, 1 - v.value);
    v.value = withTiming(1, { duration: Math.max(1, ms * left), easing: Easing.linear });
    return () => cancelAnimation(v);
  }, [playing, reduced, ms, v]);
  return v;
}

export type AppearKind = "fade" | "up" | "pop" | "side" | "light" | "stamp" | "zoom";

/**
 * دخول عنصر لحظة بلوغ التقدّم sv العتبة at:
 * fade ظهور، up صعود dist، pop انبثاق من ‎.35 بقفزة، side دخول جانبي (from: +1 من اليمين، −1 من اليسار)،
 * light إضاءة (من شفافية ‎.2 مع نبضة ١٫٠٣)، stamp طبعة ختم (١٫٨ مع ‎−14° ← ‎.92 ← ١)، zoom دفع بالعمق من ‎.8.
 */
export function Appear({
  sv,
  at,
  kind = "up",
  ms,
  dist,
  from = 1,
  style,
  children,
  onLayout,
}: {
  sv: SharedValue<number>;
  at: number;
  kind?: AppearKind;
  ms?: number;
  dist?: number;
  from?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onLayout?: React.ComponentProps<typeof View>["onLayout"];
}) {
  const easing = kind === "pop" ? BACK : kind === "stamp" ? Easing.out(Easing.quad) : EO;
  const v = useTrigger(sv, at, ms ?? (kind === "stamp" ? 700 : kind === "pop" ? 560 : 640), easing);
  const d = dist ?? (kind === "side" ? 70 : 26);
  const a = useAnimatedStyle(() => {
    const x = v.value;
    switch (kind) {
      case "fade":
        return { opacity: x };
      case "pop":
        return { opacity: Math.min(1, x * 1.6), transform: [{ scale: 0.35 + 0.65 * x }] };
      case "side":
        return { opacity: Math.min(1, x), transform: [{ translateX: (1 - x) * d * from }] };
      case "light":
        return { opacity: 0.2 + 0.8 * Math.min(1, x), transform: [{ scale: interpolate(x, [0, 0.5, 1], [0.97, 1.03, 1], Extrapolation.CLAMP) }] };
      case "stamp":
        return {
          opacity: interpolate(x, [0, 0.35], [0, 1], Extrapolation.CLAMP),
          transform: [{ scale: interpolate(x, [0, 0.6, 1], [1.8, 0.92, 1], Extrapolation.CLAMP) }, { rotate: `${interpolate(x, [0, 0.6], [-14, 0], Extrapolation.CLAMP)}deg` }],
        };
      case "zoom":
        return { opacity: Math.min(1, x), transform: [{ scale: 0.8 + 0.2 * x }] };
      default:
        return { opacity: Math.min(1, x), transform: [{ translateY: (1 - x) * d }] };
    }
  }, [kind, d, from]);
  return (
    <Animated.View style={[style, a]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

/** ومضة لحظية عند at: تكبر من ‎.3 إلى ١ ثم ١٫٧ وتخفت (ومضة عدسة، وهج الكشف) — منتهية (شفافة) عند الإيقاف */
export function Flash({ sv, at, children, style, ms = 900 }: { sv: SharedValue<number>; at: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; ms?: number }) {
  const v = useTrigger(sv, at, ms, Easing.linear);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.2, 1], [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(v.value, [0, 0.2, 1], [0.3, 1, 1.7], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[style, a]}>
      {children}
    </Animated.View>
  );
}

/** ومضة عدسة أفقية (١١٠٠×١٦): بيضاء في الوسط ذهبية الأطراف */
export function LensFlare({ sv, at, w = 1100, h = 16, style }: { sv: SharedValue<number>; at: number; w?: number; h?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Flash sv={sv} at={at} style={[{ position: "absolute", width: w, height: h }, style]}>
      <Blob w={w} h={h} res={2} stops={[[0, "#FFFAEB", 1], [0.3, GOLD, 0.55], [1, GOLD, 0]]} />
    </Flash>
  );
}

// ===== النص =====

/** حجم الخط وارتفاع السطر */
export const fs = (size: number, lh = LINE_H): TextStyle => ({ fontSize: size, lineHeight: Math.round(size * lh) });

/**
 * أدنى ارتفاع سطر لكل عائلة حتى لا تُقص رؤوس الحروف وأذيالها (Reem Kufi عالي الألف، وAmiri واسع الأذيال):
 * قيس على الويب — أقل من هذا يُقص الحرف على أندرويد والويب.
 */
export const LH_MIN = { kufi: 1.5, amiri: 1.7, plex: 1.45, ruqaa: 1.6 } as const;
export const lhOf = (role: FontRole, lh: number) => Math.max(lh, role.startsWith("kufi") ? LH_MIN.kufi : role.startsWith("amiri") ? LH_MIN.amiri : role.startsWith("ruqaa") ? LH_MIN.ruqaa : LH_MIN.plex);

/** نمط نص كامل: الحجم والسطر واللون والمحاذاة + الخط (ff بعد غيره، فلا fontWeight مع خط مخصص) */
export function ts(ff: SlideCtx["ff"], role: FontRole, size: number, color: string, lh = LINE_H, align?: TextStyle["textAlign"]): StyleProp<TextStyle> {
  return [{ fontSize: size, lineHeight: Math.round(size * lhOf(role, lh)), color, textAlign: align }, ff(role)];
}

/** نص لا يُقص: حد أسطر مع تصغير تلقائي حتى ‎.6 */
export function Tx({ lines = 1, style, children, min = 0.6 }: { lines?: number; style?: StyleProp<TextStyle>; children: React.ReactNode; min?: number }) {
  return (
    <Text style={style} numberOfLines={lines} adjustsFontSizeToFit minimumFontScale={min}>
      {children}
    </Text>
  );
}

/** الكلمات (والسطر الجديد كلمة مستقلة تبقى ظاهرة دائمًا) */
function tokens(text: string): string[] {
  return String(text ?? "")
    .split(/(\n)|[ \t ]+/)
    .filter((x) => x !== undefined && x !== "") as string[];
}

/** مدى الكلمة المفتاحية داخل الكلمات [بداية، نهاية) — بعد التطبيع، مع حرف عطف/جر ملتصق */
function keywordRange(toks: string[], keyword?: string): [number, number] | null {
  if (!keyword) return null;
  const kw = keyword
    .split(/\s+/)
    .map((w) => normText(w))
    .filter(Boolean);
  if (!kw.length) return null;
  const norm = toks.map((w) => (w === "\n" ? "" : normText(w)));
  const same = (w: string, k: string) => w === k || (w.endsWith(k) && w.length - k.length <= 3 && k.length >= 3);
  for (let s = 0; s + kw.length <= norm.length; s++) {
    let ok = true;
    for (let j = 0; j < kw.length && ok; j++) ok = same(norm[s + j], kw[j]);
    if (ok) return [s, s + kw.length];
  }
  return null;
}

/**
 * نص يظهر كلمةً كلمة مع تقدّم الراوي بين from وto: الكلمة القادمة نصف ظهور ثم كاملة، وما لم يُنطق شفاف
 * (يحجز مكانه فلا يتحرك التخطيط). head: بداية بلون/خط مختلف («رأس: …»). keyword: تتوهج ذهبًا عند kwAt
 * (أو حين تظهر كلماتها إن لم تُحدَّد). عند الإيقاف أو تقليل الحركة: النص كاملًا.
 * Text واحد فيه أجزاء متداخلة: numberOfLines والتصغير التلقائي يعملان على النص كله.
 */
export function Words({
  text,
  head,
  sv,
  from,
  to,
  style,
  color,
  headStyle,
  headColor,
  lines,
  keyword,
  kwAt,
  min = 0.6,
}: {
  text: string;
  head?: string;
  sv: SharedValue<number>;
  from: number;
  to: number;
  style: StyleProp<TextStyle>;
  color: string;
  headStyle?: StyleProp<TextStyle>;
  headColor?: string;
  lines: number;
  keyword?: string;
  kwAt?: number;
  min?: number;
}) {
  const { reduced, playing } = useContext(SlideMotion);
  const headToks = useMemo(() => (head ? tokens(head) : []), [head]);
  const bodyToks = useMemo(() => tokens(text), [text]);
  const toks = useMemo(() => [...headToks, ...bodyToks], [headToks, bodyToks]);
  const n = toks.length;
  const kr = useMemo(() => keywordRange(bodyToks, keyword), [bodyToks, keyword]);
  const animate = playing && !reduced;
  // الحالة = نصف الخطوات ×٢ + توهّج المفتاحية (رقم واحد يتغير بضع مرات في الثانية فقط)
  const [st, setSt] = useState(animate ? 0 : 4 * n + 1);
  useAnimatedReaction(
    () => {
      const d = to - from;
      const f = d <= 0 ? (sv.value >= from ? 1 : 0) : Math.min(1, Math.max(0, (sv.value - from) / d));
      const s = Math.min(2 * n, Math.floor(f * 2 * n + 1e-4));
      const k = kwAt !== undefined ? (sv.value >= kwAt ? 1 : 0) : 0;
      return s * 2 + k;
    },
    (cur, prev) => {
      if (cur !== prev) scheduleOnRN(setSt, cur);
    },
    [from, to, n, kwAt]
  );
  const s = animate ? st >> 1 : 2 * n;
  const kwOn = animate ? (kwAt !== undefined ? (st & 1) === 1 : !!kr && s >= 2 * (headToks.length + kr[1])) : !!kr;
  const hidden = { color: "transparent" } as const;
  const half = { color: alpha(color, 0.35) } as const;
  const kwStyle: TextStyle = { color: C.gold, textShadowColor: alpha(C.gold, 0.85), textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } };
  return (
    <Text style={[style, { color }]} numberOfLines={lines} adjustsFontSizeToFit minimumFontScale={min}>
      {toks.map((w, i) => {
        if (w === "\n") return <Text key={i}>{"\n"}</Text>;
        const vis = Math.max(0, Math.min(2, s - 2 * i));
        const isHead = i < headToks.length;
        const bi = i - headToks.length;
        const inKw = !!kr && !isHead && bi >= kr[0] && bi < kr[1];
        const space = i && toks[i - 1] !== "\n" ? " " : "";
        return (
          <Text
            key={i}
            style={[
              isHead ? [headStyle, headColor ? { color: headColor } : null] : null,
              inKw && kwOn ? kwStyle : null,
              vis === 0 ? hidden : vis === 1 ? (isHead && headColor ? { color: alpha(headColor, 0.35) } : half) : null,
            ]}
          >
            {space}
            {w}
          </Text>
        );
      })}
    </Text>
  );
}

// ===== الهالة والأيقونة =====

/** هالة دائرية فيها أيقونة المشهد (orb): لمعة جانبية وحد ذهبي رفيع وتوهّج حولها */
export function Orb({ m, size, icon, glow = true, style }: { m: Pick<SceneModel, "icon" | "emoji">; size: number; icon?: number; glow?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {glow ? <Blob w={size * 1.9} h={size * 1.9} res={4} stops={halo(C.gold, 0.3)} style={{ left: -size * 0.45, top: -size * 0.45 }} /> : null}
      <Blob w={size} h={size} res={2} fx={0.38} fy={0.32} stops={[[0, C.gold3, 0.36], [0.7, C.gold, 0.07], [0.98, C.gold, 0.04], [1, C.gold, 0]]} style={{ left: 0, top: 0 }} />
      <View style={{ position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: 1.2, borderColor: alpha(C.gold, 0.42) }} />
      <SceneMark m={m} size={icon ?? Math.round(size * 0.5)} color={C.gold} />
    </View>
  );
}

// ===== التخطيط =====

/** قطعة في عمود: نص بحجم أساسي base يُصغَّر بنسبة واحدة مع البقية حتى min، أو ارتفاع ثابت fixed */
export type Piece = { text?: string; w?: number; base?: number; min?: number; lh?: number; max?: number; fixed?: number; extra?: number };
export type StackPlan = { s: number; sizes: number[]; lines: number[]; heights: number[]; total: number; fits: boolean };

/**
 * أكبر نسبة تصغير (١ → ‎.3) يتسع بها العمود كله في H دون أن يحتاج نص أسطرًا فوق حده max.
 * إن لم يتسع شيء: آخر محاولة (أصغر الأحجام) — ويكمل التصغير التلقائي في Text.
 */
export function planStack(pieces: Piece[], H: number, gap: number, k = 1): StackPlan {
  let last: StackPlan | null = null;
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    const sizes = pieces.map((p) => (p.base ? Math.max(p.min ?? 16, p.base * k * s) : 0));
    let over = false;
    const lines = pieces.map((p, i) => {
      if (p.fixed !== undefined || !p.base) return 0;
      const l = linesFor(p.text ?? "", p.w ?? 1136, sizes[i]);
      if (l > (p.max ?? 3)) over = true;
      return Math.min(p.max ?? 3, l);
    });
    const heights = pieces.map((p, i) => (p.fixed !== undefined ? p.fixed : p.base ? lines[i] * sizes[i] * (p.lh ?? LINE_H) + (p.extra ?? 0) : 0));
    const shown = heights.filter((h) => h > 0).length;
    const total = heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, shown - 1);
    last = { s, sizes, lines, heights, total, fits: !over && total <= H };
    if (last.fits) return last;
  }
  return last as StackPlan;
}

/** أسطر نص بعرض وخط معيّنين، بحد أعلى */
export const linesOf = (text: string, w: number, size: number, max = 99) => Math.min(max, linesFor(text, w, size));

/**
 * إزاحة يسرى تحمي مربع الزاوية العليا اليسرى (زر ملء الشاشة) لعنصر يبدأ عند y=top:
 * إن كان المربع أطول من top فلا يبدأ المحتوى قبل حافته + ٢٤ (هامش التكبير البطيء)، وإلا الهامش العادي base.
 */
export function leftInset(ctx: SlideCtx, top: number, base: number): number {
  const c = ctx.safe.corner;
  return c > top ? Math.max(base, c + 24) : base;
}

/** هامشان متساويان لعنصر متمركز يبدأ عند top (يحمي مربع الزاوية من الجهتين فيبقى التمركز) */
export function sideInset(ctx: SlideCtx, top: number, base: number): number {
  return leftInset(ctx, top, base);
}

/**
 * صفوف بطاقات/نقاط في cols أعمدة (ترتيب الصفوف): أكبر خط بين base وmin تتسع به كل الصفوف في h،
 * وارتفاع الصف = أطول خلية فيه (بحد أدنى minH). textW = عرض نص الخلية.
 */
export function fitRows(
  texts: string[],
  o: { textW: number; h: number; cols: number; gap: number; minH: number; padY: number; maxLines: number; lh?: number },
  base: number,
  min: number
): { size: number; fits: boolean; total: number } {
  const lh = o.lh ?? LINE_H;
  const measure = (size: number) => {
    let total = 0;
    let over = false;
    const rows = Math.ceil(texts.length / o.cols);
    for (let r = 0; r < rows; r++) {
      let rowH = o.minH;
      for (const t of texts.slice(r * o.cols, r * o.cols + o.cols)) {
        const l = linesFor(t, o.textW, size);
        if (l > o.maxLines) over = true;
        rowH = Math.max(rowH, Math.min(l, o.maxLines) * size * lh + 2 * o.padY);
      }
      total += rowH;
    }
    total += o.gap * Math.max(0, rows - 1);
    return { total, over };
  };
  const hi = Math.max(base, min);
  for (let size = hi; size >= min; size -= 1) {
    const m = measure(size);
    if (!m.over && m.total <= o.h) return { size, fits: true, total: m.total };
  }
  return { size: min, fits: false, total: measure(min).total };
}

/** حبوب نصية في صفوف متمركزة (محطات الافتتاح، حقائق الرقم): عدد الصفوف وارتفاعها، والحبة الأعرض من W تُكسر سطرين */
export function packPills(texts: string[], W: number, size: number, padX: number, gap: number, padY = 9): { rows: number; h: number; ok: boolean; lines: number[] } {
  const lh = size * LINE_H;
  const widths = texts.map((t) => t.length * CHAR_EM * size * 1.08 + padX * 2 + 4);
  const lines = widths.map((w) => (w > W ? Math.ceil(w / W) : 1));
  const ok = lines.every((l) => l <= 2);
  let rows = 0;
  let x = 0;
  let h = 0;
  let rowH = 0;
  for (let i = 0; i < texts.length; i++) {
    const w = Math.min(W, widths[i]);
    const ph = Math.min(2, lines[i]) * lh + padY * 2;
    if (rows === 0 || x + gap + w > W) {
      if (rows) h += rowH + gap * 0.6;
      rows++;
      x = w;
      rowH = ph;
    } else {
      x += gap + w;
      rowH = Math.max(rowH, ph);
    }
  }
  h += rowH;
  return { rows, h: texts.length ? h : 0, ok, lines };
}
