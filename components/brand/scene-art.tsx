// components/brand/scene-art.tsx
// رسومات المشاهد الثلاثة (فيكتور مسطّح) — تكبر مع تقدّم الطالب:
//  سماء: نجوم الكوكبة تضيء بعدد صفحات اليوم.
//  سهرة: كتب على الرف بعدد الوحدات المنجزة، والأماكن الفارغة تنتظر.
//  حديقة: أوراق الشجرة تكثر مع الجاهزية، وثمرة لكل وحدة منجزة.
// الرسم بإحداثيات ثابتة 390×470 ويتمدّد لعرض الشاشة.
import React, { useMemo } from "react";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import type { SceneGrowth, SceneId } from "../../lib/sceneCore";

const W = 390;
const H = 470;

// مولّد أرقام ثابت (نفس الرسم في كل مرة — لا «يرتعش» المشهد بين الإعادات)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Props = { id: SceneId; growth: SceneGrowth; width: number; height?: number };

export function SceneArt({ id, growth, width, height = (width * H) / W }: Props) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
      {id === "sky" ? <Sky g={growth} /> : id === "study" ? <Study g={growth} /> : <Garden g={growth} />}
    </Svg>
  );
}

/* ------------------------------ سماء المعرفة ------------------------------ */

const CONSTELLATION: [number, number][] = [
  [70, 230], [112, 168], [160, 186], [196, 140], [246, 152], [282, 112], [330, 130], [352, 90],
];

function Sparkle({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={10} fill="url(#starGlow)" />
      <Path
        d={`M${x} ${y - 6}L${x + 1.6} ${y - 1.6}L${x + 6} ${y}L${x + 1.6} ${y + 1.6}L${x} ${y + 6}L${x - 1.6} ${y + 1.6}L${x - 6} ${y}L${x - 1.6} ${y - 1.6}Z`}
        fill="#FFF4D6"
      />
    </G>
  );
}

function Sky({ g }: { g: SceneGrowth }) {
  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * 300, s: 0.5 + r() * 1.1, o: 0.3 + r() * 0.65 }));
  }, []);
  return (
    <G>
      <Defs>
        <LinearGradient id="skyBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#070A1F" />
          <Stop offset="0.6" stopColor="#1A2257" />
          <Stop offset="1" stopColor="#3B3478" />
        </LinearGradient>
        <RadialGradient id="starGlow">
          <Stop offset="0" stopColor="#FFE7A8" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFE7A8" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="moonGlow">
          <Stop offset="0" stopColor="#FFF3CF" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#FFF3CF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="tentGlow">
          <Stop offset="0" stopColor="#FFB45E" stopOpacity="0.8" />
          <Stop offset="1" stopColor="#FFB45E" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#skyBg)" />
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#FFFFFF" opacity={s.o} />
      ))}
      <Circle cx={318} cy={232} r={70} fill="url(#moonGlow)" />
      <Circle cx={318} cy={232} r={26} fill="#FFF1C9" />
      <Circle cx={330} cy={224} r={23} fill="#1A2257" />
      {CONSTELLATION.slice(0, -1).map(([x, y], i) => {
        const [x2, y2] = CONSTELLATION[i + 1];
        const on = i < g.lit - 1;
        return (
          <Line key={i} x1={x} y1={y} x2={x2} y2={y2} stroke="#F6D58A" strokeWidth={1.2} opacity={on ? 0.7 : 0.18} strokeDasharray={on ? undefined : "3 4"} />
        );
      })}
      {CONSTELLATION.map(([x, y], i) =>
        i < g.lit ? <Sparkle key={i} x={x} y={y} /> : <Circle key={i} cx={x} cy={y} r={4} fill="none" stroke="#F6D58A" strokeWidth={1} opacity={0.5} />
      )}
      <Path d="M0 360 C70 330 130 345 200 362 C270 378 330 340 390 350 L390 470 L0 470Z" fill="#2A2560" />
      <Path d="M0 395 C90 370 160 392 230 400 C300 408 350 384 390 388 L390 470 L0 470Z" fill="#1C1A47" />
      <Circle cx={300} cy={388} r={46} fill="url(#tentGlow)" />
      <Path d="M276 400 L300 366 L324 400Z" fill="#3A2C5E" />
      <Path d="M294 400 L300 384 L306 400Z" fill="#FFC774" />
      <Path d="M0 425 C110 410 200 430 290 432 C340 433 370 424 390 422 L390 470 L0 470Z" fill="#0B0E26" />
    </G>
  );
}

