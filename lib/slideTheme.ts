// lib/slideTheme.ts
// «شكل الشرائح» في ملخّص الفيديو (منوّع / مجلة / بصري / سينمائي): اختيار واحد يُحفظ على الجهاز
// ويسري على كل الفيديوهات القديمة والجديدة فورًا — عرض فقط، بلا أي طلب ذكاء.
// بنمط lib/scene.ts: قيمة على مستوى الوحدة ومستمعون، والهوك يحتفظ بالقيمة في حالة React
// (لا تُقرأ متغيرات الوحدة أثناء الرسم حتى لا يحفظ React Compiler نتيجة قديمة).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { isThemePref, type SlideThemePref } from "./slideThemeCore.ts";

export type { SlideThemePref };

const KEY = "vsf:video:slideTheme";
let pref: SlideThemePref = "mixed";
let loaded = false;
const listeners = new Set<() => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    // قيمة غير صالحة أو غائبة → «منوّع» (الافتراضي)
    pref = isThemePref(v) ? v : "mixed";
  } catch {}
  listeners.forEach((fn) => fn());
}

export function getSlideThemePref(): SlideThemePref {
  return pref;
}

export async function setSlideThemePref(p: SlideThemePref): Promise<void> {
  pref = isThemePref(p) ? p : "mixed";
  loaded = true; // اختيار صريح يسبق أي قراءة متأخرة من التخزين
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(KEY, pref).catch(() => {});
}

/** [الشكل المختار، تغييره] — التغيير يسري فورًا على كل الشاشات المفتوحة ويُحفظ */
export function useSlideThemePref(): [SlideThemePref, (p: SlideThemePref) => void] {
  const [cur, setCur] = useState<SlideThemePref>(pref);
  useEffect(() => {
    const sync = () => setCur(pref);
    listeners.add(sync);
    sync();
    void load();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  const set = useCallback((p: SlideThemePref) => {
    void setSlideThemePref(p);
  }, []);
  return [cur, set];
}
