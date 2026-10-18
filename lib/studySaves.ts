// lib/studySaves.ts
// «محفوظات الكتاب»: العروض التقديمية وإجابات المساعد الذكي يحفظها المستخدم ليرجع لها
// لاحقًا، مرتبطة بالكتاب وبحسابه (جدول study_saves) — تبقى بعد تسجيل الخروج وعلى كل أجهزته.
// ومنها ملف PDF يُحفظ أو يُشارك (عرض كامل بشريحة لكل صفحة، أو نص المساعد مرتّبًا).
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { resolveLayout, splitHead, type Slide } from "./ai";
import type { StudySummary } from "./studySummary";
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
  content: { slides?: Slide[]; text?: string; question?: string; summary?: StudySummary; cards?: { front: string; back: string }[] };
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

/** يمزج لونًا فوق خلفية بنسبة شفافية → لون مُصمت. طباعة آيفون (PDF) تحوّل الشفافية
 *  والتدرّجات والظلال أحيانًا إلى سواد، فالملف كله بألوان مُصمتة محسوبة مسبقًا. */
function mix(hex: string, base: string, a: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex);
  const [r0, g0, b0] = p(base);
  const c = (x: number, y: number) => Math.round(y + (x - y) * a).toString(16).padStart(2, "0");
  return `#${c(r1, r0)}${c(g1, g0)}${c(b1, b0)}`;
}

/** مقاس صفحة العرض (نقاط): A4 أفقي — يُمرَّر للطابعة أيضًا فلا تتغيّر الصفحة بين الأجهزة */
export const DECK_PAGE = { width: 842, height: 595 };

/** عرض تقديمي كامل: صفحة أفقية لكل شريحة، وفيها الشريحة بطاقةً كما تظهر في التطبيق تمامًا
 *  (نفس التخطيطات الثمانية والألوان)، مع غلاف للعرض في البداية. */
