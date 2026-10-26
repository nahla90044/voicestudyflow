// components/brand/slides/visual/define.tsx
// قالبا التعريف والنص في الشكل البصري:
// - define: بطاقة «لغةً» فيها المصطلح بخط الرقعة ومعناه اللغوي، ثم سهم جسر يعبر إلى بطاقة «اصطلاحًا»
//   ونصها، وكلمته المفتاحية تُضاء عند نطقها. بلا معنى لغوي: بطاقة المصطلح وحده. الطول الزائد → بطاقتان فوق بعضهما.
// - quote/seal: ورقة مائلة يُكشف نصها سطرًا سطرًا وتُضاء كلمتها المهمة؛ وفي الختم يهوي ختم السنة الهجرية
//   على الورقة فتهتز قليلًا ويتطاير غبار. وبجانبها العنوان والحبوب والملاحظات.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import type { Item } from "../../../../lib/slideThemeCore";
import { useTrigger, type SlideCtx } from "../shared";
import {
  alpha,
  bareTerm,
  chunks,
  Content,
  CW,
  dg,
  fit,
  fitSize,
  frameOf,
  Head,
  headPlan,
  LH_RUQ,
  nLines,
  Pop,
  Rise,
  sceneAcc,
  startOf,
  tx,
  useCrossed,
  useSvgId,
  V,
  Wipe,
  type Frame,
  type Glyph,
} from "./kit";

/** نص بكلمة مفتاحية تُضاء عند عبور at (النص المتداخل لا تحرّكه reanimated → تبدّل واحد عند العتبة) */
function Marked({ ctx, text, keyword, at, color, style, lines }: { ctx: SlideCtx; text: string; keyword?: string; at: number; color: string; style: ReturnType<typeof tx>; lines: number }) {
  const on = useCrossed(ctx.sv, at);
  const k = keyword && keyword.length >= 2 && keyword !== text ? text.indexOf(keyword) : -1;
  return (
    <Text style={style} {...fit(lines)}>
      {k >= 0 ? (
        <>
          {text.slice(0, k)}
          <Text style={on ? [{ color, backgroundColor: alpha(color, 0.24) }, ctx.ff("plex700")] : undefined}>{keyword}</Text>
          {text.slice(k + (keyword?.length ?? 0))}
        </>
      ) : (
        text
      )}
    </Text>
  );
}

// ===== define =====

type DefPlan = {
  stacked: boolean;
  termW: number;
  istW: number;
  bridgeW: number;
  rs: number;
  rLines: number;
  ls: number;
  lLines: number;
  is: number;
  iLines: number;
  its: number;
  itLines: number[];
};

