// components/brand/slides/editorial.tsx
// شكل مجلة «حبر وذهب»: كل مشهد صفحة من مجلة فاخرة — طباعة عربية ضخمة على حبر الليل أو ورق عاجي أو ذهب،
// أرقام عملاقة تعدّ أمام العين، وخيوط ذهبية رفيعة تُرسم مع صوت الراوي.
// النموذج: docs/slides-design/١-مجلة-تحريرية.html — وملاحظات التنفيذ في docs/slides-design/notes-for-implementation.json.
// - الأسطح: الحبر (الافتتاح، الأرقام، المجموعات، التفرّع، الختام)، والورق (التعريف، الاقتباس، المقارنة، النقاط، الخلاصة)،
//   والذهب (سؤال الفهم وحده). الخلفية الدائمة ترسم السطح الحالي تحت الستارة، وفي «منوّع» (ctx.bare) تصير
//   صفحات الورق ورقة داخلية بزوايا ٢٨ فوق الليل المشترك.
// - الإطار: ترويسة (ختم المشهد + «ملخّص الفيديو» + عنوان الوحدة، ورقم المشهد بخط أميري) وخيط تقدّم ذهبي،
//   وترجمة تضيء فيها الكلمة المنطوقة، وستارة حبر بحافتين ذهبيتين تحمل رقم المشهد التالي.
// - الصفحات في editorial/: ink.tsx (حبر) وpaper.tsx (ورق) وcheck.tsx (ذهب)، وأدواتها في kit.tsx.
// قواعد الملف: يستورد فقط من ./shared و lib/slideThemeCore و lib/slideFonts والمكتبات المثبتة، والمحتوى من ctx.m وحده.
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { captionAt, captionChunk, type SceneModel } from "../../../lib/slideThemeCore";
import { CANVAS_H, CANVAS_W, KaraokeText, PlainScene, SceneMark, useLoop, type CaptionProps, type SlideCtx, type SlideThemeModule } from "./shared";
import { CheckPage } from "./editorial/check";
import { CardsPage, CoverPage, QIntroPage, StatPage, TreePage } from "./editorial/ink";
import { DIM, folio, GOLD, GOLD_INK, IVORY, pageBox, PAPER_DIM, PAPER_INK, SHEET, SurfaceFill, surfaceOf, TONES, type Box, type Surf } from "./editorial/kit";
import { ComparePage, DefinePage, ListPage, QuotePage, SummaryPage } from "./editorial/paper";

// ===== المشهد =====

/** الصفحة المناسبة لقالب المشهد — كل القوالب الخمسة عشر، وأي بيانات ناقصة ترجع للرسم البسيط الصحيح */
function Page({ ctx, B }: { ctx: SlideCtx; B: Box }) {
  const { m } = ctx;
  switch (m.template) {
    case "cover":
      return <CoverPage ctx={ctx} B={B} />;
    case "stat":
    case "range":
    case "seal":
      return <StatPage ctx={ctx} B={B} />;
    case "groups":
    case "cards":
      return <CardsPage ctx={ctx} B={B} />;
    case "tree":
      return m.tree && m.tree.nodes.length >= 2 ? <TreePage ctx={ctx} B={B} /> : <ListPage ctx={ctx} B={B} />;
    case "qIntro":
      return <QIntroPage ctx={ctx} B={B} />;
    case "list":
    case "steps":
      return <ListPage ctx={ctx} B={B} />;
    case "compare":
      return (m.columns?.length ?? 0) >= 2 ? <ComparePage ctx={ctx} B={B} /> : <ListPage ctx={ctx} B={B} />;
    case "define":
      return <DefinePage ctx={ctx} B={B} />;
    case "quote":
      return <QuotePage ctx={ctx} B={B} />;
    case "summary":
      return <SummaryPage ctx={ctx} B={B} />;
    case "check":
      return <CheckPage ctx={ctx} B={B} />;
    default:
      // احتياط صريح لقالب غير معروف مستقبلًا
      return <PlainScene ctx={ctx} tone={surfaceOf(m) === "ink" ? "dark" : "light"} />;
  }
}

