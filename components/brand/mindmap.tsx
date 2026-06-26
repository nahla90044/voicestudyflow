// components/brand/mindmap.tsx
// خريطة ذهنية شجرية أفقية (RTL): الفكرة المركزية يمينًا، الفروع تتفرّع يسارًا،
// وكل نقطة في سطر مستقل — بلا تداخل. تُرسم بـSVG وتُعرض داخل حاوية قابلة للتكبير.
import React from "react";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import type { MindMap } from "../../lib/syllabus";

const COLORS = ["#7c5cff", "#22d3ee", "#2ecc71", "#f5a623", "#ff6b9d", "#4f8cff", "#a855f7"];

const W = 900;
const ROW = 46;
const X_ROOT = W - 130;
const X_BRANCH = 440;
const X_POINT = 215;

function clip(s: string, n: number): string {
  s = (s || "").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function centerLines(s: string): string[] {
  const words = (s || "").split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  if (words.length <= 2) return [s];
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

export function BuzanMindMap({ map, size = 340 }: { map: MindMap; size?: number }) {
  // وزّع الصفوف: كل فرع يأخذ صفوفًا بعدد نقاطه
  let y = 70;
  const layout = map.branches.map((b) => {
    const pts = b.points.slice(0, 3);
    const startY = y;
    const pointYs = pts.map((_, j) => startY + j * ROW);
    const by = startY + ((Math.max(1, pts.length) - 1) / 2) * ROW;
    y += Math.max(1, pts.length) * ROW + 26;
    return { label: b.label, pts, pointYs, by };
  });
  const H = y + 50;
  const rootY = H / 2;
  const aspect = H / W;

  return (
    <Svg width={size} height={size * aspect} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="ctr" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7c5cff" />
          <Stop offset="1" stopColor="#4f8cff" />
        </LinearGradient>
      </Defs>

      {layout.map((b, i) => {
        const c = COLORS[i % COLORS.length];
        const rootEdge = X_ROOT - 92;
        return (
          <React.Fragment key={i}>
            {/* فرع منحني من المركز إلى عقدة الفرع */}
            <Path
              d={`M ${rootEdge} ${rootY} C ${(rootEdge + X_BRANCH) / 2} ${rootY} ${(rootEdge + X_BRANCH) / 2} ${b.by} ${X_BRANCH} ${b.by}`}
              stroke={c}
              strokeWidth={6}
              fill="none"
              strokeLinecap="round"
            />
            <Circle cx={X_BRANCH} cy={b.by} r={13} fill={c} />
            <SvgText x={X_BRANCH + 22} y={b.by + 7} fill={c} fontSize="22" fontWeight="900" textAnchor="start">
              {clip(b.label, 17)}
            </SvgText>

            {/* النقاط الفرعية — كل واحدة في سطرها */}
            {b.pts.map((p, j) => {
              const py = b.pointYs[j];
              return (
                <React.Fragment key={j}>
                  <Path
                    d={`M ${X_BRANCH} ${b.by} C ${(X_POINT + X_BRANCH) / 2} ${b.by} ${(X_POINT + X_BRANCH) / 2} ${py} ${X_POINT} ${py}`}
                    stroke={c}
                    strokeWidth={2.5}
                    fill="none"
                    opacity={0.75}
                    strokeLinecap="round"
                  />
                  <Circle cx={X_POINT} cy={py} r={6} fill={c} />
                  <SvgText x={X_POINT - 16} y={py + 6} fill="#dbe4f0" fontSize="20" textAnchor="end">
                    {clip(p, 22)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}

      {/* العقدة المركزية */}
      <Ellipse cx={X_ROOT} cy={rootY} rx={92} ry={56} fill="url(#ctr)" />
      {centerLines(map.center).map((ln, k, arr) => (
        <SvgText
          key={k}
          x={X_ROOT}
          y={rootY - (arr.length - 1) * 14 + k * 28 + 7}
          fill="#fff"
          fontSize="22"
          fontWeight="900"
          textAnchor="middle"
        >
          {clip(ln, 14)}
        </SvgText>
      ))}
    </Svg>
  );
}
