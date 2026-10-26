// components/brand/slides/cinematic/scenes-c.tsx
// مشاهد السينمائي (٣): الختم والاقتباس، وسؤال الفهم «لحظة صمت» (والأسئلة الختامية والتمارين) بمراحله الثلاث،
// والخلاصة «شريط العرض»، وتمهيد «أسئلة الوحدة» «فجر الفهم». المحتوى من ctx.m وحده، والأحجام مقدّرة مسبقًا.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedProps, useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { CHAR_EM, linesFor, normText, toLocalDigits, type Item, type QOption } from "../../../../lib/slideThemeCore";
import { SceneMark, useLoop, useSpan, useThinkRing, useTrigger, type SlideCtx } from "../shared";
import { kindLabel } from "./chrome";
import { alpha, Appear, asSV, Blob, C, EO, Flash, halo, leftInset, linesOf, Orb, planStack, sideInset, ts, Tx, usePhaseOn, useRun, Words, type Piece } from "./kit";
import { roleBadge } from "./scenes-a";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ===== الختم والاقتباس =====

/** كلمات على القوس العلوي للختم (كل كلمة Text مستقل مُدار — فيبقى الحرف العربي متصلًا) */
function ArcWords({ ctx, text, cx, cy, R, size }: { ctx: SlideCtx; text: string; cx: number; cy: number; R: number; size: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const ww = words.map((w) => Math.max(size * 1.4, w.length * CHAR_EM * size * 1.08));
  const space = size * 0.45;
  const total = ww.reduce((a, b) => a + b, 0) + space * Math.max(0, words.length - 1);
  const dir = ctx.isRTL ? -1 : 1;
  let acc = 0;
  return (
    <>
      {words.map((w, i) => {
        const mid = acc + ww[i] / 2;
        acc += ww[i] + space;
        const th = dir * (mid - total / 2) / R;
        const bw = ww[i] + size;
        return (
          <View key={i} style={{ position: "absolute", left: cx - bw / 2, top: cy - size * 0.75, width: bw, height: size * 1.5, transform: [{ rotate: `${th}rad` }, { translateY: -R }] }}>
            <Tx style={ts(ctx.ff, "kufi600", size, C.gold, 1.5, "center")}>{w}</Tx>
          </View>
        );
      })}
    </>
  );
}

/** الختم: يُطبع بارتداد وومضة، وقوسه بالاسم يتمايل ±٩°، وفي قرصه السنة (أو أيقونة المشهد) */
function Seal({ ctx, size, left, top, year, arc }: { ctx: SlideCtx; size: number; left: number; top: number; year?: string; arc: string }) {
  const { ff, sv, lang } = ctx;
  const sway = useLoop(9000);
  const sw = useAnimatedStyle(() => ({ transform: [{ rotate: `${-9 + 18 * sway.value}deg` }] }));
  const u = size / 350;
  const dots = Array.from({ length: 22 }, (_, i) => {
    const a = (Math.PI * (110 + (i * 140) / 21)) / 180;
    return [175 + 156 * Math.sin(a), 175 - 156 * Math.cos(a)];
  });
  const disc = 212 * u;
  return (
    <View style={{ position: "absolute", left, top, width: size, height: size }}>
      <Flash sv={sv} at={0.07} style={{ position: "absolute", left: -60 * u, top: -60 * u, width: size + 120 * u, height: size + 120 * u }}>
        <Blob w={size + 120 * u} h={size + 120 * u} res={6} stops={[[0, C.gold3, 0.55], [0.55, C.gold, 0.15], [1, C.gold, 0]]} />
      </Flash>
      <Appear sv={sv} at={0.04} kind="stamp" style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, sw]}>
          <Svg width={size} height={size} viewBox="0 0 350 350">
            <Circle cx={175} cy={175} r={170} fill="rgba(42,30,12,0.55)" stroke={C.gold2} strokeWidth={2} />
            <Circle cx={175} cy={175} r={118} fill="none" stroke="rgba(246,213,138,0.45)" strokeWidth={1.5} strokeDasharray="3 6" />
            {dots.map((d, i) => (
              <Circle key={i} cx={d[0]} cy={d[1]} r={2.2} fill={C.gold} />
            ))}
          </Svg>
          {arc ? <ArcWords ctx={ctx} text={arc} cx={size / 2} cy={size / 2} R={144 * u} size={25 * u} /> : null}
        </Animated.View>
        <View style={[styles.disc, { left: (size - disc) / 2, top: (size - disc) / 2, width: disc, height: disc, borderRadius: disc / 2 }]}>
          <LinearGradient colors={["#4A3A1C", "#1A1308"]} start={{ x: 0.35, y: 0.25 }} end={{ x: 0.75, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: disc / 2 }]} />
          <View style={[styles.discRing, { borderRadius: disc / 2 - 6 }]} />
          {year ? (
            <>
              <SceneMark m={ctx.m} size={30 * u} color={alpha(C.gold, 0.8)} />
              <Tx style={[ts(ff, "kufi700", 58 * u, C.gold, 1.25, "center"), styles.goldGlow]}>{`${toLocalDigits(year, lang)}${lang === "ar" ? "هـ" : " AH"}`}</Tx>
            </>
          ) : (
            <SceneMark m={ctx.m} size={84 * u} color={C.gold} />
          )}
        </View>
      </Appear>
    </View>
  );
}

