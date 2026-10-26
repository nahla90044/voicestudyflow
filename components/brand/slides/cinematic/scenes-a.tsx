// components/brand/slides/cinematic/scenes-a.tsx
// مشاهد السينمائي (١): ترويسة المشهد المشتركة، والافتتاح «بوابة الضوء»، والنقاط والخطوات «عدسة التركيز»،
// والبطاقات، والمجموعات «مجرّات الشروط». المحتوى من ctx.m وحده، والأحجام مقدّرة مسبقًا (لا قص ولا تداخل)،
// والمحتوى المقروء بين y=٨٤ وy=٦٠٠، ومربع الزاوية العليا اليسرى خالٍ.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { fitFont, kindOf, linesFor, normText, toLocalDigits, type Item } from "../../../../lib/slideThemeCore";
import { useLoop, useSpan, useTrigger, type SlideCtx } from "../shared";
import { alpha, Appear, Blob, C, EIO, EO, fitRows, halo, leftInset, LensFlare, linesOf, Orb, packPills, sideInset, ts, Tx, Words } from "./kit";

type GlyphName = keyof typeof Ionicons.glyphMap;

// ===== الترويسة المشتركة =====

/** شارة الدور (سؤال ختامي / تمرين من الكتاب) فوق العنوان */
export function roleBadge(ctx: SlideCtx): { label: string; icon: GlyphName } | null {
  const { m, t } = ctx;
  if (m.role === "finalQ") return { label: t("video.s.finalQ"), icon: "school-outline" };
  if (m.role === "finalEx") return { label: t("video.s.exercise"), icon: "document-text-outline" };
  return null;
}

export type HeadPlan = { top: number; L: number; R: number; size: number; lines: number; h: number; orb: number; badge: ReturnType<typeof roleBadge> };

/** مقاس الترويسة: هالة ٦٦ + (شارة) + عنوان Kufi حتى سطرين، وملحق بعرض extraW في الطرف الآخر */
export function headPlan(ctx: SlideCtx, top: number, o: { side?: number; base?: number; min?: number; extraW?: number } = {}): HeadPlan {
  const k = ctx.compact ? 1.12 : 1;
  const side = o.side ?? 96;
  const L = leftInset(ctx, top, side);
  const R = side;
  const orb = Math.round(66 * k);
  const w = 1280 - L - R - orb - 20 - (o.extraW ? o.extraW + 20 : 0);
  const title = ctx.m.title;
  const size = title ? fitFont([title], { w, h: 1e4, maxLines: 2 }, (o.base ?? 54) * k, o.min ?? 30) : 0;
  const lines = title ? linesOf(title, w, size, 2) : 0;
  const badge = roleBadge(ctx);
  const h = Math.max(orb, lines * size * 1.5 + (badge ? 40 : 0));
  return { top, L, R, size, lines, h, orb, badge };
}

export function BadgePill({ ctx, label, icon, color = C.gold }: { ctx: SlideCtx; label: string; icon: GlyphName; color?: string }) {
  const k = ctx.compact ? 1.12 : 1;
  return (
    <View style={[styles.badge, { flexDirection: ctx.row, borderColor: alpha(color, 0.45), backgroundColor: alpha(color, 0.08), alignSelf: ctx.isRTL ? "flex-end" : "flex-start" }]}>
      <Ionicons name={icon} size={22 * k} color={color} />
      <Tx style={ts(ctx.ff, "kufi600", 22 * k, color, 1.4)}>{label}</Tx>
    </View>
  );
}

/** الترويسة: تصعد عند ‎.03، والعنوان كلمةً كلمة، والكلمة المفتاحية تتوهج عند kwAt */
export function HeadRow({ ctx, plan, extra, kwAt, at = 0.03 }: { ctx: SlideCtx; plan: HeadPlan; extra?: React.ReactNode; kwAt?: number; at?: number }) {
  const { m, ff, sv } = ctx;
  return (
    <Appear sv={sv} at={at} kind="up" style={{ position: "absolute", top: plan.top, left: plan.L, right: plan.R, minHeight: plan.h, flexDirection: ctx.row, alignItems: "center", gap: 20 }}>
      <Orb m={m} size={plan.orb} icon={plan.orb * 0.52} />
      <View style={{ flex: 1, gap: 6 }}>
        {plan.badge ? <BadgePill ctx={ctx} label={plan.badge.label} icon={plan.badge.icon} /> : null}
        {m.title ? (
          <Words
            text={m.title}
            sv={sv}
            from={at}
            to={at + 0.08}
            lines={2}
            color={C.ivory}
            style={ts(ff, "kufi600", plan.size, C.ivory, 1.32, ctx.align)}
            keyword={kwAt !== undefined ? m.keyword : undefined}
            kwAt={kwAt}
          />
        ) : null}
      </View>
      {extra}
    </Appear>
  );
}

