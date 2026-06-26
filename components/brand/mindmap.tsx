// components/brand/mindmap.tsx
// خريطة ذهنية شعاعية على طريقة توني بوزان: فكرة مركزية + فروع منحنية ملوّنة
// + نقاط فرعية. تُرسم بـSVG وتُعرض داخل حاوية قابلة للتكبير/السحب.
import React from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import type { MindMap } from "../../lib/syllabus";

const COLORS = ["#7c5cff", "#22d3ee", "#2ecc71", "#f5a623", "#ff6b9d", "#4f8cff", "#a855f7", "#ef4444"];

export const MINDMAP_W = 880;
export const MINDMAP_H = 880;

function wrap(s: string, max: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 2);
}

export function BuzanMindMap({ map, size = 340 }: { map: MindMap; size?: number }) {
  const CX = MINDMAP_W / 2;
  const CY = MINDMAP_H / 2;
  const N = Math.max(1, map.branches.length);
  const R = 250; // مسافة الفرع من المركز

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MINDMAP_W} ${MINDMAP_H}`}>
      <Defs>
        <LinearGradient id="center" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7c5cff" />
          <Stop offset="1" stopColor="#4f8cff" />
        </LinearGradient>
      </Defs>

      {map.branches.map((b, i) => {
        const c = COLORS[i % COLORS.length];
        const ang = (i / N) * 2 * Math.PI - Math.PI / 2; // ابدأ من الأعلى
        const bx = CX + R * Math.cos(ang);
        const by = CY + R * Math.sin(ang);
        // منحنى عضوي من المركز إلى الفرع
        const mx = CX + R * 0.5 * Math.cos(ang) + 40 * Math.cos(ang + Math.PI / 2);
        const my = CY + R * 0.5 * Math.sin(ang) + 40 * Math.sin(ang + Math.PI / 2);
        const onLeft = Math.cos(ang) < 0;
        const labelLines = wrap(b.label, 18);

        return (
          <G key={i}>
            {/* الفرع المنحني (يرفع عند المركز وينحف عند الطرف) */}
            <Path
              d={`M ${CX} ${CY} Q ${mx} ${my} ${bx} ${by}`}
              stroke={c}
              strokeWidth={7}
              fill="none"
              strokeLinecap="round"
            />
            {/* النقاط الفرعية */}
            {b.points.slice(0, 4).map((p, j) => {
              const spread = (j - (Math.min(b.points.length, 4) - 1) / 2) * 0.42;
              const pa = ang + spread;
              const px = bx + 150 * Math.cos(pa);
              const py = by + 150 * Math.sin(pa);
              return (
                <G key={j}>
                  <Path
                    d={`M ${bx} ${by} Q ${(bx + px) / 2 + 14 * Math.cos(pa + Math.PI / 2)} ${
                      (by + py) / 2 + 14 * Math.sin(pa + Math.PI / 2)
                    } ${px} ${py}`}
                    stroke={c}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    opacity={0.8}
                  />
                  <Circle cx={px} cy={py} r={5} fill={c} />
                  <SvgText
                    x={px + (px >= bx ? 10 : -10)}
                    y={py + 5}
                    fill="#dbe4f0"
                    fontSize="20"
                    fontWeight="600"
                    textAnchor={px >= bx ? "start" : "end"}
                  >
                    {p.length > 26 ? p.slice(0, 25) + "…" : p}
                  </SvgText>
                </G>
              );
            })}
            {/* عقدة الفرع */}
            <Circle cx={bx} cy={by} r={16} fill={c} />
            {labelLines.map((ln, k) => (
              <SvgText
                key={k}
                x={bx + (onLeft ? -26 : 26)}
                y={by - (labelLines.length - 1) * 13 + k * 26 + 6}
                fill={c}
                fontSize="24"
                fontWeight="900"
                textAnchor={onLeft ? "end" : "start"}
              >
                {ln}
              </SvgText>
            ))}
          </G>
        );
      })}

      {/* العقدة المركزية */}
      <Ellipse cx={CX} cy={CY} rx={130} ry={70} fill="url(#center)" />
      {wrap(map.center, 16).map((ln, k, arr) => (
        <SvgText
          key={k}
          x={CX}
          y={CY - (arr.length - 1) * 15 + k * 30 + 8}
          fill="#fff"
          fontSize="26"
          fontWeight="900"
          textAnchor="middle"
        >
          {ln}
        </SvgText>
      ))}
    </Svg>
  );
}
