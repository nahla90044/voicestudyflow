// components/brand/slides/visual/cover.tsx
// قوالب الافتتاح والخلاصة وتمهيد الأسئلة في الشكل البصري:
// - cover: وسام أيقونة المشهد «يهبط» بموجتين وشرر، والعنوان الذهبي يُكتب من جهة القراءة، ثم تُضاء أجزاء
//   الوحدة بألوانها التي سترافق الفيديو، موصولة بأسهم.
// - summary: تذاكر تُعلَّم بعلامة صح مع نطق كل فكرة، وحلقة من أجزاء ملوّنة تكتمل معها، ووميض نجمي عند الاكتمال.
// - qIntro («أسئلة الوحدة»): وسام يتأرجح، ومروحة بطاقات أسئلة تنقلب أولاها، وقصاصات تتساقط بهدوء.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useContext, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import type { Item } from "../../../../lib/slideThemeCore";
import { SlideMotion, useLoop, useTrigger, type SlideCtx } from "../shared";
import {
  AGENDA,
  alpha,
  Content,
  CW,
  dg,
  fit,
  fitSize,
  frameOf,
  Head,
  headPlan,
  itemKind,
  KIND,
  LH_KUFI,
  LoSvg,
  Medallion,
  mix,
  nLines,
  Pop,
  Rise,
  seeded,
  startOf,
  tx,
  usePop,
  useRise,
  useSvgId,
  useWindow,
  V,
  Wipe,
  type Frame,
  type Glyph,
} from "./kit";

// ===== cover =====

type CoverPlan = { art: number; textW: number; ts: number; tLines: number; ss: number; sLines: number; cs: number; chipLines: number[]; chipMax: number };

function chipWidth(text: string, cs: number, maxT: number) {
  return 42 + 31 + 11 + Math.min(maxT, Math.ceil(text.length * 0.52 * cs * 1.06));
}

function agendaH(items: Item[], cs: number, textW: number, maxT: number, lines: number[]): number {
  let rowW = 0;
  let rowH = 0;
  let total = 0;
  items.forEach((it, i) => {
    const w = chipWidth(it.text, cs, maxT) + (i ? 58 : 0);
    const h = Math.max(54, lines[i] * Math.round(cs * 1.3) + 18);
    if (rowW && rowW + w > textW) {
      total += rowH + 12;
      rowW = 0;
      rowH = 0;
    }
    rowW += w;
    rowH = Math.max(rowH, h);
  });
  return total + rowH;
}

function coverPlan(ctx: SlideCtx, f: Frame): CoverPlan {
  const { m } = ctx;
  const art = ctx.compact ? 300 : 440;
  const textW = CW - art - 20 - f.pad;
  const title = m.title || " ";
  const sub = m.highlight ?? "";
  const maxT = textW - 84 - 58;
  let plan: CoverPlan | null = null;
  for (let sc = 1; sc >= 0.4; sc -= 0.05) {
    const maxL = title.length > 40 ? 3 : 2;
    const ts = fitSize([title], textW, maxL, Math.round(172 * sc), 48);
    const tLines = Math.min(maxL, nLines(title, textW, ts));
    const ss = sub ? Math.max(22, Math.round(38 * f.k * sc)) : 0;
    const sLines = sub ? Math.min(3, nLines(sub, textW, ss)) : 0;
    const cs = Math.max(18, Math.round(24 * f.k * Math.max(sc, 0.75)));
    const chipLines = m.items.map((it) => Math.max(1, Math.min(2, nLines(it.text, maxT, cs))));
    const h = 42 + 14 + tLines * Math.round(ts * 1.25) + 22 + (sub ? 10 + sLines * Math.round(ss * 1.4) : 0) + (m.items.length ? 30 + agendaH(m.items, cs, textW, maxT, chipLines) : 0);
    plan = { art, textW, ts, tLines, ss, sLines, cs, chipLines, chipMax: maxT };
    if (h <= f.H) break;
  }
  return plan!;
}