/** علامة الاقتباس الكبيرة (❝) مرسومة — لا تعتمد على وجود الرمز في الخط */
function QuoteMark() {
  const mark = (x: number) =>
    `M${x + 15} 66a15 15 0 1 1 0.1 0Z M${x + 2} 58C${x - 2} 34 ${x + 10} 14 ${x + 32} 6L${x + 35} 13C${x + 20} 21 ${x + 13} 34 ${x + 16} 50Z`;
  return (
    <Svg width={96} height={74} viewBox="0 0 96 74">
      <Path d={`${mark(6)} ${mark(52)}`} fill={alpha(C.gold, 0.4)} />
    </Svg>
  );
}

export function SealScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, sv } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const year = m.template === "seal" ? m.seal?.year : undefined;
  const main = m.highlight || m.title || m.items[0]?.text || "";
  const items = m.highlight || m.title ? m.items : m.items.slice(1);
  const by = m.highlight ? m.title : kindLabel(ctx);
  const size = ctx.compact ? 300 : 350;
  const sealTop = 330 - size / 2;
  // الختم في جهة النهاية؛ وفي العربية (يسارًا) يبتعد عن مربع الزاوية إن امتد إليه
  const sealLeft = ctx.isRTL ? (ctx.safe.corner > sealTop - 30 ? Math.max(140, ctx.safe.corner + 24) : 140) : 1280 - 140 - size;
  const colTop0 = 110;
  const colL = ctx.isRTL ? Math.max(1280 - 110 - 610, sealLeft + size + 40) : leftInset(ctx, colTop0, 110);
  const colW = ctx.isRTL ? 1280 - 110 - colL : 1280 - 140 - size - 60 - colL;
  const pieces: Piece[] = [
    { fixed: 74 },
    { text: main, w: colW, base: 52, min: 24, lh: 1.7, max: 8 },
    { fixed: by ? 40 : 0 },
    ...items.map((it): Piece => ({ text: it.text, w: colW, base: 24, min: 15, lh: 1.45, max: 3 })),
  ];
  const plan = planStack(pieces, 600 - 96, 14, k);
  const colTop = 96 + Math.max(0, (504 - plan.total) / 2);
  // اسم المرجع على القوس إن اتسع (≤ ٨٥٪ من نصف الدائرة)، وإلا يبقى في سطر «المرجع» وحده
  const arcLen = (s: string) => s.length * CHAR_EM * 25 * 1.08;
  const arcMax = Math.PI * 144 * 0.85;
  const arc = m.title && arcLen(`✦ ${m.title} ✦`) <= arcMax ? `✦ ${m.title} ✦` : "";
  const sizes = plan.sizes.slice(3);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Seal ctx={ctx} size={size} left={sealLeft} top={sealTop} year={year} arc={arc} />
      <View style={{ position: "absolute", top: colTop, left: colL, width: colW, gap: 14 }}>
        <Appear sv={sv} at={0.1} kind="fade" style={{ height: 74, alignItems: ctx.isRTL ? "flex-end" : "flex-start" }}>
          <QuoteMark />
        </Appear>
        <Words text={main} sv={sv} from={0.14} to={0.4} lines={plan.lines[1] || 8} color={C.ivory} style={ts(ff, "amiri400", plan.sizes[1], C.ivory, 1.55, ctx.align)} keyword={m.keyword} kwAt={0.45} />
        {by ? (
          <Appear sv={sv} at={0.48} kind="fade" style={{ flexDirection: ctx.row, alignItems: "center", gap: 14, minHeight: 40 }}>
            <View style={{ width: 48, height: 2, backgroundColor: C.gold2 }} />
            <View style={{ flex: 1 }}>
              <Tx style={ts(ff, "plex500", 25 * k, C.mist, 1.45, ctx.align)}>{by}</Tx>
            </View>
          </Appear>
        ) : null}
        {items.map((it, i) => (
          <Appear key={i} sv={sv} at={Math.min(0.92, Math.max(0.5, it.at))} kind="up">
            <Tx lines={3} style={ts(ff, "plex400", sizes[i] ?? 18, C.mist, 1.45, ctx.align)}>
              {it.text}
            </Tx>
          </Appear>
        ))}
      </View>
    </View>
  );
}

// ===== سؤال الفهم: لحظة صمت =====

type CheckPlan = { mode: "none" | "row" | "grid" | "col"; optW: number; S: number; O: number; A: number; sl: number; ol: number[]; al: number; total: number };

