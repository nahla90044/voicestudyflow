// components/brand/slides/cinematic/chrome.tsx
// الإطار الدائم للشكل السينمائي (لا يُعاد مع تغيّر المشهد):
// - CinemaBackdrop: ست طبقات بعمق — تدرّج ينجرف، وثلاث سُدُم بلون «معنى» المشهد (تتقاطع طبقتان بالشفافية عند تغيّره)،
//   ونجوم بثلاث سرعات (عمق)، وشعاع يتمايل، وتظليل الحواف، وأرضية. ساعة واحدة (useLoop) تحرّك كل شيء،
//   والنجوم نقاط ثابتة مع ٣ مجموعات وميض فقط. دفع بالعمق عند دخول كل مشهد.
// - CinemaHeader: خط التقدّم الذهبي في الأعلى، وحبة الوحدة والمشهد، ونوع المشهد.
// - CinemaCaption: ترجمة كاريوكي بلا صندوق (ما لم يُنطق خافت، والكلمة الحالية ذهبية، وما نُطق عاجي).
// - CinemaTransition: مسح ضوئي هو الأساس، وانغلاق القزحية قبل السؤال، ودفع بالعمق قبل التفرّع والمجموعات،
//   وفجر قبل «أسئلة الوحدة» — كلها في فاصل الصمت (٥٥٠ مللي ثانية).
import { LinearGradient } from "expo-linear-gradient";
import React, { useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { captionAt, captionChunk, kindOf, THINK_SECONDS, toLocalDigits, type SceneModel } from "../../../../lib/slideThemeCore";
import { KaraokeText, SlideMotion, useLoop, type CaptionProps, type SlideCtx } from "../shared";
import { alpha, Blob, C, EIO, EO, leftInset, Orb, ts, Tx, type GlowStop } from "./kit";

// ===== لون المعنى =====

type RGBA = [number, number, number, number];
type Mood = { g1: RGBA; n1: RGBA; n2: RGBA; n3: RGBA; beam: RGBA };
type MoodKey = "cover" | "list" | "def" | "tree" | "cmp" | "stat" | "grp" | "seal" | "chk" | "sum" | "end";

/** إضاءة كل نوع (من النموذج): التعريف كهرماني، والتفرّع بنفسجي، والمدة فيروزية، والسؤال قرمزي خافت، والختام فجر */
const MOODS: Record<MoodKey, Mood> = {
  cover: { g1: [60, 48, 150, 0.55], n1: [66, 52, 170, 0.55], n2: [245, 190, 110, 0.2], n3: [141, 183, 255, 0.14], beam: [245, 211, 138, 0.2] },
  list: { g1: [40, 52, 140, 0.5], n1: [40, 60, 160, 0.5], n2: [141, 183, 255, 0.2], n3: [245, 211, 138, 0.1], beam: [141, 183, 255, 0.15] },
  def: { g1: [130, 90, 40, 0.38], n1: [170, 120, 50, 0.34], n2: [245, 211, 138, 0.2], n3: [80, 60, 160, 0.26], beam: [245, 211, 138, 0.26] },
  tree: { g1: [80, 60, 180, 0.5], n1: [110, 80, 220, 0.44], n2: [169, 155, 255, 0.22], n3: [60, 40, 140, 0.3], beam: [169, 155, 255, 0.15] },
  cmp: { g1: [40, 60, 140, 0.4], n1: [255, 140, 100, 0.26], n2: [110, 150, 255, 0.34], n3: [245, 211, 138, 0.1], beam: [245, 211, 138, 0.16] },
  stat: { g1: [20, 90, 110, 0.42], n1: [40, 140, 150, 0.34], n2: [245, 211, 138, 0.2], n3: [111, 227, 200, 0.16], beam: [111, 227, 200, 0.15] },
  grp: { g1: [70, 50, 170, 0.45], n1: [90, 70, 200, 0.42], n2: [111, 227, 200, 0.18], n3: [169, 155, 255, 0.2], beam: [169, 155, 255, 0.13] },
  seal: { g1: [120, 60, 50, 0.36], n1: [170, 90, 70, 0.32], n2: [245, 211, 138, 0.22], n3: [240, 127, 166, 0.15], beam: [245, 211, 138, 0.22] },
  chk: { g1: [80, 20, 60, 0.42], n1: [120, 30, 90, 0.34], n2: [80, 40, 160, 0.32], n3: [245, 211, 138, 0.08], beam: [245, 211, 138, 0.1] },
  sum: { g1: [130, 90, 40, 0.4], n1: [190, 130, 60, 0.32], n2: [255, 155, 113, 0.2], n3: [245, 211, 138, 0.18], beam: [245, 211, 138, 0.24] },
  end: { g1: [120, 50, 90, 0.42], n1: [150, 70, 130, 0.32], n2: [245, 170, 120, 0.26], n3: [245, 211, 138, 0.2], beam: [255, 226, 160, 0.22] },
};

function moodOf(m: Pick<SceneModel, "template" | "role">): MoodKey {
  if (m.template === "qIntro" || m.role === "qIntro") return "end";
  if (m.template === "check") return "chk";
  if (m.role === "cover" || m.template === "cover") return "cover";
  if (m.role === "summary" || m.template === "summary") return "sum";
  switch (m.template) {
    case "define":
    case "quote":
      return "def";
    case "tree":
      return "tree";
    case "compare":
      return "cmp";
    case "stat":
    case "range":
      return "stat";
    case "groups":
      return "grp";
    case "seal":
      return "seal";
    default:
      return "list";
  }
}

const rgb = (c: RGBA) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** closest-side: اللون في المركز ← شفاف عند الحافة */
const neb = (c: RGBA, end = 1): GlowStop[] => [
  [0, rgb(c), c[3]],
  [end * 0.5, rgb(c), c[3] * 0.45],
  [end, rgb(c), 0],
];

// ===== النجوم: نقاط ثابتة ببذرة ثابتة (لا تتغير بين التشغيلات) =====

type Dot = { x: number; y: number; r: number; o: number };

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDots(seed: number, count: number, r0: number, r1: number, o0: number, o1: number): Dot[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => ({ x: r() * 1280, y: r() * 690 + 6, r: r0 + r() * (r1 - r0), o: o0 + r() * (o1 - o0) }));
}