export function CoverScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const { m } = ctx;
  const plan = coverPlan(ctx, f);
  const titleQ = useTrigger(ctx.sv, 0.07, 900);
  const items = m.items;
  const end = (i: number) => items[i + 1]?.at ?? Math.min(0.95, items[i].at + 0.13);
  return (
    <Content f={f}>
      <View style={{ flexDirection: ctx.row, alignItems: "center", justifyContent: "space-between", gap: 20, height: f.H, paddingLeft: f.pad }}>
        <View style={{ width: plan.textW, alignItems: startOf(ctx) }}>
          <Rise sv={ctx.sv} at={0.02} style={{ flexDirection: ctx.row, alignItems: "center", gap: 10, height: 42, paddingHorizontal: 18, borderRadius: 999, backgroundColor: alpha(V.brand, 0.14), borderWidth: 1.5, borderColor: alpha(V.brand, 0.4) }}>
            <Ionicons name="sparkles-outline" size={18} color={V.brand} />
            <Text style={tx(ctx, "plex600", 20, V.brand, 1.3)} {...fit(1)}>
              {ctx.t("video.s.brand")}
            </Text>
          </Rise>
          <Wipe q={titleQ} dir={ctx.isRTL ? "rtl" : "ltr"} style={{ marginTop: 14, alignSelf: plan.tLines > 1 ? "stretch" : startOf(ctx), maxWidth: "100%" }}>
            <Text style={tx(ctx, "kufi700", plan.ts, V.brand, 1.25, undefined, { textShadowColor: alpha(V.brand, 0.34), textShadowRadius: 40, textShadowOffset: { width: 0, height: 0 } })} {...fit(plan.tLines)}>
              {m.title}
            </Text>
          </Wipe>
          <CoverSquig ctx={ctx} />
          {m.highlight && plan.sLines ? (
            <Rise sv={ctx.sv} at={0.21} style={{ marginTop: 10, alignSelf: "stretch" }}>
              <Text style={tx(ctx, "plex500", plan.ss, V.ink, 1.4)} {...fit(plan.sLines)}>
                {m.highlight}
              </Text>
            </Rise>
          ) : null}
          {items.length ? (
            <View style={{ flexDirection: ctx.row, flexWrap: "wrap", alignItems: "center", rowGap: 12, marginTop: 30 }}>
              {items.map((it, i) => (
                <View key={i} style={{ flexDirection: ctx.row, alignItems: "center" }}>
                  {i ? <Arrow ctx={ctx} at={Math.max(0.05, it.at - 0.04)} /> : null}
                  <Chip ctx={ctx} it={it} i={i} plan={plan} b={end(i)} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Medallion ctx={ctx} size={plan.art} impact />
      </View>
    </Content>
  );
}

function CoverSquig({ ctx }: { ctx: SlideCtx }) {
  const q = useTrigger(ctx.sv, 0.17, 800);
  return (
    <Wipe q={q} dir={ctx.isRTL ? "rtl" : "ltr"} len={380} style={{ width: 380, height: 28, marginTop: -6, alignSelf: startOf(ctx) }}>
      <Svg width={380} height={28} viewBox="0 0 380 28" style={ctx.isRTL ? undefined : { transform: [{ scaleX: -1 }] }}>
        <Path d="M374 12 C 330 4, 290 6, 250 15 C 210 24, 150 26, 100 14 C 70 7, 30 6, 6 14" stroke={V.brand} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.9} />
      </Svg>
    </Wipe>
  );
}

function Arrow({ ctx, at }: { ctx: SlideCtx; at: number }) {
  const q = useTrigger(ctx.sv, at, 420);
  return (
    <Wipe q={q} dir={ctx.isRTL ? "rtl" : "ltr"} len={50} style={{ width: 50, height: 16, marginHorizontal: 4 }}>
      <Svg width={50} height={16} viewBox="0 0 50 16" style={ctx.isRTL ? undefined : { transform: [{ scaleX: -1 }] }}>
        <Path d="M46 8 H6" stroke={V.dim} strokeWidth={2.5} strokeLinecap="round" fill="none" />
        <Path d="M13 2.5 L5.5 8 L13 13.5" stroke={V.dim} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Wipe>
  );
}

function Chip({ ctx, it, i, plan, b }: { ctx: SlideCtx; it: Item; i: number; plan: CoverPlan; b: number }) {
  const color = AGENDA[i % AGENDA.length];
  const pop = usePop(ctx.sv, it.at);
  const h = useWindow(ctx.sv, it.at, b);
  const glow = useAnimatedStyle(() => ({ opacity: h.value }));
  return (
    <Animated.View style={[{ maxWidth: plan.textW }, pop]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 17, backgroundColor: alpha(color, 0.18), borderWidth: 1.5, borderColor: alpha(color, 0.9), boxShadow: `0 0 34px ${alpha(color, 0.5)}` }, glow]} />
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 11, minHeight: 54, paddingHorizontal: 20, paddingVertical: 6, borderRadius: 17, backgroundColor: mix(color, V.card, 0.08), borderWidth: 1.5, borderColor: alpha(color, 0.3) }}>
        <View style={{ width: 31, height: 31, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: color }}>
          <Text style={tx(ctx, "kufi700", 17, V.onBrand, 1.2, "center")} {...fit(1)}>
            {dg(ctx, i + 1)}
          </Text>
        </View>
        <Text style={[tx(ctx, "plex600", plan.cs, V.ink, 1.3), { flexShrink: 1, maxWidth: plan.chipMax }]} {...fit(plan.chipLines[i])}>
          {it.text}
        </Text>
      </View>
    </Animated.View>
  );
}