/** أحجام السؤال والخيارات والجواب (أو حلقة التفكير) حتى يتسع كل شيء بين y=١٠٠ وy=٥٩٨ */
function planCheck(q: { stem: string; options: QOption[]; answer: string }, W: number, reveal: boolean, k: number): CheckPlan {
  const n = q.options.length;
  const maxLen = Math.max(0, ...q.options.map((o) => o.text.length));
  const mode: CheckPlan["mode"] = n === 0 ? "none" : n <= 3 && maxLen <= 18 ? "row" : n >= 2 && (n >= 4 || maxLen <= 44) ? "grid" : "col";
  const optW = mode === "row" ? Math.min(330, (W - 28 * (n - 1)) / n) : mode === "grid" ? (W - 20) / 2 : W;
  const textW = optW - 48 - 52 - 18;
  const ansW = Math.min(W, 900) - 56;
  const H = 498;
  let last: CheckPlan | null = null;
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    const S = Math.max(20, (n ? 44 : 50) * k * s);
    const O = Math.max(16, (mode === "row" ? 34 : 30) * k * s);
    const A = Math.max(16, 29 * k * s);
    const sl = q.stem ? linesFor(q.stem, W, S) : 0;
    const ol = q.options.map((o) => linesFor(o.text, textW, O));
    const al = reveal && q.answer ? linesFor(q.answer, ansW, A) : 0;
    const cols = mode === "row" ? n : mode === "grid" ? 2 : 1;
    let optH = 0;
    for (let r = 0; r < Math.ceil(n / Math.max(1, cols)); r++) {
      const rowL = Math.max(1, ...ol.slice(r * cols, r * cols + cols));
      optH += Math.max(mode === "row" ? 104 : 72, Math.max(52, rowL * O * 1.45) + 28) + (r ? 14 : 0);
    }
    const slot = reveal ? (q.answer ? 32 + 36 + 6 + al * A * 1.5 : 0) : 128;
    const parts = [54, sl * S * 1.5, optH, slot].filter((h) => h > 0);
    const total = parts.reduce((a, b) => a + b, 0) + 16 * (parts.length - 1);
    last = { mode, optW, S, O, A, sl, ol, al, total };
    if (total <= H && sl <= 10 && ol.every((l) => l <= 4) && al <= 9) break;
  }
  return last as CheckPlan;
}

/** حلقة التفكير: تتناقص ٥ ثوانٍ بنبض كل ثانية، والعدد الباقي في وسطها */
function ThinkRing({ ctx }: { ctx: SlideCtx }) {
  const left = useThinkRing(ctx.phase, ctx.playing, ctx.thinkSeconds);
  const beat = useLoop(1000, { reverse: false, easing: Easing.linear, enabled: ctx.phase === "think" && ctx.playing });
  const r = 52;
  const c = 2 * Math.PI * r;
  const ap = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - left.value) }));
  const bs = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(beat.value, [0, 0.12, 0.24, 1], [1, 1.07, 1, 1], Extrapolation.CLAMP) }] }));
  return (
    <Animated.View style={[{ width: 120, height: 120, alignItems: "center", justifyContent: "center" }, bs]}>
      <Svg width={120} height={120} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={60} cy={60} r={r} stroke="rgba(246,240,225,0.12)" strokeWidth={6} fill="none" />
        <AnimatedCircle cx={60} cy={60} r={r} stroke={C.gold} strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray={`${c} ${c}`} animatedProps={ap} />
      </Svg>
      <Tx style={ts(ctx.ff, "kufi700", 50, C.gold, 1.3, "center")}>{toLocalDigits(ctx.thinkLeft, ctx.lang)}</Tx>
    </Animated.View>
  );
}

