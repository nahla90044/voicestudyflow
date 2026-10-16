// components/brand/mindmap.tsx
// خريطة ذهنية شعاعية بأسلوب توني بوزان: مركز متوهّج، فروع منحنية سميكة تستدقّ للخارج
// بلون لكل فرع، وعناوين الفروع في كبسولات، والنقاط أوراق في أطراف الفروع.
// التخطيط يُحسب مرة واحدة (mindmapLayout) ويُرسم في التطبيق (BuzanMindMap) وفي الطباعة/PDF
// (mindmapSvg) بنفس الشكل. يعمل على المشهد الفاتح والداكن.
import React, { useEffect, useMemo } from "react";
import { Animated } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import type { MindMap } from "../../lib/syllabus";

export const MM_COLORS = ["#7C5CFF", "#00B4D8", "#2EB872", "#F59E0B", "#EF5DA8", "#4F8CFF", "#A855F7", "#14B8A6"];

export type MindTheme = { dark: boolean; bg: string; ink: string; dim: string };

const W = 1700;
const H = 1260;
const CX = W / 2;
const CY = H / 2;
const SX = 1.18; // تمدّد أفقي (الورقة/الشاشة أعرض من طولها)
const R_CENTER = 120;
const R_BRANCH = 285; // مركز كبسولة الفرع
const R_LEAF = 455; // موضع الأوراق

/** يقسّم نصًا لأسطر بحد أقصى للحروف (يحترم الكلمات) */
function wrap(s: string, max: number, lines: number): string[] {
  const words = (s || "").trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? cur + " " + words[i] : words[i];
    if (next.length > max && cur) {
      out.push(cur);
      cur = words[i];
      if (out.length === lines) break;
    } else cur = next;
  }
  if (out.length < lines) {
    if (cur) out.push(cur);
  } else {
    out[lines - 1] += "…"; // بقيت كلمات لم تتسع
  }
  // كلمة واحدة أطول من السطر
  return out.length ? out.map((l) => (l.length > max + 6 ? l.slice(0, max + 5) + "…" : l)) : [""];
}

const at = (a: number, r: number) => ({ x: CX + Math.cos(a) * r * SX, y: CY + Math.sin(a) * r });

type Leaf = { x: number; y: number; dotX: number; dotY: number; lines: string[]; anchor: "start" | "end" | "middle"; path: string };
type Branch = {
  color: string;
  /** الفرع السميك المستدقّ (شكل مغلق) */
  shape: string;
  pill: { x: number; y: number; w: number; h: number; lines: string[] };
  leaves: Leaf[];
};
export type MindLayout = { w: number; h: number; center: string[]; branches: Branch[] };