/* ------------------------------ سهرة القراءة ------------------------------ */

const BOOK_COLORS = ["#C9583F", "#E3A04F", "#5F7FA8", "#8C5E9E", "#4E8C78", "#D98A9B", "#B5764A", "#6D7FC9", "#A85A73", "#5E9AA0"];

function Study({ g }: { g: SceneGrowth }) {
  const books = useMemo(() => {
    const r = rng(3);
    return Array.from({ length: g.slots }, (_, i) => ({ w: 13 + Math.round(r() * 9), h: 52 + Math.round(r() * 18), c: BOOK_COLORS[i % BOOK_COLORS.length] }));
  }, [g.slots]);
  // الرف يتّسع لـ ٢٤٠ نقطة؛ نصغّر الكتب إن زادت الأماكن
  const total = books.reduce((a, b) => a + b.w + 3, 0);
  const k = Math.min(1, 196 / total);
  let x = 178;
  return (
    <G>
      <Defs>
        <LinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#22131F" />
          <Stop offset="1" stopColor="#3A1F2C" />
        </LinearGradient>
        <LinearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#16204D" />
          <Stop offset="1" stopColor="#4B3A7A" />
        </LinearGradient>
        <RadialGradient id="lamp">
          <Stop offset="0" stopColor="#FFC56E" stopOpacity="0.75" />
          <Stop offset="0.5" stopColor="#E9B35F" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#E9B35F" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#wall)" />
      <Path d="M30 330 V170 Q30 100 95 82 Q160 100 160 170 V330Z" fill="url(#night)" stroke="#5A3446" strokeWidth={8} />
      <Line x1={95} y1={86} x2={95} y2={330} stroke="#5A3446" strokeWidth={4} />
      <Line x1={30} y1={215} x2={160} y2={215} stroke="#5A3446" strokeWidth={4} />
      <Circle cx={125} cy={150} r={14} fill="#FFF1C9" />
      <Circle cx={132} cy={145} r={12} fill="#22306A" />
      {[[58, 140, 1.4], [70, 180, 1], [130, 250, 1.2], [55, 270, 1], [140, 195, 1]].map(([cx, cy, r], i) => (
        <Circle key={i} cx={cx} cy={cy} r={r} fill="#FFFFFF" />
      ))}
      <Circle cx={300} cy={150} r={150} fill="url(#lamp)" />
      <Line x1={300} y1={0} x2={300} y2={104} stroke="#6B4A3A" strokeWidth={2} />
      <Path d="M272 128 Q300 92 328 128Z" fill="#E9B35F" />
      <Ellipse cx={300} cy={129} rx={28} ry={5} fill="#FFD796" />
      {books.map((b, i) => {
        const w = b.w * k;
        const bx = x;
        x += w + 3 * k;
        if (i < g.lit) {
          return (
            <G key={i}>
              <Rect x={bx} y={300 - b.h} width={w} height={b.h} rx={2.5} fill={b.c} />
              <Rect x={bx + 3 * k} y={300 - b.h + 8} width={Math.max(2, w - 6 * k)} height={2} fill="rgba(255,255,255,0.35)" />
            </G>
          );
        }
        return <Rect key={i} x={bx} y={300 - 60} width={w} height={60} rx={2.5} fill="none" stroke="#E9B35F" strokeDasharray="3 3" opacity={0.5} />;
      })}
      <Rect x={140} y={300} width={240} height={10} rx={3} fill="#6B3F2E" />
      <Rect x={140} y={310} width={240} height={5} fill="#4A2A20" />
      <Path d="M0 380 H390 V470 H0Z" fill="#1B1019" />
      <G transform="translate(158 252)">
        <Rect x={-14} y={22} width={28} height={26} rx={4} fill="#8A4B36" />
        <Path d="M0 22 C-22 6 -20 -14 -4 -20 C-10 -4 -2 8 0 22Z" fill="#4E8C78" />
        <Path d="M0 22 C20 4 22 -18 6 -26 C10 -8 4 8 0 22Z" fill="#5FA58C" />
      </G>
    </G>
  );
}

