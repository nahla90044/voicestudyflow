// components/brand/slides/visual/check.tsx
// سؤال الفهم والأسئلة الختامية في الشكل البصري، بمراحله الثلاث (ctx.phase):
// - ask: شارة «سؤال سريع» (أو «سؤال ختامي» / «تمرين من الكتاب»)، والسؤال يصعد، والخيارات تنقلب إلى مكانها.
// - think: حلقة تتناقص خمس ثوانٍ ويتدرج لونها من الأزرق إلى الذهبي، والعدد ٥←١ ينبض مع كل ثانية.
// - reveal: الخيار الصحيح أخضر بنبضة وقصاصات احتفال، والبقية تخفت، وصندوق الجواب يصعد.
//   correct = -1: لا يُميَّز أي خيار، ويظهر صندوق الجواب وحده.
// مكان الجواب محجوز من البداية فلا يقفز التخطيط. الطول الزائد → الجواب في عمود الحلقة بعد الكشف.
import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Circle } from "react-native-svg";

import type { QOption } from "../../../../lib/slideThemeCore";
import { SlideMotion, useLoop, useThinkRing, useTrigger, type SlideCtx } from "../shared";
import {
  alpha,
  BACK,
  Content,
  CW,
  dg,
  fit,
  frameOf,
  gridH,
  LoSvg,
  mix,
  nLines,
  optMark,
  sceneTag,
  seeded,
  startOf,
  tx,
  useFlipIn,
  usePop,
  useRise,
  V,
  type Frame,
} from "./kit";

type Q = { stem: string; options: QOption[]; answer: string; correct: number; long: boolean };

type CheckPlan = {
  mode: "A" | "B";
  sideW: number;
  qW: number;
  timer: number;
  stemS: number;
  stemLines: number;
  cols: 1 | 2;
  optW: number;
  optS: number;
  optLines: number[];
  optH: number[];
  whyS: number;
  whyLines: number;
  whyH: number;
};

function checkPlan(ctx: SlideCtx, f: Frame, q: Q): CheckPlan {
  const n = q.options.length;
  const label = ctx.t("video.answer");
  const tryMode = (mode: "A" | "B"): CheckPlan | null => {
    const sideW = mode === "A" ? 330 : 400;
    const qW = CW - sideW - (mode === "A" ? 46 : 30) - f.pad;
    const timer = mode === "A" ? 280 : 220;
    for (let sc = 1; sc >= 0.4; sc -= 0.04) {
      const stemS = Math.max(18, Math.round(36 * f.k * sc));
      const stemLines = Math.max(1, nLines(q.stem, qW, stemS));
      const optS = Math.max(16, Math.round(28 * f.k * sc));
      const whyS = Math.max(16, Math.round(25 * f.k * sc));
      for (const cols of n >= 2 ? ([2, 1] as const) : ([1] as const)) {
        const optW = cols === 2 ? (qW - 16) / 2 : qW;
        const otw = optW - 36 - 46 - 14;
        const optLines = q.options.map((o) => Math.max(1, nLines(o.text, otw, optS)));
        if (optLines.some((l) => l > 3)) continue;
        const optH = optLines.map((l) => Math.max(Math.round(82 * Math.min(1, sc + 0.1)), l * Math.round(optS * 1.35) + 22));
        const optsH = n ? 20 + gridH(optH, cols, 14) : 0;
        let whyLines = 0;
        let whyH = 0;
        let sideOk = true;
        if (mode === "A") {
          whyLines = q.answer ? Math.max(1, nLines(`${label}: ${q.answer}`, qW - 92, whyS)) : 0;
          whyH = q.answer ? 18 + whyLines * Math.round(whyS * 1.4) + 26 : 0;
        } else {
          whyLines = q.answer ? Math.max(1, nLines(q.answer, sideW - 48, whyS)) : 0;
          sideOk = !q.answer || 96 + 14 + 32 + 12 + whyLines * Math.round(whyS * 1.45) + 44 <= f.H;
        }
        const total = 40 + 14 + stemLines * Math.round(stemS * 1.5) + optsH + whyH;
        if (total <= f.H && sideOk) return { mode, sideW, qW, timer, stemS, stemLines, cols, optW, optS, optLines, optH, whyS, whyLines, whyH };
      }
    }
    return null;
  };
  const A = tryMode("A");
  if (A && (!q.long || A.stemS >= Math.round(26 * f.k))) return A;
  const B = tryMode("B");
  if (B && (!A || B.stemS > A.stemS)) return B;
  if (A) return A;
  // آخر احتياط: الجواب في العمود الجانبي وأصغر الخطوط (لا يُخفى شيء)
  const sideW = 400;
  const qW = CW - sideW - 30 - f.pad;
  const cols = q.options.length >= 2 ? 2 : 1;
  const optW = cols === 2 ? (qW - 16) / 2 : qW;
  const optLines = q.options.map((o) => Math.max(1, nLines(o.text, optW - 96, 16)));
  return {
    mode: "B",
    sideW,
    qW,
    timer: 200,
    stemS: 18,
    stemLines: nLines(q.stem, qW, 18),
    cols,
    optW,
    optS: 16,
    optLines,
    optH: optLines.map((l) => l * 22 + 22),
    whyS: 16,
    whyLines: nLines(q.answer, sideW - 48, 16),
    whyH: 0,
  };
}