function defPlan(ctx: SlideCtx, f: Frame, term: string, lugha: string, ist: string, items: Item[], bodyH: number): DefPlan {
  const tryV = (stacked: boolean): DefPlan | null => {
    const termW = stacked ? CW : ctx.compact ? 380 : 410;
    const bridgeW = stacked ? 0 : ctx.compact ? 64 : 96;
    const istW = stacked ? CW : CW - termW - bridgeW - 12;
    const termIn = stacked ? 380 : termW - 56;
    const lugIn = stacked ? CW - 56 - 380 - 24 : termW - 56;
    const istIn = istW - 56;
    for (let sc = 1; sc >= 0.5; sc -= 0.05) {
      const rs = fitSize([term], termIn, 2, Math.round(120 * sc), 40);
      const rLines = Math.min(2, nLines(term, termIn, rs));
      const ls = lugha ? Math.max(18, Math.round(30 * f.k * sc)) : 0;
      const lLines = lugha ? nLines(lugha, lugIn, ls) : 0;
      const is = Math.max(19, Math.round(30 * f.k * sc));
      const iLines = nLines(ist, istIn, is);
      const its = Math.max(16, Math.round(22 * f.k * sc));
      const itLines = items.map((it) => nLines(it.text, istIn - 30, its));
      const itH = items.length ? 10 + itLines.reduce((h, l) => h + l * Math.round(its * 1.45) + 6, 0) : 0;
      const termBody = rLines * Math.round(rs * LH_RUQ);
      const termH = stacked ? 50 + 54 + Math.max(termBody, lLines * Math.round(ls * 1.5)) : 50 + 54 + termBody + (lugha ? 14 + lLines * Math.round(ls * 1.5) : 0);
      const istH = 50 + 54 + iLines * Math.round(is * 1.7) + itH;
      const total = stacked ? termH + 16 + istH : Math.max(termH, istH);
      if (total <= bodyH) return { stacked, termW, istW, bridgeW, rs, rLines, ls, lLines, is, iLines, its, itLines };
    }
    return null;
  };
  const side = tryV(false);
  const stack = tryV(true);
  if (side && (!stack || side.is >= stack.is * 0.85)) return side;
  if (stack) return stack;
  // آخر احتياط: بطاقتان فوق بعضهما بأصغر خط
  const ls = lugha ? 18 : 0;
  return {
    stacked: true,
    termW: CW,
    istW: CW,
    bridgeW: 0,
    rs: 40,
    rLines: 2,
    ls,
    lLines: lugha ? nLines(lugha, CW - 460, 18) : 0,
    is: 19,
    iLines: nLines(ist, CW - 56, 19),
    its: 16,
    itLines: items.map((it) => nLines(it.text, CW - 86, 16)),
  };
}

export function DefineScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const d = ctx.m.define;
  const head = headPlan(ctx, f);
  const bodyH = f.H - head.h - 16;
  if (!d) return null;
  const term = bareTerm(d.term || ctx.m.title);
  const lugha = d.lugha ?? "";
  const plan = defPlan(ctx, f, term, lugha, d.istilah, ctx.m.items, bodyH);
  const t1 = lugha ? 0.43 : 0.24;
  const card = { borderRadius: 30, backgroundColor: V.card, borderWidth: 1.5, borderColor: alpha(V.ink, 0.1), paddingHorizontal: 28, paddingTop: 24, paddingBottom: 26, gap: 14, overflow: "hidden" as const, boxShadow: "0 22px 40px -26px rgba(0,0,0,0.8)" };
  const accent = <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: V.def, opacity: 0.85 }} />;
  const termCard = (
    <Rise sv={ctx.sv} at={0.05} style={[card, { width: plan.termW }]}>
      {accent}
      <DTag ctx={ctx} label={lugha ? ctx.t("video.s.lugha") : ctx.t("video.s.kind.define")} icon="book-outline" />
      <View style={{ flexDirection: plan.stacked ? ctx.row : "column", alignItems: plan.stacked ? "center" : "stretch", gap: plan.stacked ? 24 : 14 }}>
        <Pop sv={ctx.sv} at={0.09} from={0.5} style={plan.stacked ? { width: 380 } : undefined}>
          <Text style={tx(ctx, "ruqaa700", plan.rs, V.brand, LH_RUQ, "center", { textShadowColor: alpha(V.brand, 0.3), textShadowRadius: 24, textShadowOffset: { width: 0, height: 8 } })} {...fit(plan.rLines)}>
            {term}
          </Text>
        </Pop>
        {lugha ? (
          <Rise sv={ctx.sv} at={0.25} style={plan.stacked ? { flex: 1 } : undefined}>
            <Text style={tx(ctx, "plex500", plan.ls, V.ink, 1.5)} {...fit(plan.lLines)}>
              {lugha}
            </Text>
          </Rise>
        ) : null}
      </View>
    </Rise>
  );
  const istCard = (
    <Rise sv={ctx.sv} at={t1} style={[card, { width: plan.istW }]}>
      {accent}
      <DTag ctx={ctx} label={ctx.t("video.s.istilah")} icon="bulb-outline" solid />
      <Rise sv={ctx.sv} at={t1 + 0.04}>
        <Marked ctx={ctx} text={d.istilah} keyword={ctx.m.keyword} at={t1 + 0.1} color={V.def} style={tx(ctx, "plex500", plan.is, V.ink, 1.7)} lines={plan.iLines} />
      </Rise>
      {ctx.m.items.length ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          {ctx.m.items.map((it, i) => (
            <Rise key={i} sv={ctx.sv} at={Math.max(it.at, t1 + 0.16 + i * 0.05)} style={{ flexDirection: ctx.row, gap: 10, alignItems: "flex-start" }}>
              <Ionicons name="ellipse" size={10} color={V.def} style={{ marginTop: Math.round(plan.its * 0.55) }} />
              <Text style={[tx(ctx, "plex500", plan.its, V.dim), { flex: 1 }]} {...fit(plan.itLines[i])}>
                {it.text}
              </Text>
            </Rise>
          ))}
        </View>
      ) : null}
    </Rise>
  );
  return (
    <Content f={f}>
      <Head ctx={ctx} f={f} plan={head} />
      {plan.stacked ? (
        <View style={{ gap: 16 }}>
          {termCard}
          {istCard}
        </View>
      ) : (
        <View style={{ flexDirection: ctx.row, alignItems: "stretch", gap: 6 }}>
          {termCard}
          <Bridge ctx={ctx} w={plan.bridgeW} at={lugha ? 0.39 : 0.2} />
          {istCard}
        </View>
      )}
    </Content>
  );
}

