// constants/design.ts
// نظام تصميم موحّد لتطبيق VoiceStudyFlow.
// استخدمي هذه التوكنز بدل تكرار الألوان والقياسات داخل كل شاشة.

export const Palette = {
  // الخلفيات
  bg: "#0b1220",
  bgElevated: "#0f172a",
  surface: "rgba(255,255,255,0.06)",
  surfaceStrong: "rgba(255,255,255,0.10)",
  border: "rgba(255,255,255,0.12)",

  // النصوص
  text: "#ffffff",
  textMuted: "#c9d4e2",
  textDim: "#9fb3c8",
  placeholder: "#8aa0b8",

  // ألوان العلامة
  primary: "#4f8cff",
  primaryDark: "#2f6bdc",
  accent: "#7c5cff",
  success: "#2ecc71",
  warn: "#f1c40f",
  danger: "#ff5d6c",

  // شفافيات مفيدة
  primarySoft: "rgba(79,140,255,0.16)",
  accentSoft: "rgba(124,92,255,0.16)",
  successSoft: "rgba(46,204,113,0.16)",

  // ألوان نيون (طابع Web3)
  neonCyan: "#22d3ee",
  neonViolet: "#a855f7",
  neonPink: "#ec4899",
  neonBlue: "#3b82f6",

  // زجاج (glassmorphism)
  glass: "rgba(255,255,255,0.07)",
  glassBorder: "rgba(255,255,255,0.16)",
  glassHighlight: "rgba(255,255,255,0.22)",
} as const;

// تدرجات (للاستخدام مع expo-linear-gradient)
export const Gradients = {
  bg: ["#0b1220", "#0d1730", "#0b1220"] as const,
  brand: ["#4f8cff", "#7c5cff"] as const,
  brandSoft: ["rgba(79,140,255,0.22)", "rgba(124,92,255,0.18)"] as const,
  success: ["#2ecc71", "#1fa463"] as const,
  hero: ["#15213f", "#0b1220"] as const,
  // تدرّجات نيون (Web3)
  neon: ["#22d3ee", "#a855f7", "#ec4899"] as const,
  neonBlue: ["#3b82f6", "#22d3ee"] as const,
  neonViolet: ["#7c5cff", "#a855f7"] as const,
  // حافة زجاجية لامعة
  glassEdge: ["rgba(255,255,255,0.25)", "rgba(255,255,255,0.04)"] as const,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const Typography = {
  h1: { fontSize: 28, fontWeight: "900" as const },
  h2: { fontSize: 22, fontWeight: "900" as const },
  title: { fontSize: 16, fontWeight: "900" as const },
  body: { fontSize: 14, fontWeight: "600" as const },
  small: { fontSize: 12, fontWeight: "700" as const },
};

// ظل ناعم موحّد للبطاقات
export const cardShadow = {
  shadowColor: "#000",
  shadowOpacity: 0.25,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
};
