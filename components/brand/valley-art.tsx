// components/brand/valley-art.tsx
// «وادي الكتب»: شجرة لكل كتاب في وادٍ واحد. الشجرة تطول وتتسع مع نسبة ما قُرئ منها،
// وتزداد خضرتها مع الجاهزية، وتُثمر حين يكتمل الكتاب. ألوان السماء تتبع مشهد الوقت.
import React, { useMemo } from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import type { SceneId } from "../../lib/sceneCore";

export type ValleyTree = { id: string; read: number; readiness: number };

const W = 360;
const H = 190;
const MAX_TREES = 10;

const SKY: Record<SceneId, [string, string]> = {
  garden: ["#FFF3D6", "#F7F4EA"],
  study: ["#3A1F33", "#7A3E3A"],
  sky: ["#0B1430", "#1E2B58"],
};
const HILLS: Record<SceneId, [string, string]> = {
  garden: ["#CFE5A6", "#A9D18A"],
  study: ["#5B3A3E", "#43292F"],
  sky: ["#1F3A3A", "#15292B"],
};

// مولّد ثابت حتى لا تتحرك الأشجار بين الإعادات
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function Tree({ x, base, t, dark, seed }: { x: number; base: number; t: ValleyTree; dark: boolean; seed: number }) {
  const f = Math.max(0, Math.min(1, t.read));
  const done = f >= 0.97;
  const trunkH = 10 + 34 * f;
  const crown = 9 + 20 * f;
  const cy = base - trunkH - crown * 0.55;
  // الجاهزية تزيد الخضرة عمقًا
  const g = Math.max(0, Math.min(1, t.readiness / 100));
  const leaf = dark ? `rgb(${Math.round(70 + 20 * g)},${Math.round(140 + 40 * g)},${Math.round(95 + 15 * g)})` : `rgb(${Math.round(110 - 50 * g)},${Math.round(178 - 20 * g)},${Math.round(95 - 25 * g)})`;
  const leaf2 = dark ? "rgba(140,220,160,0.35)" : "rgba(255,255,255,0.28)";
  const r = rng(seed);
  const fruits = done ? [0, 1, 2, 3].map(() => [x + (r() - 0.5) * crown * 1.2, cy + (r() - 0.4) * crown * 0.9]) : [];
  return (
    <G>
      <Ellipse cx={x} cy={base + 2} rx={crown * 0.9} ry={3} fill="rgba(0,0,0,0.12)" />
      <Rect x={x - 2.2} y={base - trunkH} width={4.4} height={trunkH} rx={2} fill={dark ? "#6B4A3A" : "#8A5A3C"} />
      <Circle cx={x} cy={cy} r={crown} fill={leaf} />
      <Circle cx={x - crown * 0.55} cy={cy + crown * 0.25} r={crown * 0.7} fill={leaf} />
      <Circle cx={x + crown * 0.55} cy={cy + crown * 0.3} r={crown * 0.68} fill={leaf} />
      <Circle cx={x - crown * 0.25} cy={cy - crown * 0.35} r={crown * 0.35} fill={leaf2} />
      {fruits.map(([fx, fy], i) => (
        <Circle key={i} cx={fx} cy={fy} r={2.6} fill="#F29A38" stroke="#FFF" strokeWidth={0.8} />
      ))}
    </G>
  );
}

export function ValleyArt({ id, trees, width }: { id: SceneId; trees: ValleyTree[]; width: number }) {
  const dark = id !== "garden";
  const list = trees.slice(0, MAX_TREES);
  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 22 }, () => [r() * W, r() * 70, 0.6 + r() * 1.1]);
  }, []);
  const bg = useMemo(() => {
    const rr = rng(23);
    return Array.from({ length: 16 }, (_, i) => {
      const bx = 8 + (W - 16) * (i / 15) + (rr() - 0.5) * 12;
      return [bx, 112 + Math.sin(bx / 40) * 6 + rr() * 8, 5 + rr() * 5];
    });
  }, []);
  // توزيع الأشجار على عرض الوادي مع تموّج بسيط في القاعدة
  const slots = Math.max(list.length, 1);
  const r = rng(11);
  const placed = list.map((t, i) => {
    const x = 34 + ((W - 68) * (i + 0.5)) / slots + (r() - 0.5) * 10;
    const base = 150 + Math.sin((x / W) * Math.PI * 2) * 6 + (r() - 0.5) * 6;
    return { t, x, base };
  });
  // الأبعد (الأعلى) يُرسم أولًا
  placed.sort((a, b) => a.base - b.base);
  return (
    <Svg width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="vsky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SKY[id][0]} />
          <Stop offset="1" stopColor={SKY[id][1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#vsky)" />
      {id === "sky" && stars.map(([sx, sy, sr], i) => <Circle key={i} cx={sx} cy={sy} r={sr} fill="#FFFFFF" opacity={0.7} />)}
      {id === "garden" && <Circle cx={300} cy={44} r={20} fill="#FFD27A" opacity={0.85} />}
      {id === "study" && <Circle cx={300} cy={70} r={22} fill="#F2A65A" opacity={0.6} />}
      {id === "sky" && <Circle cx={300} cy={40} r={14} fill="#F5EBD0" />}
      <Path d={`M0 120 C 70 95, 140 110, 200 100 S 320 90, ${W} 108 L ${W} ${H} L 0 ${H} Z`} fill={HILLS[id][0]} />
      {/* أشجار بعيدة باهتة تملأ الوادي (زينة) */}
      {bg.map(([bx, by, br], i) => (
        <G key={`bg${i}`} opacity={dark ? 0.35 : 0.45}>
          <Rect x={bx - 1} y={by} width={2} height={br * 0.9} fill={dark ? "#3E2E2A" : "#7C6A4E"} />
          <Circle cx={bx} cy={by - br * 0.2} r={br} fill={dark ? "#2F5A45" : "#8CC07A"} />
        </G>
      ))}
      <Path d={`M0 150 C 80 138, 170 160, 250 146 S 330 140, ${W} 150 L ${W} ${H} L 0 ${H} Z`} fill={HILLS[id][1]} />
      {placed.map(({ t, x, base }, i) => (
        <Tree key={t.id} x={x} base={base} t={t} dark={dark} seed={i + 3} />
      ))}
    </Svg>
  );
}