function DTag({ ctx, label, icon, solid }: { ctx: SlideCtx; label: string; icon: Glyph; solid?: boolean }) {
  const ink = solid ? "#06221F" : V.def;
  return (
    <View
      style={{
        alignSelf: startOf(ctx),
        flexDirection: ctx.row,
        alignItems: "center",
        gap: 8,
        height: 40,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: solid ? V.def : alpha(V.def, 0.14),
        borderWidth: 1.5,
        borderColor: solid ? V.def : alpha(V.def, 0.45),
      }}
    >
      <Ionicons name={icon} size={20} color={ink} />
      <Text style={tx(ctx, solid ? "plex600" : "ruqaa700", solid ? 21 : 24, ink, solid ? 1.3 : LH_RUQ)} {...fit(1)}>
        {label}
      </Text>
    </View>
  );
}

/** سهم الجسر من «لغةً» إلى «اصطلاحًا» يُرسم باتجاه القراءة */
function Bridge({ ctx, w, at }: { ctx: SlideCtx; w: number; at: number }) {
  const q = useTrigger(ctx.sv, at, 650);
  const h = Math.round((w / 96) * 200);
  return (
    <View style={{ width: w, alignSelf: "center" }}>
      <Wipe q={q} dir={ctx.isRTL ? "rtl" : "ltr"} len={w} style={{ width: w, height: h }}>
        <Svg width={w} height={h} viewBox="0 0 96 200" style={ctx.isRTL ? undefined : { transform: [{ scaleX: -1 }] }}>
          <Path d="M90 52 C 44 52, 54 150, 10 150" stroke={V.brand} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d="M21 141 L9 150 L21 159" stroke={V.brand} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Wipe>
    </View>
  );
}

// ===== quote / seal: الورقة =====

type PaperPlan = { paperW: number; leftW: number; ps: number; chunkLines: number[]; pills: boolean; ns: number; noteLines: number[]; head: ReturnType<typeof headPlan> };

