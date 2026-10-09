// lib/sceneCore.ts
// «عالم حيّ يكبر مع القراءة»: ثلاثة مشاهد تتبدّل مع وقت اليوم — صباح «شجرة العلم»،
// مساء «سهرة القراءة»، ليل «سماء المعرفة». هنا المنطق الخالص (بلا React) ليُختبر:
// أي مشهد الآن، وألوانه، وكم يكبر حسب تقدّم الطالب.

export type SceneId = "garden" | "study" | "sky";
export type ScenePref = "auto" | SceneId;

/** ٥ص–٣م حديقة · ٣م–٨م سهرة · ٨م–٥ص سماء */
export function sceneForHour(h: number): SceneId {
  if (h >= 5 && h < 15) return "garden";
  if (h >= 15 && h < 20) return "study";
  return "sky";
}

export function resolveScene(pref: ScenePref, hour: number): SceneId {
  return pref === "auto" ? sceneForHour(hour) : pref;
}

export type ScenePalette = {
  dark: boolean;
  bg: string; // خلفية الشاشة تحت المشهد
  ink: string; // النص الأساسي
  dim: string; // النص الثانوي
  accent: string; // اللون المميّز (أزرار، تقدّم)
  onAccent: string; // نص فوق اللون المميّز
  card: string;
  cardBorder: string;
  track: string; // مسارات التقدّم والفواصل
  soft: string; // خلفية خفيفة بلون المميّز
  nav: string; // خلفية شريط التنقّل
  navIdle: string;
};

export const SCENE_PALETTE: Record<SceneId, ScenePalette> = {
  garden: {
    dark: false,
    bg: "#F7F4EA",
    ink: "#1F3527",
    dim: "#6E7B66",
    accent: "#2F7D4A",
    onAccent: "#FFFFFF",
    card: "#FFFFFF",
    cardBorder: "rgba(31,53,39,0.06)",
    track: "#EDF0E4",
    soft: "#F1F6EA",
    nav: "#FFFFFF",
    navIdle: "#8E9A86",
  },
  study: {
    dark: true,
    bg: "#140D16",
    ink: "#F7EEE4",
    dim: "#A8928D",
    accent: "#E9B35F",
    onAccent: "#140D16",
    card: "#21151F",
    cardBorder: "rgba(233,179,95,0.16)",
    track: "rgba(255,255,255,0.08)",
    soft: "rgba(233,179,95,0.08)",
    nav: "#21151F",
    navIdle: "#8F7A75",
  },
  sky: {
    dark: true,
    bg: "#0B0E26",
    ink: "#F5F1FF",
    dim: "#A9A5CC",
    accent: "#F6D58A",
    onAccent: "#0B0E26",
    card: "#151838",
    cardBorder: "rgba(255,255,255,0.10)",
    track: "rgba(255,255,255,0.10)",
    soft: "rgba(246,213,138,0.08)",
    nav: "#16183C",
    navIdle: "#8E8BB5",
  },
};

/** ما يُغذّي المشهد من تقدّم حقيقي */
export type SceneInput = {
  pagesToday: number;
  unitsDone: number; // وحدات مُنجزة (مقروءة أو مختبرة بنجاح)
  unitCount: number;
  readiness: number; // ٠–١٠٠
};

export type SceneGrowth = {
  lit: number; // نجوم مضيئة / كتب على الرف / أوراق
  slots: number; // السعة المرئية
  fruits: number; // ثمار الشجرة = وحدات مُتقنة
  fruitSlots: number;
};

/**
 * سماء: نجمة لكل صفحة اليوم من كوكبة ٨ نجوم.
 * سهرة: كتاب على الرف لكل وحدة منجزة (٦–١٠ أماكن).
 * حديقة: كثافة الأوراق من الجاهزية، وثمرة لكل وحدة منجزة.
 */
export function sceneGrowth(id: SceneId, x: SceneInput): SceneGrowth {
  const units = Math.max(0, Math.min(x.unitsDone, Math.max(x.unitCount, x.unitsDone)));
  const fruitSlots = Math.max(3, Math.min(8, x.unitCount || 4));
  const fruits = Math.min(fruitSlots, units);
  if (id === "sky") return { lit: Math.min(8, Math.max(0, x.pagesToday)), slots: 8, fruits, fruitSlots };
  if (id === "study") {
    const slots = Math.max(6, Math.min(10, x.unitCount || 6));
    return { lit: Math.min(slots, units), slots, fruits, fruitSlots };
  }
  const r = Math.max(0, Math.min(100, x.readiness));
  // شجرة لا تبدو جرداء أبدًا: ٤٠٪ أوراق كحدّ أدنى، وتمتلئ مع الجاهزية
  const slots = 40;
  return { lit: Math.round(slots * (0.4 + 0.6 * (r / 100))), slots, fruits, fruitSlots };
}
