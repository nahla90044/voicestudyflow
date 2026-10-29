// components/brand/slides/cinematic/scenes-b.tsx
// مشاهد السينمائي (٢): التعريف «المعجم المضيء»، والتفرّع «كوكبة الأنواع»، والمقارنة «الشاشة المنقسمة»،
// والرقم والمدى «مسطرة الزمن». المحتوى من ctx.m وحده، والأحجام مقدّرة مسبقًا (لا قص ولا تداخل).
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { fitFont, linesFor, toLatinDigits, toLocalDigits, type SceneModel } from "../../../../lib/slideThemeCore";
import { SceneMark, useLoop, useSpan, useTrigger, type SlideCtx } from "../shared";
import { alpha, Appear, Blob, C, EIO, EO, LensFlare, leftInset, linesOf, packPills, planStack, sideInset, ts, Tx, Words, type Piece } from "./kit";
import { HeadRow, headPlan, ListScene } from "./scenes-a";

// ===== التعريف: المعجم المضيء =====

/** خط يُمد من المنتصف (بين المصطلح والمعنى) */
function CenterLine({ ctx, w, a, b }: { ctx: SlideCtx; w: number; a: number; b: number }) {
  const f = useSpan(ctx.sv, a, b);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: f.value }] }));
  return (
    <Animated.View style={[{ width: w, height: 2, alignSelf: "center" }, st]}>
      <LinearGradient colors={[alpha(C.gold, 0), C.gold, alpha(C.gold, 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** كلمة شبحية ضخمة خلف التعريف تنجرف ±٧٠ ببطء (زخرفة بشفافية ‎.05، لا تُقرأ) — حجمها يتسع لعرض اللوحة */
function Ghost({ ctx, text }: { ctx: SlideCtx; text: string }) {
  const v = useLoop(18000);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: 70 - 140 * v.value }] }));
  const size = Math.min(400, 1500 / Math.max(1, text.length * 0.5));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 10, left: -200, right: -200, height: Math.min(560, size * 1.4), alignItems: "center", overflow: "hidden" }, st]}>
      <Text numberOfLines={1} style={[{ fontSize: size, lineHeight: size * 1.4, color: "rgba(246,213,138,0.05)", textAlign: "center" }, ctx.ff("amiri700")]}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** «لغةً» يخفت إلى ‎.38 ما دام «اصطلاحًا» يُقرأ، ثم يعود مضاءً عند ‎.80 للمراجعة */
function DimWhile({ ctx, from, to, children, style }: { ctx: SlideCtx; from: number; to: number; children: React.ReactNode; style?: object }) {
  const a = useTrigger(ctx.sv, from, 380, EIO);
  const b = useTrigger(ctx.sv, to, 480, EIO);
  const st = useAnimatedStyle(() => ({ opacity: 1 - 0.62 * Math.max(0, a.value - b.value) }));
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

function DefLabel({ ctx, text, at, gold, w }: { ctx: SlideCtx; text: string; at: number; gold: boolean; w: number }) {
  const k = ctx.compact ? 1.12 : 1;
  return (
    <Appear sv={ctx.sv} at={at} kind="pop" style={[styles.defLabel, { width: w }, gold ? styles.defLabelGold : styles.defLabelMoon]}>
      {gold ? <LinearGradient colors={[C.goldHi, C.goldLo]} start={{ x: ctx.isRTL ? 1 : 0, y: 0 }} end={{ x: ctx.isRTL ? 0 : 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 30 }]} /> : null}
      <Tx style={ts(ctx.ff, "plex600", 24 * k, gold ? C.onGold : C.moon, 1.4, "center")}>{text}</Tx>
    </Appear>
  );
}