/** ثلاث طبقات (بعيدة، وسطى، قريبة) — وثلاث مجموعات وميض، واحدة في كل طبقة */
const STARS: Dot[][] = [makeDots(11, 30, 0.7, 1.2, 0.28, 0.55), makeDots(23, 20, 0.9, 1.6, 0.35, 0.7), makeDots(37, 12, 1.3, 2.3, 0.45, 0.9)];
const TWINKLE: Dot[][] = [makeDots(51, 5, 1, 1.5, 0.85, 1), makeDots(67, 5, 1.1, 1.7, 0.85, 1), makeDots(83, 4, 1.4, 2.1, 0.85, 1)];
/** مدة عبور كل طبقة ١٢٨٠ وحدة (ث) — تقسم الساعة ٣٦٠٠ فلا قفزة عند دورانها، والأقرب أسرع */
const STAR_PERIOD = [180, 120, 72];
const PUSH = [0.03, 0.07, 0.15];
/** دورات الوميض (ث) */
const TW_PERIOD = [8, 10, 5];

function DotField({ dots }: { dots: Dot[] }) {
  return (
    <>
      {[0, 1280].map((dx) =>
        dots.map((d, i) => (
          <View
            key={`${dx}-${i}`}
            style={{ position: "absolute", left: d.x + dx - d.r, top: d.y - d.r, width: d.r * 2, height: d.r * 2, borderRadius: d.r, backgroundColor: "#FFF6E0", opacity: d.o }}
          />
        ))
      )}
    </>
  );
}

/** ٠→١→٠ جيبيًا خلال period ثانية (يقابل alternate ease-in-out في النموذج) */
function osc(t: number, period: number): number {
  "worklet";
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
}

/** الساعة: ثوانٍ ٠..٣٦٠٠ تدور بلا توقف (حلقة واحدة لكل الخلفية) */
const CLOCK = 3600;

