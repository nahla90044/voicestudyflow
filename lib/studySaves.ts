// lib/studySaves.ts
// «محفوظات الكتاب»: العروض التقديمية وإجابات المساعد الذكي يحفظها المستخدم ليرجع لها
// لاحقًا، مرتبطة بالكتاب وبحسابه (جدول study_saves) — تبقى بعد تسجيل الخروج وعلى كل أجهزته.
// ومنها ملف PDF يُحفظ أو يُشارك (عرض كامل بشريحة لكل صفحة، أو نص المساعد مرتّبًا).
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { Slide } from "./ai";
import { supabase } from "./supabase";

export type SaveKind = "slides" | "assistant";

export type StudySave = {
  id: string;
  book_id: string;
  kind: SaveKind;
  title: string;
  scope: "page" | "unit" | null;
  page_from: number | null;
  page_to: number | null;
  content: { slides?: Slide[]; text?: string; question?: string };
  created_at: string;
};

const TIMEOUT_MS = 20_000;
function within<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), TIMEOUT_MS))]);
}

/** محفوظات كتاب (الأحدث أولًا) */
export async function listSaves(bookId: string): Promise<StudySave[]> {
  const { data, error } = await within(
    supabase.from("study_saves").select("*").eq("book_id", bookId).order("created_at", { ascending: false }).limit(200)
  );
  if (error) throw error;
  return (data ?? []) as StudySave[];
}

export async function getSave(id: string): Promise<StudySave | null> {
  const { data, error } = await within(supabase.from("study_saves").select("*").eq("id", id).maybeSingle());
  if (error) throw error;
  return (data as StudySave) ?? null;
}

export async function addSave(s: Omit<StudySave, "id" | "created_at">): Promise<string> {
  const { data, error } = await within(supabase.from("study_saves").insert(s).select("id").single());
  if (error) throw error;
  return String((data as { id: string }).id);
}

/** معرّف الكتاب من مسار ملفه (للشاشات التي تصلها pdf_path فقط، مثل الملخّص) */
export async function bookIdForPdf(pdfPath: string): Promise<string | null> {
  if (!pdfPath) return null;
  const { data } = await within(supabase.from("books").select("id").eq("pdf_path", pdfPath).limit(1).maybeSingle());
  return data ? String((data as { id: string }).id) : null;
}

export async function removeSave(id: string): Promise<void> {
  const { error } = await within(supabase.from("study_saves").delete().eq("id", id));
  if (error) throw error;
}

/* ---------------- PDF ---------------- */

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BASE_CSS = `
  * { font-family: -apple-system, 'SF Arabic', 'Geeza Pro', sans-serif; box-sizing: border-box; }
  body { margin: 0; color: #1F2937; }
  .head { color: #6B7280; font-size: 12px; margin-bottom: 6px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #1F3527; }
`;

/** نفس تدرّجات شرائح التطبيق (components/brand/slide-view) */
const PDF_GRADIENTS: [string, string][] = [
  ["#5B4BF5", "#2A9DF4"],
  ["#E8505B", "#B8338C"],
  ["#0E8F7E", "#2563EB"],
  ["#E07A1F", "#C2410C"],
  ["#7C3AED", "#DB2777"],
  ["#0369A1", "#4F46E5"],
  ["#15803D", "#0E7490"],
  ["#9D174D", "#6D28D9"],
];

