// lib/listenPos.ts
// مكان الوقوف في صوت الملخّص المختصر لكل مصدر: يُحفظ على الجهاز فورًا، ويُرفع للسيرفر مع تقدّم الوحدة
// (book_syllabus.progress عبر studyTrack) فيكمل الطالب من نفس المكان على الآيباد والجوال.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = (k: string) => `vsf:listenpos:v1:${k}`;

export async function getListenPos(key: string): Promise<number> {
  try {
    const v = Number(await AsyncStorage.getItem(KEY(key)));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function setListenPos(key: string, index: number): void {
  if (index > 0) AsyncStorage.setItem(KEY(key), String(Math.floor(index))).catch(() => {});
  else AsyncStorage.removeItem(KEY(key)).catch(() => {});
}