export function mindmapLayout(map: MindMap): MindLayout {
  const bs = map.branches.slice(0, 8);
  const n = Math.max(1, bs.length);
  const sector = (2 * Math.PI) / n;
  // نبدأ من أعلى اليمين ونسير مع عقارب الساعة (يناسب القراءة العربية)
  const start = -Math.PI / 2 + sector / 2;
  const branches: Branch[] = bs.map((b, i) => {
    const a = start + i * sector;
    const color = MM_COLORS[i % MM_COLORS.length];

    // فرع سميك مستدقّ ينحني قليلًا: من حافة المركز إلى مركز الكبسولة (تغطي طرفه)
    const p0 = at(a, R_CENTER - 20);
    const p1 = at(a, R_BRANCH);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const mx = (p0.x + p1.x) / 2 + nx * 34;
    const my = (p0.y + p1.y) / 2 + ny * 34;
    const w0 = 24; // سُمك عند المركز
    const w1 = 6; // سُمك عند الطرف
    const wm = (w0 + w1) / 2;
    const shape =
      `M ${p0.x + nx * w0} ${p0.y + ny * w0} ` +
      `Q ${mx + nx * wm} ${my + ny * wm} ${p1.x + nx * w1} ${p1.y + ny * w1} ` +
      `L ${p1.x - nx * w1} ${p1.y - ny * w1} ` +
      `Q ${mx - nx * wm} ${my - ny * wm} ${p0.x - nx * w0} ${p0.y - ny * w0} Z`;

    const lines = wrap(b.label, 15, 3);
    const pw = Math.max(...lines.map((l) => l.length)) * 14 + 48;
    const ph = lines.length * 34 + 24;

    const pts = b.points.slice(0, 3);
    const spread = Math.min(0.5, sector * 0.36); // زاوية بين الأوراق
    const leaves: Leaf[] = pts.map((p, j) => {
      const la = a + (j - (pts.length - 1) / 2) * spread;
      const d = at(la, R_LEAF);
      const c = Math.cos(la);
      // أوراق الأعلى/الأسفل: نص في الوسط فوق/تحت النقطة (لا يتداخل مع جيرانه)
      const vertical = Math.abs(c) < 0.42;
      const ll = vertical ? wrap(p, 14, 4) : wrap(p, 22, 3);
      const anchor: Leaf["anchor"] = vertical ? "middle" : c >= 0 ? "start" : "end";
      const tx = vertical ? d.x : d.x + (c >= 0 ? 16 : -16);
      const down = Math.sin(la) > 0;
      const ty = vertical ? d.y + (down ? 30 + ((ll.length - 1) * 29) / 2 : -22 - ((ll.length - 1) * 29) / 2) : d.y;
      // خط رفيع منحني من الكبسولة إلى الورقة
      const q = at((a + la) / 2, (R_BRANCH + R_LEAF) / 2 + 12);
      const path = `M ${p1.x} ${p1.y} Q ${q.x} ${q.y} ${d.x} ${d.y}`;
      return { x: tx, y: ty, dotX: d.x, dotY: d.y, lines: ll, anchor, path };
    });
    return { color, shape, pill: { x: p1.x, y: p1.y, w: pw, h: ph, lines }, leaves };
  });
  return { w: W, h: H, center: wrap(map.center, 12, 4), branches };
}

const AG = Animated.createAnimatedComponent(G);