// ===== summary =====

type SumPlan = { ringW: number; leftW: number; head: ReturnType<typeof headPlan>; s: number; lines: number[]; tH: number[] };

function sumPlan(ctx: SlideCtx, f: Frame, items: Item[]): SumPlan {
  const ringW = ctx.compact ? 270 : 330;
  const leftW = CW - ringW - 40;
  const head = headPlan(ctx, f, { sideW: 0, w: leftW });
  const avail = f.H - head.h - 16;
  let best: SumPlan | null = null;
  for (let s = Math.round(25 * f.k); s >= 15; s--) {
    const tw = leftW - 14 - 40 - 16 - 16 - 74;
    const lines = items.map((it) => Math.max(1, nLines(it.text, tw, s)));
    const minH = Math.max(46, Math.round((62 * s) / 25));
    const tH = lines.map((l) => Math.max(minH, l * Math.round(s * 1.4) + 18));
    const total = tH.reduce((a, b) => a + b, 0) + 11 * Math.max(0, items.length - 1);
    best = { ringW, leftW, head, s, lines, tH };
    if (lines.every((l) => l <= 3) && total <= avail) break;
  }
  return best!;
}

/** عدد العتبات التي عبرها الراوي (قيمة React تتغير n مرات على الأكثر) */
function useStepCount(sv: SlideCtx["sv"], marks: number[]): number {
  const { playing } = useContext(SlideMotion);
  const [k, setK] = useState(playing ? 0 : marks.length);
  useAnimatedReaction(
    () => {
      let c = 0;
      for (let i = 0; i < marks.length; i++) if (sv.value >= marks[i]) c++;
      return c;
    },
    (cur, prev) => {
      if (cur !== prev) runOnJS(setK)(cur);
    },
    [marks.join(",")]
  );
  return k;
}

export function SummaryScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const items = ctx.m.items;
  const n = items.length;
  const plan = sumPlan(ctx, f, items);
  const step = 0.8 / Math.max(1, n);
  const check = items.map((it) => Math.min(0.9, it.at + step * 0.55));
  const colors = items.map((it, i) => {
    const kd = itemKind(it);
    return kd ? KIND[kd].color : AGENDA[i % AGENDA.length];
  });
  return (
    <Content f={f}>
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 40, height: f.H }}>
        <View style={{ width: plan.leftW, height: f.H }}>
          <Head ctx={ctx} f={f} plan={plan.head} noSticker />
          <View style={{ gap: 11 }}>
            {items.map((it, i) => (
              <Ticket key={i} ctx={ctx} it={it} s={plan.s} lines={plan.lines[i]} h={plan.tH[i]} color={colors[i]} rise={0.03 + i * 0.035} check={check[i]} until={check[i + 1] ?? 0.9} />
            ))}
          </View>
        </View>
        <SumRing ctx={ctx} w={plan.ringW} colors={colors} check={check} />
      </View>
    </Content>
  );
}