export function DefineScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const d = m.define ?? { term: m.title, istilah: m.highlight ?? m.items.map((it) => it.text).join(" "), plain: true };
  const S = sideInset(ctx, 84, 120);
  const W = 1280 - 2 * S;
  const labelW = Math.round(150 * k);
  const textW = W - labelW - 30;
  const rest = m.items;
  const pieces: Piece[] = [
    { text: d.term, w: W, base: 100, min: 42, lh: 1.7, max: 2 },
    { fixed: 18 },
    d.lugha ? { text: d.lugha, w: textW, base: 54, min: 22, lh: 1.7, max: 6 } : { fixed: 0 },
    d.lugha ? { fixed: 22 } : { fixed: 0 },
    { text: d.istilah || " ", w: textW, base: 42, min: 20, lh: 1.6, max: 8 },
    ...rest.map((it): Piece => ({ text: it.text, w: W, base: 26, min: 16, lh: 1.45, max: 3 })),
  ];
  const plan = planStack(pieces, 516, 16, k);
  const top = 84 + Math.max(0, (516 - plan.total) / 2);
  const lg = !!d.lugha;
  const istAt = lg ? 0.36 : 0.09;
  const istFrom = lg ? 0.39 : 0.11;
  const istTo = lg ? 0.62 : 0.5;
  const kwAt = lg ? 0.66 : 0.55;
  const restSizes = plan.sizes.slice(5);
  const row = (children: React.ReactNode) => <View style={{ flexDirection: ctx.row, alignItems: "flex-start", gap: 30, width: W }}>{children}</View>;
  return (
    <View style={StyleSheet.absoluteFill}>
      {!ctx.compact && d.term.length <= 14 ? <Ghost ctx={ctx} text={d.term} /> : null}
      <View style={{ position: "absolute", top, left: S, right: S, alignItems: "center", gap: 16 }}>
        <Appear sv={sv} at={0.03} kind="fade" style={{ width: W }}>
          <Tx lines={2} style={[ts(ff, "amiri700", plan.sizes[0], C.gold, 1.32, "center"), styles.goldGlow]}>
            {d.term}
          </Tx>
        </Appear>
        <View style={{ height: 18, justifyContent: "center", width: W }}>
          <CenterLine ctx={ctx} w={Math.min(360, W)} a={0.06} b={0.12} />
        </View>
        {lg ? (
          <DimWhile ctx={ctx} from={0.34} to={0.8}>
            {row(
              <>
                <View style={{ marginTop: plan.sizes[2] * 0.2 }}>
                  <DefLabel ctx={ctx} text={t("video.s.lugha")} at={0.09} gold={false} w={labelW} />
                </View>
                <View style={{ flex: 1 }}>
                  <Words text={d.lugha ?? ""} sv={sv} from={0.11} to={0.19} lines={plan.lines[2] || 6} color={C.ivory} style={ts(ff, "amiri400", plan.sizes[2], C.ivory, 1.55, ctx.align)} />
                </View>
              </>
            )}
          </DimWhile>
        ) : null}
        {lg ? <LinkTick ctx={ctx} labelW={labelW} W={W} /> : null}
        {row(
          <>
            <View style={{ marginTop: plan.sizes[4] * 0.25 }}>
              <DefLabel ctx={ctx} text={t(d.plain ? "video.s.definition" : "video.s.istilah")} at={istAt} gold w={labelW} />
            </View>
            <View style={{ flex: 1 }}>
              <Words
                text={d.istilah}
                sv={sv}
                from={istFrom}
                to={istTo}
                lines={plan.lines[4] || 8}
                color={C.ivory}
                style={ts(ff, "plex500", plan.sizes[4], C.ivory, 1.6, ctx.align)}
                keyword={m.keyword}
                kwAt={kwAt}
              />
            </View>
          </>
        )}
        {rest.map((it, i) => (
          <Appear key={i} sv={sv} at={Math.min(0.92, Math.max(0.7, it.at))} kind="up" style={{ width: W }}>
            <Tx lines={3} style={ts(ff, "plex400", restSizes[i] ?? 18, C.mist, 1.45, "center")}>
              {it.text}
            </Tx>
          </Appear>
        ))}
      </View>
    </View>
  );
}

/** وصلة رأسية بين الوسمين تُرسم من الأعلى */
function LinkTick({ ctx, labelW, W }: { ctx: SlideCtx; labelW: number; W: number }) {
  const f = useSpan(ctx.sv, 0.32, 0.37);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: f.value }] }));
  return (
    <View style={{ width: W, height: 22, marginVertical: -8 }}>
      <Animated.View style={[{ position: "absolute", top: 0, width: 2, height: 22, backgroundColor: C.gold2, transformOrigin: "top" }, ctx.isRTL ? { right: labelW / 2 - 1 } : { left: labelW / 2 - 1 }, st]} />
    </View>
  );
}

// ===== التفرّع: كوكبة الأنواع =====