function EditorialScene({ ctx }: { ctx: SlideCtx }) {
  const surf = surfaceOf(ctx.m);
  const B = pageBox(ctx, surf);
  if (ctx.bare && surf !== "ink") {
    // «منوّع»: ورقة داخلية فوق الليل المشترك (تحت الترويسة وفوق الترجمة)، والصفحة مقصوصة على حوافها
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.sheetShadow} />
        <View style={styles.sheet}>
          <SurfaceFill surf={surf} uid="sheet" />
          <View style={{ position: "absolute", top: B.top - SHEET.top, left: B.left - SHEET.side, width: B.w, height: B.h }}>
            <Page ctx={ctx} B={B} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: "absolute", top: B.top, left: B.left, width: B.w, height: B.h }}>
        <Page ctx={ctx} B={B} />
      </View>
    </View>
  );
}

// ===== الخلفية الدائمة =====

/** نجوم ببذرة ثابتة كالنموذج: ٥٤ نجمة، ٣٠٪ منها تتلألأ في ٣ مجموعات فقط (٣ حلقات للخلفية كلها) */
function makeStars() {
  let seed = 131;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const still: { x: number; y: number; s: number }[] = [];
  const tw: { x: number; y: number; s: number }[][] = [[], [], []];
  for (let i = 0; i < 54; i++) {
    const x = r() * CANVAS_W;
    const y = r() * 610;
    const big = r() < 0.12;
    const s = big ? 2.4 : r() * 1.2 + 0.6;
    if (r() < 0.3) tw[i % 3].push({ x, y, s });
    else still.push({ x, y, s });
  }
  return { still, tw };
}
const STARS = makeStars();