/* ------------------------------ شجرة العلم ------------------------------ */

const LEAF_COLORS = ["#7BC96F", "#5DB360", "#9BD87E", "#4E9F55"];

function Garden({ g }: { g: SceneGrowth }) {
  // مواضع ثابتة للأوراق: الأولى في قلب التاج ثم تتّسع للخارج مع الجاهزية
  const leaves = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: g.slots }, () => {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.6);
      return { x: 128 + Math.cos(a) * d * 92, y: 262 + Math.sin(a) * d * 64, r: 11 + r() * 8, c: LEAF_COLORS[Math.floor(r() * 4)], d };
    }).sort((p, q) => p.d - q.d);
  }, [g.slots]);
  const fruitSpots: [number, number][] = [[92, 248], [160, 232], [138, 288], [190, 270], [70, 280], [118, 214], [176, 300], [100, 306]];
  return (
    <G>
      <Defs>
        <LinearGradient id="gardenSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE9C8" />
          <Stop offset="0.55" stopColor="#FDF3DA" />
          <Stop offset="1" stopColor="#EAF4D6" />
        </LinearGradient>
        <RadialGradient id="sun">
          <Stop offset="0" stopColor="#FFD27A" />
          <Stop offset="0.55" stopColor="#FFC15A" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFC15A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#gardenSky)" />
      <Circle cx={70} cy={250} r={80} fill="url(#sun)" />
      <Path d="M0 330 C90 300 170 320 250 312 C320 305 360 290 390 296 V470 H0Z" fill="#CFE6A9" />
      <Path d="M0 360 C80 345 150 365 230 360 C300 356 350 340 390 345 V470 H0Z" fill="#A9D48A" />
      <Path d="M120 360 C122 330 118 306 112 284 L124 281 C127 300 132 310 142 284 L149 288 C138 314 138 336 140 360Z" fill="#8A5A3C" />
      {/* تاج ممتلئ دائمًا (قاعدة متداخلة)، والأوراق الفاتحة فوقه تكثر مع الجاهزية */}
      {[[128, 266, 74], [80, 276, 46], [176, 276, 46], [104, 222, 48], [152, 222, 48], [128, 200, 40], [62, 252, 30], [194, 252, 30], [128, 312, 44]].map(([cx, cy, r], i) => (
        <Circle key={`b${i}`} cx={cx} cy={cy} r={r} fill={i % 2 ? "#4E9F55" : "#5DB360"} />
      ))}
      {leaves.slice(0, g.lit).map((l, i) => (
        <Circle key={i} cx={l.x} cy={l.y} r={l.r} fill={l.c} opacity={0.95} />
      ))}
      {fruitSpots.slice(0, g.fruitSlots).map(([x, y], i) =>
        i < g.fruits ? (
          <Circle key={i} cx={x} cy={y} r={7} fill="#FF9F43" stroke="#FFFFFF" strokeWidth={2} />
        ) : (
          <Circle key={i} cx={x} cy={y} r={5} fill="#FFFFFF" opacity={0.18} />
        )
      )}
      <Ellipse cx={130} cy={362} rx={70} ry={8} fill="#6FAE5E" opacity={0.5} />
      <Path d="M0 395 C100 380 200 400 290 396 C340 394 370 386 390 386 V470 H0Z" fill="#F7F4EA" />
    </G>
  );
}
