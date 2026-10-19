// lib/summaryPrefs.ts
// أسلوب الملخّص الذي يختاره الطالب لكل كتاب: «الالتزام بالكتاب» أو «التوسّع» (أمثلة وتمارين إضافية).
// يُسأل مرة لكل كتاب قبل أول ملخّص، ويُغيَّر من «إعادة الصياغة».
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SummaryMode = "strict" | "expand";
const KEY = (p: string) => `vsf:summode:${p}`;

export async function getSummaryMode(pdfPath: string): Promise<SummaryMode | null> {
  try {
    const v = await AsyncStorage.getItem(KEY(pdfPath));
    return v === "strict" || v === "expand" ? v : null;
  } catch {
    return null;
  }
}

export async function setSummaryMode(pdfPath: string, mode: SummaryMode | null): Promise<void> {
  try {
    if (mode) await AsyncStorage.setItem(KEY(pdfPath), mode);
    else await AsyncStorage.removeItem(KEY(pdfPath));
  } catch {}
}
