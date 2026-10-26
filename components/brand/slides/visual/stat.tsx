// components/brand/slides/visual/stat.tsx
// قالبا الرقم والمدى في الشكل البصري: الرقم يُعدّ أمام العين بلون المدد والأرقام، ثم وحدته وحبوب حقائقه،
// وبجانبه رسمة المعنى: تقويم تمتلئ فيه أيام النافذة بالتتابع (مدى بالأيام)، أو خط أعداد تمتد عليه النافذة
// (مدى آخر)، أو حلقة تمتلئ (نسبة مئوية)، أو وسام أيقونة المشهد (رقم آخر).
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedProps, useAnimatedStyle } from "react-native-reanimated";
import { Circle } from "react-native-svg";

import type { Item } from "../../../../lib/slideThemeCore";
import { SceneMark, useLoop, useSpan, useTrigger, type SlideCtx } from "../shared";
import {
  alpha,
  Content,
  CountUp,
  CW,
  dg,
  fit,
  fitSize,
  frameOf,
  Head,
  headPlan,
  LH_KUFI,
  leadNumber,
  LoSvg,
  Medallion,
  mix,
  nLines,
  Pop,
  Rise,
  startOf,
  tx,
  usePop,
  V,
  type Frame,
  type Glyph,
} from "./kit";

type StatPlan = {
  panelW: number;
  leftW: number;
  head: ReturnType<typeof headPlan>;
  bigS: number;
  bigLines: number;
  unitS: number;
  unitLines: number;
  ns: number;
  noteLines: number[];
  pills: boolean;
};

function statPlan(ctx: SlideCtx, f: Frame, bigText: string, numeric: boolean, unit: string, facts: string[], notes: Item[]): StatPlan {
  const panelW = ctx.compact ? 400 : 470;
  const leftW = CW - panelW - 36;
  const head = headPlan(ctx, f, { sideW: 0, w: leftW });
  const avail = f.H - head.h - 16;
  const pills = notes.length > 0 && notes.length <= 4 && notes.every((n) => n.text.length <= 30);
  let best: StatPlan | null = null;
  for (let sc = 1; sc >= 0.45; sc -= 0.05) {
    const bigS = numeric ? fitSize([bigText], leftW, 1, Math.round(176 * f.k * sc), 56) : fitSize([bigText], leftW, 2, Math.round(96 * f.k * sc), 36);
    const bigLines = numeric ? 1 : Math.min(2, nLines(bigText, leftW, bigS));
    const unitS = unit ? fitSize([unit], leftW, 2, Math.round(46 * f.k * sc), 24) : 0;
    const unitLines = unit ? Math.min(2, nLines(unit, leftW, unitS)) : 0;
    const ns = Math.max(16, Math.round(22 * f.k * Math.max(0.75, sc)));
    const noteLines = notes.map((n) => nLines(n.text, pills ? leftW - 60 : leftW, ns));
    const bigH = bigLines * Math.round(bigS * (numeric ? 1.12 : LH_KUFI));
    const unitH = unitLines ? unitLines * Math.round(unitS * LH_KUFI) : 0;
    const factsH = facts.length ? 26 + 46 : 0;
    const notesH = notes.length ? 20 + (pills ? Math.ceil(notes.length / 2) * 58 : noteLines.reduce((h, l) => h + l * Math.round(ns * 1.5) + 8, 0)) : 0;
    best = { panelW, leftW, head, bigS, bigLines, unitS, unitLines, ns, noteLines, pills };
    if (bigH + unitH + factsH + notesH <= avail) break;
  }
  return best!;
}