function Ticket({ ctx, it, s, lines, h, color, rise, check, until }: { ctx: SlideCtx; it: Item; s: number; lines: number; h: number; color: string; rise: number; check: number; until: number }) {
  const up = useRise(ctx.sv, rise);
  const ck = useTrigger(ctx.sv, check, 360);
  const hl = useWindow(ctx.sv, check - 0.04, until - 0.02);
  const boxA = useAnimatedStyle(() => ({ opacity: ck.value }));
  const glowA = useAnimatedStyle(() => ({ opacity: Math.max(hl.value, ck.value * 0.35) }));
  const kd = itemKind(it);
  const icon: Glyph = kd ? KIND[kd].icon : "bookmark-outline";
  return (
    <Animated.View style={[{ minHeight: h }, up]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 18, backgroundColor: alpha(color, 0.09), borderWidth: 1.5, borderColor: alpha(color, 0.76) }, glowA]} />
      <View style={{ flex: 1, flexDirection: ctx.row, alignItems: "center", gap: 16, borderRadius: 18, borderWidth: 1.5, borderColor: alpha(color, 0.16), backgroundColor: alpha(V.card, 0.9), overflow: "hidden", minHeight: h, [ctx.isRTL ? "paddingRight" : "paddingLeft"]: 14 }}>
        <View style={{ width: 40, height: 40 }}>
          <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 11, borderWidth: 2.5, borderColor: color }} />
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 11, backgroundColor: color }, boxA]} />
          <Wipe q={ck} dir="ltr" len={40} style={StyleSheet.absoluteFill}>
            <Svg width={40} height={40} viewBox="0 0 40 40">
              <Path d="M11.5 20.5l6 6L29 14" stroke={V.onBrand} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </Wipe>
        </View>
        <Text style={[tx(ctx, "plex500", s, V.ink, 1.4), { flex: 1 }]} {...fit(lines)}>
          {it.head ? <Text style={[{ color }, ctx.ff("plex600")]}>{it.head}: </Text> : null}
          {it.head ? it.body : it.text}
        </Text>
        <View style={{ alignSelf: "stretch", width: 74, alignItems: "center", justifyContent: "center", backgroundColor: alpha(color, 0.09), [ctx.isRTL ? "borderRightWidth" : "borderLeftWidth"]: 2, borderStyle: "dashed", borderColor: alpha(color, 0.35) }}>
          <Ionicons name={icon} size={26} color={color} />
        </View>
      </View>
    </Animated.View>
  );
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function SumRing({ ctx, w, colors, check }: { ctx: SlideCtx; w: number; colors: string[]; check: number[] }) {
  const n = Math.max(1, colors.length);
  const size = Math.min(300, w - 30);
  const seg = 360 / n;
  const gap = n > 1 ? 8 : 0;
  const arcs = colors.map((_, i) => arcPath(150, 150, 124, -90 + i * seg + gap / 2, -90 + (i + 1) * seg - gap / 2 - (n === 1 ? 0.01 : 0)));
  const k = useStepCount(ctx.sv, check);
  const done = useWindow(ctx.sv, 0.86, 2, 400);
  const pop = usePop(ctx.sv, 0.03);
  const l1 = useAnimatedStyle(() => ({ opacity: 1 - done.value }));
  const l2 = useAnimatedStyle(() => ({ opacity: done.value }));
  const glow = useAnimatedStyle(() => ({ opacity: done.value }));
  return (
    <View style={{ width: w, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Animated.View style={[{ width: size, height: size }, pop]}>
        <Animated.View style={[{ position: "absolute", left: size * 0.09, top: size * 0.09, width: size * 0.82, height: size * 0.82, borderRadius: size, boxShadow: `0 0 40px ${alpha(V.brand, 0.55)}` }, glow]} />
        <View style={{ position: "absolute", left: 0, top: 0, width: 300, height: 300, transform: [{ scale: size / 300 }], transformOrigin: "top left" }}>
          <LoSvg w={300} h={300} style={StyleSheet.absoluteFill}>
            {arcs.map((d, i) => (
              <Path key={i} d={d} stroke={alpha(V.ink, 0.1)} strokeWidth={20} strokeLinecap="round" fill="none" />
            ))}
          </LoSvg>
          {arcs.map((d, i) => (
            <Arc key={i} ctx={ctx} d={d} color={colors[i]} at={check[i]} />
          ))}
        </View>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <View style={{ flexDirection: ctx.row, alignItems: "baseline", gap: 6 }}>
            <Text style={tx(ctx, "kufi700", Math.round(size * 0.25), V.ink, 1.1, "center")} {...fit(1)}>
              {dg(ctx, k)}
            </Text>
            <Text style={tx(ctx, "kufi700", Math.round(size * 0.125), V.dim, 1.1, "center")} {...fit(1)}>
              {`/ ${dg(ctx, colors.length)}`}
            </Text>
          </View>
        </View>
        <Burst ctx={ctx} size={size} />
      </Animated.View>
      <View style={{ height: 30, width: w, alignItems: "center", justifyContent: "center" }}>
        <Animated.Text style={[tx(ctx, "plex600", 22, V.dim, 1.3, "center"), { position: "absolute", width: w }, l1]} {...fit(1)}>
          {ctx.t("video.s.summary")}
        </Animated.Text>
        <Animated.Text style={[tx(ctx, "plex600", 22, V.brand, 1.3, "center"), { position: "absolute", width: w }, l2]} {...fit(1)}>
          {`✦ ${ctx.t("video.s.summaryDone")} ✦`}
        </Animated.Text>
      </View>
    </View>
  );
}

function Arc({ ctx, d, color, at }: { ctx: SlideCtx; d: string; color: string; at: number }) {
  const q = useTrigger(ctx.sv, at, 520, Easing.out(Easing.back(1.4)));
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, q.value * 2), transform: [{ scale: 0.92 + 0.08 * q.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, a]}>
      <LoSvg w={300} h={300}>
        <Path d={d} stroke={color} strokeWidth={20} strokeLinecap="round" fill="none" />
      </LoSvg>
    </Animated.View>
  );
}