// ===== الافتتاح: بوابة الضوء =====

/** الهالة الكبيرة: توهّج يتنفس، ومدار متقطع يدور ١٦ ث بقمر صغير، وأيقونة المشهد */
function BigOrb({ ctx, size }: { ctx: SlideCtx; size: number }) {
  const breathe = useLoop(4500);
  const spin = useLoop(16000, { reverse: false, enabled: !ctx.compact });
  const b = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * breathe.value, transform: [{ scale: 0.94 + 0.12 * breathe.value }] }));
  const r = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const ring = size * 1.21;
  return (
    <Appear sv={ctx.sv} at={0.03} kind="pop" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", left: -size * 0.31, top: -size * 0.31, width: size * 1.62, height: size * 1.62 }, b]}>
        <Blob w={size * 1.62} h={size * 1.62} res={6} stops={halo(C.gold, 0.32)} style={{ left: 0, top: 0 }} />
      </Animated.View>
      <Blob w={size} h={size} res={3} fx={0.4} fy={0.34} stops={[[0, C.gold3, 0.38], [0.62, C.gold, 0.08], [0.72, C.gold, 0.02], [1, C.gold, 0]]} style={{ left: 0, top: 0 }} />
      {ctx.compact ? null : (
        <Animated.View style={[{ position: "absolute", left: (size - ring) / 2, top: (size - ring) / 2, width: ring, height: ring }, r]}>
          <Svg width={ring} height={ring} viewBox="0 0 200 200">
            <Circle cx={100} cy={100} r={94} fill="none" stroke={alpha(C.gold, 0.5)} strokeWidth={1.4} strokeDasharray="2 7" />
            <Circle cx={100} cy={6} r={5} fill={C.gold3} />
          </Svg>
        </Animated.View>
      )}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <OrbIcon ctx={ctx} size={size * 0.47} />
      </View>
    </Appear>
  );
}

function OrbIcon({ ctx, size }: { ctx: SlideCtx; size: number }) {
  const name = (ctx.m.icon in Ionicons.glyphMap ? ctx.m.icon : "sparkles-outline") as GlyphName;
  return <Ionicons name={name} size={size} color={C.gold} />;
}

/** العنوان ينكشف من جهة القراءة كأن ستارًا يُزاح (قناع منزلق)، وتعبره ومضة عدسة */
function MaskTitle({ ctx, text, size, lines, W, at = 0.11 }: { ctx: SlideCtx; text: string; size: number; lines: number; W: number; at?: number }) {
  const v = useTrigger(ctx.sv, at, 760, EIO);
  const dir = ctx.isRTL ? 1 : -1;
  const outer = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - v.value) * W * dir }] }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - v.value) * W * dir }] }));
  const h = lines * size * 1.5;
  return (
    <View style={{ width: W, alignItems: "center" }}>
      <Animated.View style={[{ width: W, overflow: "hidden", paddingVertical: 10, marginVertical: -10 }, outer]}>
        <Animated.View style={inner}>
          <Tx lines={Math.max(1, lines)} style={[ts(ctx.ff, "kufi700", size, C.gold, 1.24, "center"), styles.goldGlow]}>
            {text}
          </Tx>
        </Animated.View>
      </Animated.View>
      <LensFlare sv={ctx.sv} at={at + 0.04} w={Math.min(1100, W)} style={{ left: (W - Math.min(1100, W)) / 2, top: h * 0.54 - 8 }} />
    </View>
  );
}

/** محطة على خط المسار (حبة ذهبية الحد) */
function Stop({ ctx, text, at, size, lines, W }: { ctx: SlideCtx; text: string; at: number; size: number; lines: number; W: number }) {
  return (
    <Appear sv={ctx.sv} at={at} kind="pop" style={[styles.stop, { maxWidth: W }]}>
      <Tx lines={lines} style={ts(ctx.ff, "plex500", size, C.gold, 1.45, "center")}>
        {text}
      </Tx>
    </Appear>
  );
}

