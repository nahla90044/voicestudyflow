// constants/themes.ts
// خمس هويات بصرية للتطبيق: كل ثيم له خلفية متدرّجة + بقع توهّج + لون مميّز.
export type AppTheme = {
  id: string;
  name: string;
  emoji: string;
  bg: readonly [string, string, string]; // تدرّج الخلفية
  glow1: string; // بقعة توهّج علوية
  glow2: string;
  glow3: string;
  accent: string; // اللون المميّز للثيم
};

export const THEMES: AppTheme[] = [
  {
    id: "web3",
    name: "نيون بنفسجي",
    emoji: "🟣",
    bg: ["#0a0e1a", "#0f1424", "#0a0e1a"],
    glow1: "#4f8cff",
    glow2: "#7c5cff",
    glow3: "#22d3ee",
    accent: "#7c5cff",
  },
  {
    id: "sunset",
    name: "غروب",
    emoji: "🌅",
    bg: ["#1a0b14", "#26101c", "#180a10"],
    glow1: "#ff7a59",
    glow2: "#ec4899",
    glow3: "#f59e0b",
    accent: "#ff6b9d",
  },
  {
    id: "forest",
    name: "غابة",
    emoji: "🌿",
    bg: ["#08160f", "#0c2018", "#07130d"],
    glow1: "#2ecc71",
    glow2: "#14b8a6",
    glow3: "#a3e635",
    accent: "#2ecc71",
  },
  {
    id: "ocean",
    name: "محيط",
    emoji: "🌊",
    bg: ["#06121f", "#0a1c2e", "#05101a"],
    glow1: "#22d3ee",
    glow2: "#3b82f6",
    glow3: "#06b6d4",
    accent: "#38bdf8",
  },
  {
    id: "sand",
    name: "رملي دافئ",
    emoji: "🏜️",
    bg: ["#16110a", "#211810", "#130e08"],
    glow1: "#f59e0b",
    glow2: "#d97706",
    glow3: "#fbbf24",
    accent: "#f5a623",
  },
];

export const DEFAULT_THEME_ID = "web3";

export function themeById(id: string | null | undefined): AppTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