export function slidesHtml(opts: { bookTitle: string; title: string; slides: Slide[]; rtl: boolean }): string {
  const dir = opts.rtl ? "rtl" : "ltr";
  const start = opts.rtl ? "right" : "left";
  const end = opts.rtl ? "left" : "right";
  const W = "#FFFFFF";
  const INK = "#0F172A";
  const MUTED = "#475569";
  const n = opts.slides.length;
  const of = (i: number) => (opts.rtl ? `${i + 1} من ${n}` : `${i + 1} of ${n}`);

  const bar = (fill: string, track: string, i: number) =>
    `<div class="bar" style="background:${track}"><div style="width:${((i + 1) / Math.max(1, n)) * 100}%;background:${fill}"></div></div>`;

  const pages = opts.slides
    .map((s, i) => {
      const [c1, c2] = PDF_GRADIENTS[i % PDF_GRADIENTS.length];
      const L = resolveLayout(s, i, n);
      const bold = L === "cover" || L === "stat" || L === "summary";
      const bg = L === "summary" ? c2 : c1;
      // درجات مُصمتة على خلفية الشريحة الملوّنة
      const wSoft = mix(W, bg, 0.16); // صف/كبسولة
      const wLine = mix(W, bg, 0.32); // حدّها
      const orb = mix(W, bg, 0.12);
      const wDim = mix(W, bg, 0.85);
      const head = `<div class="top"><div class="tile" style="background:${mix(c1, W, 0.1)};border-color:${mix(c1, W, 0.25)}">${esc(s.emoji || "📌")}</div><div class="tt"><div class="kick" style="color:${c1}">${of(i)}</div><h2 style="color:${INK}">${esc(s.title)}</h2></div></div><div class="accent" style="background:${c1}"></div>`;
      let inner = "";
      switch (L) {
        case "cover":
          inner = `<div class="center"><div class="medal" style="background:${wSoft};border-color:${wLine}">${esc(s.emoji || "📘")}</div><div class="chip" style="background:${wSoft};border-color:${wLine}">${opts.rtl ? "البداية" : "Intro"}</div><h2 class="big">${esc(s.title)}</h2>${s.highlight ? `<div class="sub" style="color:${wDim}">${esc(s.highlight)}</div>` : ""}<div class="tags">${s.bullets.map((b) => `<span style="background:${wSoft};border-color:${wLine}">${esc(b)}</span>`).join("")}</div></div>`;
          break;
        case "stat":
          inner = `<div class="center"><div class="chip" style="background:${wSoft};border-color:${wLine}">${esc(s.emoji || "📊")} ${of(i)}</div><div class="stat">${esc(s.highlight ?? "")}</div><h2 class="w">${esc(s.title)}</h2><div class="rule"></div><div class="wrows">${s.bullets.map((b) => `<div class="wrow" style="background:${wSoft};border-color:${wLine}"><span class="wdot">●</span><span>${esc(b)}</span></div>`).join("")}</div></div>`;
          break;
        case "summary": {
          const plain = /^(الخلاصة|خلاصة|summary)$/i.test(s.title.trim());
          inner = `<div class="top"><div class="tile" style="background:${wSoft};border-color:${wLine}">${esc(s.emoji || "✨")}</div><div class="tt">${plain ? "" : `<div class="kick" style="color:${wDim}">${opts.rtl ? "الخلاصة" : "Summary"}</div>`}<h2 class="w">${esc(s.title)}</h2></div></div><div class="wrows">${s.bullets.map((b) => `<div class="wrow" style="background:${wSoft};border-color:${wLine}"><span class="chk" style="color:${c1}">✓</span><span>${esc(b)}</span></div>`).join("")}</div>`;
          break;
        }
        case "cards":
          inner = `${head}<div class="grid" style="grid-template-columns:repeat(${s.bullets.length === 3 ? 3 : 2}, 1fr)">${s.bullets
            .map((b, j) => {
              const [g1] = PDF_GRADIENTS[(i + j + 1) % PDF_GRADIENTS.length];
              const { head: h, body } = splitHead(b);
              return `<div class="card" style="border-color:${mix(g1, W, 0.22)};background:${mix(g1, W, 0.06)}"><div class="num" style="background:${g1}">${j + 1}</div>${h ? `<div class="ch" style="color:${g1}">${esc(h)}</div><div class="cb">${esc(body)}</div>` : `<div class="ch" style="color:${INK}">${esc(body)}</div>`}</div>`;
            })
            .join("")}</div>`;
          break;
        case "steps":
          inner = `${head}<div class="steps">${s.bullets
            .map((b, j) => {
              const { head: h, body } = splitHead(b);
              const last = j === s.bullets.length - 1;
              return `<div class="step"><div class="rail"><div class="snum" style="background:${c1}">${j + 1}</div>${last ? "" : `<div class="sline" style="background:${mix(c1, W, 0.3)}"></div>`}</div><div class="stxt">${h ? `<b>${esc(h)}</b><div>${esc(body)}</div>` : `<b>${esc(body)}</b>`}</div></div>`;
            })
            .join("")}</div>`;
          break;
        case "compare":
          inner = `${head}<div class="cmp">${(s.columns ?? [])
            .slice(0, 2)
            .map((c, ci) => {
              const cc = ci === 0 ? c1 : c2;
              return `<div class="col" style="border-color:${mix(cc, W, 0.3)}"><div class="colh" style="background:${cc}">${esc(c.title)}</div><ul>${c.bullets.map((b) => `<li><span style="color:${cc}">•</span><span>${esc(b)}</span></li>`).join("")}</ul></div>`;
            })
            .join(`<div class="vs" style="color:${c1};border-color:${c1}">⇄</div>`)}</div>`;
          break;
        case "quote":
          inner = `<div class="qm" style="color:${mix(c1, W, 0.35)}">“</div><div class="qt">${esc(s.highlight ?? "")}</div><div class="qby" style="color:${c1}"><span style="background:${c1}"></span>${esc(s.emoji || "💬")} ${esc(s.title)}</div><div class="notes">${s.bullets.map((b) => `<div class="note" style="border-color:${mix(c1, W, 0.22)};background:${mix(c1, W, 0.06)}">${esc(b)}</div>`).join("")}</div>`;
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
        ? `<div class="orb o1" style="background:${orb}"></div><div class="orb o2" style="background:${orb}"></div>${bar(W, wLine, i)}`
        : `<div class="corner" style="background:${mix(c1, W, 0.08)}"></div><div class="wm" style="color:${mix(c1, W, 0.07)}">${i + 1}</div>${bar(c1, mix(c1, W, 0.15), i)}`;
      return `<section class="page"><div class="slide" style="background:${bold ? bg : W}">${deco}<div class="in">${inner}</div></div></section>`;
    })
    .join("");

  const cover = PDF_GRADIENTS[0][0];
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: ${DECK_PAGE.width}px ${DECK_PAGE.height}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #EEF1F7; }
    .page { width: ${DECK_PAGE.width}px; height: ${DECK_PAGE.height}px; padding: 18px; background: #EEF1F7; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .slide { position: relative; width: 100%; height: 100%; border-radius: 26px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; padding: 30px 44px; color: ${INK}; }
    .in { position: relative; }
    .orb { position: absolute; border-radius: 50%; }
    .o1 { width: 280px; height: 280px; top: -100px; ${end}: -80px; }
    .o2 { width: 200px; height: 200px; bottom: -80px; ${start}: -60px; }
    .corner { position: absolute; width: 360px; height: 360px; border-radius: 50%; top: -170px; ${end}: -140px; }
    .wm { position: absolute; bottom: -60px; ${end}: 22px; font-size: 230px; font-weight: 900; line-height: 1; }
    .bar { position: absolute; top: 0; left: 0; right: 0; height: 6px; }
    .bar div { height: 6px; float: ${start}; }
    .top { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
    .tile { width: 58px; height: 58px; border-radius: 17px; border: 1px solid; display: flex; align-items: center; justify-content: center; font-size: 30px; flex: none; }
    .tt { flex: 1; }
    .kick { font-size: 12px; font-weight: 900; }
    h2 { font-size: 25px; margin: 2px 0 0; line-height: 1.4; color: ${INK}; }
    h2.w { color: #fff; }
    h2.big { color: #fff; font-size: 36px; margin: 4px 0; text-align: center; }
    .accent { width: 70px; height: 5px; border-radius: 3px; margin: 6px 0 16px; }
    .center { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .medal { width: 104px; height: 104px; border-radius: 50%; border: 2px solid; display: flex; align-items: center; justify-content: center; font-size: 54px; margin-bottom: 12px; }
    .chip { display: inline-block; font-size: 12.5px; font-weight: 800; padding: 4px 14px; border-radius: 999px; border: 1px solid; color: #fff; margin-bottom: 8px; }
    .sub { font-size: 17px; max-width: 620px; line-height: 1.6; font-weight: 600; }
    .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 16px; }
    .tags span { padding: 7px 16px; border-radius: 999px; border: 1px solid; font-weight: 800; font-size: 14.5px; color: #fff; }
    .stat { font-size: 84px; font-weight: 900; line-height: 1.15; margin: 4px 0; color: #fff; }
    .rule { width: 60px; height: 4px; border-radius: 2px; background: #fff; margin: 12px auto; }
    .wrows { display: flex; flex-direction: column; gap: 9px; width: 100%; text-align: ${start}; }
    .wrow { border: 1px solid; border-radius: 16px; padding: 10px 14px; font-size: 16.5px; font-weight: 700; line-height: 1.6; display: flex; gap: 10px; align-items: center; color: #fff; }
    .wdot { font-size: 9px; }
    .chk { width: 26px; height: 26px; border-radius: 50%; background: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; flex: none; }
    .grid { display: grid; gap: 12px; }
    .card { border: 1px solid; border-radius: 18px; padding: 14px 16px; }
    .num { width: 32px; height: 32px; border-radius: 10px; color: #fff; font-weight: 900; font-size: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
    .ch { font-size: 17px; font-weight: 900; line-height: 1.45; }
    .cb { font-size: 14.5px; color: ${MUTED}; line-height: 1.65; font-weight: 600; margin-top: 3px; }
    .step { display: flex; gap: 14px; }
    .rail { display: flex; flex-direction: column; align-items: center; width: 36px; flex: none; }
    .snum { width: 36px; height: 36px; border-radius: 50%; color: #fff; font-weight: 900; font-size: 16px; display: flex; align-items: center; justify-content: center; }
    .sline { width: 3px; flex: 1; border-radius: 2px; margin: 4px 0; min-height: 12px; }
    .stxt { padding: 4px 0 14px; font-size: 15px; color: ${MUTED}; line-height: 1.6; font-weight: 600; }
    .stxt b { color: ${INK}; font-size: 17px; display: block; }
    .cmp { display: flex; gap: 14px; align-items: stretch; position: relative; }
    .col { flex: 1; border: 1px solid; border-radius: 18px; overflow: hidden; background: #fff; }
    .colh { color: #fff; font-weight: 900; font-size: 17px; text-align: center; padding: 10px; }
    .col ul { list-style: none; margin: 0; padding: 12px 14px; }
    .col li { font-size: 15px; line-height: 1.65; font-weight: 600; display: flex; gap: 8px; margin-bottom: 5px; }
    .vs { position: absolute; left: 50%; top: 6px; margin-left: -17px; width: 34px; height: 34px; border-radius: 50%; border: 2px solid; background: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 17px; }
    .qm { font-size: 120px; line-height: .8; font-weight: 900; text-align: center; }
    .qt { font-size: 24px; font-weight: 800; font-style: italic; line-height: 1.6; color: ${INK}; text-align: center; max-width: 680px; margin: 0 auto; }
    .qby { display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 900; font-size: 15px; margin: 14px 0; }
    .qby span { width: 28px; height: 3px; border-radius: 2px; }
    .notes { display: flex; flex-direction: column; gap: 8px; max-width: 680px; margin: 0 auto; }
    .note { border: 1px solid; border-radius: 14px; padding: 9px 14px; font-size: 15px; line-height: 1.6; font-weight: 600; }
    .list { display: flex; flex-direction: column; gap: 10px; }
    .li { background: #F8FAFC; border-radius: 14px; padding: 10px 16px; font-size: 16.5px; line-height: 1.65; font-weight: 600; }
    .deckcover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: #fff; }
    .deckcover h1 { font-size: 38px; color: #fff; margin: 8px 30px; line-height: 1.4; }
    .deckcover .s { font-size: 16px; color: ${mix(W, cover, 0.85)}; }
    .deckcover .brand { position: absolute; bottom: 22px; font-size: 12px; color: ${mix(W, cover, 0.7)}; letter-spacing: 1px; }
  </style></head><body data-deck="1">
    <section class="page"><div class="slide deckcover" style="background:${cover}"><div class="orb o1" style="background:${mix(W, cover, 0.12)}"></div><div class="orb o2" style="background:${mix(W, cover, 0.12)}"></div><div class="in"><div class="s">${esc(opts.bookTitle)}</div><h1>${esc(opts.title)}</h1><div class="s">${opts.rtl ? "عدد الشرائح" : "Slides"}: ${n}</div></div><div class="brand">VoiceStudyFlow</div></div></section>
    ${pages}
  </body></html>`;
}

/** بطاقات مراجعة للطباعة: كل بطاقة صف فيه السؤال والجواب متقابلان، وخط متقطع للقص،
 *  مع ترقيم. ألوان مُصمتة فقط (طباعة آيفون تحوّل الشفافية إلى سواد). */
export function cardsHtml(opts: { bookTitle: string; title: string; cards: { front: string; back: string }[]; rtl: boolean }): string {
  const dir = opts.rtl ? "rtl" : "ltr";
  const L = opts.rtl ? { q: "السؤال", a: "الجواب", n: "عدد البطاقات" } : { q: "Question", a: "Answer", n: "Cards" };
  const rows = opts.cards
    .map(
      (c, i) => `
    <div class="card">
      <div class="side q"><span class="tag">${L.q} ${i + 1}</span><div class="txt">${esc(c.front)}</div></div>
      <div class="side a"><span class="tag">${L.a}</span><div class="txt">${esc(c.back)}</div></div>
    </div>`
    )
    .join("");
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 30px 32px; }
    html, body { background: #fff; }
    .hero { background: #4338CA; color: #fff; border-radius: 16px; padding: 18px 22px; margin-bottom: 18px; }
    .hero .b { font-size: 12px; color: #C7D2FE; font-weight: 700; }
    .hero h1 { color: #fff; font-size: 22px; margin: 4px 0; }
    .hero .n { font-size: 12.5px; color: #E0E7FF; }
    .card { display: flex; gap: 0; border: 2px dashed #CBD5E1; border-radius: 16px; margin-bottom: 12px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; min-height: 92px; }
    .side { flex: 1; padding: 12px 14px; }
    .q { background: #F0EEFE; border-${opts.rtl ? "left" : "right"}: 2px dashed #CBD5E1; }
    .a { background: #ECFDF5; }
    .tag { display: inline-block; color: #fff; font-size: 11px; font-weight: 900; padding: 2px 9px; border-radius: 999px; margin-bottom: 6px; }
    .q .tag { background: #5B4BF5; } .a .tag { background: #0E8F7E; }
    .txt { font-size: 15px; line-height: 1.8; color: #1F2937; font-weight: 600; }
    .q .txt { font-weight: 800; }
    .foot { margin-top: 16px; color: #9CA3AF; font-size: 11px; text-align: center; }
  </style></head><body>
    <div class="hero"><div class="b">${esc(opts.bookTitle)}</div><h1>${esc(opts.title)}</h1><div class="n">${L.n}: ${opts.cards.length}</div></div>
    ${rows}
    <div class="foot">VoiceStudyFlow</div>
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
  // العرض: مقاس صفحة أفقي ثابت (وإلا تقصّ آيفون الشريحة على ورقة طولية)
  const deck = html.includes('data-deck="1"');
  const { uri } = await Print.printToFileAsync(deck ? { html, ...DECK_PAGE } : { html });
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