export function CoverScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const S = sideInset(ctx, 84, 72);
  const W = 1280 - 2 * S;
  const sub = m.highlight ?? "";
  const kicker = ctx.unitTitle && normText(ctx.unitTitle) !== normText(m.title) ? `${t("video.s.brand")} · ${ctx.unitTitle}` : t("video.s.brand");
  const texts = m.items.map((it) => it.text);
  const H = 516;
  // أكبر نسبة يتسع بها العمود كله (هالة، تمهيد، عنوان، سطر فرعي، محطات)
  let p = { orb: 150, kick: 24, ttl: 138, tl: 1, sub: 40, sl: 0, pill: 26, route: packPills(texts, W, 26, 26, 24), total: 0 };
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    const orb = (ctx.compact ? 112 : 150) * Math.max(0.62, s);
    const kick = Math.max(16, 24 * k * s);
    const ttl = Math.max(50, 138 * k * s);
    const subS = Math.max(20, 40 * k * s);
    const pill = Math.max(16, 26 * k * s);
    const tl = m.title ? linesFor(m.title, W - 52, ttl) : 0;
    const sl = sub ? linesFor(sub, W, subS) : 0;
    const route = packPills(texts, W, pill, 26, 24);
    const total = orb + 18 + kick * 1.5 + (tl ? 6 + tl * ttl * 1.5 : 0) + (sl ? 8 + sl * subS * 1.5 : 0) + (texts.length ? 34 + route.h : 0);
    p = { orb, kick, ttl, tl, sub: subS, sl, pill, route, total };
    if (tl <= 2 && sl <= 2 && route.ok && total <= H) break;
  }
  const top = 84 + Math.max(0, (H - p.total) / 2);
  const n = texts.length;
  // المحطات بعد العنوان والسطر الفرعي (من ‎.34 بفاصل ثابت)، والخط يُمد قبلها
  const stopAt = (i: number) => Math.min(0.9, 0.34 + i * Math.min(0.08, 0.5 / Math.max(1, n)));
  const single = p.route.rows <= 1;
  return (
    <View style={[StyleSheet.absoluteFill, { paddingTop: top, paddingHorizontal: S, alignItems: "center" }]}>
      <BigOrb ctx={ctx} size={p.orb} />
      <Appear sv={sv} at={0.08} kind="fade" style={{ flexDirection: ctx.row, alignItems: "center", gap: 16, marginTop: 18, maxWidth: W }}>
        {/* الخطان يشتدّان نحو النص: الأول في جهة البداية */}
        <LinearGradient colors={ctx.isRTL ? [C.gold2, alpha(C.gold2, 0)] : [alpha(C.gold2, 0), C.gold2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.kickLine} />
        <View style={{ flexShrink: 1 }}>
          <Tx style={ts(ff, "plex500", p.kick, C.mist, 1.5, "center")}>{kicker}</Tx>
        </View>
        <LinearGradient colors={ctx.isRTL ? [alpha(C.gold2, 0), C.gold2] : [C.gold2, alpha(C.gold2, 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.kickLine} />
      </Appear>
      {m.title ? (
        <View style={{ marginTop: 6 }}>
          <MaskTitle ctx={ctx} text={m.title} size={p.ttl} lines={Math.min(3, Math.max(1, p.tl))} W={W} />
        </View>
      ) : null}
      {sub ? (
        <View style={{ marginTop: 8, width: W }}>
          <Words text={sub} sv={sv} from={0.18} to={0.31} lines={Math.min(3, Math.max(1, p.sl))} color={C.ivory} style={ts(ff, "plex500", p.sub, C.ivory, 1.5, "center")} />
        </View>
      ) : null}
      {n ? (
        <View style={single ? { marginTop: 34, alignSelf: "center" } : { marginTop: 34, width: W }}>
          {single && n > 1 ? <RouteLine ctx={ctx} a={stopAt(0) - 0.02} b={stopAt(n - 1)} /> : null}
          <View style={{ flexDirection: ctx.row, flexWrap: "wrap", justifyContent: "center", columnGap: single ? 54 : 24, rowGap: 14 }}>
            {m.items.map((it, i) => (
              <Stop key={i} ctx={ctx} text={it.text} at={stopAt(i)} size={p.pill} lines={Math.min(2, p.route.lines[i] ?? 1)} W={W} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** خط المسار الذهبي بين المحطات يُمد من جهة القراءة */
function RouteLine({ ctx, a, b }: { ctx: SlideCtx; a: number; b: number }) {
  const f = useSpan(ctx.sv, a, b);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: f.value }] }));
  return (
    <Animated.View style={[styles.routeLine, { transformOrigin: ctx.isRTL ? "right" : "left" }, st]}>
      <LinearGradient colors={ctx.isRTL ? [C.gold2, C.gold] : [C.gold, C.gold2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

// ===== النقاط والخطوات: عدسة التركيز =====

type Box = { x: number; y: number; w: number; h: number };

/** كل الصفوف مقيسة (المصفوفة قد تكون فيها ثغرات قبل اكتمال القياس) */
function allBoxes(boxes: Box[], n: number): boolean {
  if (boxes.length < n) return false;
  for (let i = 0; i < n; i++) if (!boxes[i]) return false;
  return true;
}

/** فهرس النقطة التي تُقرأ الآن (‎−1 قبل أولها) */
function activeIndex(sv: SharedValue<number>, ats: number[]) {
  "worklet";
  let a = -1;
  for (let i = 0; i < ats.length; i++) if (sv.value >= ats[i]) a = i;
  return a;
}

/** «النقطة i من n» تتبدل مع الراوي (وعند الإيقاف عدد النقاط ونوعها) */
function PointPill({ ctx, ats }: { ctx: SlideCtx; ats: number[] }) {
  const { sv, ff, t, lang } = ctx;
  const n = ats.length;
  const [a, setA] = useState(-1);
  useAnimatedReaction(
    () => activeIndex(sv, ats),
    (cur, prev) => {
      if (cur !== prev) scheduleOnRN(setA, cur);
    },
    [ats]
  );
  const k = ctx.compact ? 1.12 : 1;
  const label = ctx.playing && a >= 0 ? t("video.s.pointOf", { i: toLocalDigits(a + 1, lang), n: toLocalDigits(n, lang) }) : `${toLocalDigits(n, lang)} · ${t(`video.s.kind.${kindOf(ctx.m)}`)}`;
  return (
    <View style={styles.cnt}>
      <Tx style={ts(ff, "plex500", 22 * k, C.mist, 1.4, "center")}>{label}</Tx>
    </View>
  );
}

/** شريط الضوء: ينزلق إلى الصف الذي يُقرأ (مواضع الصفوف مقيسة)، ويختفي عند الإيقاف */
function Band({ ctx, ats, boxes }: { ctx: SlideCtx; ats: number[]; boxes: Box[] }) {
  const sv = ctx.sv;
  const ready = allBoxes(boxes, ats.length);
  const y = useSharedValue(0);
  const x = useSharedValue(0);
  const h = useSharedValue(68);
  const op = useSharedValue(0);
  useAnimatedReaction(
    () => (ready ? activeIndex(sv, ats) : -1),
    (a, prev) => {
      if (a === prev) return;
      if (a < 0) {
        op.value = withTiming(0, { duration: 220 });
        return;
      }
      const b = boxes[a];
      const jump = prev === null || prev === undefined || prev < 0;
      y.value = jump ? b.y : withTiming(b.y, { duration: 420, easing: EIO });
      x.value = jump ? b.x : withTiming(b.x, { duration: 420, easing: EIO });
      h.value = jump ? b.h : withTiming(b.h, { duration: 420, easing: EIO });
      op.value = withTiming(1, { duration: 300 });
    },
    [ats, boxes, ready]
  );
  const w = boxes[0]?.w ?? 0;
  const st = useAnimatedStyle(() => ({ opacity: op.value, height: h.value, transform: [{ translateX: x.value }, { translateY: y.value }] }));
  if (!ready || !ctx.playing) return null;
  return (
    <Animated.View style={[{ position: "absolute", left: -32, top: 0, width: w + 64, borderRadius: 20, overflow: "hidden" }, st]}>
      <LinearGradient
        colors={[alpha(C.gold, 0.22), alpha(C.gold, 0.06), alpha(C.gold, 0)]}
        locations={[0, 0.45, 0.85]}
        start={{ x: ctx.isRTL ? 1 : 0, y: 0 }}
        end={{ x: ctx.isRTL ? 0 : 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.bandEdge, ctx.isRTL ? { right: 0 } : { left: 0 }]} />
    </Animated.View>
  );
}

/** المسار الجانبي: يمتلئ ذهبًا بقدر ما قُرئ (عمود واحد فقط) */
function Rail({ ctx, ats, boxes, medal }: { ctx: SlideCtx; ats: number[]; boxes: Box[]; medal: number }) {
  const sv = ctx.sv;
  const n = ats.length;
  const fill = useSharedValue(ctx.playing ? 0 : 1);
  useAnimatedReaction(
    () => activeIndex(sv, ats),
    (a, prev) => {
      if (a === prev) return;
      const to = n <= 1 ? 1 : Math.max(0, a) / (n - 1);
      fill.value = withTiming(to, { duration: 480, easing: EO });
    },
    [ats, n]
  );
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: fill.value }] }));
  if (n < 2 || !allBoxes(boxes, n)) return null;
  const y0 = boxes[0].y + boxes[0].h / 2;
  const y1 = boxes[n - 1].y + boxes[n - 1].h / 2;
  const cx = ctx.isRTL ? boxes[0].x + boxes[0].w - 4 - medal / 2 : boxes[0].x + 4 + medal / 2;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: cx - 1, top: y0, width: 2, height: Math.max(0, y1 - y0), backgroundColor: alpha(C.gold, 0.12) }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: "top" }, st]}>
        <LinearGradient colors={[C.gold, C.gold2]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/** رقم النقطة في دائرة (Kufi ذهبي على ليل) */
function Medal({ ctx, n, size }: { ctx: SlideCtx; n: number; size: number }) {
  return (
    <View style={[styles.medal, { width: size, height: size, borderRadius: size / 2 }]}>
      <Tx style={ts(ctx.ff, "kufi600", size * 0.48, C.gold, 1.3, "center")}>{toLocalDigits(n, ctx.lang)}</Tx>
    </View>
  );
}

/** صف نقطة: يصعد لحظة نطقها، والنص كلمةً كلمة، ويخفت إلى ‎.46 حين تبدأ التالية (أثناء التشغيل فقط) */
function ListRow({
  ctx,
  it,
  i,
  nextAt,
  size,
  lines,
  medal,
  width,
  onBox,
}: {
  ctx: SlideCtx;
  it: Item;
  i: number;
  nextAt: number;
  size: number;
  lines: number;
  medal: number;
  width: number;
  onBox: (i: number, b: Box) => void;
}) {
  const { sv, ff } = ctx;
  const show = useTrigger(sv, it.at, 620, EO);
  const past = useTrigger(sv, nextAt, 380, EIO);
  const dim = ctx.playing && nextAt <= 1 ? 1 : 0;
  const a = useAnimatedStyle(
    () => ({
      opacity: Math.min(1, show.value) * (1 - 0.54 * past.value * dim),
      transform: [{ translateY: (1 - Math.min(1, show.value)) * 22 }, { scale: 1 - 0.015 * past.value * dim }],
    }),
    [dim]
  );
  const onLayout = (e: LayoutChangeEvent) => {
    const l = e.nativeEvent.layout;
    onBox(i, { x: l.x, y: l.y, w: l.width, h: l.height });
  };
  const to = Math.min(nextAt, it.at + 0.18) - 0.01;
  return (
    <Animated.View onLayout={onLayout} style={[{ width, flexDirection: ctx.row, alignItems: "center", gap: 22, minHeight: medal + 12, paddingVertical: 6, paddingHorizontal: 4 }, a]}>
      <Medal ctx={ctx} n={i + 1} size={medal} />
      <View style={{ flex: 1 }}>
        <Words
          text={it.head ? it.body : it.text}
          head={it.head ? `${it.head}:` : undefined}
          headStyle={ff("plex600")}
          headColor={C.gold}
          sv={sv}
          from={it.at}
          to={Math.max(it.at + 0.02, to)}
          lines={lines}
          color={C.ivory}
          style={ts(ff, "plex500", size, C.ivory, 1.45, ctx.align)}
        />
      </View>
    </Animated.View>
  );
}

/** صفوف بمواضع مقيسة (للشريط والمسار) */
function useBoxes(n: number): [Box[], (i: number, b: Box) => void] {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const onBox = (i: number, b: Box) =>
    setBoxes((prev) => {
      const o = prev[i];
      if (o && Math.abs(o.x - b.x) < 0.5 && Math.abs(o.y - b.y) < 0.5 && Math.abs(o.w - b.w) < 0.5 && Math.abs(o.h - b.h) < 0.5) return prev;
      const c = prev.slice(0, n);
      c[i] = b;
      return c;
    });
  return [boxes, onBox];
}

export function ListScene({ ctx }: { ctx: SlideCtx }) {
  const { m } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const head = headPlan(ctx, 96, { extraW: 230 });
  const n = m.items.length;
  const top = head.top + head.h + 26;
  const H = 600 - top;
  const medal = Math.round(56 * k);
  const W = 1280 - head.L - head.R;
  const texts = m.items.map((it) => it.text);
  const gap = n >= 6 ? 8 : 10;
  const minH = medal + 12;
  // عمود واحد أولًا (عدسة التركيز)، وعمودان إن صار الخط فيه أصغر من ٢٤ أو لم يتسع
  const tw1 = W - 8 - medal - 22;
  const r1 = fitRows(texts, { textW: tw1, h: H, cols: 1, gap, minH, padY: 6, maxLines: 3 }, (n >= 6 ? 27 : 31) * k, 18);
  let cols = 1;
  let size = r1.size;
  let lines = 3;
  if (!r1.fits || r1.size < 24 * k) {
    const cw = (W - 40) / 2;
    const r2 = fitRows(texts, { textW: cw - 8 - medal - 22, h: H, cols: 2, gap, minH, padY: 6, maxLines: 4 }, 27 * k, 16);
    if ((r2.fits && (!r1.fits || r2.size > r1.size)) || (!r1.fits && !r2.fits && r2.total < r1.total)) {
      cols = 2;
      size = r2.size;
      lines = 4;
    }
  }
  const width = cols === 1 ? W : (W - 40) / 2;
  const ats = m.items.map((it) => it.at);
  const [boxes, onBox] = useBoxes(n);
  return (
    <View style={StyleSheet.absoluteFill}>
      <HeadRow ctx={ctx} plan={head} extra={n ? <PointPill ctx={ctx} ats={ats} /> : null} />
      <View style={{ position: "absolute", top, left: head.L, right: head.R }}>
        <Band ctx={ctx} ats={ats} boxes={boxes} />
        {cols === 1 ? <Rail ctx={ctx} ats={ats} boxes={boxes} medal={medal} /> : null}
        <View style={{ flexDirection: ctx.row, flexWrap: "wrap", columnGap: 40, rowGap: gap }}>
          {m.items.map((it, i) => (
            <ListRow key={i} ctx={ctx} it={it} i={i} nextAt={i + 1 < n ? m.items[i + 1].at : 2} size={size} lines={lines} medal={medal} width={width} onBox={onBox} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ===== البطاقات والمجموعات =====

type CardPlan = { cols: number; rows: number; cw: number; ch: number; hs: number; bs: number; hl: number[]; bl: number[]; star: boolean };

/** شبكة بطاقات: حتى ٤ في صف، و٥–٦ صفّان من ٣؛ الرأس Kufi والشرح Plex بأحجام تتسع للبطاقة الأطول */
function planCards(items: Item[], W: number, H: number, k: number, compact: boolean): CardPlan {
  const n = Math.max(1, items.length);
  const cols = n <= 4 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gapX = 24;
  const gapY = 18;
  const cw = Math.min(n === 1 ? 640 : 420, (W - gapX * (cols - 1)) / cols);
  const chMax = Math.min(rows === 1 ? 330 : 260, (H - gapY * (rows - 1)) / rows);
  const tw = cw - 44;
  let best: CardPlan | null = null;
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    const hs = Math.max(18, 28 * k * s);
    const bs = Math.max(15, 22 * k * s);
    const hl = items.map((it) => (it.head ? linesOf(it.head, tw - 50, hs) : 0));
    const bl = items.map((it) => linesOf(it.head ? it.body : it.text, it.head ? tw : tw - 0, it.head ? bs : hs * 0.9));
    let need = 0;
    let over = false;
    items.forEach((it, i) => {
      const headH = Math.max(40, hl[i] * hs * 1.5);
      const bodyH = bl[i] * (it.head ? bs : hs * 0.9) * 1.45;
      if (hl[i] > 2 || bl[i] > 7) over = true;
      need = Math.max(need, 40 + headH + (it.head ? 8 + bodyH : 8 + bodyH));
    });
    const star = !compact && rows === 1 && chMax - need >= 128;
    best = { cols, rows, cw, ch: Math.min(chMax, Math.max(need + (star ? 124 : 0), rows === 1 ? 200 : 120)), hs, bs, hl, bl, star };
    if (!over && need <= chMax) break;
  }
  return best as CardPlan;
}

/** كوكبة صغيرة في البطاقة: مضلّع نجمي ونقاط مضيئة (ثابتة) */
function Constellation({ i }: { i: number }) {
  const sides = 4 + (i % 3);
  const pts = Array.from({ length: sides }, (_, j) => {
    const a = -Math.PI / 2 + (j * 2 * Math.PI) / sides;
    return [60 + 38 * Math.cos(a), 55 + 38 * Math.sin(a)];
  });
  const d = pts.map((p, j) => `${j ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
  return (
    <Svg width={124} height={112} viewBox="0 0 120 110">
      <Path d={d} stroke={alpha(C.violet, 0.55)} strokeWidth={1.6} fill="none" />
      {pts.map((p, j) => (
        <Circle key={j} cx={p[0]} cy={p[1]} r={j === 0 ? 4.2 : 3.2} fill="#FFF3D1" />
      ))}
      <Circle cx={60} cy={55} r={1.6} fill={alpha("#FFF3D1", 0.6)} />
    </Svg>
  );
}

/** بطاقة: رقم في دائرة + رأس (Kufi) + شرح — تضيء لحظة نطقها */
function Card({ ctx, it, i, at, plan }: { ctx: SlideCtx; it: Item; i: number; at: number; plan: CardPlan }) {
  const { ff } = ctx;
  const body = it.head ? it.body : it.text;
  return (
    <Appear sv={ctx.sv} at={at} kind="light" ms={700} style={[styles.card, { width: plan.cw, height: plan.ch }]}>
      <LinearGradient colors={["rgba(22,20,64,0.85)", "rgba(10,13,38,0.85)"]} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />
      {plan.star ? (
        <View style={{ alignItems: "center", marginBottom: 6 }}>
          <Constellation i={i} />
        </View>
      ) : null}
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 12, minHeight: 40 }}>
        <View style={styles.cardNum}>
          <Tx style={ts(ff, "kufi700", 21, C.onGold, 1.3, "center")}>{toLocalDigits(i + 1, ctx.lang)}</Tx>
        </View>
        {it.head ? (
          <View style={{ flex: 1 }}>
            <Tx lines={2} style={ts(ff, "kufi600", plan.hs, C.gold, 1.3, ctx.align)}>
              {it.head}
            </Tx>
          </View>
        ) : null}
      </View>
      {body ? (
        <View style={{ marginTop: 8 }}>
          <Tx lines={Math.max(1, plan.bl[i] ?? 3)} style={ts(ff, "plex500", it.head ? plan.bs : plan.hs * 0.9, it.head ? C.mist : C.ivory, 1.45, ctx.align)}>
            {body}
          </Tx>
        </View>
      ) : null}
    </Appear>
  );
}

function CardGrid({ ctx, items, top, L, R, ats }: { ctx: SlideCtx; items: Item[]; top: number; L: number; R: number; ats: number[] }) {
  const k = ctx.compact ? 1.12 : 1;
  const W = 1280 - L - R;
  const plan = planCards(items, W, 600 - top, k, ctx.compact);
  return (
    <View style={{ position: "absolute", top, left: L, right: R, flexDirection: ctx.row, flexWrap: "wrap", justifyContent: "center", columnGap: 24, rowGap: 18 }}>
      {items.map((it, i) => (
        <Card key={i} ctx={ctx} it={it} i={i} at={ats[i]} plan={plan} />
      ))}
    </View>
  );
}

export function CardsScene({ ctx }: { ctx: SlideCtx }) {
  const head = headPlan(ctx, 96);
  const top = head.top + head.h + 30;
  return (
    <View style={StyleSheet.absoluteFill}>
      <HeadRow ctx={ctx} plan={head} />
      <CardGrid ctx={ctx} items={ctx.m.items} top={top} L={head.L} R={head.R} ats={ctx.m.items.map((it) => it.at)} />
    </View>
  );
}

/** الرقم الكبير يُعلن العدد بقفزة، ثم يصغر إلى ‎.46 ويصعد فيصير عنوانًا، وتولد البطاقات تحته */
export function GroupsScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, sv } = ctx;
  if (!m.count) return <CardsScene ctx={ctx} />;
  const k = ctx.compact ? 1.12 : 1;
  const S = sideInset(ctx, 92, 96);
  const heroW = 1280 - 2 * S;
  const numTxt = toLocalDigits(m.count, ctx.lang);
  const numSize = 230 * k;
  const numW = numTxt.length * 0.62 * numSize + 20;
  const titleW = Math.max(200, heroW - numW - 26);
  const tSize = m.title ? fitFont([m.title], { w: titleW, h: 1e4, maxLines: 2 }, 48 * k, 26) : 0;
  const heroH = Math.max(numSize * 1.5, (m.title ? linesOf(m.title, titleW, tSize, 2) : 0) * tSize * 1.45);
  const FINAL = 0.46;
  const startTop = 186;
  const finalTop = 92;
  const dy = finalTop + (heroH * FINAL) / 2 - (startTop + heroH / 2);
  const cardsTop = finalTop + heroH * FINAL + 24;
  const shrinkAt = 0.2;
  const ats = m.items.map((it, i) => Math.min(0.92, Math.max(it.at, shrinkAt + 0.07 + i * 0.05)));
  return (
    <View style={StyleSheet.absoluteFill}>
      <GroupsHero ctx={ctx} top={startTop} S={S} h={heroH} dy={dy} scaleTo={FINAL} shrinkAt={shrinkAt}>
        <Tx style={[ts(ff, "kufi700", numSize, C.gold, 1.5, "center"), styles.goldGlow]}>{numTxt}</Tx>
        {m.title ? (
          <View style={{ maxWidth: titleW }}>
            <Words text={m.title} sv={sv} from={0.05} to={0.14} lines={2} color={C.ivory} style={ts(ff, "plex500", tSize, C.ivory, 1.4, ctx.align)} />
          </View>
        ) : null}
      </GroupsHero>
      <CardGrid ctx={ctx} items={m.items} top={cardsTop} L={S} R={S} ats={ats} />
    </View>
  );
}

function GroupsHero({ ctx, top, S, h, dy, scaleTo, shrinkAt, children }: { ctx: SlideCtx; top: number; S: number; h: number; dy: number; scaleTo: number; shrinkAt: number; children: React.ReactNode }) {
  const pop = useTrigger(ctx.sv, 0.03, 560, EO);
  const shrink = useTrigger(ctx.sv, shrinkAt, 700, EIO);
  const a = useAnimatedStyle(() => {
    const p = Math.min(1, pop.value);
    const s = interpolate(shrink.value, [0, 1], [1, scaleTo], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: dy * shrink.value }, { scale: (0.6 + 0.4 * p) * s }] };
  }, [dy, scaleTo]);
  return (
    <Animated.View style={[{ position: "absolute", top, left: S, right: S, height: h, flexDirection: ctx.row, alignItems: "center", justifyContent: "center", gap: 26 }, a]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 3, borderRadius: 20, borderWidth: 1.2 },
  goldGlow: { textShadowColor: "rgba(246,213,138,0.42)", textShadowRadius: 30, textShadowOffset: { width: 0, height: 0 } },
  kickLine: { width: 56, height: 1.5 },
  stop: { paddingHorizontal: 26, paddingVertical: 9, borderRadius: 30, backgroundColor: "rgba(10,14,40,0.92)", borderWidth: 1, borderColor: "rgba(246,213,138,0.4)" },
  routeLine: { position: "absolute", left: 50, right: 50, top: "50%", height: 2, marginTop: -1 },
  cnt: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", maxWidth: 230 },
  bandEdge: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: "rgba(246,213,138,0.85)" },
  medal: { backgroundColor: C.panel, borderWidth: 1.5, borderColor: "rgba(246,213,138,0.6)", alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 28, borderWidth: 1, borderColor: "rgba(169,155,255,0.3)", paddingHorizontal: 22, paddingVertical: 20, overflow: "visible" },
  cardNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
});
