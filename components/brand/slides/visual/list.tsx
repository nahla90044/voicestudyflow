// components/brand/slides/visual/list.tsx
// قوالب النقاط في الشكل البصري:
// - list: نقاط كالخرز على خيط ذهبي يمتلئ، لكل نقطة أيقونة نوعها ولونه، والتي يقرؤها الراوي تتوهّج ثم تهدأ؛
//   وبجانبها «عدسة» تكبّر نوع النقطة الحالية ثم تتحول إلى نقاط ملوّنة عند الاكتمال. الطول الزائد → عرض كامل أو عمودان.
// - steps: طريق متعرّج يُرسم خطه الذهبي وعلامة تسير عليه من محطة إلى محطة؛ إن طالت الخطوات → قائمة مرقّمة.
// - cards/groups: بطاقات تنقلب واحدة تلو الأخرى (الوجه: الرأس، والظهر: الشرح كاملًا)، وللمجموعات عدّاد دائري.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { Path } from "react-native-svg";

import type { Item } from "../../../../lib/slideThemeCore";
import { useLoop, useSpan, useTrigger, type SlideCtx } from "../shared";
import {
  alpha,
  Content,
  CountUp,
  CW,
  dg,
  fit,
  fitSize,
  frameOf,
  gridH,
  Head,
  headPlan,
  ItemLine,
  itemKind,
  KIND,
  LH_KUFI,
  LINE_H,
  LoSvg,
  mix,
  nLines,
  Pill,
  pillW,
  Rise,
  sceneAcc,
  tx,
  usePop,
  useRise,
  useWindow,
  V,
  type Frame,
  type VKind,
} from "./kit";

// ===== list =====

type ListPlan = { mode: "lens" | "full" | "grid"; cols: 1 | 2; size: number; lines: number[]; rowW: number; pill: boolean; pillW: number; bead: number; gap: number; rowsH: number };

function listPlan(ctx: SlideCtx, f: Frame, items: Item[], kinds: (VKind | null)[], bodyH: number, numbered: boolean): ListPlan {
  const n = items.length;
  const labels = kinds.map((kd) => (kd ? ctx.t(KIND[kd].label) : ""));
  const maxPill = Math.max(0, ...labels.map((l) => (l ? pillW(l) : 0)));
  const tryMode = (mode: ListPlan["mode"], minLines = 3): ListPlan | null => {
    const cols = mode === "grid" ? 2 : 1;
    const rowW = mode === "lens" ? 770 : mode === "full" ? CW : (CW - 18) / 2;
    const pill = mode !== "grid" && maxPill > 0 && !numbered;
    const gap = cols === 2 ? 12 : 8;
    for (let s = Math.round(27 * f.k); s >= 15; s--) {
      const bead = Math.round(46 * Math.min(1, Math.max(0.7, s / 27)));
      const tw = rowW - 26 - bead - 18 - (pill ? maxPill + 18 : 0);
      const ls = items.map((it) => Math.max(1, nLines(it.text, tw, s)));
      if (ls.some((l) => l > minLines)) continue;
      const hs = ls.map((l) => Math.max(bead + 10, l * Math.round(s * LINE_H) + 10));
      const rowsH = gridH(hs, cols, gap);
      if (rowsH <= bodyH) return { mode, cols, size: s, lines: ls, rowW, pill, pillW: maxPill, bead, gap, rowsH };
    }
    return null;
  };
  const lens = !ctx.compact && n >= 2 && n <= 6 ? tryMode("lens") : null;
  if (lens && lens.size >= Math.round(24 * f.k)) return lens;
  const full = tryMode("full");
  const grid = n >= 3 ? tryMode("grid") : null;
  if (full && (!grid || full.size >= grid.size - 1)) return full;
  if (grid) return grid;
  if (lens) return lens;
  // آخر احتياط: عمودان بأصغر خط وبلا حد للأسطر (لا يُخفى شيء)
  return tryMode("grid", 99) ?? tryMode("full", 99) ?? { mode: "full", cols: 1, size: 15, lines: items.map(() => 3), rowW: CW, pill: false, pillW: 0, bead: 32, gap: 8, rowsH: bodyH };
}