/** خيار: ينبثق متتابعًا، وفي الكشف يكبر الصحيح ١٫٠٧ بتوهّج وومضة وعلامة ✓ ويخفت غيره إلى ‎.3 */
function Option({
  ctx,
  o,
  i,
  at,
  askSv,
  rv,
  w,
  size,
  lines,
  minH,
  right,
  wrong,
}: {
  ctx: SlideCtx;
  o: QOption;
  i: number;
  at: number;
  askSv: SharedValue<number>;
  rv: SharedValue<number>;
  w: number;
  size: number;
  lines: number;
  minH: number;
  right: boolean;
  wrong: boolean;
}) {
  const { ff, lang } = ctx;
  const st = useAnimatedStyle(() => ({ opacity: wrong ? 1 - 0.7 * rv.value : 1, transform: [{ scale: right ? 1 + 0.07 * rv.value : 1 }] }), [right, wrong]);
  const glow = useAnimatedStyle(() => ({ opacity: right ? rv.value : 0 }), [right]);
  const burst = useAnimatedStyle(
    () => ({
      opacity: right ? interpolate(rv.value, [0, 0.3, 1], [0, 1, 0], Extrapolation.CLAMP) : 0,
      transform: [{ scale: interpolate(rv.value, [0, 0.3, 1], [0.3, 1, 1.7], Extrapolation.CLAMP) }],
    }),
    [right]
  );
  const tick = useAnimatedStyle(() => ({ opacity: right ? Math.min(1, rv.value * 1.5) : 0, transform: [{ scale: 0.35 + 0.65 * rv.value }] }), [right]);
  const mark = o.marker ? toLocalDigits(o.marker, lang) : toLocalDigits(i + 1, lang);
  return (
    <Appear sv={askSv} at={at} kind="pop" style={{ width: w }}>
      <Animated.View style={st}>
        {right ? (
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: w / 2 - 280, top: minH / 2 - 280, width: 560, height: 560 }, burst]}>
            <Blob w={560} h={560} res={8} stops={[[0, "#FFF6DE", 0.75], [0.4, C.gold, 0.25], [1, C.gold, 0]]} />
          </Animated.View>
        ) : null}
        <View style={[styles.opt, { minHeight: minH, flexDirection: ctx.row }]}>
          {right ? (
            <Animated.View pointerEvents="none" style={[styles.optGlow, glow]}>
              <LinearGradient colors={[alpha(C.gold, 0.24), alpha(C.gold, 0.06)]} start={{ x: ctx.isRTL ? 1 : 0, y: 0 }} end={{ x: ctx.isRTL ? 0 : 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
            </Animated.View>
          ) : null}
          <View style={styles.optMark}>
            <Tx style={ts(ff, "kufi600", 26, C.gold, 1.3, "center")}>{mark}</Tx>
          </View>
          <View style={{ flex: 1 }}>
            <Tx lines={lines} style={ts(ff, "plex600", size, C.ivory, 1.45, ctx.align)}>
              {o.text}
            </Tx>
          </View>
        </View>
        {right ? (
          <Animated.View style={[styles.tick, ctx.isRTL ? { left: -14 } : { right: -14 }, tick]}>
            <Ionicons name="checkmark" size={26} color={C.onGold} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </Appear>
  );
}

/** أشرطة السينما السوداء (٨٤ أعلى، ١١٦ أسفل) تنزل، والأنوار تخفت حول السؤال */
function Letterbox({ ctx }: { ctx: SlideCtx }) {
  const v = useTrigger(ctx.sv, 0, 560, EO);
  const top = useAnimatedStyle(() => ({ transform: [{ translateY: -84 * (1 - Math.min(1, v.value)) }] }));
  const bot = useAnimatedStyle(() => ({ transform: [{ translateY: 116 * (1 - Math.min(1, v.value)) }] }));
  const dim = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value) }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(2,3,10,0.6)" }, dim]} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 640 - 550, top: 330 - 310, width: 1100, height: 620 }, dim]}>
        <Blob w={1100} h={620} res={10} stops={[[0, C.gold, 0.16], [0.6, C.gold, 0.04], [1, C.gold, 0]]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.barTop, top]} />
      <Animated.View pointerEvents="none" style={[styles.barBot, bot]} />
    </>
  );
}

export function CheckScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv, phase } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const q = m.check ?? { stem: m.title, options: [], answer: "", correct: -1, long: false };
  const askSv = asSV(useDerivedValue(() => (phase === "ask" ? sv.value : 1), [phase]));
  const rv = usePhaseOn(phase === "reveal", 650, EO);
  const reveal = phase === "reveal";
  const L0 = 120;
  const padL = Math.max(0, leftInset(ctx, 100, L0) - L0);
  const W = 1280 - 2 * L0 - padL;
  const plan = planCheck(q, W, reveal, k);
  const role = roleBadge(ctx);
  const label = phase === "think" ? t("video.s.thinking") : role ? role.label : t("video.check");
  const icon = phase === "think" ? "hourglass-outline" : role ? role.icon : "help-circle-outline";
  const n = q.options.length;
  const optAt = (i: number) => Math.min(0.9, 0.42 + i * Math.min(0.08, 0.4 / Math.max(1, n)));
  const known = q.correct >= 0 && q.correct < n;
  const minH = plan.mode === "row" ? 104 : 72;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Letterbox ctx={ctx} />
      <View style={{ position: "absolute", top: 100, left: L0 + padL, right: L0, height: 498, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Appear sv={sv} at={0.02} kind="up" style={{ flexDirection: ctx.row, alignItems: "center", gap: 14, height: 54 }}>
          <View style={styles.ckOrb}>
            <Blob w={44} h={44} res={2} fx={0.38} fy={0.32} stops={[[0, C.gold3, 0.32], [0.95, C.gold, 0.06], [1, C.gold, 0]]} style={{ left: 0, top: 0 }} />
            <Ionicons name={icon} size={24} color={C.gold} />
          </View>
          <Tx style={ts(ff, "kufi600", 30 * k, C.gold, 1.4)}>{label}</Tx>
        </Appear>
        {q.stem ? (
          <View style={{ width: W }}>
            <Words text={q.stem} sv={askSv} from={0.02} to={0.4} lines={Math.max(1, plan.sl)} color={C.ivory} style={ts(ff, "plex600", plan.S, C.ivory, 1.5, "center")} />
          </View>
        ) : null}
        {n ? (
          <View style={{ width: W, flexDirection: plan.mode === "col" ? "column" : ctx.row, flexWrap: plan.mode === "grid" ? "wrap" : "nowrap", justifyContent: "center", columnGap: plan.mode === "row" ? 28 : 20, rowGap: 14 }}>
            {q.options.map((o, i) => (
              <Option
                key={i}
                ctx={ctx}
                o={o}
                i={i}
                at={optAt(i)}
                askSv={askSv}
                rv={rv}
                w={plan.optW}
                size={plan.O}
                lines={Math.min(4, Math.max(1, plan.ol[i] ?? 1))}
                minH={minH}
                right={known && i === q.correct}
                wrong={known && i !== q.correct}
              />
            ))}
          </View>
        ) : null}
        {reveal ? (
          q.answer ? <Answer ctx={ctx} rv={rv} text={q.answer} size={plan.A} lines={Math.max(1, plan.al)} W={Math.min(W, 900)} /> : null
        ) : (
          <View style={{ height: 128, alignItems: "center", justifyContent: "center" }}>{phase === "think" ? <ThinkRing ctx={ctx} /> : null}</View>
        )}
      </View>
    </View>
  );
}

