// lib/notes.ts
// «صفحة الملاحظات» لكل كتاب (مثل Notability): صفحات مسطّرة فيها نص مكتوب وكتابة بالقلم معًا.
// تُحفظ على الجهاز تلقائيًا لكل كتاب، وتُطبع/تُشارك PDF.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Stroke } from "./ink";

export type NotePage = { id: string; text: string; strokes: Stroke[]; updatedAt: number };

const key = (bookId: string) => `vsf:notes:v1:${bookId}`;

export function newNotePage(): NotePage {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: "", strokes: [], updatedAt: Date.now() };
}

export async function loadNotes(bookId: string): Promise<NotePage[]> {
  try {
    const raw = await AsyncStorage.getItem(key(bookId));
    const list = raw ? (JSON.parse(raw) as NotePage[]) : [];
    const ok = Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string") : [];
    return ok.length ? ok.map((p) => ({ ...p, text: String(p.text ?? ""), strokes: Array.isArray(p.strokes) ? p.strokes : [] })) : [newNotePage()];
  } catch {
    return [newNotePage()];
  }
}

export async function saveNotes(bookId: string, pages: NotePage[]): Promise<void> {
  await AsyncStorage.setItem(key(bookId), JSON.stringify(pages)).catch(() => {});
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

/** كتابة القلم كمسارات SVG بأبعاد الصفحة المطبوعة */
function strokesSvg(strokes: Stroke[], w: number, h: number): string {
  const paths = strokes
    .map((s) => {
      const p = s.p;
      if (!p || p.length < 2) return "";
      let d = `M${(p[0] * w).toFixed(1)} ${(p[1] * w).toFixed(1)}`;
      for (let i = 2; i < p.length; i += 2) d += ` L${(p[i] * w).toFixed(1)} ${(p[i + 1] * w).toFixed(1)}`;
      return `<path d="${d}" stroke="${s.c}" stroke-width="${(s.w * w).toFixed(2)}" stroke-opacity="${s.m ? 0.38 : 1}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg class="ink" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin meet">${paths}</svg>`;
}

/** PDF لصفحات الملاحظات (النص + كتابة القلم) ثم الحفظ/المشاركة/الطباعة */
export async function exportNotesPdf(pages: NotePage[], L: { title: string; bookTitle: string; rtl: boolean; aspect: number }): Promise<void> {
  const W = 700;
  const H = Math.round(W * L.aspect);
  const body = pages
    .filter((p) => p.text.trim() || p.strokes.length)
    .map(
      (p, i) => `<section class="pg">
        <div class="no">${i + 1}</div>
        <div class="txt">${esc(p.text)}</div>
        ${p.strokes.length ? strokesSvg(p.strokes, W, H) : ""}
      </section>`
    )
    .join("");
  const html = `<!doctype html><html dir="${L.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&family=Noto+Kufi+Arabic:wght@700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; font-family: "Noto Naskh Arabic", "Geeza Pro", -apple-system, sans-serif; color: #24263A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 18pt; margin: 0 0 4px; }
    .sub { color: #6B6880; font-size: 10pt; margin-bottom: 10px; }
    .pg { position: relative; width: ${W}px; height: ${H}px; margin: 0 auto 14px; page-break-after: always; border-radius: 10px;
      background: repeating-linear-gradient(#FFFDF8, #FFFDF8 33px, #E4E8F2 34px); border: 1px solid #E7E5F2; overflow: hidden; }
    .no { position: absolute; top: 8px; ${L.rtl ? "left" : "right"}: 12px; color: #A3A0B8; font-size: 9pt; }
    .txt { position: absolute; inset: 6px 22px; font-size: 15pt; line-height: 34px; white-space: normal; }
    .ink { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
  </style></head><body>
  <h1>${esc(L.title)}</h1><div class="sub">${esc(L.bookTitle)}</div>${body}</body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: L.title });
  else await Print.printAsync({ uri });
}
