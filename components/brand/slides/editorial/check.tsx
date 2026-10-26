// components/brand/slides/editorial/check.tsx
// سؤال الفهم في شكل المجلة: صفحة ذهبية كاملة تكسر الإيقاع (check والأسئلة الختامية والتمارين).
// المراحل من ctx.phase: ask (السؤال والخيارات تدخل تباعًا) ← think (حلقة تتناقص ٥ ثوانٍ وأرقام تتبدّل)
// ← reveal (الخيار الصحيح يصير حبرًا ذهبيّ النص، والبقية تخفت وتُشطب، وقرص صح، وشريط الجواب).
// مكان الجواب محجوز من البداية فلا يقفز التخطيط، والسؤال الطويل يأخذ العرض كله والحلقة تصغر بجانب الشارة.
// correct = -1: لا يُميَّز أي خيار، ويظهر شريط الجواب وحده.
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { toLocalDigits } from "../../../../lib/slideThemeCore";
import { useLoop, useThinkRing, type SlideCtx } from "../shared";
import {
  belowCorner,
  cornerPad,
  fitScale,
  Ghost,
  GOLD,
  Grow,
  IVORY,
  originStart,
  PAPER_INK,
  planAt,
  Pop,
  Rise,
  SideIn,
  Stamp,
  T,
  Tick,
  useCue,
  type Box,
  type TP,
} from "./kit";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const kOf = (ctx: SlideCtx) => (ctx.compact ? 1.12 : 1);

/** الشارة: سؤال سريع (نقطة تومض) / سؤال ختامي / تمرين من الكتاب */
function Badge({ ctx }: { ctx: SlideCtx }) {
  const { m, t } = ctx;
  const blink = useLoop(600, { enabled: ctx.playing && m.role === "check" });
  const dot = useAnimatedStyle(() => ({ opacity: 1 - 0.75 * blink.value }));
  const label = m.role === "finalEx" ? t("video.s.exercise") : m.role === "finalQ" ? t("video.s.finalQ") : t("video.check");
  const icon = m.role === "finalEx" ? "document-text-outline" : m.role === "finalQ" ? "school-outline" : null;
  return (
    <Stamp sv={ctx.sv} at={0} delay={200} style={{ alignSelf: ctx.isRTL ? "flex-end" : "flex-start" }}>
      <View style={[styles.badge, { flexDirection: ctx.row }]}>
        {icon ? <Ionicons name={icon} size={22} color={GOLD} /> : <Animated.View style={[styles.badgeDot, dot]} />}
        <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD, fontSize: 22, lineHeight: 30 }, ctx.ff("plex600")]}>
          {label}
        </Text>
      </View>
    </Stamp>
  );
}

/** حلقة التفكير: تتناقص خطيًا ثوانيَ التفكير (animatedProps واحدة للمشهد)، والرقم من thinkLeft يُختم مع كل تبدّل */
function ThinkTimer({ ctx, size }: { ctx: SlideCtx; size: number }) {
  const left = useThinkRing(ctx.phase, ctx.playing, ctx.thinkSeconds);
  const sw = Math.max(6, size * 0.05);
  const r = (size - sw) / 2 - 2;
  const c = 2 * Math.PI * r;
  const ap = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - left.value) }));
  return (
    <Pop sv={ctx.sv} at={0} ms={400} from={0.85} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: "-90deg" }, { scaleY: -1 }] }]}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="rgba(255,250,235,0.38)" stroke="rgba(18,20,46,0.12)" strokeWidth={sw} />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PAPER_INK} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={ap} />
      </Svg>
      <Digit key={ctx.thinkLeft} ctx={ctx} n={ctx.thinkLeft} size={size * 0.47} />
    </Pop>
  );
}