/** نص الجواب بلا «الجواب:» في أوله (تسبقه تسمية «الجواب» في الصندوق) */
function answerBody(a: string): string {
  const s = String(a ?? "").trim();
  const out = s.replace(/^(?:(?:ال)?(?:جواب|إجابة|اجابة)(?:\s+(?:ال)?صحيحة?)?|(?:the\s+)?(?:correct\s+)?answer(?:\s+is)?)\s*[:：\-–]\s*/i, "").trim();
  return out || s;
}

/** قيمة ٠→١ تتبع شرطًا (المرحلة) بانتقال زمني، وفورًا مع تقليل الحركة */
function useOn(on: boolean, ms = 520) {
  const { reduced } = useContext(SlideMotion);
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    if (reduced) v.value = on ? 1 : 0;
    else v.value = withTiming(on ? 1 : 0, { duration: ms });
    return () => cancelAnimation(v);
  }, [on, ms, reduced, v]);
  return v;
}

export function CheckScene({ ctx }: { ctx: SlideCtx }) {
  const f = frameOf(ctx);
  const raw = ctx.m.check ?? { stem: ctx.m.title, options: [], answer: "", correct: -1, long: false };
  const q: Q = { ...raw, answer: answerBody(raw.answer) };
  const plan = checkPlan(ctx, f, q);
  const ask = ctx.phase === "ask";
  const reveal = ctx.phase === "reveal";
  const tag = sceneTag(ctx);
  return (
    <Content f={f}>
      <View style={{ flexDirection: ctx.row, alignItems: "center", gap: plan.mode === "A" ? 46 : 30, height: f.H, paddingLeft: f.pad }}>
        <View style={{ width: plan.qW, alignItems: startOf(ctx) }}>
          <QBadge ctx={ctx} label={tag.label} color={tag.color} icon={tag.icon} />
          <Stem ctx={ctx} q={q} plan={plan} at={ask ? 0.045 : -1} />
          {q.options.length ? (
            <View style={{ alignSelf: "stretch", marginTop: 20, flexDirection: plan.cols === 2 ? ctx.row : "column", flexWrap: "wrap", columnGap: 16, rowGap: 14 }}>
              {q.options.map((o, i) => (
                <Opt key={i} ctx={ctx} o={o} i={i} plan={plan} at={ask ? 0.08 + i * 0.03 : -1} state={!reveal || q.correct < 0 ? "idle" : q.correct === i ? "right" : "wrong"} />
              ))}
            </View>
          ) : null}
          {plan.mode === "A" && q.answer ? (
            <View style={{ alignSelf: "stretch", minHeight: plan.whyH, marginTop: 18 }}>{reveal ? <Why ctx={ctx} q={q} plan={plan} /> : null}</View>
          ) : null}
        </View>
        <View style={{ width: plan.sideW, height: f.H, alignItems: "center", justifyContent: "center", gap: 18 }}>
          {plan.mode === "B" && reveal && q.answer ? <SideAnswer ctx={ctx} q={q} plan={plan} /> : <Timer ctx={ctx} size={plan.timer} />}
          {plan.mode === "B" && reveal && q.answer ? null : <PhaseLabel key={ctx.phase} ctx={ctx} />}
        </View>
      </View>
    </Content>
  );
}