function paperPlan(ctx: SlideCtx, f: Frame, parts: string[], notes: Item[], seal: boolean): PaperPlan {
  const paperW = ctx.compact ? 540 : 650;
  const leftW = CW - paperW - 40;
  const head = headPlan(ctx, f, { sideW: 0, w: leftW });
  const inner = paperW - 80;
  const maxH = f.H - (seal ? 60 : 8);
  let ps = 20;
  let chunkLines = parts.map((p) => nLines(p, inner, 20));
  for (let s = Math.round(37 * f.k); s >= 20; s--) {
    const cl = parts.map((p) => nLines(p, inner, s));
    const h = 34 + (seal ? 104 : 46) + 47 + 52 + cl.reduce((n, l) => n + l * Math.round(s * 1.6), 0);
    ps = s;
    chunkLines = cl;
    if (h <= maxH) break;
  }
  // يسار الورقة: حبوب قصيرة، أو ملاحظات بأسطر
  const pills = notes.length > 0 && notes.length <= 4 && notes.every((n) => n.text.length <= 34);
  const leftH = f.H - head.h - 16 - (seal ? 64 : 0);
  let ns = 16;
  let noteLines = notes.map(() => 1);
  for (let s = Math.round(22 * f.k); s >= 16; s--) {
    const nl = notes.map((n) => nLines(n.text, pills ? leftW - 60 : leftW - 24, s));
    const h = pills ? nl.reduce((a, l) => a + Math.max(48, l * Math.round(s * 1.45) + 16) + 12, 0) : nl.reduce((a, l) => a + l * Math.round(s * 1.55) + 10, 0);
    ns = s;
    noteLines = nl;
    if (h <= leftH) break;
  }
  return { paperW, leftW, ps, chunkLines, pills, ns, noteLines, head };
}

export function PaperScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const { m } = ctx;
  const seal = m.template === "seal" && !!m.seal;
  const text = m.highlight || m.items.map((it) => it.text).join("\n");
  const notes = m.highlight ? m.items : [];
  const parts = chunks(text, 3);
  const plan = paperPlan(ctx, f, parts, notes, seal);
  const acc = sceneAcc(m);
  const t0 = seal ? 0.3 : 0.12;
  const gap = Math.min(0.13, 0.5 / Math.max(1, parts.length));
  const year = seal ? `${dg(ctx, m.seal!.year)}${ctx.lang === "ar" ? "هـ" : " AH"}` : "";
  return (
    <Content f={f}>
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 40, height: f.H }}>
        <View style={{ width: plan.leftW, height: f.H }}>
          <Head ctx={ctx} f={f} plan={plan.head} noSticker />
          <View style={{ gap: 12, alignItems: startOf(ctx) }}>
            {seal ? <MetaPill ctx={ctx} icon="calendar-outline" label={year} color={acc} at={0.14} lines={1} s={21} /> : null}
            {plan.pills
              ? notes.map((it, i) => <MetaPill key={i} ctx={ctx} icon="document-text-outline" label={it.text} color={acc} at={Math.max(0.2, it.at)} lines={plan.noteLines[i]} s={plan.ns} />)
              : notes.map((it, i) => (
                  <Rise key={i} sv={ctx.sv} at={Math.max(0.2, it.at)} style={{ alignSelf: "stretch" }}>
                    <Text style={tx(ctx, "plex500", plan.ns, V.dim, 1.55)} {...fit(plan.noteLines[i])}>
                      {it.head ? <Text style={[{ color: V.ink }, ctx.ff("plex600")]}>{it.head}: </Text> : null}
                      {it.head ? it.body : it.text}
                    </Text>
                  </Rise>
                ))}
          </View>
        </View>
        <View style={{ width: plan.paperW, paddingBottom: seal ? 60 : 0 }}>
          <Paper ctx={ctx} plan={plan} parts={parts} t0={t0} gap={gap} seal={seal} year={year} />
        </View>
      </View>
    </Content>
  );
}

function MetaPill({ ctx, icon, label, color, at, lines, s }: { ctx: SlideCtx; icon: Glyph; label: string; color: string; at: number; lines: number; s: number }) {
  return (
    <Pop sv={ctx.sv} at={at} from={0.6} style={{ flexDirection: ctx.row, alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 15, backgroundColor: alpha(color, 0.11), borderWidth: 1.5, borderColor: alpha(color, 0.38), maxWidth: "100%" }}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[tx(ctx, "plex600", s, V.ink, 1.45), { flexShrink: 1 }]} {...fit(lines)}>
        {label}
      </Text>
    </Pop>
  );
}