/** رقم العدّ التنازلي: يُركَّب مع كل ثانية فيُختم (تكبير ١٫٣٥ ← ١) */
function Digit({ ctx, n, size }: { ctx: SlideCtx; n: number; size: number }) {
  const v = useCue(ctx.sv, 0, 260);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 1.35 - 0.35 * v.value }] }));
  return (
    <Animated.View style={a}>
      <Text allowFontScaling={false} numberOfLines={1} style={[{ color: PAPER_INK, fontSize: size, lineHeight: size * 1.3, textAlign: "center" }, ctx.ff("amiri700")]}>
        {toLocalDigits(Math.max(0, n), ctx.lang)}
      </Text>
    </Animated.View>
  );
}

/** قرص الحبر بعلامة صح ذهبية (مكان الحلقة عند الكشف) */
function DoneDisc({ ctx, size }: { ctx: SlideCtx; size: number }) {
  return (
    <Stamp sv={ctx.sv} at={0} ms={600} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[styles.disc, { width: size * 0.75, height: size * 0.75, borderRadius: size }]}>
        <Tick sv={ctx.sv} at={0} delay={200} size={size * 0.45} color={GOLD} width={Math.max(3, size * 0.022)} />
      </View>
    </Stamp>
  );
}

type OptPlan = { tp: TP; h: number };

/** خيار: يدخل من جهة البداية، وعند الكشف تُركَّب طبقة الصحيح (حبر وذهب) أو الخفوت والشطب فوقه */
function Option({
  ctx,
  marker,
  text,
  p,
  w,
  i,
  state,
}: {
  ctx: SlideCtx;
  marker: string;
  text: string;
  p: OptPlan;
  w: number;
  i: number;
  state: "idle" | "ok" | "no";
}) {
  const ask = ctx.phase === "ask";
  const mk = Math.min(46, Math.max(32, p.tp.size * 1.5));
  const row = (ok: boolean) => (
    <View style={[styles.optRow, { flexDirection: ctx.row, height: p.h, gap: 16 }]}>
      {marker ? (
        <View style={[styles.optMark, { width: mk, height: mk, borderRadius: mk / 2, backgroundColor: ok ? GOLD : PAPER_INK }]}>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ color: ok ? PAPER_INK : GOLD, fontSize: mk * 0.5, lineHeight: mk * 0.7 }, ctx.ff("kufi700")]}>
            {toLocalDigits(marker, ctx.lang)}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T ctx={ctx} tp={p.tp} color={ok ? GOLD : PAPER_INK} role="plex500">
          {text}
        </T>
      </View>
      {ok ? <Tick sv={ctx.sv} at={0} delay={250} size={44} color={GOLD} width={3.2} /> : null}
    </View>
  );
  return (
    // الدخول بالترتيب في مرحلة السؤال فقط (في التفكير والكشف يبدأ التقدّم من جديد على نص آخر)
    <SideIn sv={ctx.sv} at={0} delay={ask ? 500 + i * 300 : 0} isRTL={ctx.isRTL} style={[styles.opt, { width: w, height: p.h }]}>
      {row(false)}
      {state === "ok" ? (
        <Rise sv={ctx.sv} at={0} ms={500} dist={0} style={[StyleSheet.absoluteFill, styles.optOk]}>
          {row(true)}
        </Rise>
      ) : null}
      {state === "no" ? <NoVeil ctx={ctx} inset={marker ? 16 + mk + 12 : 16} /> : null}
    </SideIn>
  );
}

/** الخيار غير الصحيح عند الكشف: غشاء بلون الصفحة يخفته، وخط شطب يُمدّ من جهة البداية */
function NoVeil({ ctx, inset }: { ctx: SlideCtx; inset: number }) {
  // الشطب على النص وحده (بعد دائرة الرمز من جهة البداية)
  const side = ctx.isRTL ? { right: inset, left: 24 } : { left: inset, right: 24 };
  return (
    <>
      <Rise sv={ctx.sv} at={0} ms={500} dist={0} style={[StyleSheet.absoluteFill, styles.veil]} />
      <Grow sv={ctx.sv} at={0} delay={200} ms={450} origin={originStart(ctx.isRTL)} style={[styles.strike, side]} />
    </>
  );
}