/** صندوق الإجابة: يصعد لحظة الكشف، والنص كلمةً كلمة مع الراوي (التقدّم يبدأ من الصفر على نص الجواب) */
function Answer({ ctx, rv, text, size, lines, W }: { ctx: SlideCtx; rv: SharedValue<number>; text: string; size: number; lines: number; W: number }) {
  const { ff, t, sv } = ctx;
  const st = useAnimatedStyle(() => ({ opacity: rv.value, transform: [{ translateY: (1 - rv.value) * 26 }] }));
  return (
    <Animated.View style={[styles.ans, { width: W }, st]}>
      <LinearGradient colors={[alpha(C.gold, 0.16), alpha(C.gold, 0.05)]} start={{ x: ctx.isRTL ? 1 : 0, y: 0 }} end={{ x: ctx.isRTL ? 0 : 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
      <View style={{ flexDirection: ctx.row, alignItems: "center", justifyContent: "center", gap: 10, height: 36 }}>
        <Ionicons name="checkmark-circle" size={26} color={C.gold} />
        <Tx style={ts(ff, "kufi600", 26, C.gold, 1.4)}>{t("video.answer")}</Tx>
      </View>
      <Words text={text} sv={sv} from={0.02} to={0.9} lines={lines} color={C.ivory} style={ts(ff, "plex500", size, C.ivory, 1.5, "center")} />
    </Animated.View>
  );
}

// ===== الخلاصة: شريط العرض =====

/** ثقوب الشريط السينمائي (سطر واحد من مستطيلات) */
function Sprockets({ w }: { w: number }) {
  let d = "";
  for (let x = 0; x < w; x += 46) d += `M${x} 0h22v14h-22z`;
  return (
    <Svg width={w} height={14}>
      <Path d={d} fill="rgba(246,240,225,0.16)" />
    </Svg>
  );
}

/** إطار فكرة: يضيء لحظة نطقها (من شفافية ‎.2) مع ومضة، وينال ✓ */
function Frame({ ctx, it, at, w, h, hs, bs, hl, bl }: { ctx: SlideCtx; it: Item; at: number; w: number; h: number; hs: number; bs: number; hl: number; bl: number }) {
  const { ff, sv } = ctx;
  const body = it.head ? it.body : it.text;
  return (
    <Appear sv={sv} at={at} kind="light" ms={700} style={[styles.frm, { width: w, minHeight: h }]}>
      <LinearGradient colors={["#18205A", "#0D1234"]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
      <Flash sv={sv} at={at} style={{ position: "absolute", left: -20, top: -20, right: -20, bottom: -20 }}>
        <Blob w={w + 40} h={h + 40} res={6} stops={halo("#FFF8E6", 0.55)} style={{ left: 0, top: 0 }} />
      </Flash>
      {it.head ? (
        <Tx lines={Math.max(1, hl)} style={ts(ff, "kufi600", hs, C.gold, 1.32, "center")}>
          {it.head}
        </Tx>
      ) : null}
      {body ? (
        <Tx lines={Math.max(1, bl)} style={ts(ff, it.head ? "plex400" : "plex500", it.head ? bs : hs * 0.86, C.ivory, 1.45, "center")}>
          {body}
        </Tx>
      ) : null}
      <Appear sv={sv} at={Math.min(0.95, at + 0.04)} kind="pop" style={[styles.fst, ctx.isRTL ? { left: -15 } : { right: -15 }]}>
        <Ionicons name="checkmark" size={24} color={C.onGold} />
      </Appear>
    </Appear>
  );
}

/** الشريط ينساب ببطء (زمنيًا أثناء التشغيل) */
function Strip({ ctx, top, h, children }: { ctx: SlideCtx; top: number; h: number; children: React.ReactNode }) {
  const run = useRun(16000);
  const dir = ctx.isRTL ? 1 : -1;
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: (12 - 24 * run.value) * dir }] }));
  return (
    <Appear sv={ctx.sv} at={0.03} kind="side" from={dir} style={{ position: "absolute", top, left: -60, right: -60, height: h }}>
      <Animated.View style={[StyleSheet.absoluteFill, st]}>
        <LinearGradient colors={["#060818", "#0B1028", "#060818"]} style={[StyleSheet.absoluteFill, styles.strip]} />
        <View style={{ position: "absolute", top: 11, left: 0 }}>
          <Sprockets w={1400} />
        </View>
        <View style={{ position: "absolute", bottom: 11, left: 0 }}>
          <Sprockets w={1400} />
        </View>
        {children}
      </Animated.View>
    </Appear>
  );
}