function StarLayer({ i, clock, push }: { i: number; clock: SharedValue<number>; push: SharedValue<number> }) {
  const period = STAR_PERIOD[i];
  const k = PUSH[i];
  const twp = TW_PERIOD[i];
  const a = useAnimatedStyle(() => {
    const t = clock.value * CLOCK;
    return { transform: [{ scale: 1 + (1 - push.value) * k }, { translateX: -1280 * ((t / period) % 1) }] };
  });
  const tw = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * osc(clock.value * CLOCK + i * 1.7, twp) }));
  return (
    <Animated.View style={[styles.stars, a]}>
      <DotField dots={STARS[i]} />
      <Animated.View style={[StyleSheet.absoluteFill, { width: 2560 }, tw]}>
        <DotField dots={TWINKLE[i]} />
      </Animated.View>
    </Animated.View>
  );
}

/** طبقتا لون متقاطعتان: A تخفت وB تظهر بقدر mix */
function Duo({ mix, a, b }: { mix: SharedValue<number>; a: React.ReactNode; b: React.ReactNode }) {
  const sa = useAnimatedStyle(() => ({ opacity: 1 - mix.value }));
  const sb = useAnimatedStyle(() => ({ opacity: mix.value }));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, sa]}>{a}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, sb]}>{b}</Animated.View>
    </>
  );
}

/** سديم: دائرة توهّج تنجرف وتتنفس (من الساعة) */
function Nebula({
  clock,
  mix,
  ca,
  cb,
  size,
  left,
  top,
  dx,
  dy,
  ds,
  period,
}: {
  clock: SharedValue<number>;
  mix: SharedValue<number>;
  ca: RGBA;
  cb: RGBA;
  size: number;
  left: number;
  top: number;
  dx: number;
  dy: number;
  ds: number;
  period: number;
}) {
  const a = useAnimatedStyle(() => {
    const f = osc(clock.value * CLOCK, period);
    return { transform: [{ translateX: dx * f }, { translateY: dy * f }, { scale: 1 + (ds - 1) * f }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left, top, width: size, height: size }, a]}>
      <Duo mix={mix} a={<Blob w={size} h={size} res={10} stops={neb(ca)} />} b={<Blob w={size} h={size} res={10} stops={neb(cb)} />} />
    </Animated.View>
  );
}