export function StatScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const { m } = ctx;
  const range = m.template === "range" ? m.range : undefined;
  const lead = range ? null : leadNumber(m.highlight);
  const pct = !range && lead && /%|٪|percent|بالمئة|في المئة/.test(m.highlight ?? "") && lead.n <= 100 ? lead.n : null;
  const unit = range ? range.unit : lead ? lead.rest.replace(/^[%٪]\s*/, "") : "";
  const bigText = range ? `${dg(ctx, range.from)}–${dg(ctx, range.to)}` : lead ? dg(ctx, lead.n) + (pct !== null ? "٪" : "") : (m.highlight ?? "");
  const numeric = !!range || !!lead;
  const facts = range
    ? [`${ctx.t("video.s.min")}: ${dg(ctx, range.from)} ${range.unit}`.trim(), `${ctx.t("video.s.max")}: ${dg(ctx, range.to)} ${range.unit}`.trim()]
    : [];
  const plan = statPlan(ctx, f, bigText, numeric, unit, facts, m.items);
  const glow = { textShadowColor: alpha(V.time, 0.4), textShadowRadius: 34, textShadowOffset: { width: 0, height: 0 } };
  return (
    <Content f={f}>
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 36, height: f.H }}>
        <View style={{ width: plan.leftW, height: f.H }}>
          <Head ctx={ctx} f={f} plan={plan.head} noSticker />
          <View style={{ alignItems: startOf(ctx) }}>
            {range ? (
              <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 6 }}>
                <CountUp ctx={ctx} sv={ctx.sv} at={0.1} to={range.from} ms={1000} style={tx(ctx, "kufi700", plan.bigS, V.time, 1.12, "center", glow)} />
                <Pop sv={ctx.sv} at={0.3}>
                  <Text style={tx(ctx, "kufi700", Math.round(plan.bigS * 0.68), V.time, 1.12, "center")} {...fit(1)}>
                    –
                  </Text>
                </Pop>
                <CountUp ctx={ctx} sv={ctx.sv} at={0.3} from={range.from} to={range.to} ms={1300} style={tx(ctx, "kufi700", plan.bigS, V.time, 1.12, "center", glow)} />
              </View>
            ) : lead ? (
              <CountUp ctx={ctx} sv={ctx.sv} at={0.1} to={lead.n} ms={1300} suffix={pct !== null ? "٪" : ""} style={tx(ctx, "kufi700", plan.bigS, V.time, 1.12, undefined, glow)} />
            ) : (
              <Pop sv={ctx.sv} at={0.1} from={0.6} style={{ alignSelf: "stretch" }}>
                <Text style={tx(ctx, "kufi700", plan.bigS, V.time, LH_KUFI, undefined, glow)} {...fit(plan.bigLines)}>
                  {bigText}
                </Text>
              </Pop>
            )}
            {unit && plan.unitLines ? (
              <Rise sv={ctx.sv} at={0.2} style={{ alignSelf: "stretch" }}>
                <Text style={tx(ctx, "kufi600", plan.unitS, V.ink, LH_KUFI)} {...fit(plan.unitLines)}>
                  {unit}
                </Text>
              </Rise>
            ) : null}
            {facts.length ? (
              <View style={{ flexDirection: ctx.row, flexWrap: "wrap", gap: 12, marginTop: 26 }}>
                {facts.map((t, i) => (
                  <Fact key={i} ctx={ctx} label={t} icon={i ? "arrow-up-circle-outline" : "arrow-down-circle-outline"} at={i ? 0.53 : 0.33} />
                ))}
              </View>
            ) : null}
            {m.items.length ? (
              <View style={plan.pills ? { flexDirection: ctx.row, flexWrap: "wrap", gap: 12, marginTop: 20 } : { gap: 8, marginTop: 20, alignSelf: "stretch" }}>
                {m.items.map((it, i) =>
                  plan.pills ? (
                    <Fact key={i} ctx={ctx} label={it.text} icon="checkmark-circle-outline" at={Math.max(0.4, it.at)} s={plan.ns} lines={plan.noteLines[i]} />
                  ) : (
                    <Rise key={i} sv={ctx.sv} at={Math.max(0.4, it.at)}>
                      <Text style={tx(ctx, "plex500", plan.ns, V.dim, 1.5)} {...fit(plan.noteLines[i])}>
                        {it.head ? <Text style={[{ color: V.ink }, ctx.ff("plex600")]}>{it.head}: </Text> : null}
                        {it.head ? it.body : it.text}
                      </Text>
                    </Rise>
                  )
                )}
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ width: plan.panelW, height: f.H, alignItems: "center", justifyContent: "center" }}>
          {range?.ruler ? (
            <Calendar ctx={ctx} f={f} w={plan.panelW} from={range.from} to={range.to} unit={range.unit} />
          ) : range ? (
            <LinePanel ctx={ctx} w={plan.panelW} from={range.from} to={range.to} unit={range.unit} />
          ) : pct !== null ? (
            <Gauge ctx={ctx} pct={pct} size={Math.min(320, plan.panelW - 60)} />
          ) : (
            <Medallion ctx={ctx} size={Math.min(380, plan.panelW - 40)} at={0.03} />
          )}
        </View>
      </View>
    </Content>
  );
}

function Fact({ ctx, label, icon, at, s = 21, lines = 1 }: { ctx: SlideCtx; label: string; icon: Glyph; at: number; s?: number; lines?: number }) {
  return (
    <Pop sv={ctx.sv} at={at} from={0.5} style={{ flexDirection: ctx.row, alignItems: "center", gap: 9, minHeight: 46, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 15, backgroundColor: alpha(V.time, 0.12), borderWidth: 1.5, borderColor: alpha(V.time, 0.4), maxWidth: "100%" }}>
      <Ionicons name={icon} size={20} color={V.time} />
      <Text style={[tx(ctx, "plex600", s, V.ink, 1.4), { flexShrink: 1 }]} {...fit(lines)}>
        {label}
      </Text>
    </Pop>
  );
}