/** خيط ذهبي يربط الإطارات (صف الإطارات الأول) */
function Thread({ ctx, w, a, b }: { ctx: SlideCtx; w: number; a: number; b: number }) {
  const f = useSpan(ctx.sv, a, b);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: f.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 39, left: 60 + 640 - w / 2, width: w, height: 2.5, backgroundColor: C.gold, transformOrigin: ctx.isRTL ? "right" : "left" }, st]} />
  );
}

export function SummaryScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const S = sideInset(ctx, 88, 96);
  const HW = 1280 - 2 * S;
  const label = t("video.s.summary");
  const showLabel = !!m.title && normText(m.title) !== normText(label);
  const titleS = m.title ? Math.max(30, Math.min(52 * k, 52 * k)) : 0;
  const tl = m.title ? linesOf(m.title, HW, titleS, 2) : 0;
  const tSize = m.title && linesFor(m.title, HW, titleS) > 2 ? Math.max(28, titleS * 0.7) : titleS;
  const headH = (showLabel ? 40 : 0) + tl * tSize * 1.5;
  const items = m.items;
  const n = Math.max(1, items.length);
  const rows = n <= 4 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const frameW = Math.min(cols <= 3 ? 340 : 262, (1136 - 22 * (cols - 1)) / cols);
  const tw = frameW - 36;
  const stripTop = 88 + headH + 22;
  const maxStrip = 598 - 14 - 44 - stripTop;
  const innerMax = maxStrip - 80;
  const fhMax = (innerMax - 16 * (rows - 1)) / rows;
  let fp = { hs: 29 * k, bs: 23 * k, hl: [] as number[], bl: [] as number[], fh: 0 };
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    const hs = Math.max(17, 29 * k * s);
    const bs = Math.max(14, 23 * k * s);
    const hl = items.map((it) => (it.head ? linesOf(it.head, tw, hs) : 0));
    const bl = items.map((it) => linesOf(it.head ? it.body : it.text, tw, it.head ? bs : hs * 0.86));
    const fh = Math.max(rows === 1 ? 150 : 100, ...items.map((it, i) => 32 + hl[i] * hs * 1.5 + (it.head ? 4 : 0) + bl[i] * (it.head ? bs : hs * 0.86) * 1.45));
    fp = { hs, bs, hl, bl, fh };
    if (fh <= fhMax && hl.every((l) => l <= 2) && bl.every((l) => l <= 6)) break;
  }
  const fh = Math.min(fp.fh, Math.max(fhMax, 100));
  const stripH = 80 + rows * fh + 16 * (rows - 1);
  const lastAt = items.length ? items[items.length - 1].at : 0.5;
  const thrA = Math.min(0.9, Math.max(0.64, lastAt + 0.02));
  const doneAt = Math.min(0.95, Math.max(0.76, lastAt + 0.1));
  const firstRow = Math.min(cols, items.length);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: "absolute", top: 88, left: S, right: S, alignItems: "center" }}>
        {showLabel ? (
          <Appear sv={sv} at={0.03} kind="fade" style={{ height: 40, justifyContent: "center" }}>
            <Tx style={ts(ff, "kufi600", 26 * k, C.gold, 1.4, "center")}>{label}</Tx>
          </Appear>
        ) : null}
        {m.title ? (
          <Appear sv={sv} at={0.04} kind="up" style={{ width: HW }}>
            <Tx lines={2} style={ts(ff, "kufi600", tSize, C.ivory, 1.3, "center")}>
              {m.title}
            </Tx>
          </Appear>
        ) : null}
      </View>
      <Strip ctx={ctx} top={stripTop} h={stripH}>
        {firstRow > 1 ? <Thread ctx={ctx} w={(firstRow - 1) * (frameW + 22)} a={thrA} b={Math.min(0.97, thrA + 0.1)} /> : null}
        <View style={{ position: "absolute", top: 40, left: 60, width: 1280, flexDirection: ctx.row, flexWrap: "wrap", justifyContent: "center", columnGap: 22, rowGap: 16 }}>
          {items.map((it, i) => (
            <Frame key={i} ctx={ctx} it={it} at={it.at} w={frameW} h={fh} hs={fp.hs} bs={fp.bs} hl={fp.hl[i] ?? 1} bl={fp.bl[i] ?? 2} />
          ))}
        </View>
      </Strip>
      <View style={{ position: "absolute", top: stripTop + stripH + 14, left: 0, right: 0, alignItems: "center" }}>
        <Appear sv={sv} at={doneAt} kind="pop" style={styles.done}>
          <LinearGradient colors={[C.goldHi, C.goldLo]} start={{ x: ctx.isRTL ? 1 : 0, y: 0 }} end={{ x: ctx.isRTL ? 0 : 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 30 }]} />
          <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 10 }}>
            <Tx style={ts(ff, "plex600", 24, C.onGold, 1.4)}>{t("video.s.summaryDone")}</Tx>
            <Ionicons name="checkmark" size={24} color={C.onGold} />
          </View>
        </Appear>
      </View>
    </View>
  );
}

