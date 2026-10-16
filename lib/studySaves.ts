// lib/studySaves.ts
// «محفوظات الكتاب»: العروض التقديمية وإجابات المساعد الذكي يحفظها المستخدم ليرجع لها
// لاحقًا، مرتبطة بالكتاب وبحسابه (جدول study_saves) — تبقى بعد تسجيل الخروج وعلى كل أجهزته.
// ومنها ملف PDF يُحفظ أو يُشارك (عرض كامل بشريحة لكل صفحة، أو نص المساعد مرتّبًا).
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { resolveLayout, splitHead, type Slide } from "./ai";
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

/** عرض تقديمي كامل بأسلوب Gamma: غلاف ثم شريحة أفقية لكل صفحة، بنفس تخطيطات التطبيق
 *  (غلاف، بطاقات، خطوات، مقارنة، رقم بارز، اقتباس، قائمة، خلاصة) وألوانه */
export function slidesHtml(opts: { bookTitle: string; title: string; slides: Slide[]; rtl: boolean }): string {
  const dir = opts.rtl ? "rtl" : "ltr";
  const start = opts.rtl ? "right" : "left";
  const end = opts.rtl ? "left" : "right";
  const n = opts.slides.length;
  const of = (i: number) => (opts.rtl ? `${i + 1} من ${n}` : `${i + 1} of ${n}`);
  const pages = opts.slides
    .map((s, i) => {
      const [c1, c2] = PDF_GRADIENTS[i % PDF_GRADIENTS.length];
      const L = resolveLayout(s, i, n);
      const bold = L === "cover" || L === "stat" || L === "summary";
      const grad = `linear-gradient(225deg, ${L === "summary" ? c2 : c1}, ${L === "summary" ? c1 : c2})`;
      const bar = `<div class="bar" style="background:${bold ? "rgba(255,255,255,.2)" : c1 + "22"}"><div style="width:${((i + 1) / n) * 100}%;background:${bold ? "#fff" : c1}"></div></div>`;
      const head = `<div class="top"><div class="tile" style="background:${c1}18;border-color:${c1}40">${esc(s.emoji || "📌")}</div><div><div class="kick" style="color:${c1}">${of(i)}</div><h2 class="ink">${esc(s.title)}</h2></div></div><div class="accent" style="background:linear-gradient(90deg, ${c1}, ${c2})"></div>`;
      let inner = "";
      switch (L) {
        case "cover":
          inner = `<div class="center"><div class="medal">${esc(s.emoji || "📘")}</div><h2 class="big">${esc(s.title)}</h2>${s.highlight ? `<div class="sub">${esc(s.highlight)}</div>` : ""}<div class="tags">${s.bullets.map((b) => `<span>${esc(b)}</span>`).join("")}</div></div>`;
          break;
        case "stat":
          inner = `<div class="center"><div class="chip">${esc(s.emoji || "📊")} ${of(i)}</div><div class="stat">${esc(s.highlight ?? "")}</div><h2 class="w">${esc(s.title)}</h2><div class="rule"></div><div class="wrows">${s.bullets.map((b) => `<div class="wrow">● ${esc(b)}</div>`).join("")}</div></div>`;
          break;
        case "summary":
          inner = `<div class="top"><div class="tile w">${esc(s.emoji || "✨")}</div><div>${/^(الخلاصة|خلاصة|Summary)$/i.test(s.title.trim()) ? "" : `<div class="kick w">${opts.rtl ? "الخلاصة" : "Summary"}</div>`}<h2 class="w">${esc(s.title)}</h2></div></div><div class="wrows">${s.bullets.map((b) => `<div class="wrow"><span class="chk" style="color:${c1}">✓</span>${esc(b)}</div>`).join("")}</div>`;
          break;
        case "cards":
          inner = `${head}<div class="grid" style="grid-template-columns:repeat(${s.bullets.length === 3 ? 3 : 2}, 1fr)">${s.bullets
            .map((b, j) => {
              const [g1, g2] = PDF_GRADIENTS[(i + j + 1) % PDF_GRADIENTS.length];
              const { head: h, body } = splitHead(b);
              return `<div class="card" style="border-color:${g1}33;background:${g1}0D"><div class="num" style="background:linear-gradient(135deg, ${g1}, ${g2})">${j + 1}</div>${h ? `<div class="ch" style="color:${g1}">${esc(h)}</div><div class="cb">${esc(body)}</div>` : `<div class="ch ink">${esc(body)}</div>`}</div>`;
            })
            .join("")}</div>`;
          break;
        case "steps":
          inner = `${head}<div class="steps">${s.bullets
            .map((b, j) => {
              const { head: h, body } = splitHead(b);
              const last = j === s.bullets.length - 1;
              return `<div class="step"><div class="rail"><div class="snum" style="background:linear-gradient(135deg, ${c1}, ${c2})">${j + 1}</div>${last ? "" : `<div class="sline" style="background:${c1}40"></div>`}</div><div class="stxt">${h ? `<b>${esc(h)}</b><div>${esc(body)}</div>` : `<b>${esc(body)}</b>`}</div></div>`;
            })
            .join("")}</div>`;
          break;
        case "compare":
          inner = `${head}<div class="cmp">${(s.columns ?? [])
            .slice(0, 2)
            .map((c, ci) => {
              const cc = ci === 0 ? c1 : c2;
              return `<div class="col" style="border-color:${cc}40"><div class="colh" style="background:${cc}">${esc(c.title)}</div><ul>${c.bullets.map((b) => `<li><span style="color:${cc}">•</span>${esc(b)}</li>`).join("")}</ul></div>`;
            })
            .join(`<div class="vs" style="color:${c1};border-color:${c1}">⇄</div>`)}</div>`;
          break;
        case "quote":
          inner = `<div class="qm" style="color:${c1}">“</div><div class="qt">${esc(s.highlight ?? "")}</div><div class="qby" style="color:${c1}"><span style="background:${c1}"></span>${esc(s.emoji || "💬")} ${esc(s.title)}</div><div class="notes">${s.bullets.map((b) => `<div class="note" style="border-color:${c1}33;background:${c1}0D">${esc(b)}</div>`).join("")}</div>`;
          break;
        default:
          inner = `${head}<div class="list">${s.bullets
            .map((b) => {
              const { head: h, body } = splitHead(b);
              return `<div class="li" style="border-${start}:5px solid ${c1}">${h ? `<b style="color:${c1}">${esc(h)}: </b>` : ""}${esc(body)}</div>`;
            })
            .join("")}</div>`;
      }
      const deco = bold
        ? `<div class="orb o1"></div><div class="orb o2"></div>`
        : `<div class="glow" style="background:radial-gradient(circle at ${end === "left" ? "0%" : "100%"} 0%, ${c1}30, transparent 55%)"></div><div class="wm" style="color:${c1}12">${i + 1}</div>`;
      return `<section class="slide ${bold ? "bold" : "light"}" style="${bold ? `background:${grad}` : ""}">${deco}${bar}<div class="in">${inner}</div></section>`;
    })
    .join("");
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: landscape; margin: 0; }
    section { height: 100vh; page-break-after: always; position: relative; overflow: hidden; }
    .light { background: #fff; color: #0F172A; }
    .bold { color: #fff; }
    .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(225deg, #5B4BF5, #2A9DF4); color: #fff; }
    .cover h1 { font-size: 46px; color: #fff; margin: 10px 40px; line-height: 1.4; }
    .cover .sub { font-size: 18px; opacity: .85; }
    .cover .brand { position: absolute; bottom: 26px; font-size: 13px; opacity: .7; letter-spacing: 1px; }
    .slide { display: flex; flex-direction: column; justify-content: center; padding: 44px 64px; }
    .in { position: relative; }
    .orb { position: absolute; border-radius: 50%; background: rgba(255,255,255,.13); }
    .o1 { width: 360px; height: 360px; top: -120px; ${end}: -100px; }
    .o2 { width: 260px; height: 260px; bottom: -90px; ${start}: -70px; opacity: .6; }
    .glow { position: absolute; inset: 0; }
    .wm { position: absolute; bottom: -70px; ${end}: 30px; font-size: 300px; font-weight: 900; line-height: 1; }
    .bar { position: absolute; top: 0; left: 0; right: 0; height: 7px; }
    .bar div { height: 7px; float: ${start}; }
    .top { display: flex; align-items: center; gap: 18px; margin-bottom: 12px; }
    .tile { width: 70px; height: 70px; border-radius: 20px; border: 1px solid; display: flex; align-items: center; justify-content: center; font-size: 36px; flex: none; }
    .tile.w { background: rgba(255,255,255,.22); border: none; }
    .kick { font-size: 13px; font-weight: 900; }
    .kick.w { color: rgba(255,255,255,.85); }
    h2 { font-size: 32px; margin: 2px 0 0; line-height: 1.35; }
    h2.ink { color: #0F172A; } h2.w { color: #fff; }
    h2.big { color: #fff; font-size: 46px; text-shadow: 0 2px 10px rgba(0,0,0,.25); margin: 6px 0; }
    .accent { width: 80px; height: 6px; border-radius: 3px; margin: 4px 0 22px; }
    .center { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .medal { width: 130px; height: 130px; border-radius: 50%; background: rgba(255,255,255,.22); box-shadow: 0 0 0 8px rgba(255,255,255,.25); display: flex; align-items: center; justify-content: center; font-size: 68px; margin-bottom: 18px; }
    .sub { font-size: 20px; opacity: .92; max-width: 760px; line-height: 1.6; }
    .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 20px; }
    .tags span { padding: 8px 18px; border-radius: 999px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3); font-weight: 800; font-size: 17px; }
    .chip { display: inline-block; font-size: 14px; font-weight: 800; padding: 5px 14px; border-radius: 999px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35); }
    .stat { font-size: 110px; font-weight: 900; line-height: 1.2; margin: 10px 0; text-shadow: 0 3px 14px rgba(0,0,0,.25); }
    .rule { width: 70px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.85); margin: 16px auto; }
    .wrows { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 900px; text-align: ${start}; }
    .wrow { background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.2); border-radius: 18px; padding: 12px 18px; font-size: 20px; font-weight: 700; line-height: 1.6; display: flex; gap: 12px; align-items: center; }
    .chk { width: 32px; height: 32px; border-radius: 50%; background: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; flex: none; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .card { border: 1px solid; border-radius: 22px; padding: 18px 20px; break-inside: avoid; }
    .num { width: 40px; height: 40px; border-radius: 12px; color: #fff; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
    .ch { font-size: 21px; font-weight: 900; line-height: 1.45; } .ch.ink { color: #0F172A; }
    .cb { font-size: 17px; color: #475569; line-height: 1.65; font-weight: 600; margin-top: 4px; }
    .step { display: flex; gap: 18px; }
    .rail { display: flex; flex-direction: column; align-items: center; width: 44px; flex: none; }
    .snum { width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 900; font-size: 19px; display: flex; align-items: center; justify-content: center; }
    .sline { width: 4px; flex: 1; border-radius: 2px; margin: 4px 0; min-height: 14px; }
    .stxt { padding: 6px 0 18px; font-size: 18px; color: #475569; line-height: 1.6; font-weight: 600; }
    .stxt b { color: #0F172A; font-size: 21px; display: block; }
    .cmp { display: flex; gap: 18px; align-items: stretch; position: relative; }
    .col { flex: 1; border: 1px solid; border-radius: 22px; overflow: hidden; }
    .colh { color: #fff; font-weight: 900; font-size: 21px; text-align: center; padding: 12px; }
    .col ul { list-style: none; margin: 0; padding: 14px 18px; }
    .col li { font-size: 18px; line-height: 1.65; font-weight: 600; display: flex; gap: 8px; margin-bottom: 6px; }
    .vs { position: absolute; left: 50%; top: 8px; transform: translateX(-50%); width: 40px; height: 40px; border-radius: 50%; border: 2px solid; background: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; }
    .qm { font-size: 160px; line-height: .8; font-weight: 900; opacity: .3; text-align: center; }
    .qt { font-size: 30px; font-weight: 800; font-style: italic; line-height: 1.6; color: #0F172A; text-align: center; max-width: 900px; margin: 0 auto; }
    .qby { display: flex; align-items: center; justify-content: center; gap: 12px; font-weight: 900; font-size: 18px; margin: 18px 0; }
    .qby span { width: 34px; height: 4px; border-radius: 2px; }
    .notes { display: flex; flex-direction: column; gap: 10px; max-width: 900px; margin: 0 auto; }
    .note { border: 1px solid; border-radius: 16px; padding: 10px 16px; font-size: 18px; line-height: 1.6; font-weight: 600; }
    .list { display: flex; flex-direction: column; gap: 12px; }
    .li { background: #F8FAFC; border-radius: 16px; padding: 12px 18px; font-size: 20px; line-height: 1.65; font-weight: 600; }
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
