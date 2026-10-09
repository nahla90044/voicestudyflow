// lib/scene.ts
// المشهد الحالي للواجهة: يتبع وقت اليوم تلقائيًا، أو يثبّته الطالب من الإعدادات.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { resolveScene, SCENE_PALETTE, type SceneId, type ScenePalette, type ScenePref } from "./sceneCore.ts";

export { SCENE_PALETTE, type SceneId, type ScenePalette, type ScenePref };

const KEY = "vsf:scene:v1";
let pref: ScenePref = "auto";
let loaded = false;
const listeners = new Set<() => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const v = (await AsyncStorage.getItem(KEY)) as ScenePref | null;
    if (v === "garden" || v === "study" || v === "sky" || v === "auto") pref = v;
  } catch {}
  listeners.forEach((fn) => fn());
}

export function getScenePref(): ScenePref {
  return pref;
}

export async function setScenePref(p: ScenePref): Promise<void> {
  pref = p;
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(KEY, p).catch(() => {});
}

/** المشهد الآن + ألوانه. يُعاد حسابه عند العودة للتطبيق وكل ١٠ دقائق.
 * القيم في حالة React (لا متغيرات الوحدة مباشرة) حتى لا يحفظ React Compiler نتيجة قديمة. */
export function useScene(): { id: SceneId; pal: ScenePalette; pref: ScenePref } {
  const [cur, setCur] = useState<ScenePref>(pref);
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    void load();
    const sync = () => {
      setCur(pref);
      setHour(new Date().getHours());
    };
    sync();
    listeners.add(sync);
    const sub = AppState.addEventListener("change", (s) => s === "active" && sync());
    const iv = setInterval(sync, 10 * 60 * 1000);
    return () => {
      listeners.delete(sync);
      sub.remove();
      clearInterval(iv);
    };
  }, []);
  const id = resolveScene(cur, hour);
  return { id, pal: SCENE_PALETTE[id], pref: cur };
}