/** عرض تقديمي كامل: غلاف ثم شريحة في كل صفحة أفقية — بنفس تصميم التطبيق (تدرّج، نقاط مرقّمة) */
export function slidesHtml(opts: { bookTitle: string; title: string; slides: Slide[]; rtl: boolean }): string {
  const dir = opts.rtl ? "rtl" : "ltr";
  const start = opts.rtl ? "right" : "left";
  const end = opts.rtl ? "left" : "right";
  const n = opts.slides.length;
  const pages = opts.slides
    .map((s, i) => {
      const [c1, c2] = PDF_GRADIENTS[i % PDF_GRADIENTS.length];
      const summary = i === n - 1 && n > 2;
      const items = s.bullets
        .map((b, j) => `<li><span class="n" style="color:${c1}">${summary ? "✓" : j + 1}</span><span>${esc(b)}</span></li>`)
        .join("");
      return `
    <section class="slide" style="background:linear-gradient(225deg, ${c1}, ${c2})">
      <div class="orb o1"></div><div class="orb o2"></div>
      <div class="wm">${i + 1}</div>
      <div class="bar"><div style="width:${((i + 1) / n) * 100}%"></div></div>
      <div class="top"><div class="medal">${esc(s.emoji || "📌")}</div><div><div class="chip">${opts.rtl ? `${i + 1} من ${n}` : `${i + 1} of ${n}`}</div><h2>${esc(s.title)}</h2></div></div>
      <ul>${items}</ul>
    </section>`;
    })
    .join("");
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: landscape; margin: 0; }
    section { height: 100vh; page-break-after: always; position: relative; overflow: hidden; color: #fff; }
    .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(225deg, #5B4BF5, #2A9DF4); }
    .cover h1 { font-size: 46px; color: #fff; margin: 10px 40px; line-height: 1.4; }
    .cover .sub { font-size: 18px; opacity: .85; }
    .cover .brand { position: absolute; bottom: 26px; font-size: 13px; opacity: .7; letter-spacing: 1px; }
    .slide { padding: 46px 64px; display: flex; flex-direction: column; justify-content: center; }
    .orb { position: absolute; border-radius: 50%; background: rgba(255,255,255,.13); }
    .o1 { width: 360px; height: 360px; top: -120px; ${end}: -100px; }
    .o2 { width: 260px; height: 260px; bottom: -90px; ${start}: -70px; opacity: .6; }
    .wm { position: absolute; bottom: -70px; ${end}: 30px; font-size: 300px; font-weight: 900; color: rgba(255,255,255,.08); line-height: 1; }
    .bar { position: absolute; top: 0; left: 0; right: 0; height: 7px; background: rgba(255,255,255,.2); }
    .bar div { height: 7px; background: #fff; float: ${start}; }
    .top { display: flex; align-items: center; gap: 22px; margin-bottom: 26px; position: relative; color: #fff; }
    .medal { width: 92px; height: 92px; border-radius: 50%; background: rgba(255,255,255,.22); box-shadow: 0 0 0 6px rgba(255,255,255,.25); display: flex; align-items: center; justify-content: center; font-size: 48px; flex: none; }
    .chip { display: inline-block; font-size: 13px; font-weight: 800; padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35); }
    h2 { color: #fff; font-size: 34px; margin: 8px 0 0; line-height: 1.35; text-shadow: 0 2px 8px rgba(0,0,0,.2); }
    ul { list-style: none; margin: 0; padding: 0; position: relative; }
    li { display: flex; gap: 14px; align-items: flex-start; font-size: 21px; line-height: 1.65; font-weight: 600; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.2); border-radius: 18px; padding: 12px 16px; margin-bottom: 12px; break-inside: avoid; }
    .n { width: 32px; height: 32px; border-radius: 50%; background: #fff; font-weight: 900; font-size: 16px; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 2px; }
  </style></head><body>
    <section class="cover"><div class="orb o1"></div><div class="orb o2"></div><div class="sub">${esc(opts.bookTitle)}</div><h1>${esc(opts.title)}</h1><div class="sub">${opts.rtl ? "عدد الشرائح" : "Slides"}: ${n}</div><div class="brand">VoiceStudyFlow</div></section>
    ${pages}
  </body></html>`;
}

/** نص المساعد (ملخّص/إجابة/ترجمة…) كمستند مرتّب */
export function textHtml(opts: { bookTitle: string; title: string; text: string; question?: string; rtl: boolean }): string {
  const dir = opts.rtl ? "rtl" : "ltr";
  const paras = opts.text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    @page { margin: 36px; }
    .q { background: #F1F6EA; border-radius: 12px; padding: 10px 14px; margin: 12px 0; font-weight: 600; }
    p { font-size: 15px; line-height: 1.9; margin: 0 0 12px; }
    .foot { margin-top: 24px; color: #9CA3AF; font-size: 11px; }
  </style></head><body>
    <div class="head">${esc(opts.bookTitle)}</div>
    <h1>${esc(opts.title)}</h1>
    ${opts.question ? `<div class="q">${esc(opts.question)}</div>` : ""}
    ${paras}
    <div class="foot">VoiceStudyFlow</div>
  </body></html>`;
}

/** ينشئ ملف PDF ويفتح نافذة المشاركة (حفظ في «الملفات»، إرسال، طباعة…) */
export async function sharePdf(html: string, fileTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: fileTitle });
  } else {
    await Print.printAsync({ uri });
  }
}

/** نص قابل للحفظ من الشرائح (للمشاركة النصية أو البحث لاحقًا) */
export function slidesToText(slides: Slide[]): string {
  return slides.map((s) => `${s.emoji} ${s.title}\n${s.bullets.map((b) => `• ${b}`).join("\n")}`).join("\n\n");
}
