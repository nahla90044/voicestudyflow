// components/brand/slides/visual/compare.tsx
// قالبا المقارنة والتفرّع في الشكل البصري:
// - compare: عمودان متقابلان (نعناعي ومرجاني) يتوهج كلٌّ منهما ما دام الراوي يشرحه، وبينهما ميزان يميل نحو
//   الطرف المشروح ثم يستقر عند الخلاصة، والفروق تنزلق سطرًا بسطر. الطول الزائد → بلا ميزان وأعمدة أعرض.
// - tree: شجرة تنمو مع الكلام: الجذر ← الأنواع (فرع يُرسم ثم تقفز عقدته) ← الأوراق على جذع كل نوع.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";

import type { Item } from "../../../../lib/slideThemeCore";
import { useTrigger, type SlideCtx } from "../shared";
import {
  alpha,
  bareRoot,
  BRANCH,
  Content,
  CW,
  dg,
  dirSign,
  fit,
  fitSize,
  frameOf,
  Head,
  headPlan,
  LH_KUFI,
  LoSvg,
  mix,
  nLines,
  Pop,
  Rise,
  SMOOTH,
  tx,
  usePop,
  useRise,
  useSlideX,
  useSvgId,
  useWindow,
  V,
  Wipe,
  type Frame,
} from "./kit";

// ===== compare =====

type CmpPlan = { balance: boolean; colW: number; midW: number; ts: number; tLines: number[]; s: number; lines: number[][]; liMin: number; headerH: number };

function cmpPlan(ctx: SlideCtx, f: Frame, cols: { title: string; items: Item[] }[], bodyH: number): CmpPlan {
  let last: CmpPlan | null = null;
  for (const balance of ctx.compact ? [false] : [true, false]) {
    const colW = balance ? 404 : (CW - 28 - 110) / 2;
    const midW = CW - 2 * colW - 28;
    const inner = colW - 40;
    const ts = fitSize(cols.map((c) => c.title), inner - 78, 2, Math.round(34 * f.k), 22);
    const tLines = cols.map((c) => (c.title ? Math.min(2, nLines(c.title, inner - 78, ts)) : 0));
    const headerH = Math.max(64, Math.max(0, ...tLines) * Math.round(ts * LH_KUFI)) + 24;
    const tw = inner - 28 - 42;
    let found: CmpPlan | null = null;
    for (let s = Math.round(24 * f.k); s >= 15; s--) {
      const lines = cols.map((c) => c.items.map((it) => Math.max(1, nLines(it.text, tw, s))));
      const liMin = Math.max(40, Math.round((62 * s) / 24));
      const colHs = lines.map((ls) => 38 + headerH + ls.reduce((n, l) => n + Math.max(liMin, l * Math.round(s * 1.4) + 16), 0) + 10 * Math.max(0, ls.length - 1));
      const plan = { balance, colW, midW, ts, tLines, s, lines, liMin, headerH };
      last = plan;
      if (lines.every((ls) => ls.every((l) => l <= 3)) && Math.max(...colHs) <= bodyH) {
        found = plan;
        break;
      }
    }
    if (found && (!balance || found.s >= Math.round(20 * f.k))) return found;
  }
  return last!;
}