export function CheckPage({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m, isRTL, phase } = ctx;
  const k = kOf(ctx);
  const q = useMemo(() => m.check ?? { stem: m.title, options: [], answer: "", correct: -1, long: false }, [m]);
  const cp = cornerPad(ctx, B, B.top);
  const long = q.long;
  // العمود الجانبي للحلقة (السؤال العادي)؛ والطويل يأخذ العرض كله والحلقة في صف الشارة
  const sideW = long ? 0 : ctx.compact ? 230 : 290;
  const ring = long ? 92 : ctx.compact ? 200 : 240;
  const mainW = B.w - sideW - (sideW ? 40 : 0);
  const opts = q.options;
  const n = opts.length;
  const grid = n > 3 || (long && n > 2);
  const marked = (rev: boolean) => (rev && q.correct >= 0 ? q.correct : -1);
  const ansLabel = q.correct >= 0 && opts[q.correct]?.marker ? `${ctx.t("video.answer")} ${toLocalDigits(opts[q.correct].marker, ctx.lang)}` : ctx.t("video.answer");
  const plan = useMemo(() => {
    const tw = mainW - (isRTL && sideW ? 0 : cp);
    const badgeH = long ? Math.max(46, ring) : 46;
    const H = B.h - badgeH - 18;
    const cols = grid ? 2 : 1;
    const ow = cols === 2 ? (tw - 14) / 2 : Math.min(tw, long ? tw : 820);
    const pillW = ansLabel.length * 0.56 * 19 + 30;
    const build = (s: number) => {
      const stemS = Math.max(18, (q.stem.length > 140 ? 44 : 60) * k * s);
      const stem = planAt(q.stem || " ", tw, stemS, 1.3, 12, q.stem.length > 140 ? "plex600" : "kufi700");
      const os = Math.max(15, 29 * k * s);
      const mk = Math.min(46, Math.max(32, os * 1.5));
      const op = opts.map((o) => {
        const tp = planAt(o.text, ow - (o.marker ? mk + 16 : 0) - 34 - 44, os, 1.35, 4, "plex500");
        return { tp, h: Math.max(mk + 14, tp.h + 20) };
      });
      let optH = 0;
      for (let r = 0; r < Math.ceil(n / cols); r++) {
        const hs = op.slice(r * cols, r * cols + cols).map((x) => x.h);
        const rh = Math.max(...hs);
        for (let c = 0; c < cols; c++) if (op[r * cols + c]) op[r * cols + c].h = rh;
        optH += rh + 12;
      }
      const as = Math.max(15, 25 * k * s);
      const ans = q.answer ? planAt(q.answer, tw - pillW - 52, as, 1.45, 10, "plex500") : null;
      const ansH = ans ? Math.max(62, ans.h + 22) : 0;
      return { stem, op, optH, ans, ansH, total: stem.h + 18 + optH + (ans ? ansH + 18 : 0) };
    };
    const s = fitScale((x) => build(x).total, H, 0.3);
    return { tw, ow, badgeH, cols, ...build(s) };
  }, [q, B, k, cp, mainW, sideW, isRTL, long, ring, grid, n, opts, ansLabel]);
  const reveal = phase === "reveal";
  const correct = marked(reveal);
  const sideTop = isRTL ? belowCorner(ctx, B, 130) : 130;
  return (
    <View style={StyleSheet.absoluteFill}>
      {ctx.compact ? null : <Ghost glyph="؟" size={840} color="rgba(18,20,46,0.06)" sway style={[{ top: -330 }, isRTL ? { left: -40 } : { right: -40 }]} ff={ctx.ff} />}
      <View style={{ flexDirection: ctx.row, flex: 1, gap: sideW ? 40 : 0 }}>
        <View style={{ width: mainW, paddingLeft: isRTL && sideW ? 0 : cp, gap: 18 }}>
          <View style={{ height: plan.badgeH, flexDirection: ctx.row, alignItems: "center", justifyContent: "space-between" }}>
            <Badge ctx={ctx} />
            {long ? (
              <View style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
                {phase === "think" ? <ThinkTimer ctx={ctx} size={ring} /> : null}
                {reveal ? <DoneDisc ctx={ctx} size={ring} /> : null}
              </View>
            ) : null}
          </View>
          {q.stem ? (
            <Rise sv={ctx.sv} at={0} delay={350} ms={800}>
              <T ctx={ctx} tp={plan.stem} color={PAPER_INK} role={q.stem.length > 140 ? "plex600" : "kufi700"}>
                {q.stem}
              </T>
            </Rise>
          ) : null}
          {n ? (
            <View style={{ flexDirection: ctx.row, flexWrap: "wrap", columnGap: 14, rowGap: 12 }}>
              {opts.map((o, i) => (
                <Option key={i} ctx={ctx} marker={o.marker} text={o.text} p={plan.op[i]} w={plan.ow} i={i} state={correct < 0 ? "idle" : i === correct ? "ok" : "no"} />
              ))}
            </View>
          ) : null}
          {q.answer ? (
            <View style={{ height: plan.ansH }}>
              {reveal ? (
                <Rise sv={ctx.sv} at={0} delay={350} style={[styles.ans, { flexDirection: ctx.row, minHeight: plan.ansH }]}>
                  <View style={styles.ansPill}>
                    <Text allowFontScaling={false} numberOfLines={1} style={[{ color: PAPER_INK, fontSize: 19, lineHeight: 26 }, ctx.ff("plex600")]}>
                      {ansLabel}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T ctx={ctx} tp={plan.ans!} color={IVORY} role="plex500">
                      {q.answer}
                    </T>
                  </View>
                </Rise>
              ) : null}
            </View>
          ) : null}
        </View>
        {sideW ? (
          <View style={{ width: sideW, alignItems: "center", paddingTop: sideTop }}>
            <View style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
              {phase === "think" ? <ThinkTimer ctx={ctx} size={ring} /> : null}
              {reveal ? <DoneDisc ctx={ctx} size={ring} /> : null}
            </View>
            <View style={{ height: 40, justifyContent: "center", marginTop: 14 }}>
              {phase === "think" ? (
                <Rise sv={ctx.sv} at={0} ms={400}>
                  <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.tl, ctx.ff("plex600")]}>
                    {ctx.t("video.s.thinking")}
                  </Text>
                </Rise>
              ) : reveal ? (
                <Rise sv={ctx.sv} at={0} delay={150} ms={400}>
                  <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.tl, ctx.ff("plex600")]}>
                    {correct >= 0 ? `${ctx.t("video.answer")}: ${toLocalDigits(opts[correct].marker || String(correct + 1), ctx.lang)}` : ctx.t("video.answer")}
                  </Text>
                </Rise>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { height: 46, alignItems: "center", gap: 12, paddingHorizontal: 22, borderRadius: 999, backgroundColor: PAPER_INK },
  badgeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD },
  opt: { borderRadius: 18, backgroundColor: "rgba(255,250,235,0.42)", borderWidth: 1.5, borderColor: "rgba(18,20,46,0.14)", overflow: "hidden" },
  optRow: { alignItems: "center", paddingHorizontal: 16 },
  optOk: { backgroundColor: PAPER_INK, borderRadius: 16, shadowColor: PAPER_INK, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 14 } },
  optMark: { alignItems: "center", justifyContent: "center" },
  veil: { backgroundColor: "rgba(238,196,108,0.62)" },
  strike: { position: "absolute", top: "52%", height: 2, backgroundColor: "rgba(18,20,46,0.38)" },
  disc: { backgroundColor: PAPER_INK, alignItems: "center", justifyContent: "center", shadowColor: PAPER_INK, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 18 } },
  ans: { alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, backgroundColor: "rgba(18,20,46,0.9)" },
  ansPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: GOLD },
  tl: { color: PAPER_INK, fontSize: 22, lineHeight: 30, textAlign: "center" },
});