/** وميض نجمي عند اكتمال الخلاصة */
function Burst({ ctx, size }: { ctx: SlideCtx; size: number }) {
  const p = useTrigger(ctx.sv, 0.86, 1100, Easing.out(Easing.cubic));
  return (
    <View style={{ position: "absolute", left: size / 2, top: size / 2, width: 0, height: 0 }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Spark key={i} p={p} ang={i * 36} r0={size * 0.4} />
      ))}
    </View>
  );
}

function Spark({ p, ang, r0 }: { p: ReturnType<typeof useTrigger>; ang: number; r0: number }) {
  const a = useAnimatedStyle(() => {
    const v = p.value;
    return {
      opacity: v > 0 && v < 1 ? Math.min(1, v * 20) * (1 - v * 0.85) : 0,
      transform: [{ rotate: `${ang}deg` }, { translateY: -(r0 + 70 * v) }, { rotate: "45deg" }, { scale: 0.4 + 0.8 * Math.sin(v * Math.PI) }],
    };
  });
  return <Animated.View style={[{ position: "absolute", left: -7, top: -7, width: 14, height: 14, borderRadius: 2, backgroundColor: V.brand }, a]} />;
}

// ===== qIntro: «أسئلة الوحدة» =====

const QI_ICONS: Glyph[] = ["help-circle-outline", "time-outline", "checkmark-circle-outline", "bulb-outline", "school-outline"];