/** نقاط المشهد: الخيط والخرز والعدسة. numbered: الخطوات (أرقام بدل أيقونات النوع) */
export function ListScene({ ctx, numbered = false }: { ctx: SlideCtx; numbered?: boolean }) {
  const f = frameOf(ctx);
  const { m } = ctx;
  const items = m.items;
  const n = items.length;
  const kinds = items.map((it) => (numbered ? null : itemKind(it)));
  const head = headPlan(ctx, f);
  const bodyH = f.H - head.h - 16;
  if (!n) return <EmptyBody ctx={ctx} f={f} head={head} bodyH={bodyH} />;
  const plan = listPlan(ctx, f, items, kinds, bodyH, numbered);
  const step = 0.8 / Math.max(1, n);
  const end = (i: number) => items[i + 1]?.at ?? Math.min(0.92, items[i].at + step);
  const lensH = Math.min(400, bodyH);
  const blockH = plan.mode === "lens" ? Math.max(plan.rowsH, Math.min(lensH, bodyH)) : plan.rowsH;
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} />
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 26, height: blockH }}>
        <View style={{ width: plan.mode === "lens" ? plan.rowW : CW }}>
          {plan.cols === 1 && n > 1 ? <Rail ctx={ctx} plan={plan} from={items[0].at} to={items[n - 1].at} /> : null}
          <View style={plan.cols === 2 ? { flexDirection: ctx.row, flexWrap: "wrap", columnGap: 18, rowGap: plan.gap } : { gap: plan.gap }}>
            {items.map((it, i) => (
              <Row key={i} ctx={ctx} it={it} i={i} plan={plan} kind={kinds[i]} a={it.at} b={end(i)} numbered={numbered} />
            ))}
          </View>
        </View>
        {plan.mode === "lens" ? <Lens ctx={ctx} items={items} kinds={kinds} end={end} H={lensH} /> : null}
      </View>
    </Content>
  );
}

/** مشهد بلا نقاط: العبارة البارزة (إن وُجدت) في بطاقة */
function EmptyBody({ ctx, f, head, bodyH }: { ctx: SlideCtx; f: Frame; head: ReturnType<typeof headPlan>; bodyH: number }) {
  const text = ctx.m.highlight ?? "";
  const size = text ? fitSize([text], CW - 80, 4, Math.round(40 * f.k), 20) : 0;
  const lines = text ? Math.min(4, nLines(text, CW - 80, size)) : 0;
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} />
      {text ? (
        <Rise sv={ctx.sv} at={0.12} style={{ maxHeight: bodyH, padding: 30, borderRadius: 30, backgroundColor: V.card, borderWidth: 1.5, borderColor: alpha(sceneAcc(ctx.m), 0.4) }}>
          <Text style={tx(ctx, "plex600", size, V.ink, 1.5)} {...fit(lines)}>
            {text}
          </Text>
        </Rise>
      ) : null}
    </Content>
  );
}

/** الخيط الذهبي خلف الخرز: يمتلئ من الأعلى مع تقدّم الراوي */
function Rail({ ctx, plan, from, to }: { ctx: SlideCtx; plan: ListPlan; from: number; to: number }) {
  const fill = useSpan(ctx.sv, from, Math.max(from + 0.05, to));
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: fill.value }] }));
  // الحشوة على جهة الخرزة ١٠ في الاتجاهين
  const x = 10 + plan.bead / 2 - 2;
  const half = (plan.bead + 10) / 2;
  return (
    <View style={[{ position: "absolute", top: half, bottom: half, width: 4, borderRadius: 4, backgroundColor: alpha(V.ink, 0.09) }, ctx.isRTL ? { right: x } : { left: x }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 4, overflow: "hidden", transformOrigin: "top" }, a]}>
        <LinearGradient colors={[V.brand, alpha(V.brand, 0.35)]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function Row({ ctx, it, i, plan, kind, a, b, numbered }: { ctx: SlideCtx; it: Item; i: number; plan: ListPlan; kind: VKind | null; a: number; b: number; numbered: boolean }) {
  const color = kind ? KIND[kind].color : V.brand;
  const rise = useRise(ctx.sv, it.at);
  const pop = usePop(ctx.sv, it.at);
  const h = useWindow(ctx.sv, a, b);
  const past = useWindow(ctx.sv, b, 0.88);
  const glow = useAnimatedStyle(() => ({ opacity: h.value }));
  const ring = useAnimatedStyle(() => ({ opacity: h.value, transform: [{ scale: 0.8 + 0.2 * h.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - 0.4 * past.value }));
  const bead = plan.bead;
  return (
    <Animated.View style={[{ width: plan.cols === 2 ? plan.rowW : undefined, minHeight: bead + 10, justifyContent: "center" }, rise]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 18, backgroundColor: alpha(color, 0.13), borderWidth: 1.5, borderColor: alpha(color, 0.48) }, glow]} />
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 18, paddingVertical: 5, paddingRight: ctx.isRTL ? 10 : 16, paddingLeft: ctx.isRTL ? 16 : 10 }}>
        <View style={{ width: bead, height: bead }}>
          <Animated.View style={[{ position: "absolute", left: -9, top: -9, right: -9, bottom: -9, borderRadius: 999, backgroundColor: alpha(color, 0.22) }, ring]} />
          <Animated.View
            style={[
              { width: bead, height: bead, borderRadius: bead / 2, backgroundColor: mix(color, V.bgB, 0.2), borderWidth: 2, borderColor: color, alignItems: "center", justifyContent: "center" },
              pop,
            ]}
          >
            {kind && !numbered ? (
              <Ionicons name={KIND[kind].icon} size={Math.round(bead * 0.5)} color={color} />
            ) : (
              <Text style={tx(ctx, "kufi700", Math.round(bead * 0.46), color, 1.2, "center")} {...fit(1)}>
                {dg(ctx, i + 1)}
              </Text>
            )}
          </Animated.View>
        </View>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, dim]}>
          <ItemLine ctx={ctx} it={it} size={plan.size} lines={plan.lines[i]} color={color} />
        </Animated.View>
        {plan.pill && kind ? <Pill ctx={ctx} label={ctx.t(KIND[kind].label)} color={color} /> : null}
      </View>
    </Animated.View>
  );
}