function QBadge({ ctx, label, color, icon }: { ctx: SlideCtx; label: string; color: string; icon: ReturnType<typeof sceneTag>["icon"] }) {
  const pop = usePop(ctx.sv, ctx.phase === "ask" ? 0.02 : -1, 0.5);
  const wob = useLoop(1100);
  const w = useAnimatedStyle(() => ({ transform: [{ rotate: `${-10 + 20 * wob.value}deg` }] }));
  return (
    <Animated.View style={[{ flexDirection: ctx.row, alignItems: "center", gap: 9, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color, transformOrigin: ctx.isRTL ? "right" : "left" }, pop]}>
      <Animated.View style={w}>
        <Ionicons name={icon} size={22} color="#04203A" />
      </Animated.View>
      <Text style={tx(ctx, "plex700", 20, "#04203A", 1.3)} {...fit(1)}>
        {label}
      </Text>
    </Animated.View>
  );
}

function Stem({ ctx, q, plan, at }: { ctx: SlideCtx; q: Q; plan: CheckPlan; at: number }) {
  const a = useRise(ctx.sv, at);
  if (!q.stem) return null;
  return (
    <Animated.View style={[{ alignSelf: "stretch", marginTop: 14 }, a]}>
      <Text style={tx(ctx, "plex600", plan.stemS, V.ink, 1.5)} {...fit(plan.stemLines)}>
        {q.stem}
      </Text>
    </Animated.View>
  );
}

function Opt({ ctx, o, i, plan, at, state }: { ctx: SlideCtx; o: QOption; i: number; plan: CheckPlan; at: number; state: "idle" | "right" | "wrong" }) {
  const flip = useFlipIn(ctx.sv, at);
  const rv = useOn(state !== "idle", 560);
  const right = state === "right";
  const wrong = state === "wrong";
  const inner = useAnimatedStyle(() => ({
    opacity: wrong ? 1 - 0.64 * rv.value : 1,
    transform: [{ scale: right ? 1 + 0.07 * Math.sin(Math.min(1, rv.value) * Math.PI) : 1 }],
  }));
  const okA = useAnimatedStyle(() => ({ opacity: right ? rv.value : 0 }));
  const h = plan.optH[i] ?? 82;
  return (
    <Animated.View style={[{ width: plan.cols === 2 ? plan.optW : undefined, minHeight: h }, flip]}>
      <Animated.View style={[{ flex: 1, minHeight: h }, inner]}>
        <View style={{ ...StyleSheet.absoluteFillObject, borderRadius: 22, backgroundColor: V.card, borderWidth: 2, borderColor: alpha(V.ink, 0.1) }} />
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 22, backgroundColor: mix(V.law, V.card, 0.2), borderWidth: 2, borderColor: V.law, boxShadow: `0 0 40px -4px ${alpha(V.law, 0.55)}` }, okA]} />
        <View style={{ flex: 1, flexDirection: ctx.row, alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 11 }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: alpha(V.q, 0.18) }}>
            <Text style={tx(ctx, "plex700", 25, V.q, 1.2, "center")} {...fit(1)}>
              {optMark(ctx, o.marker, i)}
            </Text>
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: V.law, alignItems: "center", justifyContent: "center" }, okA]}>
              <Ionicons name="checkmark" size={28} color="#05301A" />
            </Animated.View>
          </View>
          <Text style={[tx(ctx, "plex600", plan.optS, V.ink, 1.35), { flex: 1 }]} {...fit(plan.optLines[i] ?? 1)}>
            {o.text}
          </Text>
        </View>
        {right ? <Burst ctx={ctx} /> : null}
      </Animated.View>
    </Animated.View>
  );
}