/** الخريطة في التطبيق: ظهور متدرّج للفروع، وتتبع ألوان المشهد */
export function BuzanMindMap({ map, size = 340, theme }: { map: MindMap; size?: number; theme?: MindTheme }) {
  const th = theme ?? { dark: true, bg: "#0B1220", ink: "#F3F4F8", dim: "#C4C9D8" };
  const L = useMemo(() => mindmapLayout(map), [map]);
  // قيم الحركة تُنشأ من جديد لكل خريطة (عدد الفروع يختلف بين الوحدات)
  const anims = useMemo(() => L.branches.map(() => new Animated.Value(0)), [L]);
  const center = useMemo(() => new Animated.Value(0), [L]);
  useEffect(() => {
    Animated.sequence([
      Animated.timing(center, { toValue: 1, duration: 380, useNativeDriver: false }),
      Animated.stagger(
        110,
        anims.map((v) => Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: false }))
      ),
    ]).start();
  }, [anims, center]);

  return (
    <Svg width={size} height={(size * L.h) / L.w} viewBox={`0 0 ${L.w} ${L.h}`}>
      <Defs>
        <RadialGradient id="mmGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#8B7CFF" stopOpacity={th.dark ? 0.55 : 0.35} />
          <Stop offset="1" stopColor="#8B7CFF" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="mmCenter" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7C5CFF" />
          <Stop offset="1" stopColor="#00B4D8" />
        </LinearGradient>
        {L.branches.map((b, i) => (
          <LinearGradient key={i} id={`mmB${i}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={b.color} stopOpacity={1} />
            <Stop offset="1" stopColor={b.color} stopOpacity={0.75} />
          </LinearGradient>
        ))}
      </Defs>

      {/* هالة خلف المركز */}
      <Circle cx={CX} cy={CY} r={340} fill="url(#mmGlow)" />

      {L.branches.map((b, i) => (
        <AG key={i} opacity={anims[i]}>
          <Path d={b.shape} fill={`url(#mmB${i})`} />
          {b.leaves.map((lf, j) => (
            <G key={j}>
              <Path d={lf.path} stroke={b.color} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.8} />
              <Circle cx={lf.dotX} cy={lf.dotY} r={8} fill={b.color} />
              {lf.lines.map((ln, k) => (
                <SvgText
                  key={k}
                  x={lf.x}
                  y={lf.y + 8 + (k - (lf.lines.length - 1) / 2) * 29}
                  fontSize={23}
                  fontWeight="600"
                  fill={th.ink}
                  textAnchor={lf.anchor}
                >
                  {ln}
                </SvgText>
              ))}
            </G>
          ))}
          <Rect
            x={b.pill.x - b.pill.w / 2}
            y={b.pill.y - b.pill.h / 2}
            width={b.pill.w}
            height={b.pill.h}
            rx={b.pill.h / 2}
            fill={th.bg}
            stroke={b.color}
            strokeWidth={4}
          />
          {b.pill.lines.map((ln, k) => (
            <SvgText
              key={k}
              x={b.pill.x}
              y={b.pill.y + 10 + (k - (b.pill.lines.length - 1) / 2) * 34}
              fontSize={26}
              fontWeight="800"
              fill={b.color}
              textAnchor="middle"
            >
              {ln}
            </SvgText>
          ))}
        </AG>
      ))}

      <AG opacity={center}>
        <Circle cx={CX} cy={CY} r={R_CENTER + 10} fill={th.dark ? "#ffffff14" : "#7C5CFF1F"} />
        <Circle cx={CX} cy={CY} r={R_CENTER} fill="url(#mmCenter)" />
        {L.center.map((ln, k) => (
          <SvgText
            key={k}
            x={CX}
            y={CY + 11 + (k - (L.center.length - 1) / 2) * 34}
            fontSize={28}
            fontWeight="900"
            fill="#FFFFFF"
            textAnchor="middle"
          >
            {ln}
          </SvgText>
        ))}
      </AG>
    </Svg>
  );
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** نفس الخريطة كنص SVG (للطباعة وملف PDF) — مشهد فاتح للطباعة */
export function mindmapSvg(map: MindMap): string {
  const L = mindmapLayout(map);
  const parts: string[] = [];
  parts.push(
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8B7CFF" stop-opacity="0.3"/><stop offset="1" stop-color="#8B7CFF" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset="1" stop-color="#00B4D8"/></linearGradient></defs>`
  );
  parts.push(`<circle cx="${CX}" cy="${CY}" r="340" fill="url(#g)"/>`);
  for (const b of L.branches) {
    parts.push(`<path d="${b.shape}" fill="${b.color}"/>`);
    for (const lf of b.leaves) {
      parts.push(`<path d="${lf.path}" stroke="${b.color}" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.8"/>`);
      parts.push(`<circle cx="${lf.dotX}" cy="${lf.dotY}" r="8" fill="${b.color}"/>`);
      lf.lines.forEach((ln, k) =>
        parts.push(
          `<text x="${lf.x}" y="${lf.y + 8 + (k - (lf.lines.length - 1) / 2) * 29}" font-size="23" font-weight="600" fill="#1F2937" text-anchor="${lf.anchor}">${esc(ln)}</text>`
        )
      );
    }
    const p = b.pill;
    parts.push(`<rect x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" rx="${p.h / 2}" fill="#fff" stroke="${b.color}" stroke-width="4"/>`);
    p.lines.forEach((ln, k) =>
      parts.push(`<text x="${p.x}" y="${p.y + 10 + (k - (p.lines.length - 1) / 2) * 34}" font-size="26" font-weight="800" fill="${b.color}" text-anchor="middle">${esc(ln)}</text>`)
    );
  }
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_CENTER}" fill="url(#c)"/>`);
  L.center.forEach((ln, k) =>
    parts.push(`<text x="${CX}" y="${CY + 11 + (k - (L.center.length - 1) / 2) * 34}" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">${esc(ln)}</text>`)
  );
  return `<svg viewBox="0 0 ${L.w} ${L.h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, 'SF Arabic', sans-serif">${parts.join("")}</svg>`;
}