// ===== التقويم =====

function Calendar({ ctx, f, w, from, to, unit }: { ctx: SlideCtx; f: Frame; w: number; from: number; to: number; unit: string }) {
  const cols = 6;
  const days = Math.max(1, Math.min(60, Math.round(to)));
  const rows = Math.ceil(days / cols);
  const gridAvail = f.H - 30 - 16 - 33 - 80 - 12;
  const cellH = Math.max(18, Math.min(46, Math.floor((gridAvail - (rows - 1) * 8) / rows)));
  const cellW = (w - 44 - (cols - 1) * 8) / cols;
  const fs = Math.max(12, Math.round((19 * cellH) / 46));
  const lo = Math.max(1, Math.round(from));
  const span = Math.max(1, days - lo + 1);
  const rise = usePop(ctx.sv, 0.03, 0.8);
  return (
    <Animated.View style={[{ width: w, borderRadius: 30, backgroundColor: V.card, borderWidth: 1.5, borderColor: alpha(V.ink, 0.1), paddingTop: 30, paddingHorizontal: 22, paddingBottom: 16, boxShadow: "0 26px 50px -28px rgba(0,0,0,0.85)" }, rise]}>
      <View style={{ position: "absolute", top: -15, left: 70, right: 70, flexDirection: "row", justifyContent: "space-around" }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 14, height: 32, borderRadius: 8, backgroundColor: "#B9B6DD", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }} />
        ))}
      </View>
      <View style={{ flexDirection: ctx.row, justifyContent: "space-between", alignItems: "center", marginBottom: 14, height: 19 }}>
        <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 8 }}>
          <Ionicons name="calendar-outline" size={20} color={V.time} />
          <Text style={tx(ctx, "plex600", 19, V.ink, 1.1)} {...fit(1)}>
            {`${dg(ctx, days)} ${unit}`.trim()}
          </Text>
        </View>
        <Text style={tx(ctx, "plex500", 16, V.dim, 1.1)} {...fit(1)}>
          {`${dg(ctx, lo)}–${dg(ctx, days)}`}
        </Text>
      </View>
      <View style={{ flexDirection: ctx.row, flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: days }, (_, j) => {
          const d = j + 1;
          return <Cell key={j} ctx={ctx} d={d} w={cellW} h={cellH} fs={fs} kind={d === 1 && lo > 1 ? "d1" : d < lo ? "pre" : "win"} at={0.28 + ((d - lo) / span) * 0.22} edge={d === lo || d === days} />;
        })}
      </View>
      <NumberLine ctx={ctx} w={w - 44} from={lo} to={days} max={days} />
    </Animated.View>
  );
}

function Cell({ ctx, d, w, h, fs, kind, at, edge }: { ctx: SlideCtx; d: number; w: number; h: number; fs: number; kind: "d1" | "pre" | "win"; at: number; edge: boolean }) {
  const q = useTrigger(ctx.sv, kind === "win" ? at : 2, 380, Easing.out(Easing.quad));
  const dimC = alpha(V.dim, kind === "pre" ? 0.65 : 1);
  const fill = useAnimatedStyle(() => ({ opacity: q.value, transform: [{ scale: 1 + 0.18 * Math.sin(Math.min(1, q.value) * Math.PI) }] }));
  const col = useAnimatedStyle(() => ({ color: interpolateColor(q.value, [0, 1], [dimC, "#2B1803"]) }));
  const base =
    kind === "d1"
      ? { backgroundColor: alpha(V.time, 0.16), borderWidth: 2, borderColor: V.time }
      : kind === "pre"
        ? { backgroundColor: alpha(V.ink, 0.04), borderWidth: 1, borderStyle: "dashed" as const, borderColor: alpha(V.ink, 0.12) }
        : { backgroundColor: alpha(V.ink, 0.05), borderWidth: edge ? 2 : 0, borderColor: alpha(V.time, 0.9) };
  return (
    <View style={[{ width: w, height: h, borderRadius: 12, alignItems: "center", justifyContent: "center" }, base]}>
      {kind === "win" ? <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: mix(V.time, V.card, 0.88) }, fill]} /> : null}
      {kind === "win" ? (
        <Animated.Text style={[tx(ctx, "kufi600", fs, V.dim, 1.15, "center"), col]} {...fit(1)}>
          {dg(ctx, d)}
        </Animated.Text>
      ) : (
        <Text style={tx(ctx, "kufi600", fs, kind === "d1" ? V.time : dimC, 1.15, "center")} {...fit(1)}>
          {dg(ctx, d)}
        </Text>
      )}
    </View>
  );
}