function TwinkleGroup({ stars, delay }: { stars: { x: number; y: number; s: number }[]; delay: number }) {
  const v = useLoop(1700, { delay });
  const a = useAnimatedStyle(() => ({ opacity: 0.18 + 0.82 * v.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, a]}>
      <Svg width={CANVAS_W} height={CANVAS_H}>
        {stars.map((st, i) => (
          <Circle key={i} cx={st.x} cy={st.y} r={st.s} fill={IVORY} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** طبقة الحبر: التدرّج والتوهّجان والنجوم — ثابتة لا تُعاد رسمها */
const InkLayer = memo(function InkLayer() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <SurfaceFill surf="ink" uid="bg" />
      <Svg width={CANVAS_W} height={CANVAS_H} style={StyleSheet.absoluteFill}>
        {STARS.still.map((st, i) => (
          <Circle key={i} cx={st.x} cy={st.y} r={st.s} fill={IVORY} fillOpacity={0.42} />
        ))}
      </Svg>
      {STARS.tw.map((g, i) => (
        <TwinkleGroup key={i} stars={g} delay={i * 1130} />
      ))}
    </View>
  );
});

/** الورق والذهب فوق الحبر: يتبدّلان تحت الستارة مع تغيّر المشهد (بلا مؤقت) */
const PaperLayer = memo(function PaperLayer() {
  return <SurfaceFill surf="paper" uid="bgp" />;
});
const GoldLayer = memo(function GoldLayer() {
  return <SurfaceFill surf="gold" uid="bgg" />;
});

function EditorialBackdrop({ m }: { m: SceneModel; reduced: boolean }) {
  const surf = surfaceOf(m);
  return (
    <View style={StyleSheet.absoluteFill}>
      <InkLayer />
      <View style={[StyleSheet.absoluteFill, { opacity: surf === "paper" ? 1 : 0 }]}>
        <PaperLayer />
      </View>
      <View style={[StyleSheet.absoluteFill, { opacity: surf === "gold" ? 1 : 0 }]}>
        <GoldLayer />
      </View>
    </View>
  );
}

// ===== الترويسة وخيط التقدّم =====

const MAST: Record<Surf, { label: string; brand: string; ring: string }> = {
  ink: { label: DIM, brand: GOLD, ring: "rgba(246,213,138,0.55)" },
  paper: { label: PAPER_DIM, brand: GOLD_INK, ring: "rgba(126,92,30,0.45)" },
  gold: { label: "rgba(18,20,46,0.66)", brand: PAPER_INK, ring: "rgba(18,20,46,0.4)" },
};

function EditorialHeader({ ctx }: { ctx: SlideCtx; p: number }) {
  // في «منوّع» الترويسة فوق الليل المشترك دائمًا (والورقة الداخلية تبدأ تحتها)
  const surf: Surf = ctx.bare ? "ink" : surfaceOf(ctx.m);
  const c = MAST[surf];
  const track = TONES[surf].track;
  const { sv, phase, thinkLeft, thinkSeconds, isRTL } = ctx;
  const check = ctx.m.template === "check";
  // خيط التقدّم: عمر المشهد؛ وفي السؤال ثلاث مراحل على الخيط نفسه (السؤال ← التفكير ← الجواب)
  const thinkPart = thinkSeconds > 0 ? 1 - Math.max(0, Math.min(thinkSeconds, thinkLeft)) / thinkSeconds : 1;
  const fill = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, sv.value));
    const v = !check ? p : phase === "ask" ? 0.45 * p : phase === "think" ? 0.45 + 0.15 * thinkPart : 0.6 + 0.4 * p;
    return { transform: [{ scaleX: v }] };
  });
  // مربع الزاوية العليا اليسرى (زر ملء الشاشة) يبقى خاليًا
  const left = Math.max(72, ctx.safe.corner > 0 ? ctx.safe.corner + 12 : 0);
  const sceneWord = ctx.t("video.s.scene", { n: "" }).trim();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.mast, { left, flexDirection: ctx.row }]}>
        <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 12, flexShrink: 1 }}>
          <View style={[styles.chip, { borderColor: c.ring }]}>
            <SceneMark m={ctx.m} size={20} color={c.brand} />
          </View>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ color: c.brand, fontSize: 19, lineHeight: 26 }, ctx.ff("plex600")]}>
            {ctx.t("video.s.brand")}
          </Text>
          {ctx.unitTitle ? (
            <>
              <View style={{ width: 22, height: 1.5, backgroundColor: c.label, opacity: 0.5 }} />
              <Text allowFontScaling={false} numberOfLines={1} style={[{ flexShrink: 1, color: c.label, fontSize: 19, lineHeight: 26, textAlign: ctx.align }, ctx.ff("plex500")]}>
                {ctx.unitTitle}
              </Text>
            </>
          ) : null}
        </View>
        <View style={{ flexDirection: ctx.row, alignItems: "center", gap: 10 }}>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ color: c.label, fontSize: 19, lineHeight: 26 }, ctx.ff("plex500")]}>
            {sceneWord}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[{ color: c.brand, fontSize: 36, lineHeight: 48 }, ctx.ff("amiri700")]}>
            {folio(ctx.index + 1, ctx.lang)}
          </Text>
        </View>
      </View>
      <View style={[styles.prog, { left, backgroundColor: track }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.brand, transformOrigin: isRTL ? "100% 50%" : "0% 50%" }, fill]} />
      </View>
    </View>
  );
}

// ===== الترجمة =====

/** بطاقة حبر بحافة ذهبية: الكلمة المنطوقة عاجية، والقادمة خافتة (تختفي لحظة التفكير) */
function EditorialCaption({ speech, p, phase, ff }: CaptionProps) {
  if (!speech || phase === "think") return null;
  const c = captionChunk(captionAt(speech, p), 20);
  if (!c.words.length) return null;
  return (
    <View style={styles.capWrap} pointerEvents="none">
      <View style={styles.capBox}>
        <KaraokeText
          words={c.words}
          current={c.current}
          style={[styles.cap, ff("plex500")]}
          spokenStyle={{ color: IVORY }}
          activeStyle={{ color: IVORY }}
          upcomingStyle={{ color: "rgba(245,241,255,0.36)" }}
          numberOfLines={2}
        />
      </View>
    </View>
  );
}