// ===== تمهيد «أسئلة الوحدة»: فجر الفهم =====

/** شمس تطلع من الأفق وسماء تدفأ (بتقدّم الراوي) */
function Dawn({ ctx }: { ctx: SlideCtx }) {
  const f = useSpan(ctx.sv, 0, 0.38);
  const g = useSpan(ctx.sv, 0, 0.35);
  const sun = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * f.value, transform: [{ translateY: 300 * (1 - f.value) }] }));
  const sky = useAnimatedStyle(() => ({ opacity: g.value }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sky]}>
        <LinearGradient colors={["rgba(240,127,166,0)", "rgba(245,211,138,0.08)", "rgba(240,127,166,0.24)"]} locations={[0.28, 0.6, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 640 - 750, top: 720 + 560 - 860, width: 1500, height: 860 }, sun]}>
        <Blob w={1500} h={860} res={10} stops={[[0, "#FFE8AA", 0.9], [0.38, "#FAAA78", 0.5], [0.64, "#F07FA6", 0.18], [1, "#F07FA6", 0]]} />
      </Animated.View>
    </>
  );
}

/** شرر يصعد من الأفق (ساعة واحدة لكل الشرر) */
const SPARKS = [
  { x: 230, d: 6, o: 0.17 },
  { x: 384, d: 7.5, o: 0.45 },
  { x: 563, d: 6, o: 0.37 },
  { x: 730, d: 10, o: 0.48 },
  { x: 883, d: 20 / 3, o: 0.09 },
  { x: 1050, d: 6, o: 0.92 },
  { x: 128, d: 7.5, o: 0.39 },
  { x: 1165, d: 5, o: 0.31 },
];

function Spark({ clock, s }: { clock: SharedValue<number>; s: (typeof SPARKS)[number] }) {
  const st = useAnimatedStyle(() => {
    const f = (clock.value * 60) / s.d + s.o;
    const p = f - Math.floor(f);
    return { opacity: p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85, transform: [{ translateX: 30 * p }, { translateY: -460 * p }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.spark, { left: s.x }, st]} />;
}

function Sparks({ ctx }: { ctx: SlideCtx }) {
  const clock = useLoop(60000, { reverse: false, easing: Easing.linear });
  const list = ctx.compact ? SPARKS.slice(0, 4) : SPARKS;
  return (
    <>
      {list.map((s, i) => (
        <Spark key={i} clock={clock} s={s} />
      ))}
    </>
  );
}

/** بطاقة سؤال تطفو (من ساعة مشتركة بأطوار مختلفة) مائلة قليلًا */
function QCard({ ctx, it, i, n, at, w, h, size, lines, clock }: { ctx: SlideCtx; it: Item; i: number; n: number; at: number; w: number; h: number; size: number; lines: number; clock: SharedValue<number> }) {
  const { ff, lang } = ctx;
  const period = [10, 12.4, 8.8][i % 3];
  const phase = [0, 4, 2][i % 3];
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + 14 * (0.5 - 0.5 * Math.cos((2 * Math.PI * (clock.value * 120 + phase)) / period)) }] }), [period, phase]);
  const tilt = n > 1 && i === 0 ? 3 : n > 1 && i === n - 1 ? -3 : 0;
  return (
    <Appear sv={ctx.sv} at={at} kind="up" style={{ width: w }}>
      <Animated.View style={st}>
        <View style={[styles.qc, { minHeight: h, transform: [{ rotate: `${ctx.isRTL ? tilt : -tilt}deg` }] }]}>
          <LinearGradient colors={["rgba(26,24,70,0.92)", "rgba(12,14,40,0.92)"]} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
          <View style={[styles.qcNum, { alignSelf: ctx.isRTL ? "flex-end" : "flex-start" }]}>
            <Tx style={ts(ff, "kufi700", 19, C.onGold, 1.3, "center")}>{toLocalDigits(i + 1, lang)}</Tx>
          </View>
          <Tx lines={lines} style={ts(ff, "plex500", size, C.ivory, 1.45, ctx.align)}>
            {it.text}
          </Tx>
        </View>
      </Animated.View>
    </Appear>
  );
}