/** ١٦ قصاصة تتطاير من الخيار الصحيح لحظة الكشف */
function Burst({ ctx }: { ctx: SlideCtx }) {
  const p = useTrigger(ctx.sv, -1, 1300, Easing.linear);
  const rnd = seeded(11);
  const cs = [V.law, V.brand, V.def, V.cond, V.type, V.q];
  const pieces = Array.from({ length: 16 }, (_, i) => {
    const ang = (i / 16) * Math.PI * 2 + rnd() * 0.4;
    const d = 90 + rnd() * 140;
    return { dx: Math.cos(ang) * d * 1.3, dy: Math.sin(ang) * d - 60, rot: 200 + rnd() * 500, c: cs[i % cs.length] };
  });
  return (
    <View style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }} pointerEvents="none">
      {pieces.map((pc, i) => (
        <Piece key={i} p={p} {...pc} />
      ))}
    </View>
  );
}

function Piece({ p, dx, dy, rot, c }: { p: ReturnType<typeof useTrigger>; dx: number; dy: number; rot: number; c: string }) {
  const a = useAnimatedStyle(() => {
    const v = p.value;
    return {
      opacity: v > 0 && v < 1 ? Math.min(1, v * 25) * (1 - v) : 0,
      transform: [{ translateX: dx * v }, { translateY: dy * v + 150 * v * v }, { rotate: `${rot * v}deg` }],
    };
  });
  return <Animated.View style={[{ position: "absolute", left: -6, top: -6, width: 13, height: 13, borderRadius: 3, backgroundColor: c }, a]} />;
}

function Why({ ctx, q, plan }: { ctx: SlideCtx; q: Q; plan: CheckPlan }) {
  const a = useRise(ctx.sv, -1);
  return (
    <Animated.View style={[{ flexDirection: ctx.row, alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 20, borderRadius: 18, backgroundColor: alpha(V.law, 0.13), borderWidth: 1.5, borderColor: alpha(V.law, 0.45) }, a]}>
      <Ionicons name="checkmark-circle" size={28} color={V.law} />
      <Text style={[tx(ctx, "plex500", plan.whyS, V.ink, 1.4), { flex: 1 }]} {...fit(plan.whyLines)}>
        <Text style={[{ color: V.law }, ctx.ff("plex700")]}>{ctx.t("video.answer")}: </Text>
        {q.answer}
      </Text>
    </Animated.View>
  );
}