/** الخلفية السينمائية الدائمة طوال الفيديو (بلا key) — تتلوّن بمعنى المشهد */
export function CinemaBackdrop({ m, reduced }: { m: SceneModel; reduced: boolean }) {
  const { playing } = useContext(SlideMotion);
  const key = moodOf(m);
  // طبقتا اللون: الظاهرة الآن والتالية (تبادل بالشفافية عند تغيّر المعنى)
  const [pair, setPair] = useState<{ a: MoodKey; b: MoodKey; onB: boolean }>({ a: key, b: key, onB: false });
  useEffect(() => {
    setPair((p) => {
      const shown = p.onB ? p.b : p.a;
      if (shown === key) return p;
      return p.onB ? { a: key, b: p.b, onB: false } : { a: p.a, b: key, onB: true };
    });
  }, [key]);
  const mix = useSharedValue(0);
  useEffect(() => {
    const to = pair.onB ? 1 : 0;
    mix.value = reduced ? to : withTiming(to, { duration: 1100, easing: EIO });
  }, [pair.onB, reduced, mix]);

  // دفع بالعمق عند دخول كل مشهد: طبقات النجوم تصغر من ١٫٠٣/١٫٠٧/١٫١٥ إلى ١
  const push = useSharedValue(1);
  useEffect(() => {
    if (reduced || !playing) {
      push.value = 1;
      return;
    }
    push.value = 0;
    push.value = withTiming(1, { duration: 1200, easing: EO });
    // playing خارج الاعتماديات عمدًا: الدفع عند تغيّر المشهد فقط لا عند الإيقاف والتشغيل
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, reduced, push]);

  const clock = useLoop(CLOCK * 1000, { reverse: false, easing: Easing.linear });
  const A = MOODS[pair.a];
  const B = MOODS[pair.b];

  const grad = useAnimatedStyle(() => {
    const f = osc(clock.value * CLOCK, 50);
    return { transform: [{ translateX: 82 - 205 * f }, { translateY: -35 + 81 * f }] };
  });
  const beam = useAnimatedStyle(() => ({ transform: [{ rotate: `${-8 + 16 * osc(clock.value * CLOCK, 30)}deg` }] }));

  // g1 داخل التدرّج: ellipse 60%×55% عند 72% 22% من صندوق ١٦٠٪ (٢٠٤٨×١١٥٢)، شفاف عند ٧٠٪
  const g1 = (c: RGBA) => <Blob w={1720} h={888} res={10} stops={neb(c)} style={{ left: 1475 - 860, top: 253 - 444 }} />;
  const beamBlob = (c: RGBA) => <Blob w={518} h={995} res={8} stops={neb(c)} style={{ left: 0, top: 0 }} />;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.night0, overflow: "hidden" }]} pointerEvents="none">
      <Animated.View style={[styles.grad, grad]}>
        <LinearGradient colors={["#070B22", "#0C1440", "#130F45", "#050816"]} locations={[0, 0.42, 0.72, 1]} start={{ x: 0.37, y: 0 }} end={{ x: 0.63, y: 1 }} style={StyleSheet.absoluteFill} />
        <Duo mix={mix} a={g1(A.g1)} b={g1(B.g1)} />
      </Animated.View>
      <Nebula clock={clock} mix={mix} ca={A.n1} cb={B.n1} size={980} left={-260} top={-380} dx={140} dy={90} ds={1.12} period={45} />
      <Nebula clock={clock} mix={mix} ca={A.n2} cb={B.n2} size={860} left={1280 + 280 - 860} top={720 + 400 - 860} dx={-160} dy={-70} ds={0.92} period={60} />
      <Nebula clock={clock} mix={mix} ca={A.n3} cb={B.n3} size={560} left={512} top={130} dx={-200} dy={60} ds={1.2} period={40} />
      {[0, 1, 2].map((i) => (
        <StarLayer key={i} i={i} clock={clock} push={push} />
      ))}
      {/* الشعاع: مركز التوهّج عند أعلى منتصف الشعاع، فيدور حوله */}
      <Animated.View style={[{ position: "absolute", left: 640 - 259, top: -90 - 497, width: 518, height: 995 }, beam]}>
        <Duo mix={mix} a={beamBlob(A.beam)} b={beamBlob(B.beam)} />
      </Animated.View>
      {/* تظليل الحواف: شفاف حتى ٥٢٪ ثم ليل */}
      <Blob
        w={1280}
        h={720}
        res={10}
        cy={0.44}
        rx={0.78}
        ry={0.74}
        stops={[
          [0, "#02030A", 0],
          [0.52, "#02030A", 0],
          [1, "#02030A", 0.78],
        ]}
        style={{ left: 0, top: 0 }}
      />
      <LinearGradient colors={["rgba(3,5,14,0)", "rgba(3,5,14,0.55)", "rgba(3,5,14,0.94)"]} locations={[0, 0.55, 1]} style={styles.floor} />
    </View>
  );
}

// ===== الترويسة =====

/** نوع المشهد في الواجهة (افتتاح، خلاصة، سؤال…) */
export function kindLabel(ctx: Pick<SlideCtx, "m" | "t">): string {
  const { m, t } = ctx;
  if (m.role === "finalEx") return t("video.s.exercise");
  if (m.role === "finalQ") return t("video.s.finalQ");
  if (m.template === "check") return t("video.check");
  if (m.template === "qIntro" || m.role === "qIntro") return t("video.qTitle");
  if (m.role === "cover" || m.template === "cover") return t("video.s.brand");
  if (m.role === "summary" || m.template === "summary") return t("video.s.summary");
  return t(`video.s.kind.${kindOf(m)}`);
}

