// components/brand/illustrations.tsx
// رسومات SVG احترافية تُستخدم في التوتوريال والشاشات.
import React from "react";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { Palette } from "../../constants/design";

type Props = { size?: number };

function Frame({ size = 220, children }: Props & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 220 220" fill="none">
      <Defs>
        <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Palette.primary} />
          <Stop offset="1" stopColor={Palette.accent} />
        </LinearGradient>
        <LinearGradient id="brandSoft" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Palette.primary} stopOpacity="0.25" />
          <Stop offset="1" stopColor={Palette.accent} stopOpacity="0.18" />
        </LinearGradient>
      </Defs>
      {children}
    </Svg>
  );
}

/** كتاب + سماعة: ذاكر بالاستماع */
export function ReadListenArt({ size }: Props) {
  return (
    <Frame size={size}>
      <Circle cx="110" cy="110" r="96" fill="url(#brandSoft)" />
      {/* الكتاب */}
      <Rect x="58" y="74" width="104" height="78" rx="10" fill="url(#brand)" />
      <Rect x="58" y="74" width="52" height="78" rx="10" fill={Palette.primaryDark} opacity={0.55} />
      <Path d="M110 74 v78" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
      <Rect x="70" y="92" width="30" height="5" rx="2.5" fill="#fff" opacity="0.7" />
      <Rect x="70" y="104" width="30" height="5" rx="2.5" fill="#fff" opacity="0.5" />
      <Rect x="122" y="92" width="30" height="5" rx="2.5" fill="#fff" opacity="0.7" />
      <Rect x="122" y="104" width="30" height="5" rx="2.5" fill="#fff" opacity="0.5" />
      {/* السماعة */}
      <Path
        d="M150 120 a40 40 0 0 0 -80 0"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <Rect x="62" y="118" width="16" height="26" rx="8" fill="#fff" />
      <Rect x="142" y="118" width="16" height="26" rx="8" fill="#fff" />
    </Frame>
  );
}

/** موجات صوت: أصوات بشرية */
export function VoiceWaveArt({ size }: Props) {
  const bars = [28, 52, 78, 100, 78, 52, 28, 60, 40];
  return (
    <Frame size={size}>
      <Circle cx="110" cy="110" r="96" fill="url(#brandSoft)" />
      <Circle cx="110" cy="110" r="58" fill={Palette.bgElevated} />
      <G>
        {bars.map((h, i) => {
          const x = 70 + i * 9;
          return (
            <Rect
              key={i}
              x={x}
              y={110 - h / 2}
              width="5"
              height={h}
              rx="2.5"
              fill="url(#brand)"
            />
          );
        })}
      </G>
    </Frame>
  );
}

/** تقويم + علامة صح: خطة ذكية */
export function PlanArt({ size }: Props) {
  return (
    <Frame size={size}>
      <Circle cx="110" cy="110" r="96" fill="url(#brandSoft)" />
      <Rect x="56" y="60" width="108" height="100" rx="14" fill={Palette.bgElevated} stroke={Palette.border} strokeWidth="1.5" />
      <Rect x="56" y="60" width="108" height="26" rx="14" fill="url(#brand)" />
      <Circle cx="80" cy="56" r="6" fill="#fff" />
      <Circle cx="140" cy="56" r="6" fill="#fff" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <Rect
            key={`${r}-${c}`}
            x={70 + c * 22}
            y={100 + r * 18}
            width="12"
            height="12"
            rx="3"
            fill={r === 1 && c === 2 ? Palette.success : Palette.surfaceStrong}
          />
        ))
      )}
      <Path
        d="M150 118 l6 6 l12 -14"
        stroke={Palette.success}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Frame>
  );
}

/** قفل + درع: خصوصيتك محمية */
export function SecureArt({ size }: Props) {
  return (
    <Frame size={size}>
      <Circle cx="110" cy="110" r="96" fill="url(#brandSoft)" />
      <Path
        d="M110 56 l44 18 v34 c0 30 -20 50 -44 60 c-24 -10 -44 -30 -44 -60 v-34 z"
        fill="url(#brand)"
      />
      <Rect x="92" y="104" width="36" height="30" rx="6" fill="#fff" />
      <Path d="M99 104 v-8 a11 11 0 0 1 22 0 v8" stroke="#fff" strokeWidth="6" fill="none" />
      <Circle cx="110" cy="118" r="5" fill={Palette.primaryDark} />
    </Frame>
  );
}