export function QIntroScene({ ctx }: { ctx: SlideCtx }) {
  const { m, ff, t, sv } = ctx;
  const k = ctx.compact ? 1.12 : 1;
  const clock = useLoop(120000, { reverse: false, easing: Easing.linear });
  const S = sideInset(ctx, 84, 96);
  const W = 1280 - 2 * S;
  const items = m.items;
  const n = items.length;
  const rows = n <= 3 ? 1 : 2;
  const cols = Math.max(1, Math.ceil(n / rows));
  const cw = Math.min(320, (W - 30 * (cols - 1)) / cols);
  const tSize = m.title ? Math.max(28, Math.min(50 * k, 50 * k)) : 0;
  const plan = planStack(
    [
      { fixed: 100 },
      { fixed: 40 },
      { text: m.title, w: W, base: m.title ? 50 : 0, min: 28, lh: 1.5, max: 2 },
      { fixed: 0 },
    ],
    516,
    12,
    k
  );
  const headH = plan.total;
  const cardsTop = 84 + headH + 26;
  const cardHMax = (598 - cardsTop - 18 * (rows - 1)) / rows;
  let cs = 25 * k;
  let cl = items.map(() => 1);
  for (let s = 1; s >= 0.3 - 1e-9; s -= 0.04) {
    cs = Math.max(15, 25 * k * s);
    cl = items.map((it) => linesOf(it.text, cw - 44, cs));
    const need = 36 + 36 + Math.max(1, ...cl) * cs * 1.45;
    if (need <= cardHMax && cl.every((l) => l <= 3)) break;
  }
  const cardH = Math.min(150, Math.max(100, cardHMax));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Dawn ctx={ctx} />
      <Sparks ctx={ctx} />
      <View style={{ position: "absolute", top: 84, left: S, right: S, alignItems: "center", gap: 12 }}>
        <Appear sv={sv} at={0.06} kind="pop">
          <Orb m={m} size={100} icon={50} />
        </Appear>
        <Appear sv={sv} at={0.1} kind="fade" style={{ height: 40, justifyContent: "center" }}>
          <Tx style={ts(ff, "kufi600", 26 * k, C.gold, 1.4, "center")}>{t("video.s.summaryDone")}</Tx>
        </Appear>
        {m.title ? (
          <Appear sv={sv} at={0.12} kind="up" style={{ width: W }}>
            <Tx lines={2} style={ts(ff, "kufi600", plan.sizes[2] || tSize, C.ivory, 1.3, "center")}>
              {m.title}
            </Tx>
          </Appear>
        ) : null}
      </View>
      {n ? (
        <View style={{ position: "absolute", top: cardsTop, left: S, right: S, flexDirection: ctx.row, flexWrap: "wrap", justifyContent: "center", columnGap: 30, rowGap: 18 }}>
          {items.map((it, i) => (
            <QCard key={i} ctx={ctx} it={it} i={i} n={n} at={Math.min(0.9, 0.2 + 0.04 * i)} w={cw} h={cardH} size={cs} lines={Math.min(3, Math.max(1, cl[i] ?? 1))} clock={clock} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  goldGlow: { textShadowColor: "rgba(246,213,138,0.5)", textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 } },
  disc: { position: "absolute", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: C.gold },
  discRing: { position: "absolute", left: 6, right: 6, top: 6, bottom: 6, borderWidth: 2, borderColor: "rgba(246,213,138,0.45)" },
  barTop: { position: "absolute", left: 0, right: 0, top: 0, height: 84, backgroundColor: "#000000" },
  barBot: { position: "absolute", left: 0, right: 0, bottom: 0, height: 116, backgroundColor: "#000000" },
  ckOrb: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(246,213,138,0.4)", alignItems: "center", justifyContent: "center" },
  opt: { alignItems: "center", gap: 18, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, backgroundColor: "rgba(14,18,46,0.9)", borderWidth: 1.5, borderColor: "rgba(246,240,225,0.18)" },
  optGlow: { position: "absolute", left: -2, right: -2, top: -2, bottom: -2, borderRadius: 26, borderWidth: 2.5, borderColor: C.gold },
  optMark: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: "rgba(246,213,138,0.55)", backgroundColor: "rgba(246,213,138,0.06)", alignItems: "center", justifyContent: "center" },
  tick: { position: "absolute", top: -16, width: 42, height: 42, borderRadius: 21, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
  ans: { borderRadius: 22, borderWidth: 1, borderColor: "rgba(246,213,138,0.5)", paddingHorizontal: 28, paddingVertical: 16, gap: 6 },
  strip: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(246,213,138,0.2)" },
  frm: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(246,213,138,0.28)", paddingHorizontal: 18, paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: 4 },
  fst: { position: "absolute", top: -17, width: 40, height: 40, borderRadius: 20, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
  done: { paddingHorizontal: 24, paddingVertical: 6, borderRadius: 30, minHeight: 44, justifyContent: "center" },
  spark: { position: "absolute", top: 654, width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFE7B0" },
  qc: { borderRadius: 22, borderWidth: 1, borderColor: "rgba(246,213,138,0.3)", paddingHorizontal: 22, paddingVertical: 18, gap: 8 },
  qcNum: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
});