const PAPER_INK = "#2A2340";

function Paper({ ctx, plan, parts, t0, gap, seal, year }: { ctx: SlideCtx; plan: PaperPlan; parts: string[]; t0: number; gap: number; seal: boolean; year: string }) {
  const rise = useTrigger(ctx.sv, 0.04, 560);
  const sh = useTrigger(ctx.sv, seal ? 0.245 : 2, 700, Easing.linear);
  const a = useAnimatedStyle(() => {
    const d = 1 - sh.value;
    const on = sh.value > 0 && sh.value < 1 ? 1 : 0;
    return {
      opacity: rise.value,
      transform: [
        { translateY: (1 - rise.value) * 28 + on * Math.sin(sh.value * 25) * 3 * d },
        { translateX: on * Math.sin(sh.value * 31.4) * 8 * d },
        { rotate: "-1.6deg" },
      ],
    };
  });
  const kw = ctx.m.keyword;
  return (
    <Animated.View style={[{ borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, boxShadow: "0 30px 60px -26px rgba(0,0,0,0.85)" }, a]}>
      <LinearGradient colors={["#FBF3E1", "#EEDFC0"]} start={{ x: 0.45, y: 0 }} end={{ x: 0.55, y: 1 }} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }]} />
      <View style={{ position: "absolute", left: 14, right: 14, top: 14, bottom: 14, borderWidth: 1.5, borderColor: "rgba(120,90,40,0.22)", borderRadius: 8 }} />
      <View style={{ paddingHorizontal: 40, paddingTop: 34, paddingBottom: seal ? 104 : 46 }}>
        <View style={{ flexDirection: ctx.row, justifyContent: "space-between", alignItems: "center", paddingBottom: 14, marginBottom: 16, borderBottomWidth: 1.5, borderColor: "rgba(120,90,40,0.2)" }}>
          <Text style={tx(ctx, "plex600", 17, "#8A6A3A", 1.2)} {...fit(1)}>
            {ctx.t("video.s.kind.text")}
          </Text>
          <Ionicons name={seal ? "ribbon-outline" : "chatbox-ellipses-outline"} size={20} color="#8A6A3A" />
        </View>
        <Pop sv={ctx.sv} at={0.08} style={{ alignSelf: startOf(ctx), marginBottom: 4 }}>
          <Svg width={62} height={48} viewBox="0 0 62 48" style={ctx.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <Path
              fill="#C4973E"
              d="M26 4C12 8 4 18 4 30c0 8 5 14 12 14 6 0 11-5 11-11s-4-10-10-10c-1 0-2 0-3 .5C15 17 20 12 28 9zM58 4C44 8 36 18 36 30c0 8 5 14 12 14 6 0 11-5 11-11s-4-10-10-10c-1 0-2 0-3 .5C47 17 52 12 60 9z"
            />
          </Svg>
        </Pop>
        {parts.map((p, i) => (
          <PaperLine key={i} ctx={ctx} text={p} lines={plan.chunkLines[i]} s={plan.ps} at={t0 + i * gap} keyword={kw && p.includes(kw) ? kw : undefined} />
        ))}
      </View>
      {seal ? <Seal ctx={ctx} year={year} /> : null}
    </Animated.View>
  );
}

function PaperLine({ ctx, text, lines, s, at, keyword }: { ctx: SlideCtx; text: string; lines: number; s: number; at: number; keyword?: string }) {
  const q = useTrigger(ctx.sv, at, 900);
  return (
    <Wipe q={q} dir={ctx.isRTL ? "rtl" : "ltr"} style={{ alignSelf: "stretch" }}>
      <Marked ctx={ctx} text={text} keyword={keyword} at={at + 0.06} color="#1E7F55" style={tx(ctx, "plex600", s, PAPER_INK, 1.6)} lines={lines} />
    </Wipe>
  );
}