function SideAnswer({ ctx, q, plan }: { ctx: SlideCtx; q: Q; plan: CheckPlan }) {
  const pop = usePop(ctx.sv, -1);
  const a = useRise(ctx.sv, -1, 24, 640);
  return (
    <View style={{ width: plan.sideW, alignItems: "center", gap: 14 }}>
      <Animated.View style={[{ width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: V.law, boxShadow: `0 0 30px ${alpha(V.law, 0.6)}` }, pop]}>
        <Ionicons name="checkmark" size={58} color="#05301A" />
      </Animated.View>
      <Text style={tx(ctx, "plex600", 24, V.law, 1.3, "center")} {...fit(1)}>
        {ctx.t("video.answer")}
      </Text>
      <Animated.View style={[{ alignSelf: "stretch", paddingVertical: 14, paddingHorizontal: 22, borderRadius: 20, backgroundColor: alpha(V.law, 0.12), borderWidth: 1.5, borderColor: alpha(V.law, 0.45) }, a]}>
        <Text style={tx(ctx, "plex500", plan.whyS, V.ink, 1.45)} {...fit(plan.whyLines)}>
          {q.answer}
        </Text>
      </Animated.View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** حلقة التفكير: كاملة زرقاء في السؤال، تتناقص ويتدرج لونها إلى الذهبي في التفكير، وخضراء عند الكشف */
function Timer({ ctx, size }: { ctx: SlideCtx; size: number }) {
  const left = useThinkRing(ctx.phase, ctx.playing, ctx.thinkSeconds);
  const done = useOn(ctx.phase === "reveal", 600);
  const pop = usePop(ctx.sv, ctx.phase === "ask" ? 0.03 : -1, 0.6);
  const r = 118;
  const c = 2 * Math.PI * r;
  const blue = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - left.value) }));
  const gold = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - left.value), opacity: 1 - left.value }));
  const doneA = useAnimatedStyle(() => ({ opacity: done.value }));
  const k = size / 280;
  return (
    <Animated.View style={[{ width: size, height: size }, pop]}>
      <View style={{ position: "absolute", left: 0, top: 0, width: 280, height: 280, transform: [{ scale: k }], transformOrigin: "top left" }}>
        <LoSvg w={280} h={280} res={0.6} style={[StyleSheet.absoluteFill, { transform: [{ rotate: "-90deg" }] }]}>
          <Circle cx={140} cy={140} r={r} stroke={alpha(V.ink, 0.1)} strokeWidth={16} fill="none" />
          <AnimatedCircle cx={140} cy={140} r={r} stroke={V.q} strokeWidth={16} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={blue} />
          <AnimatedCircle cx={140} cy={140} r={r} stroke={V.brand} strokeWidth={16} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={gold} />
        </LoSvg>
        <Animated.View style={[StyleSheet.absoluteFill, doneA]}>
          <View style={{ position: "absolute", left: 140 - r - 8, top: 140 - r - 8, width: (r + 8) * 2, height: (r + 8) * 2, borderRadius: r + 8, borderWidth: 16, borderColor: V.law, boxShadow: `0 0 14px ${alpha(V.law, 0.6)}` }} />
        </Animated.View>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          {ctx.phase === "ask" ? <Bulb /> : ctx.phase === "think" ? <ThinkNum key={ctx.thinkLeft} ctx={ctx} /> : <OkDisk ctx={ctx} />}
        </View>
      </View>
    </Animated.View>
  );
}

function Bulb() {
  const f = useLoop(3000);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * f.value }] }));
  return (
    <Animated.View style={a}>
      <Ionicons name="bulb-outline" size={96} color={V.q} />
    </Animated.View>
  );
}

/** العدد الباقي: يُركَّب من جديد مع كل ثانية فينبض */
function ThinkNum({ ctx }: { ctx: SlideCtx }) {
  const v = useTrigger(ctx.sv, -1, 520, BACK);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ scale: 1.14 - 0.14 * v.value }] }));
  return (
    <Animated.Text style={[tx(ctx, "kufi700", 104, V.ink, 1.15, "center"), a]} {...fit(1)}>
      {dg(ctx, Math.max(0, ctx.thinkLeft))}
    </Animated.Text>
  );
}

function OkDisk({ ctx }: { ctx: SlideCtx }) {
  const v = useTrigger(ctx.sv, -1, 700, BACK);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ scale: 0.4 + 0.6 * v.value }] }));
  return (
    <Animated.View style={[{ width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center", backgroundColor: V.law }, a]}>
      <Ionicons name="checkmark" size={76} color="#05301A" />
    </Animated.View>
  );
}

/** تسمية المرحلة تحت الحلقة (تُركَّب مع كل مرحلة فتظهر بتلاشٍ) */
function PhaseLabel({ ctx }: { ctx: SlideCtx }) {
  const v = useTrigger(ctx.sv, -1, 420);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  const [label, color] =
    ctx.phase === "ask" ? [ctx.t("video.s.kind.question"), V.dim] : ctx.phase === "think" ? [`${ctx.t("video.s.thinking")}…`, V.brand] : [ctx.t("video.answer"), V.law];
  return (
    <Animated.Text style={[tx(ctx, "plex600", 24, color, 1.2, "center"), { maxWidth: 320 }, a]} {...fit(1)}>
      {label}
    </Animated.Text>
  );
}