/** خط التقدّم الذهبي (٣ بكسل بتوهّج) + حبة الوحدة والمشهد + نوع المشهد — والزاوية العليا اليسرى محجوزة */
export function CinemaHeader({ ctx }: { ctx: SlideCtx; p: number }) {
  const { ff, t, isRTL, m } = ctx;
  const sv = ctx.sv;
  const k = ctx.compact ? 1.12 : 1;
  const L = leftInset(ctx, 24, 36);
  const line = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0, Math.min(1, sv.value)) }] }));
  const origin = isRTL ? "right" : "left";
  const scene = t("video.s.scene", { n: toLocalDigits(ctx.index + 1, ctx.lang) });
  const chipMax = 600;
  const chip = (
    <View style={[styles.chip, { flexDirection: ctx.row, maxWidth: chipMax }, isRTL ? { right: 36 } : { left: L }]}>
      <Orb m={m} size={40 * k} icon={21 * k} glow={false} />
      {ctx.unitTitle ? (
        <View style={{ flexShrink: 1 }}>
          <Tx style={ts(ff, "plex600", 21 * k, C.ivory, 1.4, ctx.align)}>{ctx.unitTitle}</Tx>
        </View>
      ) : null}
      {ctx.unitTitle ? <View style={styles.dot} /> : null}
      <Tx style={ts(ff, "plex500", 21 * k, C.mist, 1.4)}>{scene}</Tx>
    </View>
  );
  const tagW = 1280 - 36 - L - chipMax - 24;
  const tag = (
    <View style={[styles.tag, { flexDirection: ctx.row, maxWidth: Math.max(160, tagW) }, isRTL ? { left: L } : { right: 36 }]}>
      <View style={{ flexShrink: 1 }}>
        <Tx style={ts(ff, "kufi600", 22 * k, C.gold, 1.4)}>{kindLabel(ctx)}</Tx>
      </View>
      <LinearGradient colors={[alpha(C.gold, 0), C.gold]} start={{ x: isRTL ? 0 : 1, y: 0 }} end={{ x: isRTL ? 1 : 0, y: 0 }} style={styles.tagLine} />
    </View>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.prog, { transformOrigin: origin }, line]}>
        <View style={styles.progGlow} />
        <LinearGradient colors={isRTL ? [C.gold3, C.gold] : [C.gold, C.gold3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {chip}
      {tag}
    </View>
  );
}

// ===== الترجمة =====

/** كاريوكي بلا صندوق: يمين ويسار ١٣٠، أسفل ٣٠، Plex ٥٠٠ ٣٠/١٫٥٥ مع ظل — وأثناء التفكير سطر خافت «٥ ثوانٍ للتفكير…» */
export function CinemaCaption({ speech, p, phase, ff, t, isRTL }: CaptionProps) {
  if (!speech) return null;
  if (phase === "think") {
    return (
      <View style={styles.capWrap} pointerEvents="none">
        <Tx style={[ts(ff, "plex400", 26, C.mist2, 1.55, "center"), styles.capShadow]}>{t("video.s.thinkSecs", { n: toLocalDigits(THINK_SECONDS, isRTL ? "ar" : "en") })}</Tx>
      </View>
    );
  }
  const c = captionChunk(captionAt(speech, p), 18);
  if (!c.words.length) return null;
  return (
    <View style={styles.capWrap} pointerEvents="none">
      <KaraokeText
        words={c.words}
        current={c.current}
        style={[ts(ff, "plex500", 30, C.unspoken, 1.55, "center"), styles.capShadow]}
        spokenStyle={{ color: C.ivory }}
        activeStyle={{ color: C.gold }}
        upcomingStyle={{ color: C.unspoken }}
      />
    </View>
  );
}

// ===== الانتقالات =====

type TrKind = "sweep" | "iris" | "depth" | "dawn";

function trOf(m: Pick<SceneModel, "template" | "role">): TrKind {
  if (m.template === "check") return "iris";
  if (m.template === "tree" || m.template === "groups") return "depth";
  if (m.template === "qIntro" || m.role === "qIntro") return "dawn";
  return "sweep";
}

/** مسح ضوئي: شعاع ٤٦٠ مائل ١٤° يعبر الإطار باتجاه القراءة */
function Sweep({ v, dir }: { v: SharedValue<number>; dir: number }) {
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.06, 0.9, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(v.value, [0, 1], [1150 * dir, -1150 * dir]) }, { rotate: "14deg" }],
  }));
  const veil = useAnimatedStyle(() => ({ opacity: interpolate(v.value, [0, 0.3, 1], [0.32, 0.18, 0], Extrapolation.CLAMP) }));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#03040C" }, veil]} />
      <Animated.View style={[styles.sweep, a]}>
        <LinearGradient
          colors={["rgba(245,211,138,0)", "rgba(245,211,138,0.08)", "rgba(255,244,214,0.6)", "rgba(245,211,138,0.08)", "rgba(245,211,138,0)"]}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </>
  );
}

/** انغلاق القزحية: حلقة سوداء عريضة تضيق حتى ثقب صغير ثم تنفتح على السؤال */
function Iris({ v }: { v: SharedValue<number> }) {
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.02, 0.95, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(v.value, [0, 0.45, 1], [19, 1.15, 19], Extrapolation.CLAMP) }],
  }));
  return <Animated.View style={[styles.iris, a]} />;
}