export function QIntroScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const { m } = ctx;
  const fanW = ctx.compact ? 360 : 440;
  const leftW = CW - fanW - 30 - f.pad;
  const ts = fitSize([m.title], leftW, 2, Math.round(66 * f.k), 34);
  const tLines = m.title ? Math.min(2, nLines(m.title, leftW, ts)) : 0;
  const sub = m.highlight ?? "";
  const ss = sub ? fitSize([sub], leftW, 3, Math.round(27 * f.k), 18) : 0;
  const sLines = sub ? Math.min(3, nLines(sub, leftW, ss)) : 0;
  const cs = Math.round(19 * f.k);
  const chipLines = m.items.map((it) => Math.min(2, nLines(it.text, leftW - 80, cs)));
  const titleQ = useTrigger(ctx.sv, 0.1, 800);
  return (
    <Content f={f}>
      <Confetti ctx={ctx} />
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 30, height: f.H, paddingLeft: f.pad }}>
        <View style={{ width: leftW, alignItems: startOf(ctx) }}>
          <Medal ctx={ctx} />
          {m.title ? (
            <Wipe q={titleQ} dir={ctx.isRTL ? "rtl" : "ltr"} style={{ alignSelf: tLines > 1 ? "stretch" : startOf(ctx), maxWidth: "100%" }}>
              <Text style={tx(ctx, "kufi700", ts, V.ink, LH_KUFI)} {...fit(tLines)}>
                {m.title}
              </Text>
            </Wipe>
          ) : null}
          {sub ? (
            <Rise sv={ctx.sv} at={0.2} style={{ marginTop: 8, alignSelf: "stretch" }}>
              <Text style={tx(ctx, "plex500", ss, V.dim, 1.6)} {...fit(sLines)}>
                {sub}
              </Text>
            </Rise>
          ) : null}
          {m.items.length ? (
            <View style={{ flexDirection: ctx.row, flexWrap: "wrap", gap: 10, marginTop: 24 }}>
              {m.items.map((it, i) => (
                <Rise key={i} sv={ctx.sv} at={Math.max(0.3, it.at)} style={{ flexDirection: ctx.row, alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: alpha(V.ink, 0.05), maxWidth: leftW }}>
                  <Ionicons name={QI_ICONS[i % QI_ICONS.length]} size={20} color={V.brand} />
                  <Text style={[tx(ctx, "plex500", cs, V.ink, 1.35), { flexShrink: 1 }]} {...fit(chipLines[i] || 1)}>
                    {it.text}
                  </Text>
                </Rise>
              ))}
            </View>
          ) : null}
        </View>
        <Fan ctx={ctx} w={fanW} />
      </View>
    </Content>
  );
}