/** العدسة: تكبّر نوع النقطة التي يقرؤها الراوي، وعند الاكتمال تتحول إلى نقاط ملوّنة */
function Lens({ ctx, items, kinds, end, H }: { ctx: SlideCtx; items: Item[]; kinds: (VKind | null)[]; end: (i: number) => number; H: number }) {
  const ring = Math.max(160, Math.min(300, H - 40));
  const disk = Math.round((170 * ring) / 300);
  const spin = useLoop(30000, { reverse: false, easing: Easing.linear });
  const spinA = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const lastEnd = end(items.length - 1);
  return (
    <View style={{ flex: 1, height: H, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: ring, height: ring, borderRadius: ring / 2, borderWidth: 2, borderStyle: "dashed", borderColor: alpha(V.brand, 0.35) }, spinA]}>
        <View style={{ position: "absolute", top: -7, left: ring / 2 - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: V.brand, boxShadow: `0 0 14px ${V.brand}` }} />
      </Animated.View>
      {items.map((it, i) => (
        <LensLayer key={i} ctx={ctx} i={i} n={items.length} kind={kinds[i]} a={it.at} b={end(i)} disk={disk} />
      ))}
      <LensDone ctx={ctx} kinds={kinds} a={Math.max(0.86, lastEnd)} disk={disk} />
    </View>
  );
}

function LensLayer({ ctx, i, n, kind, a, b, disk }: { ctx: SlideCtx; i: number; n: number; kind: VKind | null; a: number; b: number; disk: number }) {
  const h = useWindow(ctx.sv, a, b, 360);
  const st = useAnimatedStyle(() => ({ opacity: h.value, transform: [{ scale: 0.86 + 0.14 * h.value }] }));
  const color = kind ? KIND[kind].color : V.brand;
  const point = ctx.t("video.s.pointOf", { i: dg(ctx, i + 1), n: dg(ctx, n) });
  return (
    <Animated.View style={[{ position: "absolute", alignItems: "center", gap: 10 }, st]}>
      <View
        style={{
          width: disk,
          height: disk,
          borderRadius: disk / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: mix(color, V.bgB, 0.24),
          borderWidth: 3,
          borderColor: color,
          boxShadow: `0 0 50px -6px ${alpha(color, 0.6)}`,
        }}
      >
        {kind ? (
          <Ionicons name={KIND[kind].icon} size={Math.round(disk * 0.5)} color={color} />
        ) : (
          <Text style={tx(ctx, "kufi700", Math.round(disk * 0.45), color, 1.2, "center")} {...fit(1)}>
            {dg(ctx, i + 1)}
          </Text>
        )}
      </View>
      <Text style={[tx(ctx, "kufi700", 32, color, LH_KUFI, "center"), { maxWidth: 320 }]} {...fit(1)}>
        {kind ? ctx.t(KIND[kind].label) : point}
      </Text>
      {kind ? (
        <Text style={[tx(ctx, "plex500", 18, V.dim, 1.3, "center"), { maxWidth: 320 }]} {...fit(1)}>
          {point}
        </Text>
      ) : null}
    </Animated.View>
  );
}