export function CompareScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const cols = (ctx.m.columns ?? []).slice(0, 2);
  const head = headPlan(ctx, f);
  const bodyH = f.H - head.h - 16;
  if (cols.length < 2) return null;
  const plan = cmpPlan(ctx, f, cols, bodyH);
  const a0 = cols[0].items[0]?.at ?? 0.1;
  const a1 = cols[1].items[0]?.at ?? 0.47;
  const w0: [number, number] = [Math.max(0.04, a0 - 0.04), a1 - 0.01];
  const w1: [number, number] = [a1 - 0.01, 0.9];
  const tint = [V.pa, V.pb];
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} />
      <View style={{ flexDirection: ctx.row, alignItems: "flex-start", gap: 14, height: bodyH }}>
        <Column ctx={ctx} ci={0} col={cols[0]} plan={plan} color={tint[0]} win={w0} headAt={0.06} />
        <View style={{ width: plan.midW, height: bodyH, alignItems: "center", justifyContent: "center", gap: 12 }}>
          {plan.balance ? <Balance ctx={ctx} a1={w0[0]} a2={a1 - 0.01} a3={0.86} /> : <View style={{ position: "absolute", top: 20, bottom: 20, width: 2, borderRadius: 2, backgroundColor: alpha(V.ink, 0.12) }} />}
          <Pop sv={ctx.sv} at={a1 - 0.01} style={{ flexDirection: ctx.row, alignItems: "center", gap: 8, height: 42, paddingHorizontal: 18, borderRadius: 999, backgroundColor: mix(V.brand, V.bgB, 0.15), borderWidth: 1.5, borderColor: alpha(V.brand, 0.45) }}>
            <Ionicons name="swap-horizontal-outline" size={20} color={V.brand} />
            <Text style={tx(ctx, "plex600", 20, V.brand, 1.3, "center")} {...fit(1)}>
              {ctx.t("video.s.vs")}
            </Text>
          </Pop>
          {ctx.m.highlight && plan.balance ? (
            <Rise sv={ctx.sv} at={0.84} style={{ maxWidth: plan.midW - 20 }}>
              <Text style={tx(ctx, "plex500", 18, V.dim, 1.45, "center")} {...fit(3)}>
                {ctx.m.highlight}
              </Text>
            </Rise>
          ) : null}
        </View>
        <Column ctx={ctx} ci={1} col={cols[1]} plan={plan} color={tint[1]} win={w1} headAt={0.08} />
      </View>
    </Content>
  );
}

function Column({ ctx, ci, col, plan, color, win, headAt }: { ctx: SlideCtx; ci: number; col: { title: string; items: Item[] }; plan: CmpPlan; color: string; win: [number, number]; headAt: number }) {
  const h = useWindow(ctx.sv, win[0], win[1], 400);
  const glow = useAnimatedStyle(() => ({ opacity: h.value }));
  const hd = useRise(ctx.sv, headAt);
  const s = plan.s;
  return (
    <View style={{ width: plan.colW }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 28, borderWidth: 1.5, borderColor: alpha(color, 0.73), boxShadow: `0 0 44px -8px ${alpha(color, 0.5)}` }, glow]} />
      <View style={{ borderRadius: 28, backgroundColor: V.card, borderWidth: 1.5, borderColor: alpha(color, 0.18), paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, gap: 12 }}>
        <Animated.View style={[{ flexDirection: ctx.row, alignItems: "center", gap: 14, paddingBottom: 12, borderBottomWidth: 1.5, borderStyle: "dashed", borderColor: alpha(color, 0.38), minHeight: plan.headerH - 12 }, hd]}>
          <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: alpha(color, 0.2) }}>
            <Text style={tx(ctx, "kufi700", 32, color, 1.2, "center")} {...fit(1)}>
              {dg(ctx, ci + 1)}
            </Text>
          </View>
          <Text style={[tx(ctx, "kufi700", plan.ts, color, LH_KUFI), { flex: 1 }]} {...fit(plan.tLines[ci] || 1)}>
            {col.title}
          </Text>
        </Animated.View>
        <View style={{ gap: 10 }}>
          {col.items.map((it, i) => (
            <Li key={i} ctx={ctx} it={it} color={color} s={s} lines={plan.lines[ci][i]} minH={plan.liMin} dx={(ci === 0 ? 46 : -46) * dirSign(ctx)} />
          ))}
        </View>
      </View>
    </View>
  );
}

function Li({ ctx, it, color, s, lines, minH, dx }: { ctx: SlideCtx; it: Item; color: string; s: number; lines: number; minH: number; dx: number }) {
  const a = useSlideX(ctx.sv, it.at, dx);
  return (
    <Animated.View style={[{ flexDirection: ctx.row, alignItems: "center", gap: 12, minHeight: minH, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: alpha(V.ink, 0.04) }, a]}>
      <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: alpha(color, 0.22) }}>
        <Ionicons name="checkmark" size={18} color={color} />
      </View>
      <Text style={[tx(ctx, "plex500", s, V.ink, 1.4), { flex: 1 }]} {...fit(lines)}>
        {it.head ? <Text style={[{ color }, ctx.ff("plex600")]}>{it.head}: </Text> : null}
        {it.head ? it.body : it.text}
      </Text>
    </Animated.View>
  );
}