// ===== الستارة بين المشاهد =====

const EASE_IO = Easing.bezier(0.76, 0, 0.24, 1);

/**
 * ستارة الحبر: تُركَّب مغطيةً لحظة تغيّر المشهد (فلا يظهر الجديد قبلها ولو لإطار واحد) وتحمل رقمه،
 * ثم تعبر نحو جهة النهاية خلال ٣٨٠ مللي ثانية — المجموع ≤ ٥٠٠ داخل فجوة الصمت.
 */
function Curtain({ index, ff, rtl }: { index: number; ff: SlideCtx["ff"]; rtl: boolean }) {
  const x = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    x.value = withDelay(110, withTiming((rtl ? -1 : 1) * CANVAS_W * 1.04, { duration: 380, easing: EASE_IO }));
    o.value = withDelay(40, withTiming(0, { duration: 220 }));
    return () => {
      cancelAnimation(x);
      cancelAnimation(o);
    };
  }, [x, o, rtl]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const b = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, a]} pointerEvents="none">
      <LinearGradient colors={["#05071A", "#0B0E26", "#05071A"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.edge, { left: 0 }]} />
      <View style={[styles.edge, { right: 0 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, b]}>
        <Text allowFontScaling={false} numberOfLines={1} style={[{ color: GOLD, fontSize: 130, lineHeight: 190 }, ff("amiri700")]}>
          {folio(index + 1, rtl ? "ar" : "en")}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function EditorialTransition({ index, m, reduced, ff }: { index: number; m: SceneModel; reduced: boolean; ff: SlideCtx["ff"] }) {
  // المشهد الأول عند فتح الفيديو بلا ستارة؛ وكل تغيّر بعده ستارة جديدة (key = index)
  const [born] = useState(index);
  if (reduced || index === born) return null;
  // الاتجاه من لغة المحتوى (Transition لا يأخذ اتجاه الواجهة): العربية تعبر نحو اليسار
  const rtl = /[؀-ۿ]/.test(`${m.title} ${m.items[0]?.text ?? ""} ${m.check?.stem ?? ""}`);
  return <Curtain key={index} index={index} ff={ff} rtl={rtl} />;
}

export const editorial: SlideThemeModule = {
  id: "editorial",
  Scene: EditorialScene,
  Backdrop: EditorialBackdrop,
  Header: EditorialHeader,
  Caption: EditorialCaption,
  Transition: EditorialTransition,
};

const styles = StyleSheet.create({
  sheet: { position: "absolute", top: SHEET.top, bottom: CANVAS_H - SHEET.bottom, left: SHEET.side, right: SHEET.side, borderRadius: SHEET.radius, overflow: "hidden" },
  sheetShadow: {
    position: "absolute",
    top: SHEET.top,
    bottom: CANVAS_H - SHEET.bottom,
    left: SHEET.side,
    right: SHEET.side,
    borderRadius: SHEET.radius,
    backgroundColor: "rgba(0,0,0,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
  },
  mast: { position: "absolute", top: 28, right: 72, height: 40, alignItems: "center", justifyContent: "space-between", gap: 24 },
  chip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  prog: { position: "absolute", top: 84, right: 72, height: 2, overflow: "hidden" },
  capWrap: { position: "absolute", left: 110, right: 110, bottom: 18, alignItems: "center" },
  capBox: {
    maxWidth: "100%",
    paddingHorizontal: 30,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 16,
    backgroundColor: "rgba(7,9,32,0.86)",
    borderTopWidth: 1.5,
    borderTopColor: "rgba(246,213,138,0.5)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  cap: { color: IVORY, fontSize: 26, lineHeight: 39, textAlign: "center" },
  edge: { position: "absolute", top: 0, bottom: 0, width: 4, backgroundColor: GOLD },
});