/** وصلة منحنية (هالة + خط) من الجذر إلى عقدة، تنكشف من الأعلى لحظة ولادة العقدة */
function Link({ ctx, x0, x1, y0, y1, at, hot }: { ctx: SlideCtx; x0: number; x1: number; y0: number; y1: number; at: number; hot: boolean }) {
  const v = useTrigger(ctx.sv, at, 520, EO);
  const g = useTrigger(ctx.sv, 0.8, 600, EO);
  const st = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.4), transform: [{ scaleY: Math.min(1, v.value) }] }));
  const gs = useAnimatedStyle(() => ({ opacity: g.value }));
  const left = Math.min(x0, x1) - 12;
  const w = Math.abs(x1 - x0) + 24;
  const h = Math.max(4, y1 - y0);
  const a = x0 - left;
  const b = x1 - left;
  const d = `M${a} 0 C${a} ${h * 0.62} ${b} ${h * 0.38} ${b} ${h}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left, top: y0, width: w, height: h, transformOrigin: "top" }, st]}>
      <Svg width={w} height={h}>
        <Path d={d} stroke="rgba(169,155,255,0.22)" strokeWidth={9} strokeLinecap="round" fill="none" />
        <Path d={d} stroke="rgba(205,196,255,0.9)" strokeWidth={2.4} strokeLinecap="round" fill="none" />
      </Svg>
      {hot ? (
        <Animated.View style={[StyleSheet.absoluteFill, gs]}>
          <Svg width={w} height={h}>
            <Path d={d} stroke="rgba(246,213,138,0.28)" strokeWidth={11} strokeLinecap="round" fill="none" />
            <Path d={d} stroke={C.gold} strokeWidth={3.2} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** حلقة تركيز ذهبية حول الفرع الأهم عند ‎.80 (تكبر من ‎.6 ثم تستقر) */
function FocusRing({ ctx }: { ctx: SlideCtx }) {
  const v = useTrigger(ctx.sv, 0.8, 700, EO);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.5, 1], [0, 1, 0.85], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(v.value, [0, 0.5, 1], [0.6, 1.08, 1], Extrapolation.CLAMP) }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.focus, st]} />;
}

export function TreeScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, sv } = ctx;
  const nodes = (m.tree?.nodes ?? []).slice(0, 4);
  if (nodes.length < 2) return <ListScene ctx={ctx} />;
  const k = ctx.compact ? 1.12 : 1;
  const root = m.tree?.root || m.title;
  const S = sideInset(ctx, 96, 96);
  const rootW = Math.min(900, 1280 - 2 * S) - 96;
  const rs = fitFont([`✦ ${root}`], { w: rootW, h: 1e4, maxLines: 2 }, 44 * k, 24);
  const rl = linesOf(`✦ ${root}`, rootW, rs, 2);
  const rootTop = 98;
  const rootH = rl * rs * 1.5 + 24;
  const y0 = rootTop + rootH;
  const nodesTop = y0 + 60;
  const n = nodes.length;
  const gap = 24;
  const colW = (1136 - gap * (n - 1)) / n;
  const H = 600 - nodesTop;
  // أكبر خط تتسع به أطول عمود (عقدة + فروعها مع الوصلات)
  let ns = 26 * k;
  let ls = 24 * k;
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    ns = Math.max(16, 26 * k * s);
    ls = Math.max(14, 24 * k * s);
    const colH = nodes.map((nd) => linesOf(nd.title, colW - 48, ns, 3) * ns * 1.45 + 20 + nd.leaves.reduce((h, lf) => h + 16 + linesOf(lf, colW - 44, ls, 4) * ls * 1.45 + 16, 0));
    const over = nodes.some((nd) => linesFor(nd.title, colW - 48, ns) > 3 || nd.leaves.some((lf) => linesFor(lf, colW - 44, ls) > 4));
    if (!over && Math.max(...colH) <= H) break;
  }
  const hot = nodes.reduce((best, nd, i) => (nd.leaves.length > nodes[best].leaves.length ? i : best), 0);
  const hasHot = nodes[hot].leaves.length > 0;
  const xs = nodes.map((_, i) => (ctx.isRTL ? 1208 - colW / 2 - i * (colW + gap) : 72 + colW / 2 + i * (colW + gap)));
  const at = (i: number) => m.items[i]?.at ?? 0.05 + (i / n) * 0.8;
  return (
    <View style={StyleSheet.absoluteFill}>
      {nodes.map((_, i) => (
        <Link key={i} ctx={ctx} x0={640} x1={xs[i]} y0={y0 - 6} y1={nodesTop + 6} at={Math.max(0.04, at(i) - 0.05)} hot={hasHot && i === hot} />
      ))}
      <View style={{ position: "absolute", top: rootTop, left: S, right: S, alignItems: "center" }}>
        <Appear sv={sv} at={0.03} kind="pop" style={{ maxWidth: rootW + 96 }}>
          <View style={styles.rootHalo} />
          <View style={styles.root}>
            <LinearGradient colors={[C.goldHi, C.goldLo]} start={{ x: ctx.isRTL ? 1 : 0, y: 0 }} end={{ x: ctx.isRTL ? 0 : 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 40 }]} />
            <Tx lines={2} style={ts(ff, "kufi700", rs, C.onGold, 1.3, "center")}>{`✦ ${root}`}</Tx>
          </View>
        </Appear>
      </View>
      {nodes.map((nd, i) => (
        <View key={i} style={{ position: "absolute", top: nodesTop, left: xs[i] - colW / 2, width: colW, alignItems: "center" }}>
          <Appear sv={sv} at={at(i)} kind="pop" style={{ maxWidth: colW }}>
            {hasHot && i === hot ? <FocusRing ctx={ctx} /> : null}
            <View style={styles.crit}>
              <Tx lines={3} style={ts(ff, "plex600", ns, C.lilac, 1.32, "center")}>
                {nd.title}
              </Tx>
            </View>
          </Appear>
          {nd.leaves.map((lf, j) => {
            const la = Math.min(0.92, at(i) + 0.04 * (j + 1));
            return (
              <Appear key={j} sv={sv} at={la} kind="pop" style={{ alignItems: "center", maxWidth: colW }}>
                <View style={styles.stem} />
                <View style={styles.sub}>
                  <Tx lines={4} style={ts(ff, "plex500", ls, C.ivory, 1.45, "center")}>
                    {lf}
                  </Tx>
                </View>
              </Appear>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ===== المقارنة: الشاشة المنقسمة =====

/** الفاصل الضوئي: يشق الشاشة من الأعلى */
function Seam({ ctx, top, h }: { ctx: SlideCtx; top: number; h: number }) {
  const f = useSpan(ctx.sv, 0.03, 0.1);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: f.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 640 - 6, top, width: 12, height: h, transformOrigin: "top" }, st]}>
      <LinearGradient colors={[alpha(C.gold, 0), alpha(C.gold, 0.16), alpha(C.gold, 0.16), alpha(C.gold, 0)]} locations={[0, 0.14, 0.86, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[alpha(C.gold, 0), C.gold, C.gold, alpha(C.gold, 0)]} locations={[0, 0.14, 0.86, 1]} style={{ position: "absolute", left: 5, width: 2, top: 0, bottom: 0 }} />
    </Animated.View>
  );
}

type PaneTone = { ink: string; a: string; b: string; border: string };
const MOON: PaneTone = { ink: C.moon, a: "rgba(141,183,255,0.17)", b: "rgba(141,183,255,0.03)", border: "rgba(141,183,255,0.3)" };
const EMBER: PaneTone = { ink: C.ember, a: "rgba(255,155,113,0.17)", b: "rgba(255,155,113,0.03)", border: "rgba(255,155,113,0.32)" };

function Pane({
  ctx,
  col,
  tone,
  left,
  top,
  w,
  h,
  from,
  hs,
  rs,
  hl,
  rl,
  padLeft,
}: {
  ctx: SlideCtx;
  col: NonNullable<SceneModel["columns"]>[number];
  tone: PaneTone;
  left: number;
  top: number;
  w: number;
  h: number;
  from: number;
  hs: number;
  rs: number;
  hl: number;
  rl: number[];
  padLeft: number;
}) {
  const { ff, sv } = ctx;
  return (
    <Appear sv={sv} at={0.05} kind="side" from={from} style={[styles.pane, { left, top, width: w, height: h, borderColor: tone.border }]}>
      <LinearGradient colors={[tone.a, tone.b, tone.b]} locations={[0, 0.62, 1]} start={{ x: from > 0 ? 0.65 : 0.35, y: 0 }} end={{ x: from > 0 ? 0.35 : 0.65, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 30 }]} />
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 14, paddingLeft: padLeft, marginBottom: 10 }}>
        <View style={[styles.paneDot, { backgroundColor: tone.ink, shadowColor: tone.ink }]} />
        <View style={{ flex: 1 }}>
          <Tx lines={Math.max(1, hl)} style={ts(ff, "kufi600", hs, tone.ink, 1.32, ctx.align)}>
            {col.title}
          </Tx>
        </View>
      </View>
      {col.items.map((it, i) => (
        <Appear key={i} sv={sv} at={it.at} kind="side" from={from} style={styles.cr}>
          <Tx lines={Math.max(1, rl[i] ?? 3)} style={ts(ff, "plex500", rs, C.ivory, 1.45, ctx.align)}>
            {it.head ? `${it.head}: ${it.body}` : it.text}
          </Tx>
        </Appear>
      ))}
    </Appear>
  );
}

export function CompareScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv } = ctx;
  const cols = (m.columns ?? []).slice(0, 2);
  if (cols.length < 2) return <ListScene ctx={ctx} />;
  const k = ctx.compact ? 1.12 : 1;
  const S = sideInset(ctx, 96, 96);
  const tW = 1280 - 2 * S;
  const ts0 = m.title ? fitFont([m.title], { w: tW, h: 1e4, maxLines: 2 }, 36 * k, 22) : 0;
  const tH = m.title ? linesOf(m.title, tW, ts0, 2) * ts0 * 1.5 : 0;
  const paneTop = 96 + tH + (tH ? 18 : 0);
  const paneH = 600 - paneTop;
  const paneW = 520;
  const innerW = paneW - 68;
  // نسبة واحدة للعمودين: الرأس حتى سطرين، والبنود حتى ٤ أسطر
  const plans = cols.map((c) =>
    planStack(
      [{ text: c.title, w: innerW - 30, base: 42, min: 22, lh: 1.5, max: 2, extra: 10 }, ...c.items.map((it): Piece => ({ text: it.text, w: innerW, base: 29, min: 15, lh: 1.45, max: 4, extra: 18 }))],
      paneH - 52,
      0,
      k
    )
  );
  const pi = plans[0].s <= plans[1].s ? 0 : 1;
  const s = plans[pi].s;
  const hs = Math.max(22, 42 * k * s);
  const rs = Math.max(15, 29 * k * s);
  const corner = ctx.safe.corner;
  const firstLeft = ctx.isRTL ? 1 : 0; // فهرس العمود الذي في اليسار
  const padLeft = corner > paneTop ? Math.max(0, leftInset(ctx, paneTop, 72) - 72 - 34) : 0;
  const medalY = paneTop + 54;
  const vsAt = cols[1].items[0]?.at ?? 0.46;
  return (
    <View style={StyleSheet.absoluteFill}>
      {m.title ? (
        <Appear sv={sv} at={0.03} kind="fade" style={{ position: "absolute", top: 96, left: S, right: S }}>
          <Tx lines={2} style={ts(ff, "kufi600", ts0, C.gold, 1.35, "center")}>
            {m.title}
          </Tx>
        </Appear>
      ) : null}
      {cols.map((c, ci) => {
        const onLeft = ci === firstLeft;
        return (
          <Pane
            key={ci}
            ctx={ctx}
            col={c}
            tone={ci ? EMBER : MOON}
            left={onLeft ? 72 : 1280 - 72 - paneW}
            top={paneTop}
            w={paneW}
            h={paneH}
            from={onLeft ? -1 : 1}
            hs={hs}
            rs={rs}
            hl={linesOf(c.title, innerW - 30, hs, 2)}
            rl={c.items.map((it) => linesOf(it.text, innerW, rs, 4))}
            padLeft={onLeft ? padLeft : 0}
          />
        );
      })}
      <Seam ctx={ctx} top={paneTop + 10} h={paneH - 20} />
      <Appear sv={sv} at={0.08} kind="pop" style={[styles.medalC, { top: medalY - 39 }]}>
        <LinearGradient colors={["#2B2A55", "#0B0E28"]} start={{ x: 0.3, y: 0.2 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 39 }]} />
        <SceneMark m={m} size={36} color={C.gold} />
      </Appear>
      <Appear sv={sv} at={vsAt} kind="pop" style={[styles.vs, { top: medalY + 56 }]}>
        <Tx style={ts(ff, "plex600", 20 * k, C.gold, 1.4, "center")}>{t("video.s.vs")}</Tx>
      </Appear>
    </View>
  );
}

// ===== الرقم والمدى: مسطرة الزمن =====

/** عدّاد دوّار: عمود أرقام يتحرك داخل إطار مقصوص حتى يستقر على القيمة */
function Reel({ ctx, values, size, at }: { ctx: SlideCtx; values: string[]; size: number; at: number }) {
  const v = useTrigger(ctx.sv, at, 1100, EIO);
  const h = size * 1.5;
  const steps = values.length - 1;
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: -h * steps * Math.min(1, v.value) }] }), [h, steps]);
  return (
    <View style={{ height: h, overflow: "hidden" }}>
      <Animated.View style={st}>
        {values.map((x, i) => (
          <View key={i} style={{ height: h, justifyContent: "center", alignItems: "center" }}>
            <Tx min={0.4} style={[ts(ctx.ff, "kufi700", size, C.gold, 1.5, "center"), styles.goldGlow]}>
              {x}
            </Tx>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/** قيم العدّاد: من البداية إلى الهدف على ثلاث خطوات (أعداد صحيحة فقط، وإلا القيمة نفسها) */
function reelValues(from: number, to: number, lang: string): string[] {
  if (!Number.isInteger(to) || !Number.isInteger(from) || to <= from) return [toLocalDigits(to, lang)];
  const vals = [from, Math.round(from + (to - from) / 3), Math.round(from + ((to - from) * 2) / 3), to].filter((x, i, a) => i === 0 || x !== a[i - 1]);
  return vals.map((x) => toLocalDigits(x, lang));
}

/** الرقم في highlight: ما قبله وما بعده (للوحدة) — أو لا رقم */
function parseNum(h: string): { pre: string; n: number; post: string; raw: string } | null {
  const s = toLatinDigits(h ?? "").trim();
  const mm = s.match(/^(.*?)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!mm) return null;
  const n = Number(mm[2].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return { pre: mm[1].trim(), n, post: mm[3].trim(), raw: mm[2] };
}

/** وهج الرقم: يكبر من ‎.6 إلى ١٫١ ثم يستقر بشفافية ‎.8 */
function NumGlow({ ctx, w, h }: { ctx: SlideCtx; w: number; h: number }) {
  const v = useTrigger(ctx.sv, 0.22, 800, EO);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.5, 1], [0, 1, 0.8], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(v.value, [0, 0.5, 1], [0.6, 1.1, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 640 - w / 2, width: w, height: h }, st]}>
      <Blob w={w} h={h} res={8} stops={[[0, C.gold, 0.34], [0.6, C.gold, 0.08], [1, C.gold, 0]]} />
    </Animated.View>
  );
}

/** مسطرة الأيام: خط أساس يُرسم، وعلامات، ونافذة المدة تمتد، وعلامة المشهد تتنقل داخلها */
function Ruler({ ctx, from, to, unit }: { ctx: SlideCtx; from: number; to: number; unit: string }) {
  const { ff, sv, lang } = ctx;
  const max = Math.max(1, to);
  const x = (d: number) => (ctx.isRTL ? 40 + (d / max) * 1020 : 1060 - (d / max) * 1020);
  const base = useSpan(sv, 0.24, 0.32);
  const win = useSpan(sv, 0.32, 0.4);
  const mk = useSpan(sv, 0.41, 0.86);
  const mOn = useTrigger(sv, 0.38, 400, EO);
  const xa = x(to);
  const xb = x(from);
  const baseSt = useAnimatedStyle(() => ({ transform: [{ scaleX: base.value }] }));
  const winSt = useAnimatedStyle(() => ({ transform: [{ scaleX: win.value }] }));
  const mid = (xa + xb) / 2;
  const mkSt = useAnimatedStyle(() => ({
    opacity: Math.min(1, mOn.value),
    transform: [{ translateX: interpolate(mk.value, [0, 0.38, 0.73, 1], [xa, xb, xa, mid], Extrapolation.CLAMP) }],
  }));
  const step = max <= 30 ? 1 : 2;
  const major = max <= 30 ? 5 : 10;
  let d = "";
  for (let i = 0; i <= max; i += step) d += i % major === 0 || i === max ? `M${x(i).toFixed(1)} 26V74` : `M${x(i).toFixed(1)} 44V56`;
  const close = Math.abs(xa - xb) < 260;
  const label = (txt: string, cx: number, y: number, gold = false) => (
    <View style={{ position: "absolute", left: cx - 130, width: 260, top: y }}>
      <Tx style={ts(ff, gold ? "plex600" : "plex500", 22, gold ? C.gold : C.mist, 1.4, "center")}>{txt}</Tx>
    </View>
  );
  const u = unit ? ` ${unit}` : "";
  return (
    <View style={{ width: 1100, height: 130 }}>
      <Animated.View style={[{ position: "absolute", left: 40, width: 1020, top: 49, height: 2, backgroundColor: "rgba(246,240,225,0.55)", transformOrigin: ctx.isRTL ? "right" : "left" }, baseSt]} />
      <Appear sv={sv} at={0.27} kind="fade" style={StyleSheet.absoluteFill}>
        <Svg width={1100} height={100}>
          <Path d={d} stroke="rgba(246,240,225,0.45)" strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </Appear>
      <Animated.View style={[styles.win, { left: Math.min(xa, xb), width: Math.max(8, Math.abs(xa - xb)), transformOrigin: ctx.isRTL ? "right" : "left" }, winSt]} />
      <Appear sv={sv} at={0.3} kind="fade" style={StyleSheet.absoluteFill}>
        {label(`${toLocalDigits(to, lang)}${u}`, xa, close ? -8 : 88)}
        {label(`${toLocalDigits(from, lang)}${u}`, xb, 88)}
        {from > 0 && Math.abs(x(0) - xb) > 200 ? label(toLocalDigits(0, lang), x(0), 88, true) : null}
      </Appear>
      <Animated.View style={[{ position: "absolute", left: 0, top: 50 }, mkSt]}>
        <View style={styles.mkDot} />
        <View style={styles.mkBubble}>
          <SceneMark m={ctx.m} size={28} color={C.teal} />
        </View>
      </Animated.View>
    </View>
  );
}

export function StatScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv, lang } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const range = m.template === "range" ? m.range : undefined;
  const num = range ? null : parseNum(m.highlight ?? "");
  const head = headPlan(ctx, 94, { base: 48 });
  const top0 = head.top + head.h + 12;
  const S = sideInset(ctx, top0, 72);
  const W = 1280 - 2 * S;
  const avail = 600 - top0;
  const unit = range ? range.unit : num ? num.post : "";
  const texts = m.items.map((it) => it.text);
  const ruler = !!range?.ruler;
  // عرض صف الأرقام بخط N (تقدير): أرقام Kufi ~٠٫٦٢ em، والشرطة، والوحدة بخط ‎.31N
  const digitsW = (s: string, N: number) => s.length * 0.62 * N;
  const rowW = (N: number) =>
    range
      ? digitsW(String(range.from), N) + digitsW(String(range.to), N) + 0.45 * N + (unit ? unit.length * 0.55 * N * 0.31 : 0) + 24 * 3
      : num
        ? digitsW(num.raw, N) + ((num.pre + num.post).length ? (num.pre.length + num.post.length) * 0.55 * N * 0.31 + 24 : 0)
        : 0;
  const bigText = !range && !num ? (m.highlight ?? "") : "";
  let N = 176 * k;
  let pill = 26 * k;
  let pack = packPills(texts, W, pill, 22, 18);
  let bigSize = 110 * k;
  let bigLines = 1;
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    N = Math.max(84, 176 * k * s);
    pill = Math.max(16, 26 * k * s);
    pack = packPills(texts, W, pill, 22, 18);
    bigSize = Math.max(40, 110 * k * s);
    bigLines = bigText ? linesFor(bigText, W, bigSize) : 0;
    const numH = bigText ? bigLines * bigSize * 1.5 : (range ? 36 : 0) + N * 1.5;
    const total = numH + (texts.length ? 18 + pack.h : 0) + (ruler ? 18 + 130 : 0);
    if ((bigText ? bigLines <= 2 : rowW(N) <= W) && pack.ok && total <= avail) break;
  }
  const valsFrom = range ? reelValues(0, range.from, lang) : [];
  const valsTo = range ? reelValues(range.from, range.to, lang) : num ? reelValues(0, num.n, lang) : [];
  const unitSize = Math.max(22, N * 0.31);
  const unitEl = unit ? (
    <Appear sv={sv} at={0.2} kind="fade" style={{ marginBottom: N * 0.25, flexShrink: 1 }}>
      <Tx style={ts(ff, "plex500", unitSize, C.ivory, 1.4)}>{unit}</Tx>
    </Appear>
  ) : null;
  const numH = (range ? 36 : 0) + N * 1.5;
  return (
    <View style={StyleSheet.absoluteFill}>
      <HeadRow ctx={ctx} plan={head} kwAt={0.55} />
      <View style={{ position: "absolute", top: top0, height: avail, left: 0, right: 0, alignItems: "center", justifyContent: "center", gap: 18 }}>
        <View style={{ width: 1280, alignItems: "center", justifyContent: "center" }}>
          <NumGlow ctx={ctx} w={900} h={Math.max(200, numH * 1.5)} />
          {bigText ? (
            <Appear sv={sv} at={0.06} kind="pop" style={{ width: W }}>
              <Tx lines={Math.min(2, Math.max(1, bigLines))} style={[ts(ff, "kufi700", bigSize, C.gold, 1.25, "center"), styles.goldGlow]}>
                {bigText}
              </Tx>
            </Appear>
          ) : (
            <View style={{ flexDirection: ctx.row, alignItems: "flex-end", justifyContent: "center", gap: 24, maxWidth: W }}>
              {range ? (
                <>
                  <Appear sv={sv} at={0.05} kind="fade" style={{ alignItems: "center" }}>
                    <Tx style={ts(ff, "plex500", 24, C.mist, 1.4, "center")}>{t("video.s.min")}</Tx>
                    <Reel ctx={ctx} values={valsFrom} size={N} at={0.08} />
                  </Appear>
                  <Appear sv={sv} at={0.1} kind="fade" style={{ marginBottom: N * 0.28 }}>
                    <Tx style={ts(ff, "kufi600", N * 0.57, C.mist2, 1.2, "center")}>–</Tx>
                  </Appear>
                  <Appear sv={sv} at={0.09} kind="fade" style={{ alignItems: "center" }}>
                    <Tx style={ts(ff, "plex500", 24, C.mist, 1.4, "center")}>{t("video.s.max")}</Tx>
                    <Reel ctx={ctx} values={valsTo} size={N} at={0.12} />
                  </Appear>
                  {unitEl}
                </>
              ) : (
                <>
                  {num?.pre ? (
                    <Appear sv={sv} at={0.05} kind="fade" style={{ marginBottom: N * 0.25 }}>
                      <Tx style={ts(ff, "plex500", unitSize, C.ivory, 1.4)}>{num.pre}</Tx>
                    </Appear>
                  ) : null}
                  <Appear sv={sv} at={0.05} kind="fade">
                    <Reel ctx={ctx} values={valsTo} size={N} at={0.08} />
                  </Appear>
                  {unitEl}
                </>
              )}
            </View>
          )}
          <LensFlare sv={sv} at={0.22} w={1000} h={14} style={{ left: 140, top: (bigText ? bigLines * bigSize * 1.5 : numH) * 0.6 }} />
        </View>
        {texts.length ? (
          <View style={{ flexDirection: ctx.row, flexWrap: "wrap", justifyContent: "center", columnGap: 18, rowGap: 11, width: W }}>
            {m.items.map((it, i) => (
              <Appear key={i} sv={sv} at={Math.max(0.25, it.at)} kind="up" style={[styles.fact, { maxWidth: W }]}>
                <Tx lines={Math.min(2, pack.lines[i] ?? 1)} style={ts(ff, "plex500", pill, C.ivory, 1.45, "center")}>
                  {it.text}
                </Tx>
              </Appear>
            ))}
          </View>
        ) : null}
        {ruler && range ? <Ruler ctx={ctx} from={range.from} to={range.to} unit={range.unit} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  goldGlow: { textShadowColor: "rgba(246,213,138,0.45)", textShadowRadius: 34, textShadowOffset: { width: 0, height: 0 } },
  defLabel: { paddingVertical: 7, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  defLabelMoon: { borderWidth: 1.5, borderColor: "rgba(141,183,255,0.6)", backgroundColor: "rgba(141,183,255,0.08)" },
  defLabelGold: {},
  rootHalo: { position: "absolute", left: -7, right: -7, top: -7, bottom: -7, borderRadius: 48, borderWidth: 7, borderColor: "rgba(246,213,138,0.12)" },
  root: { paddingHorizontal: 40, paddingVertical: 12, borderRadius: 40, alignItems: "center" },
  crit: { paddingHorizontal: 24, paddingVertical: 9, borderRadius: 30, backgroundColor: "rgba(22,17,62,0.9)", borderWidth: 1.5, borderColor: "rgba(169,155,255,0.75)" },
  stem: { width: 2.4, height: 16, backgroundColor: "rgba(205,196,255,0.9)" },
  sub: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 22, backgroundColor: "rgba(9,12,34,0.92)", borderWidth: 1, borderColor: "rgba(246,213,138,0.38)" },
  focus: { position: "absolute", left: -10, right: -10, top: -10, bottom: -10, borderRadius: 50, borderWidth: 2, borderColor: C.gold },
  pane: { position: "absolute", borderRadius: 30, borderWidth: 1, paddingHorizontal: 34, paddingVertical: 24 },
  paneDot: { width: 14, height: 14, borderRadius: 7, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  cr: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingVertical: 9 },
  medalC: { position: "absolute", left: 640 - 39, width: 78, height: 78, borderRadius: 39, borderWidth: 1.5, borderColor: C.gold, alignItems: "center", justifyContent: "center" },
  vs: { position: "absolute", left: 640 - 44, width: 88, paddingVertical: 5, borderRadius: 20, backgroundColor: "#0B1030", borderWidth: 1, borderColor: "rgba(246,213,138,0.6)", alignItems: "center" },
  win: { position: "absolute", top: 34, height: 32, borderRadius: 16, backgroundColor: "rgba(111,227,200,0.16)", borderWidth: 2, borderColor: C.teal },
  mkDot: { position: "absolute", left: -7, top: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.teal },
  mkBubble: { position: "absolute", left: -31, top: -92, width: 62, height: 62, borderRadius: 31, backgroundColor: "#0B1634", borderWidth: 1.5, borderColor: C.teal, alignItems: "center", justifyContent: "center" },
  fact: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 24, backgroundColor: "rgba(10,14,40,0.7)", borderWidth: 1, borderColor: "rgba(246,213,138,0.25)" },
});