/** الميزان: العاتق يميل ±٨° نحو الطرف المشروح والكفّتان تبقيان معلّقتين رأسيًا */
function Balance({ ctx, a1, a2, a3 }: { ctx: SlideCtx; a1: number; a2: number; a3: number }) {
  const s1 = useTrigger(ctx.sv, a1, 900, SMOOTH);
  const s2 = useTrigger(ctx.sv, a2, 900, SMOOTH);
  const s3 = useTrigger(ctx.sv, a3, 900, SMOOTH);
  const w0 = useTrigger(ctx.sv, 0, 1400, Easing.linear);
  const sign = dirSign(ctx);
  const ang = useDerivedValue(() => sign * 8 * (s1.value - 2 * s2.value + s3.value) + 6 * Math.sin(w0.value * 12.566) * (1 - w0.value));
  const beam = useAnimatedStyle(() => ({ transform: [{ rotate: `${ang.value}deg` }] }));
  const pan = useAnimatedStyle(() => ({ transform: [{ rotate: `${-ang.value}deg` }] }));
  const id = useSvgId("bal");
  const grad = (
    <Defs>
      <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FBE6AE" />
        <Stop offset="1" stopColor="#D6A447" />
      </SvgGradient>
    </Defs>
  );
  const right = ctx.isRTL ? V.pa : V.pb;
  const left = ctx.isRTL ? V.pb : V.pa;
  const pop = usePop(ctx.sv, 0.02, 0.6);
  return (
    <Animated.View style={[{ width: 300, height: 272 }, pop]}>
      <View style={{ position: "absolute", left: 0, top: 0, width: 320, height: 290, transform: [{ scale: 300 / 320 }], transformOrigin: "top left" }}>
        <LoSvg w={320} h={290} style={StyleSheet.absoluteFill}>
          {grad}
          <Ellipse cx={160} cy={278} rx={82} ry={9} fill="#000" opacity={0.3} />
          <Path d="M112 272 L208 272 L190 250 L130 250 Z" fill={`url(#${id})`} />
          <Rect x={153} y={70} width={14} height={184} rx={7} fill={`url(#${id})`} />
        </LoSvg>
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: [160, 68, 0] }, beam]}>
          <LoSvg w={320} h={290} style={StyleSheet.absoluteFill}>
            {grad}
            <Rect x={44} y={62} width={232} height={13} rx={6.5} fill={`url(#${id})`} />
            <Circle cx={270} cy={68} r={7} fill={`url(#${id})`} />
            <Circle cx={50} cy={68} r={7} fill={`url(#${id})`} />
          </LoSvg>
          <Pan ctx={ctx} x={220} color={right} num={ctx.isRTL ? 1 : 2} style={pan} />
          <Pan ctx={ctx} x={0} color={left} num={ctx.isRTL ? 2 : 1} style={pan} />
        </Animated.View>
        <LoSvg w={320} h={290} style={StyleSheet.absoluteFill}>
          {grad}
          <Path d="M148 54 L160 30 L172 54Z" fill={`url(#${id})`} />
          <Circle cx={160} cy={68} r={15} fill={`url(#${id})`} />
          <Circle cx={160} cy={68} r={5} fill="#8A6420" />
        </LoSvg>
      </View>
    </Animated.View>
  );
}

function Pan({ ctx, x, color, num, style }: { ctx: SlideCtx; x: number; color: string; num: number; style: ReturnType<typeof useAnimatedStyle> }) {
  return (
    <Animated.View style={[{ position: "absolute", left: x, top: 60, width: 100, height: 160, transformOrigin: [50, 8, 0] }, style as any]}>
      <LoSvg w={100} h={160} res={0.6}>
        <Path d={`M50 8 L12 110 M50 8 L88 110`} stroke="#D6A447" strokeWidth={2.5} fill="none" />
        <Path d="M2 110 Q50 150 98 110 Z" fill={mix(color, V.bgB, 0.55)} stroke={color} strokeWidth={2.5} />
      </LoSvg>
      <View style={{ position: "absolute", left: 0, right: 0, top: 70, alignItems: "center" }}>
        <Text style={tx(ctx, "kufi700", 30, color, 1.2, "center")} {...fit(1)}>
          {dg(ctx, num)}
        </Text>
      </View>
    </Animated.View>
  );
}

// ===== tree =====

type TreePlan = { root: boolean; rootW: number; rootS: number; nodeW: number; ts: number; tLines: number[]; nodeH: number; yNode: number; leafS: number; leafLines: number[][]; centers: number[]; h: number };

