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

/** عرض تقديمي كامل: شريحة في كل صفحة (أفقي) بتصميم واضح للطباعة */
export function slidesHtml(opts: { bookTitle: string; title: string; slides: Slide[]; rtl: boolean }): string {
  const dir = opts.rtl ? "rtl" : "ltr";
  const pages = opts.slides
    .map(
      (s, i) => `
    <section class="slide">
      <div class="num">${i + 1} / ${opts.slides.length}</div>
      <div class="emoji">${esc(s.emoji || "📌")}</div>
      <h2>${esc(s.title)}</h2>
      <ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </section>`
    )
    .join("");
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    @page { size: landscape; margin: 18px; }
    .cover { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
    .cover h1 { font-size: 34px; }
    .cover .head { font-size: 16px; }
    .slide { height: 100vh; padding: 36px 56px; page-break-after: always; border: 2px solid #E5E7EB; border-radius: 22px; position: relative; }
    .slide .num { position: absolute; top: 18px; ${opts.rtl ? "left" : "right"}: 24px; color: #9CA3AF; font-size: 13px; }
    .slide .emoji { font-size: 44px; }
    .slide h2 { font-size: 30px; margin: 10px 0 18px; color: #2F7D4A; }
    .slide li { font-size: 22px; line-height: 1.7; margin-bottom: 8px; }
  </style></head><body>
    <section class="cover"><div class="head">${esc(opts.bookTitle)}</div><h1>${esc(opts.title)}</h1><div class="head">VoiceStudyFlow</div></section>
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