function LensDone({ ctx, kinds, a, disk }: { ctx: SlideCtx; kinds: (VKind | null)[]; a: number; disk: number }) {
  const h = useWindow(ctx.sv, a, 2, 420);
  const st = useAnimatedStyle(() => ({ opacity: h.value, transform: [{ scale: 0.86 + 0.14 * h.value }] }));
  const dot = kinds.length > 4 ? 30 : 36;
  return (
    <Animated.View style={[{ position: "absolute", alignItems: "center", gap: 10 }, st]}>
      <View style={{ width: disk, height: disk, flexDirection: ctx.row, flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 10 }}>
        {kinds.map((kd, i) => {
          const c = kd ? KIND[kd].color : V.brand;
          return <View key={i} style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c, boxShadow: `0 0 16px ${alpha(c, 0.6)}` }} />;
        })}
      </View>
      <Text style={tx(ctx, "kufi700", 32, V.brand, LH_KUFI, "center")} {...fit(1)}>
        {dg(ctx, kinds.length)}
      </Text>
      <Text style={tx(ctx, "plex500", 18, V.dim, 1.3, "center")} {...fit(1)}>
        {ctx.t("video.s.kind.points")}
      </Text>
    </Animated.View>
  );
}

// ===== steps: الطريق =====

type Pt = { x: number; y: number };
type RoadPlan = {
  H: number;
  stations: Pt[];
  d: string;
  fr: number[];
  xs: number[];
  ys: number[];
  /** موضع كل محطة من طول الطريق (٠..١) */
  sf: number[];
  cardW: number;
  hs: number;
  bs: number;
  avail: number;
};

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function roadPlan(ctx: SlideCtx, f: Frame, items: Item[], bodyH: number): RoadPlan | null {
  const n = items.length;
  if (ctx.compact || n < 2 || n > 6) return null;
  const H = Math.min(392, bodyH);
  if (H < 300) return null;
  const lowY = Math.round(H * 0.668);
  const highY = Math.round(H * 0.311);
  const mx = (x: number) => (ctx.isRTL ? x : CW - x);
  const x0 = CW - 126;
  const x1 = 124;
  const sp = (x0 - x1) / (n - 1);
  const stations: Pt[] = items.map((_, i) => ({ x: mx(x0 - i * sp), y: i % 2 ? highY : lowY }));
  // المقاطع: بداية مستقيمة، ثم منحنيات بين المحطات، ثم نهاية مستقيمة (كما في النموذج)
  const segs: [Pt, Pt, Pt, Pt][] = [];
  const start = { x: mx(CW - 26), y: stations[0].y };
  const line = (a: Pt, b: Pt): [Pt, Pt, Pt, Pt] => [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 }, b];
  segs.push(line(start, stations[0]));
  for (let i = 0; i + 1 < n; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const k = (b.x - a.x) * 0.4545;
    segs.push([a, { x: a.x + k, y: a.y }, { x: b.x - k, y: b.y }, b]);
  }
  const last = stations[n - 1];
  segs.push(line(last, { x: mx(40), y: last.y }));
  let d = `M${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
  for (const [, c1, c2, p] of segs) d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  // عيّنات بطول القوس: العلامة تسير بسرعة ثابتة على الطريق
  const xs: number[] = [start.x];
  const ys: number[] = [start.y];
  const acc: number[] = [0];
  const sAt: number[] = [];
  let L = 0;
  segs.forEach((s, si) => {
    const steps = si === 0 || si === segs.length - 1 ? 4 : 18;
    let prev = s[0];
    for (let j = 1; j <= steps; j++) {
      const p = cubic(s[0], s[1], s[2], s[3], j / steps);
      L += Math.hypot(p.x - prev.x, p.y - prev.y);
      xs.push(p.x);
      ys.push(p.y);
      acc.push(L);
      prev = p;
    }
    if (si < n) sAt.push(L);
  });
  const fr = acc.map((v) => v / (L || 1));
  const sf = sAt.map((v) => v / (L || 1));
  // البطاقات: عالية فوق محطتها، ومنخفضة تحتها، وتتناوب فلا تتجاور على المستوى نفسه
  const cardW = Math.round(Math.min(300, n <= 2 ? 300 : 2 * sp - 24));
  const avail = Math.min(highY - 27 - 10, H - lowY - 27 - 10);
  const tw = cardW - 28;
  for (let hs = Math.round(25 * f.k); hs >= 19; hs--) {
    const bs = Math.max(15, Math.round(hs * 0.7));
    const ok = items.every((it) => {
      const h = it.head
        ? Math.min(2, nLines(it.head, tw, hs)) * Math.round(hs * LH_KUFI) + (it.body ? 4 + nLines(it.body, tw, bs) * Math.round(bs * 1.4) : 0) + 18
        : nLines(it.text, tw, bs + 2) * Math.round((bs + 2) * 1.4) + 18;
      const lines = it.head ? nLines(it.head, tw, hs) <= 2 && (!it.body || nLines(it.body, tw, bs) <= 3) : nLines(it.text, tw, bs + 2) <= 3;
      return lines && h <= avail;
    });
    if (ok) return { H, stations, d, fr, xs, ys, sf, cardW, hs, bs, avail };
  }
  return null;
}

/** الخطوات: الطريق إن اتسع، وإلا قائمة مرقّمة بالخيط الذهبي */
export function StepsScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const head = headPlan(ctx, f);
  const plan = roadPlan(ctx, f, ctx.m.items, f.H - head.h - 16);
  if (!plan) return <ListScene ctx={ctx} numbered />;
  return <Road ctx={ctx} f={f} head={head} plan={plan} />;
}

function Road({ ctx, f, head, plan }: { ctx: SlideCtx; f: Frame; head: ReturnType<typeof headPlan>; plan: RoadPlan }) {
  const items = ctx.m.items;
  const n = items.length;
  // التقدّم على الطريق: العلامة تصل كل محطة عند عتبة نقطتها، وتنتقل بينها قبيل ذلك
  const inR: number[] = [0, Math.max(0.01, items[0].at)];
  const outR: number[] = [0, plan.sf[0]];
  for (let i = 1; i < n; i++) {
    inR.push(Math.max(inR[inR.length - 1] + 0.005, items[i].at - 0.06), items[i].at);
    outR.push(plan.sf[i - 1], plan.sf[i]);
  }
  const lastAt = items[n - 1].at;
  inR.push(Math.min(0.97, lastAt + 0.04), Math.min(0.995, lastAt + 0.1));
  outR.push(plan.sf[n - 1], 1);
  const prog = useDerivedValue(() => interpolate(ctx.sv.value, inR, outR, Extrapolation.CLAMP));
  const tokX = useDerivedValue(() => interpolate(prog.value, plan.fr, plan.xs, Extrapolation.CLAMP));
  const tokY = useDerivedValue(() => interpolate(prog.value, plan.fr, plan.ys, Extrapolation.CLAMP));
  const show = useTrigger(ctx.sv, 0.02, 400);
  const tok = useAnimatedStyle(() => ({ opacity: show.value, transform: [{ translateX: tokX.value - 37 }, { translateY: tokY.value - 37 }] }));
  // الخط الذهبي يُكشف حتى موضع العلامة (الطريق يتقدّم أفقيًا باتجاه القراءة)
  const rtl = ctx.isRTL;
  const clipO = useAnimatedStyle(() => ({ transform: [{ translateX: rtl ? tokX.value : tokX.value - CW }] }));
  const clipI = useAnimatedStyle(() => ({ transform: [{ translateX: rtl ? -tokX.value : CW - tokX.value }] }));
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} />
      <View style={{ width: CW, height: plan.H }}>
        <LoSvg w={CW} h={plan.H} style={StyleSheet.absoluteFill}>
          <Path d={plan.d} stroke={alpha(V.ink, 0.07)} strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d={plan.d} stroke={alpha(V.ink, 0.22)} strokeWidth={2.5} strokeDasharray="10 14" fill="none" />
        </LoSvg>
        <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, clipO]}>
          <Animated.View style={[StyleSheet.absoluteFill, clipI]}>
            <LoSvg w={CW} h={plan.H}>
              <Path d={plan.d} stroke={alpha(V.brand, 0.25)} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path d={plan.d} stroke={V.brand} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </LoSvg>
          </Animated.View>
        </Animated.View>
        {items.map((it, i) => (
          <Station key={i} ctx={ctx} it={it} i={i} plan={plan} a={it.at} b={items[i + 1]?.at ?? Math.min(0.92, it.at + 0.12)} />
        ))}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: 74,
              height: 74,
              borderRadius: 37,
              borderWidth: 4,
              borderColor: V.brand,
              boxShadow: `0 0 26px ${alpha(V.brand, 0.7)}`,
              backgroundColor: alpha(V.brand, 0.08),
            },
            tok,
          ]}
        >
          <View style={{ position: "absolute", top: -9, left: 30, width: 14, height: 14, borderRadius: 7, backgroundColor: V.brand, boxShadow: `0 0 12px ${V.brand}` }} />
        </Animated.View>
      </View>
    </Content>
  );
}

function Station({ ctx, it, i, plan, a, b }: { ctx: SlideCtx; it: Item; i: number; plan: RoadPlan; a: number; b: number }) {
  const p = plan.stations[i];
  const high = i % 2 === 1;
  const pop = usePop(ctx.sv, a);
  const reached = useTrigger(ctx.sv, a, 400);
  const h = useWindow(ctx.sv, a, b);
  const rise = useRise(ctx.sv, a + 0.01, high ? -20 : 20);
  const on = V.brand;
  const off = alpha(V.brand, 0.35);
  const ringA = useAnimatedStyle(() => ({ borderColor: reached.value > 0.5 ? on : off }));
  const halo = useAnimatedStyle(() => ({ opacity: h.value, transform: [{ scale: 1 + 0.18 * h.value }] }));
  const glow = useAnimatedStyle(() => ({ opacity: h.value }));
  const left = Math.max(0, Math.min(CW - plan.cardW, p.x - plan.cardW / 2));
  const cardStyle = high ? { bottom: plan.H - (p.y - 27 - 10) } : { top: p.y + 27 + 10 };
  const tw = plan.cardW - 28;
  return (
    <>
      <Animated.View style={[{ position: "absolute", left, width: plan.cardW, maxHeight: plan.avail }, cardStyle, rise]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 20, backgroundColor: alpha(V.brand, 0.1), borderWidth: 1.5, borderColor: alpha(V.brand, 0.74) }, glow]} />
        <View style={{ borderRadius: 20, borderWidth: 1.5, borderColor: alpha(V.brand, 0.14), backgroundColor: alpha(V.card, 0.92), paddingHorizontal: 14, paddingVertical: 9, gap: 4 }}>
          {it.head ? (
            <>
              <Text style={tx(ctx, "kufi700", plan.hs, V.ink, LH_KUFI)} {...fit(Math.min(2, nLines(it.head, tw, plan.hs)))}>
                {it.head}
              </Text>
              {it.body ? (
                <Text style={tx(ctx, "plex500", plan.bs, V.dim, 1.4)} {...fit(nLines(it.body, tw, plan.bs))}>
                  {it.body}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={tx(ctx, "plex600", plan.bs + 2, V.ink, 1.4)} {...fit(nLines(it.text, tw, plan.bs + 2))}>
              {it.text}
            </Text>
          )}
        </View>
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: p.x - 27 - 10, top: p.y - 27 - 10, width: 74, height: 74, borderRadius: 37, backgroundColor: alpha(V.brand, 0.22) }, halo]} />
      <Animated.View
        style={[
          { position: "absolute", left: p.x - 27, top: p.y - 27, width: 54, height: 54, borderRadius: 27, backgroundColor: V.bgB, borderWidth: 3, alignItems: "center", justifyContent: "center" },
          ringA,
          pop,
        ]}
      >
        <Text style={tx(ctx, "kufi700", 23, V.brand, 1.2, "center")} {...fit(1)}>
          {dg(ctx, i + 1)}
        </Text>
      </Animated.View>
    </>
  );
}

// ===== cards / groups: بطاقات تنقلب =====

type CardsPlan = { cols: number; cardW: number; cardH: number; fs: number; hs: number; bs: number; gic: number; frontLines: number[]; headLines: number[]; bodyLines: number[] };

function cardsPlan(f: Frame, items: Item[], bodyH: number): CardsPlan {
  const n = Math.max(1, items.length);
  const cols = n <= 4 ? n : 3;
  const rows = Math.ceil(n / cols);
  const cardW = (CW - (cols - 1) * 22) / cols;
  const maxH = Math.max(140, Math.min(n <= 4 ? 340 : 999, (bodyH - (rows - 1) * 18) / rows));
  let cardH = maxH;
  const tw = cardW - 40;
  const fronts = items.map(frontText);
  // الظهر: الرأس (سطران) ثم الشرح كاملًا
  let hs = 16;
  let bs = 14;
  let headLines = items.map(() => 0);
  let bodyLines = items.map(() => 1);
  for (let s = Math.round(21 * f.k); s >= 14; s--) {
    const h2 = Math.max(16, Math.round(s * 1.14));
    const hl = items.map((it) => (it.head ? Math.min(2, nLines(it.head, tw, h2)) : 0));
    const bl = items.map((it) => Math.max(1, nLines(it.head ? it.body || it.head : it.text, tw, s)));
    const ok = items.every((it, i) => 40 + (hl[i] ? hl[i] * Math.round(h2 * LH_KUFI) + 12 : 0) + bl[i] * Math.round(s * LINE_H) <= cardH);
    hs = h2;
    bs = s;
    headLines = hl;
    bodyLines = bl;
    if (ok) break;
  }
  // الوجه: رقم + دائرة الأيقونة + الرأس + علامة القلب
  let gic = Math.round(Math.max(48, Math.min(108, cardH * 0.32)));
  let fs = fitSize(fronts, tw, 3, Math.round(28 * f.k), 17);
  const frontH = (s: number) => 40 + 28 + 10 + gic + 10 + Math.max(0, ...fronts.map((t) => (t ? Math.min(3, nLines(t, tw, s)) : 0))) * Math.round(s * LH_KUFI) + 30;
  while (fs > 17 && frontH(fs) > cardH) fs--;
  while (gic > 40 && frontH(fs) > cardH) gic -= 6;
  // الارتفاع بقدر أطول الوجهين (حدّ أدنى ٢٣٠ ليبقى شكل البطاقة)
  const backH = Math.max(...items.map((it, i) => 40 + (headLines[i] ? headLines[i] * Math.round(hs * LH_KUFI) + 12 : 0) + bodyLines[i] * Math.round(bs * LINE_H)));
  cardH = Math.min(maxH, Math.max(Math.min(230, maxH), frontH(fs), backH + 10));
  const frontLines = fronts.map((t) => (t ? Math.min(3, nLines(t, tw, fs)) : 0));
  return { cols, cardW, cardH, fs, hs, bs, gic, frontLines, headLines, bodyLines };
}

/** نص الوجه: الرأس، أو النص كله إن قصر */
const frontText = (it: Item) => it.head || (it.text.length <= 40 ? it.text : "");

export function CardsScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const { m } = ctx;
  const items = m.items;
  const groups = m.template === "groups" && !!m.count;
  const head = headPlan(ctx, f, { sideW: groups ? 128 : 94 });
  const bodyH = f.H - head.h - 16;
  const plan = cardsPlan(f, items, bodyH);
  const acc = sceneAcc(m);
  const n = items.length;
  const rise = (i: number) => 0.02 + i * 0.035;
  const flip = (i: number) => Math.max(items[i].at, rise(i) + 0.08);
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} side={groups ? <CountDial ctx={ctx} color={acc} /> : undefined} />
      <View style={{ flexDirection: ctx.row, flexWrap: "wrap", columnGap: 22, rowGap: 18 }}>
        {items.map((it, i) => (
          <FlipCard key={i} ctx={ctx} it={it} i={i} plan={plan} color={acc} rise={rise(i)} flip={flip(i)} until={i + 1 < n ? flip(i + 1) - 0.02 : 0.92} />
        ))}
      </View>
    </Content>
  );
}

const GROUP_ICON = ["layers-outline", "albums-outline", "grid-outline", "library-outline", "bookmark-outline", "reader-outline"] as const;

function FlipCard({ ctx, it, i, plan, color, rise, flip, until }: { ctx: SlideCtx; it: Item; i: number; plan: CardsPlan; color: string; rise: number; flip: number; until: number }) {
  const up = useRise(ctx.sv, rise);
  const fq = useTrigger(ctx.sv, flip, 760, Easing.inOut(Easing.cubic));
  const h = useWindow(ctx.sv, flip - 0.02, until);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -12 * h.value }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${fq.value * 180}deg` }] }));
  const back = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${fq.value * 180 - 180}deg` }] }));
  const shadow = useAnimatedStyle(() => ({ opacity: h.value }));
  const ft = frontText(it);
  const face = { ...StyleSheet.absoluteFillObject, borderRadius: 26, backfaceVisibility: "hidden" as const, paddingHorizontal: 20, paddingVertical: 20 };
  return (
    <Animated.View style={[{ width: plan.cardW, height: plan.cardH }, up]}>
      <Animated.View style={[StyleSheet.absoluteFill, lift]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 26, boxShadow: "0 26px 40px -24px rgba(0,0,0,0.9)" }, shadow]} />
        <Animated.View style={[face, { backgroundColor: mix(color, V.card, 0.1), borderWidth: 1.5, borderColor: alpha(color, 0.34), alignItems: "center", justifyContent: "center", gap: 10 }, front]}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, backgroundColor: alpha(color, 0.13) }}>
            <Text style={tx(ctx, "kufi700", 18, color, 1.2, "center")} {...fit(1)}>
              {dg(ctx, i + 1)}
            </Text>
          </View>
          <View style={{ width: plan.gic, height: plan.gic, borderRadius: plan.gic / 2, alignItems: "center", justifyContent: "center", backgroundColor: alpha(color, 0.13), borderWidth: 2, borderStyle: "dashed", borderColor: alpha(color, 0.45) }}>
            <Ionicons name={GROUP_ICON[i % GROUP_ICON.length]} size={Math.round(plan.gic * 0.55)} color={color} />
          </View>
          {ft ? (
            <Text style={tx(ctx, "kufi700", plan.fs, V.ink, LH_KUFI, "center")} {...fit(plan.frontLines[i])}>
              {ft}
            </Text>
          ) : null}
          <Ionicons name="sync-outline" size={20} color={alpha(V.dim, 0.7)} />
        </Animated.View>
        <Animated.View style={[face, { borderWidth: 2, borderColor: color, gap: 10 }, back]}>
          <LinearGradient colors={[mix(color, V.card, 0.28), mix(color, V.card, 0.09)]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
          {it.head ? (
            <View style={{ borderBottomWidth: 1.5, borderStyle: "dashed", borderColor: alpha(color, 0.45), paddingBottom: 8 }}>
              <Text style={tx(ctx, "kufi700", plan.hs, color, LH_KUFI)} {...fit(plan.headLines[i] || 1)}>
                {it.head}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: ctx.row, gap: 8, alignItems: "flex-start" }}>
            <Ionicons name="checkmark" size={Math.round(plan.bs * 0.95)} color={color} style={{ marginTop: Math.round(plan.bs * 0.25) }} />
            <Text style={[tx(ctx, "plex500", plan.bs, V.ink), { flex: 1 }]} {...fit(plan.bodyLines[i])}>
              {it.head ? it.body || it.head : it.text}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** عدّاد المجموعات: نقاط بعدد المجموعات تُضاء حول دائرة، والعدد يُعدّ في وسطها */
function CountDial({ ctx, color }: { ctx: SlideCtx; color: string }) {
  const count = Math.max(1, Math.min(12, ctx.m.count ?? 1));
  const pop = usePop(ctx.sv, 0.05);
  const fill = useSpan(ctx.sv, 0.06, 0.06 + Math.max(0.06, count * 0.012));
  const label = (ctx.m.highlight ?? "").replace(/^[\s\d٠-٩]+/, "").trim();
  const R = 54;
  return (
    <Animated.View style={[{ width: 128, height: 128 }, pop]}>
      {Array.from({ length: count }, (_, j) => {
        const th = -Math.PI / 2 + (j * 2 * Math.PI) / count;
        const x = 64 + R * Math.cos(th);
        const y = 64 + R * Math.sin(th);
        return <DialDot key={j} fill={fill} j={j} count={count} x={x} y={y} color={color} />;
      })}
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <CountUp ctx={ctx} sv={ctx.sv} at={0.06} to={count} ms={1100} style={tx(ctx, "kufi700", 46, color, 1.1, "center")} />
        {label ? (
          <Text style={[tx(ctx, "plex600", 15, V.dim, 1.2, "center"), { maxWidth: 84 }]} {...fit(1)}>
            {label}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function DialDot({ fill, j, count, x, y, color }: { fill: ReturnType<typeof useSpan>; j: number; count: number; x: number; y: number; color: string }) {
  const a = useAnimatedStyle(() => {
    const e = Math.min(1, Math.max(0, fill.value * count - j));
    return { opacity: e, transform: [{ scale: 0.6 + 0.4 * e }] };
  });
  const r = count > 9 ? 5.2 : 6.5;
  return (
    <View style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2 }}>
      <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: r, backgroundColor: alpha(V.ink, 0.14) }} />
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: color }, a]} />
    </View>
  );
}