function treePlan(ctx: SlideCtx, f: Frame, root: string, nodes: { title: string; leaves: string[] }[], bodyH: number): TreePlan {
  const n = nodes.length;
  const slot = CW / n;
  const nodeW = Math.min(320, slot - 28);
  const centers = nodes.map((_, i) => (ctx.isRTL ? CW - (i + 0.5) * slot : (i + 0.5) * slot));
  const ts = fitSize(nodes.map((x) => x.title), nodeW - 32 - 46 - 12, 2, Math.round(27 * f.k), 18);
  const tLines = nodes.map((x) => Math.max(1, Math.min(2, nLines(x.title, nodeW - 90, ts))));
  const nodeH = Math.max(72, Math.max(...tLines) * Math.round(ts * LH_KUFI) + 26);
  const rootS = fitSize([root], 560, 1, 34, 22);
  const rootW = Math.max(220, Math.min(620, Math.ceil(root.length * 0.52 * rootS * 1.06 + 96)));
  const ltw = nodeW - 34 - 28;
  let last: TreePlan | null = null;
  for (const withRoot of [true, false]) {
    const yNode = withRoot ? 104 : 0;
    const avail = bodyH - (yNode + nodeH + 16);
    for (let s = Math.round(22 * f.k); s >= 14; s--) {
      const leafLines = nodes.map((x) => x.leaves.map((l) => Math.max(1, nLines(l, ltw, s))));
      const colH = leafLines.map((ls) => ls.reduce((h, l) => h + l * Math.round(s * 1.4) + 16, 0) + 8 * Math.max(0, ls.length - 1));
      const ok = colH.every((h) => h <= avail);
      const h = yNode + nodeH + (Math.max(0, ...colH) ? 16 + Math.max(0, ...colH) : 0);
      last = { root: withRoot, rootW, rootS, nodeW, ts, tLines, nodeH, yNode, leafS: s, leafLines, centers, h };
      if (ok) return last;
    }
  }
  return last!;
}

export function TreeScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const tree = ctx.m.tree;
  const head = headPlan(ctx, f);
  const bodyH = f.H - head.h - 16;
  if (!tree || tree.nodes.length < 2) return null;
  const rootLabel = bareRoot(tree.root || ctx.m.title);
  const plan = treePlan(ctx, f, rootLabel, tree.nodes, bodyH);
  const items = ctx.m.items;
  const at = (i: number) => items[i]?.at ?? 0.05 + (i / tree.nodes.length) * 0.8;
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} />
      <View style={{ width: CW, height: Math.min(bodyH, plan.h), marginTop: Math.max(0, (bodyH - plan.h) / 2) }}>
        {plan.root ? (
          <>
            {tree.nodes.map((_, i) => (
              <Edge key={i} ctx={ctx} x0={CW / 2} x1={plan.centers[i]} color={BRANCH[i % BRANCH.length]} at={Math.max(0.06, at(i) - 0.03)} />
            ))}
            <RootPill ctx={ctx} label={rootLabel} w={plan.rootW} s={plan.rootS} />
          </>
        ) : null}
        {tree.nodes.map((nd, i) => (
          <TreeNode key={i} ctx={ctx} i={i} node={nd} plan={plan} color={BRANCH[i % BRANCH.length]} a={at(i)} b={i + 1 < tree.nodes.length ? at(i + 1) : 0.9} />
        ))}
      </View>
    </Content>
  );
}

function RootPill({ ctx, label, w, s }: { ctx: SlideCtx; label: string; w: number; s: number }) {
  const h = useWindow(ctx.sv, 0.04, 0.12);
  const glow = useAnimatedStyle(() => ({ opacity: h.value }));
  return (
    <Pop sv={ctx.sv} at={0.04} style={{ position: "absolute", top: 0, left: (CW - w) / 2, width: w, height: 60 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 999, boxShadow: `0 0 36px -4px ${alpha(V.brand, 0.65)}` }, glow]} />
      <View style={{ flex: 1, borderRadius: 999, backgroundColor: V.brand, flexDirection: ctx.row, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 }}>
        <Ionicons name="git-network-outline" size={30} color={V.onBrand} />
        <Text style={[tx(ctx, "kufi700", s, V.onBrand, 1.3, "center"), { flexShrink: 1 }]} {...fit(1)}>
          {label}
        </Text>
      </View>
    </Pop>
  );
}