function Medal({ ctx }: { ctx: SlideCtx }) {
  const pop = usePop(ctx.sv, 0.03);
  const swing = useLoop(4000);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${-4 + 8 * swing.value}deg` }] }));
  const id = useSvgId("md");
  return (
    <Animated.View style={[{ width: 118, height: 136, marginBottom: 6 }, pop]}>
      <Animated.View style={[{ width: 118, height: 136, transformOrigin: "top" }, a]}>
        <Svg width={118} height={136} viewBox="0 0 140 160">
          <Defs>
            <RadialGradient id={id} cx="35%" cy="30%" r="80%">
              <Stop offset="0" stopColor="#FFF1C9" />
              <Stop offset="0.55" stopColor="#F6D58A" />
              <Stop offset="1" stopColor="#C9973E" />
            </RadialGradient>
          </Defs>
          <Path d="M50 74 L30 150 L52 138 L64 158 L78 86Z" fill={V.cond} />
          <Path d="M90 74 L110 150 L88 138 L76 158 L62 86Z" fill={V.type} />
          <Circle cx={70} cy={62} r={54} fill={`url(#${id})`} />
          <Circle cx={70} cy={62} r={42} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={3} strokeDasharray="4 7" />
          <Path d="M70 33 l8.6 17.4 19.2 2.8 -13.9 13.5 3.3 19.1 -17.2 -9 -17.2 9 3.3 -19.1 -13.9 -13.5 19.2 -2.8z" fill="#fff" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** مروحة بطاقات الأسئلة: الوسطى تنقلب عند ٠٫٤٨ */
function Fan({ ctx, w }: { ctx: SlideCtx; w: number }) {
  const k = w / 440;
  const flip = useTrigger(ctx.sv, 0.48, 800, Easing.inOut(Easing.cubic));
  const fr = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${flip.value * 180}deg` }] }));
  const bk = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${flip.value * 180 - 180}deg` }] }));
  const q = ctx.t("video.s.kind.question");
  // البطاقتان الجانبيتان: الوسم على الحافة المكشوفة (لا تغطيه البطاقة الوسطى)
  const card = (tc: string, rot: number, dx: number, at: number, num: number) => (
    <View style={{ position: "absolute", left: 95, top: 58, width: 250, height: 310, transform: [{ translateX: dx }, { translateY: 16 }, { rotate: `${rot}deg` }] }}>
      <Rise sv={ctx.sv} at={at} style={{ flex: 1, borderRadius: 26, backgroundColor: V.card, borderWidth: 2, borderColor: alpha(tc, 0.55), padding: 22, gap: 12, boxShadow: "0 24px 40px -22px rgba(0,0,0,0.9)" }}>
        <View style={{ alignSelf: dx < 0 ? "flex-start" : "flex-end", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: alpha(tc, 0.14) }}>
          <Text style={tx(ctx, "plex600", 16, tc, 1.2)} {...fit(1)}>
            {`${q} ${dg(ctx, num)}`}
          </Text>
        </View>
        <Text style={[tx(ctx, "kufi700", 120, alpha(tc, 0.55), 1.2, dx < 0 ? "left" : "right"), { alignSelf: "stretch" }]} {...fit(1)}>
          ؟
        </Text>
      </Rise>
    </View>
  );
  const face = { ...StyleSheet.absoluteFillObject, borderRadius: 26, backfaceVisibility: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 10 };
  return (
    <View style={{ width: w, height: w }}>
      <View style={{ width: 440, height: 440, transform: [{ scale: k }], transformOrigin: "top left" }}>
        {card(V.def, 11, -112, 0.14, 2)}
        {card(V.type, -11, 112, 0.19, 3)}
        <Rise sv={ctx.sv} at={0.24} style={{ position: "absolute", left: 95, top: 44, width: 250, height: 310 }}>
          <Animated.View style={[face, { boxShadow: "0 30px 50px -22px rgba(0,0,0,0.95)" }, fr]}>
            <LinearGradient colors={[V.brand, mix(V.brand, "#7A4A10", 0.55)]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 26 }]} />
            <Text style={tx(ctx, "kufi700", 150, V.onBrand, 1.1, "center")} {...fit(1)}>
              ؟
            </Text>
            <Text style={tx(ctx, "plex700", 20, alpha(V.onBrand, 0.8), 1.2, "center")} {...fit(1)}>
              {`${q} ${dg(ctx, 1)}`}
            </Text>
          </Animated.View>
          <Animated.View style={[face, { backgroundColor: V.card, borderWidth: 2, borderColor: V.q }, bk]}>
            <View style={{ width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", backgroundColor: alpha(V.q, 0.16), borderWidth: 2, borderColor: alpha(V.q, 0.55) }}>
              <Ionicons name="bulb-outline" size={64} color={V.q} />
            </View>
            <Text style={tx(ctx, "plex700", 22, V.q, 1.2, "center")} {...fit(1)}>
              {`${q} ${dg(ctx, 1)}`}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 40, height: 8, borderRadius: 4, backgroundColor: alpha(V.ink, i === 1 ? 0.3 : 0.12) }} />
              ))}
            </View>
          </Animated.View>
        </Rise>
      </View>
    </View>
  );
}

/** قصاصات تتساقط بهدوء خلف المحتوى (حلقة واحدة تحرّكها كلها) */
function Confetti({ ctx }: { ctx: SlideCtx }) {
  const v = useLoop(9000, { reverse: false, easing: Easing.linear });
  const rnd = seeded(7);
  const pieces = Array.from({ length: 12 }, () => ({ x: rnd() * CW, off: rnd(), w: 8 + rnd() * 6, h: 8 + rnd() * 7, rot: 300 + rnd() * 400, c: AGENDA[Math.floor(rnd() * AGENDA.length)] }));
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {pieces.map((p, i) => (
        <Piece key={i} v={v} {...p} H={540} />
      ))}
    </View>
  );
}

function Piece({ v, x, off, w, h, rot, c, H }: { v: ReturnType<typeof useLoop>; x: number; off: number; w: number; h: number; rot: number; c: string; H: number }) {
  const a = useAnimatedStyle(() => {
    const t = (v.value + off) % 1;
    return { transform: [{ translateY: -40 + t * (H + 80) }, { rotate: `${t * rot}deg` }] };
  });
  return <Animated.View style={[{ position: "absolute", left: x, top: 0, width: w, height: h, borderRadius: 3, backgroundColor: c, opacity: 0.45 }, a]} />;
}

