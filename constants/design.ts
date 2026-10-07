// constants/design.ts
// نظام تصميم موحّد لتطبيق VoiceStudyFlow.
// استخدمي هذه التوكنز بدل تكرار الألوان والقياسات داخل كل شاشة.

export const Palette = {
  // الخلفيات — تصميم 2.0: أسود حبري هادئ بدل الأزرق الداكن
  bg: "#07080D",
  bgElevated: "#10121B",
  surface: "rgba(255,255,255,0.05)",
  surfaceStrong: "rgba(255,255,255,0.09)",
  border: "rgba(255,255,255,0.07)",

  // النصوص
  text: "#F3F4F8",
  textMuted: "#C4C9D8",
  textDim: "#8E95AB",
  placeholder: "#6F7690",

  // ألوان العلامة (تدرّج «الشفق»: بنفسجي ← سماوي ← نعناعي)
  primary: "#7C6CFF",
  primaryDark: "#5B4BD6",
  accent: "#3FD0FF",
  success: "#6CF3C5",
  warn: "#FFB38A",
  danger: "#FF6B81",

  // شفافيات مفيدة
  primarySoft: "rgba(124,108,255,0.16)",
  accentSoft: "rgba(63,208,255,0.14)",
  successSoft: "rgba(108,243,197,0.14)",

  // ألوان مميّزة للأدوات (الأسماء القديمة باقية حتى لا تنكسر الشاشات)
  neonCyan: "#5ED9FF",
  neonViolet: "#B9AFFF",
  neonPink: "#F79ACB",
  neonBlue: "#7C9CFF",

  // البطاقات: سطح مسطّح بحافة شعرية (بدل الزجاج المتوهّج)
  glass: "#10121B",
  glassBorder: "rgba(255,255,255,0.07)",
  glassHighlight: "rgba(255,255,255,0.05)",
} as const;

// تدرجات (للاستخدام مع expo-linear-gradient)
export const Gradients = {
  bg: ["#07080D", "#0A0B12", "#07080D"] as const,
  brand: ["#7C6CFF", "#3FD0FF"] as const,
  brandSoft: ["rgba(124,108,255,0.20)", "rgba(63,208,255,0.12)"] as const,
  success: ["#6CF3C5", "#3FD0FF"] as const,
  hero: ["#141629", "#07080D"] as const,
  // «الشفق» — يُستخدم للعناصر المهمة فقط (زر رئيسي، حلقة، شريط تقدّم)
  neon: ["#7C6CFF", "#3FD0FF", "#6CF3C5"] as const,
  neonBlue: ["#7C6CFF", "#3FD0FF"] as const,
  neonViolet: ["#7C6CFF", "#B9AFFF"] as const,
  glassEdge: ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.04)"] as const,
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
  lg: 20,
  xl: 26,
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