const SCALLOP =
  "M151 80 Q162.5 88.7 149.4 94.8 Q158.9 105.6 144.9 108.9 Q151.9 121.5 137.4 121.7 Q141.7 135.5 127.5 132.8 Q128.8 147.1 115.5 141.5 Q113.8 155.8 101.9 147.5 Q97.3 161.2 87.4 150.6 Q80 163 72.6 150.6 Q62.7 161.2 58.1 147.5 Q46.2 155.8 44.5 141.5 Q31.2 147.1 32.5 132.8 Q18.3 135.5 22.6 121.7 Q8.1 121.5 15.1 108.9 Q1.1 105.6 10.6 94.8 Q-2.5 88.7 9 80 Q-2.5 71.3 10.6 65.2 Q1.1 54.4 15.1 51.1 Q8.1 38.5 22.6 38.3 Q18.3 24.5 32.5 27.2 Q31.2 12.9 44.5 18.5 Q46.2 4.2 58.1 12.5 Q62.7 -1.2 72.6 9.4 Q80 -3 87.4 9.4 Q97.3 -1.2 101.9 12.5 Q113.8 4.2 115.5 18.5 Q128.8 12.9 127.5 27.2 Q141.7 24.5 137.4 38.3 Q151.9 38.5 144.9 51.1 Q158.9 54.4 149.4 65.2 Q162.5 71.3 151 80 Z";

/** ختم السنة: يهوي مسرعًا ثم يستقر مائلًا، وحلقة غبار تتسع عند ارتطامه */
function Seal({ ctx, year }: { ctx: SlideCtx; year: string }) {
  const sp = useTrigger(ctx.sv, 0.2, 420, Easing.in(Easing.quad));
  const dp = useTrigger(ctx.sv, 0.245, 900);
  const stamp = useAnimatedStyle(() => ({
    opacity: Math.min(1, sp.value * 5),
    transform: [{ rotate: `${-12 - 24 * (1 - sp.value)}deg` }, { scale: 1 + 1.5 * (1 - sp.value * sp.value) }],
  }));
  const dust = useAnimatedStyle(() => ({ opacity: Math.min(1, dp.value * 30) * (1 - dp.value), transform: [{ scale: 1 + 0.9 * dp.value }] }));
  const id = useSvgId("seal");
  const ys = fitSize([year], 104, 1, 27, 16);
  const stars = Array.from({ length: 14 }, (_, i) => {
    const th = (i / 14) * Math.PI * 2;
    return { x: 80 + 50 * Math.cos(th), y: 80 + 50 * Math.sin(th) };
  });
  const pos = ctx.isRTL ? { left: -30 } : { right: -30 };
  return (
    <View style={[{ position: "absolute", bottom: -58, width: 168, height: 168 }, pos]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 84, borderWidth: 3, borderColor: "rgba(110,29,43,0.35)" }, dust]} />
      <Animated.View style={[StyleSheet.absoluteFill, { boxShadow: "0 10px 16px rgba(0,0,0,0.35)", borderRadius: 84 }, stamp]}>
        <Svg width={168} height={168} viewBox="-4 -4 168 168">
          <Defs>
            <RadialGradient id={id} cx="38%" cy="32%" r="75%">
              <Stop offset="0" stopColor="#C2475B" />
              <Stop offset="0.6" stopColor="#8E2738" />
              <Stop offset="1" stopColor="#5E1824" />
            </RadialGradient>
          </Defs>
          <Path d={SCALLOP} fill={`url(#${id})`} />
          <Circle cx={80} cy={80} r={62} fill="none" stroke="#F3D488" strokeOpacity={0.7} strokeWidth={2} />
          <Circle cx={80} cy={80} r={38} fill="none" stroke="#F3D488" strokeOpacity={0.55} strokeWidth={1.5} />
          {stars.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i % 2 ? 1.6 : 2.6} fill="#F3D488" opacity={0.85} />
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Text style={[tx(ctx, "kufi700", ys, "#F3D488", 1.2, "center"), { maxWidth: 104 }]} {...fit(1)}>
            {year}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