/** خط الأعداد: النافذة [from, to] تمتد عليه، وعلامة تتنقّل داخلها (أي يوم فيها صالح) */
function NumberLine({ ctx, w, from, to, max, big = false }: { ctx: SlideCtx; w: number; from: number; to: number; max: number; big?: boolean }) {
  const span = useSpan(ctx.sv, 0.3, 0.5);
  const tokPop = usePop(ctx.sv, 0.56);
  const bob = useLoop(2400);
  const inner = w - 20;
  const pos = (v: number) => (ctx.isRTL ? inner - (v / Math.max(1, max)) * inner : (v / Math.max(1, max)) * inner) + 10;
  const a = Math.min(pos(from), pos(to));
  const b = Math.max(pos(from), pos(to));
  const rtl = ctx.isRTL;
  const fillA = useAnimatedStyle(() => ({ transform: [{ scaleX: span.value }] }));
  const pFrom = pos(from);
  const pTo = pos(to);
  const tokA = useAnimatedStyle(() => ({ transform: [{ translateX: pFrom + (pTo - pFrom) * bob.value - 22 }] }));
  const labels = [
    { v: 0, show: from / Math.max(1, max) > 0.14 },
    { v: from, show: true },
    { v: to, show: to !== from },
  ];
  const th = big ? 12 : 8;
  return (
    <View style={{ height: big ? 96 : 66, marginTop: 14, width: w }}>
      <View style={{ position: "absolute", top: 22, left: 10, right: 10, height: th, borderRadius: th, backgroundColor: alpha(V.ink, 0.1) }} />
      <Animated.View style={[{ position: "absolute", top: 22, left: a, width: Math.max(4, b - a), height: th, borderRadius: th, backgroundColor: V.time, transformOrigin: rtl ? "right" : "left" }, fillA]} />
      {labels.map((l, i) =>
        l.show ? (
          <Text key={i} style={[tx(ctx, "kufi600", big ? 20 : 16, V.dim, 1.1, "center"), { position: "absolute", top: big ? 44 : 40, left: pos(l.v) - 30, width: 60 }]} {...fit(1)}>
            {dg(ctx, l.v)}
          </Text>
        ) : null
      )}
      <Animated.View style={[{ position: "absolute", top: -1, left: 0, width: 44, height: 44 }, tokPop]}>
        <Animated.View style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: V.ink, alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }, tokA]}>
          <Ionicons name="flag" size={20} color={V.time} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** مدى بلا أيام: لوحة خط أعداد كبير */
function LinePanel({ ctx, w, from, to, unit }: { ctx: SlideCtx; w: number; from: number; to: number; unit: string }) {
  const rise = usePop(ctx.sv, 0.03, 0.8);
  const max = to <= 0 ? 1 : to;
  // مدى السنوات (2015–2020): الخط من بداية المدى لا من الصفر
  const base = from > 100 ? from - Math.max(1, Math.round((to - from) * 0.5)) : 0;
  return (
    <Animated.View style={[{ width: w, borderRadius: 30, backgroundColor: V.card, borderWidth: 1.5, borderColor: alpha(V.ink, 0.1), paddingVertical: 34, paddingHorizontal: 22, gap: 18, alignItems: "center" }, rise]}>
      <View style={{ width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", backgroundColor: alpha(V.time, 0.13), borderWidth: 2, borderColor: alpha(V.time, 0.5) }}>
        <SceneMark m={ctx.m} size={60} color={V.time} />
      </View>
      {unit ? (
        <Text style={tx(ctx, "kufi600", 26, V.ink, LH_KUFI, "center")} {...fit(1)}>
          {unit}
        </Text>
      ) : null}
      <NumberLine ctx={ctx} w={w - 44} from={from - base} to={to - base} max={max - base} big />
    </Animated.View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** نسبة مئوية: حلقة تمتلئ حتى قيمتها */
function Gauge({ ctx, pct, size }: { ctx: SlideCtx; pct: number; size: number }) {
  const fill = useSpan(ctx.sv, 0.1, 0.5);
  const pop = usePop(ctx.sv, 0.03);
  const r = 124;
  const c = 2 * Math.PI * r;
  const goal = Math.max(0, Math.min(1, pct / 100));
  const ap = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - goal * fill.value) }));
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, pop]}>
      <View style={{ position: "absolute", left: 0, top: 0, width: 300, height: 300, transform: [{ scale: size / 300 }], transformOrigin: "top left" }}>
        <LoSvg w={300} h={300} res={0.6} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={150} cy={150} r={r} stroke={alpha(V.ink, 0.1)} strokeWidth={20} fill="none" />
          <AnimatedCircle cx={150} cy={150} r={r} stroke={V.time} strokeWidth={20} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={ap} />
        </LoSvg>
      </View>
      <SceneMark m={ctx.m} size={Math.round(size * 0.3)} color={V.time} />
    </Animated.View>
  );
}