/** دفع بالعمق: وهج يندفع نحو المشاهد وظلمة قصيرة (والمشهد الجديد يدخل من ‎.8) */
function Depth({ v }: { v: SharedValue<number> }) {
  const g = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.35, 1], [0, 0.75, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(v.value, [0, 1], [0.3, 2.2]) }],
  }));
  const veil = useAnimatedStyle(() => ({ opacity: interpolate(v.value, [0, 0.25, 1], [0.45, 0.3, 0], Extrapolation.CLAMP) }));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#02030A" }, veil]} />
      <Animated.View style={[{ position: "absolute", left: 640 - 450, top: 360 - 450, width: 900, height: 900 }, g]}>
        <Blob w={900} h={900} res={8} stops={[[0, C.gold3, 0.55], [0.4, C.gold, 0.18], [1, C.gold, 0]]} />
      </Animated.View>
    </>
  );
}

/** طلوع الفجر: الأفق يضيء من الأسفل ويدفئ الليل */
function Dawn({ v }: { v: SharedValue<number> }) {
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.4, 1], [0, 0.95, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(v.value, [0, 0.6, 1], [420, 60, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", left: 640 - 900, top: 300, width: 1800, height: 900 }, a]}>
      <Blob w={1800} h={900} res={10} stops={[[0, "#FFE8AA", 0.9], [0.38, "#FAAA78", 0.5], [0.64, "#F07FA6", 0.18], [1, "#F07FA6", 0]]} />
    </Animated.View>
  );
}

/** الانتقال بين المشاهد — يعمل عند تغيّر index فقط (لا عند أول مشهد، ولا مع تقليل الحركة) */
export function CinemaTransition({ index, m, reduced }: { index: number; m: SceneModel; reduced: boolean; ff: SlideCtx["ff"] }) {
  const kind = trOf(m);
  // اتجاه المسح باتجاه قراءة نص المشهد (العربية من اليمين)
  const dir = /[؀-ۿ]/.test(m.title || m.items[0]?.text || m.check?.stem || "") ? 1 : -1;
  const [run, setRun] = useState<{ kind: TrKind; dir: number } | null>(null);
  const v = useSharedValue(1);
  const last = useRef(index);
  useEffect(() => {
    if (last.current === index) return;
    last.current = index;
    if (reduced) return;
    setRun({ kind, dir });
    v.value = 0;
    v.value = withTiming(1, { duration: 550, easing: Easing.linear });
  }, [index, kind, dir, reduced, v]);
  if (!run) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {run.kind === "iris" ? <Iris v={v} /> : run.kind === "depth" ? <Depth v={v} /> : run.kind === "dawn" ? <Dawn v={v} /> : null}
      {run.kind === "iris" ? null : <Sweep v={v} dir={run.dir} />}
    </View>
  );
}

const styles = StyleSheet.create({
  grad: { position: "absolute", left: -384, top: -216, width: 2048, height: 1152 },
  stars: { position: "absolute", left: 0, top: 0, width: 2560, height: 720 },
  floor: { position: "absolute", left: 0, right: 0, bottom: 0, height: 210 },
  prog: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  progGlow: { position: "absolute", left: 0, right: 0, top: -3, height: 9, backgroundColor: "rgba(246,213,138,0.22)", borderRadius: 4 },
  chip: {
    position: "absolute",
    top: 24,
    height: 54,
    alignItems: "center",
    gap: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 40,
    backgroundColor: "rgba(8,11,30,0.6)",
    borderWidth: 1,
    borderColor: "rgba(246,213,138,0.2)",
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold2 },
  tag: { position: "absolute", top: 24, height: 54, alignItems: "center", gap: 12 },
  tagLine: { width: 34, height: 2 },
  capWrap: { position: "absolute", left: 130, right: 130, bottom: 30, alignItems: "center" },
  capShadow: { textShadowColor: "rgba(0,0,0,0.75)", textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 } },
  sweep: { position: "absolute", left: 640 - 230, top: -180, width: 460, height: 1080 },
  iris: { position: "absolute", left: 640 - 800, top: 360 - 800, width: 1600, height: 1600, borderRadius: 800, borderWidth: 760, borderColor: "#000000" },
});