/** فرع من الجذر إلى النوع: منحنى يُرسم من الأعلى ونقطة تقفز عند طرفه */
function Edge({ ctx, x0, x1, color, at }: { ctx: SlideCtx; x0: number; x1: number; color: string; at: number }) {
  const q = useTrigger(ctx.sv, at, 520);
  const bx = Math.min(x0, x1) - 8;
  const w = Math.abs(x1 - x0) + 16;
  const p0 = x0 - bx;
  const p1 = x1 - bx;
  return (
    <>
      <Wipe q={q} dir="down" len={52} style={{ position: "absolute", left: bx, top: 56, width: w, height: 52 }}>
        <LoSvg w={w} h={52} res={0.6}>
          <Path d={`M${p0} 4 C ${p0} 28, ${p1} 24, ${p1} 46`} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" />
        </LoSvg>
      </Wipe>
      <Pop sv={ctx.sv} at={at + 0.035} style={{ position: "absolute", left: x1 - 6, top: 56 + 46 - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
    </>
  );
}

function TreeNode({ ctx, i, node, plan, color, a, b }: { ctx: SlideCtx; i: number; node: { title: string; leaves: string[] }; plan: TreePlan; color: string; a: number; b: number }) {
  const h = useWindow(ctx.sv, a, b);
  const glow = useAnimatedStyle(() => ({ opacity: h.value }));
  const pop = usePop(ctx.sv, a);
  const spineQ = useTrigger(ctx.sv, a + 0.02, 700);
  const cx = plan.centers[i];
  const left = cx - plan.nodeW / 2;
  const lines = plan.leafLines[i] ?? [];
  const lastH = lines.length ? lines[lines.length - 1] * Math.round(plan.leafS * 1.4) + 16 : 0;
  const span = Math.max(0.02, (b - a - 0.04) / Math.max(1, node.leaves.length + 1));
  const side = ctx.isRTL ? "right" : "left";
  return (
    <View style={{ position: "absolute", left, top: plan.yNode, width: plan.nodeW }}>
      <Animated.View style={[{ height: plan.nodeH }, pop]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 20, borderWidth: 2, borderColor: color, backgroundColor: alpha(color, 0.15), boxShadow: `0 0 36px -4px ${alpha(color, 0.65)}` }, glow]} />
        <View style={{ flex: 1, borderRadius: 20, borderWidth: 2, borderColor: alpha(color, 0.4), backgroundColor: mix(color, V.card, 0.09), flexDirection: ctx.row, alignItems: "center", gap: 12, paddingHorizontal: 16 }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: alpha(color, 0.22) }}>
            <Text style={tx(ctx, "kufi700", 24, color, 1.2, "center")} {...fit(1)}>
              {dg(ctx, i + 1)}
            </Text>
          </View>
          <Text style={[tx(ctx, "kufi700", plan.ts, color, LH_KUFI), { flex: 1 }]} {...fit(plan.tLines[i])}>
            {node.title}
          </Text>
        </View>
      </Animated.View>
      {node.leaves.length ? (
        <View style={{ marginTop: 16, gap: 8, [side === "right" ? "paddingRight" : "paddingLeft"]: 34 }}>
          <Wipe q={spineQ} dir="down" style={{ position: "absolute", [side]: 16, top: -16, bottom: lastH / 2, width: 3 }}>
            <View style={{ width: 3, height: 2000, backgroundColor: alpha(color, 0.7), borderRadius: 2 }} />
          </Wipe>
          {node.leaves.map((leaf, j) => (
            <Leaf key={j} ctx={ctx} text={leaf} lines={lines[j] ?? 1} s={plan.leafS} color={color} at={a + 0.03 + j * span} side={side} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Leaf({ ctx, text, lines, s, color, at, side }: { ctx: SlideCtx; text: string; lines: number; s: number; color: string; at: number; side: "right" | "left" }) {
  const a = usePop(ctx.sv, at, 0.6);
  return (
    <Animated.View style={[{ borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: alpha(color, 0.55), backgroundColor: mix(color, V.card, 0.08), paddingHorizontal: 14, paddingVertical: 8 }, a]}>
      <View style={{ position: "absolute", [side]: -20, top: "50%", width: 18, height: 3, marginTop: -1.5, borderRadius: 2, backgroundColor: alpha(color, 0.7) }} />
      <Text style={tx(ctx, "plex500", s, V.ink, 1.4)} {...fit(lines)}>
        {text}
      </Text>
    </Animated.View>
  );
}
