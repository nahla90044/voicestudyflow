// lib/wordsPdf.ts
// ملفات دراسة مطبوعة: «كلماتي» وقاموس الوحدة. تصميم مريح للعين: جداول بألوان هادئة
// (لكل نوع معلومة لونه الثابت)، عناوين واضحة، وتصريف الأفعال في جدول. تُنشأ على الجهاز
// ثم يُفتح الحفظ/المشاركة (الملفات، البريد، الطباعة…) فتبقى مع الطالب حتى بلا إنترنت.
import * as Sharing from "expo-sharing";

import type { GlossaryItem } from "./glossaryCore.ts";
import { shareBranded } from "./pdfBrand";
import type { SavedWord } from "./words";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const num = (n: number | string, rtl: boolean) => (rtl ? String(n).replace(/\d/g, (d) => AR_DIGITS[+d]) : String(n));
const isLatin = (s: string) => /^[^\u0600-\u06FF]*[A-Za-zÀ-ÿ]/.test(s);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ألوان هادئة: خلفية فاتحة جدًا + لون نص أعمق من نفس العائلة (تباين مريح عند الطباعة)
const TONE = {
  lavender: { bg: "#F2EFFD", ink: "#5446B8", line: "#E2DCFA" },
  sky: { bg: "#EAF3FC", ink: "#2C6799", line: "#D5E6F7" },
  mint: { bg: "#E9F6EF", ink: "#23805C", line: "#D2EDDF" },
  peach: { bg: "#FDF0E7", ink: "#B0552A", line: "#F8DDCB" },
  butter: { bg: "#FFF7E1", ink: "#956914", line: "#F6E7BC" },
  rose: { bg: "#FCEEF3", ink: "#A8406A", line: "#F6D6E2" },
} as const;
type Tone = keyof typeof TONE;
const UNIT_TONES: Tone[] = ["lavender", "mint", "sky", "peach", "rose", "butter"];

const KIND_TONE: Record<GlossaryItem["k"], Tone> = {
  term: "lavender",
  def: "sky",
  word: "mint",
  idiom: "rose",
  char: "peach",
  place: "butter",
};

function baseCss(rtl: boolean): string {
  return `
    @page { size: A4; margin: 15mm 13mm; }
    * { box-sizing: border-box; }
    body { font-family: "Noto Naskh Arabic", "Geeza Pro", -apple-system, "Helvetica Neue", sans-serif;
      color: #2A2838; font-size: 11.5pt; line-height: 1.75; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1, h2, h3, .k { font-family: "Noto Kufi Arabic", "Geeza Pro", -apple-system, sans-serif; }
    .cover { border-radius: 18px; padding: 18px 22px; margin-bottom: 18px;
      background: linear-gradient(${rtl ? "270deg" : "90deg"}, #F2EFFD, #E9F6EF); border: 1px solid #E4E0F6; }
    .cover h1 { margin: 0; font-size: 22pt; color: #2B2A5A; line-height: 1.4; }
    .cover .sub { color: #6B6880; font-size: 10.5pt; margin-top: 2px; }
    .cover .brand { float: ${rtl ? "left" : "right"}; font-size: 9pt; color: #8E8AA6; margin-top: 6px; }
    h2 { font-size: 13.5pt; margin: 22px 0 10px; padding: 6px 14px; border-radius: 12px; display: inline-block; }
    h2 small { font-weight: normal; opacity: .75; font-size: 10pt; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 14px; overflow: hidden;
      margin: 0 0 14px; page-break-inside: avoid; border: 1px solid #E7E5F2; }
    td, th { padding: 8px 12px; vertical-align: top; text-align: start; }
    tr + tr td, tr + tr th { border-top: 1px solid #EEECF6; }
    .lbl { width: 24%; font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 9.5pt; font-weight: 700; }
    .head td { background: #F8F7FC; }
    .w { font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 16pt; font-weight: 800; color: #2B2A5A; }
    .chip { display: inline-block; border-radius: 999px; padding: 1px 10px; margin: 2px; font-size: 10pt; }
    .badge { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 9pt; margin-inline-start: 6px; vertical-align: middle; }
    ol { margin: 0; padding-inline-start: 18px; list-style: ${rtl ? "arabic-indic" : "decimal"}; } li { margin: 1px 0; }
    .ctx { color: #6B6880; font-style: italic; }
    .conj th { font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 10pt; text-align: center; }
    .conj td { font-size: 10.5pt; text-align: center; }
    .conj .ex td { font-style: italic; font-size: 10pt; }
    .gl th { font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 9.5pt; }
    .gl tbody tr:nth-child(even) td { background: #FAFAFD; }
    .gl .n { width: 5%; color: #A3A0B8; text-align: center; }
    .gl .t { width: 22%; font-weight: 700; color: #2B2A5A; }
    .gl .pg { width: 7%; text-align: center; color: #6B6880; }
    .gl .ex { color: #5F5C72; font-size: 10pt; }
  `;
}

function doc(title: string, rtl: boolean, body: string): string {
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@500;700;800&family=Noto+Naskh+Arabic:wght@400;600&display=swap" rel="stylesheet">
    <title>${esc(title)}</title><style>${baseCss(rtl)}</style></head><body>${body}</body></html>`;
}

const cover = (title: string, subtitle: string) =>
  `<div class="cover"><span class="brand">VoiceStudyFlow</span><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div></div>`;

const sectionHead = (text: string, count: string, tone: Tone) =>
  `<h2 style="background:${TONE[tone].bg};color:${TONE[tone].ink}">${esc(text)} <small>(${count})</small></h2>`;

/* ------------------------------ كلماتي ------------------------------ */

type Labels = {
  title: string;
  subtitle: string;
  meaning: string;
  usage: string;
  synonyms: string;
  antonyms: string;
  examples: string;
  verb: string;
  infinitive: string;
  noun: string;
  general: string;
  page?: string;
  rtl: boolean;
};

function row(label: string, tone: Tone, value: string): string {
  const c = TONE[tone];
  return `<tr><td class="lbl" style="background:${c.bg};color:${c.ink}">${esc(label)}</td><td dir="auto">${value}</td></tr>`;
}

const chips = (xs: string[], tone: Tone) =>
  xs.map((x) => `<span class="chip" style="background:${TONE[tone].bg};color:${TONE[tone].ink}">${esc(x)}</span>`).join("");

/** جدول التصريف: الأزمنة أعمدة (٣ في كل جدول ليبقى مقروءًا على A4)، والمثال في صف أخير */
function conjugation(tenses: NonNullable<NonNullable<SavedWord["info"]>["verb"]>["tenses"]): string {
  // أفعال اللغات اللاتينية: الجدول من اليسار لليمين (يُقرأ كما في كتب اللغة)
  const tdir = isLatin(tenses[0]?.forms[0] ?? "") ? "ltr" : "rtl";
  const out: string[] = [];
  for (let i = 0; i < tenses.length; i += 3) {
    const part = tenses.slice(i, i + 3);
    const rows = Math.max(...part.map((tn) => tn.forms.length));
    const head = part.map((tn) => `<th style="background:${TONE.mint.bg};color:${TONE.mint.ink}">${esc(tn.name)}</th>`).join("");
    let body = "";
    for (let r = 0; r < rows; r++) body += `<tr>${part.map((tn) => `<td dir="auto">${esc(tn.forms[r] ?? "")}</td>`).join("")}</tr>`;
    const ex = part.some((tn) => tn.example)
      ? `<tr class="ex">${part.map((tn) => `<td dir="auto" style="background:${TONE.butter.bg};color:${TONE.butter.ink}">${esc(tn.example ?? "")}</td>`).join("")}</tr>`
      : "";
    out.push(`<table class="conj" dir="${tdir}"><tr>${head}</tr>${body}${ex}</table>`);
  }
  return out.join("");
}

function wordTable(w: SavedWord, L: Labels): string {
  const i = w.info;
  const badges =
    (i?.pos ? `<span class="badge" style="background:${TONE.lavender.bg};color:${TONE.lavender.ink}">${esc(i.pos)}</span>` : "") +
    (w.bookTitle || w.page
      ? `<span class="badge" style="background:#F0EFF5;color:#6B6880">${[w.bookTitle ? esc(w.bookTitle) : "", w.page ? `${esc(L.page ?? (L.rtl ? "ص" : "p."))} ${num(w.page, L.rtl)}` : ""].filter(Boolean).join(" · ")}</span>`
      : "");
  let rows = `<tr class="head"><td colspan="2"><span class="w" dir="auto">${esc(w.word)}</span>${badges}</td></tr>`;
  if (i) {
    rows += row(L.meaning, "lavender", esc(i.meaning));
    if (i.usage) rows += row(L.usage, "sky", esc(i.usage));
    if (i.synonyms.length) rows += row(L.synonyms, "mint", chips(i.synonyms, "mint"));
    if (i.antonyms.length) rows += row(L.antonyms, "peach", chips(i.antonyms, "peach"));
    if (i.examples.length) rows += row(L.examples, "butter", `<ol>${i.examples.map((e) => `<li dir="auto">${esc(e)}</li>`).join("")}</ol>`);
    if (i.verb) {
      const v = i.verb;
      const forms = [`${esc(L.infinitive)}: <b dir="auto">${esc(v.infinitive)}</b>`];
      if (v.noun) forms.push(`${esc(L.noun)}: <b dir="auto">${esc(v.noun)}</b>`);
      if (v.participle) forms.push(`<b dir="auto">${esc(v.participle)}</b>`);
      rows += row(L.verb, "rose", forms.join(" &nbsp;·&nbsp; "));
    }
  } else if (w.context) {
    rows += `<tr><td colspan="2" class="ctx" dir="auto">«${esc(w.context)}»</td></tr>`;
  }
  const conj = i?.verb?.tenses.length ? conjugation(i.verb.tenses) : "";
  return `<table>${rows}</table>${conj}`;
}

export function wordsHtml(words: SavedWord[], L: Labels): string {
  const groups = new Map<string, SavedWord[]>();
  for (const w of words) {
    const k = w.bookTitle || L.general;
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }
  const sections = [...groups.entries()]
    .map(([book, ws], gi) =>
      sectionHead(book, num(ws.length, L.rtl), UNIT_TONES[gi % UNIT_TONES.length]) +
      [...ws].sort((a, b) => a.word.localeCompare(b.word)).map((w) => wordTable(w, L)).join("")
    )
    .join("");
  return doc(L.title, L.rtl, cover(L.title, L.subtitle) + sections);
}

/* --------------------------- قاموس الوحدة --------------------------- */

export type GlossaryLabels = {
  title: string; // اسم الكتاب
  subtitle: string; // الوحدة + الصفحات + التاريخ
  unitTitle: string;
  term: string;
  meaning: string;
  example: string;
  page: string;
  kindName: (k: GlossaryItem["k"]) => string;
  rtl: boolean;
};

export function glossaryHtml(items: GlossaryItem[], L: GlossaryLabels, unitIndex = 0): string {
  const tone = TONE[UNIT_TONES[unitIndex % UNIT_TONES.length]];
  const head = [
    `<th class="n" style="background:${tone.bg};color:${tone.ink}">#</th>`,
    `<th class="t" style="background:${tone.bg};color:${tone.ink}">${esc(L.term)}</th>`,
    `<th style="background:${tone.bg};color:${tone.ink}">${esc(L.meaning)}</th>`,
    `<th class="pg" style="background:${tone.bg};color:${tone.ink}">${esc(L.page)}</th>`,
  ].join("");
  const body = items
    .map((it, i) => {
      const kt = TONE[KIND_TONE[it.k] ?? "lavender"];
      const kindChip = `<span class="chip" style="background:${kt.bg};color:${kt.ink};font-size:8.5pt">${esc(L.kindName(it.k))}</span>`;
      const ex = it.ex ? `<div class="ex" dir="auto">${esc(L.example)}: ${esc(it.ex)}</div>` : "";
      return `<tr><td class="n">${num(i + 1, L.rtl)}</td><td class="t" dir="auto">${esc(it.t)}${it.tr ? `<div class="ex" dir="auto">⇄ ${esc(it.tr)}</div>` : ""}${kindChip}</td><td dir="auto">${esc(it.m)}${ex}</td><td class="pg">${it.p ? num(it.p, L.rtl) : ""}</td></tr>`;
    })
    .join("");
  const unit = L.unitTitle
    ? `<h2 style="background:${tone.bg};color:${tone.ink}">${esc(L.unitTitle)} <small>(${num(items.length, L.rtl)})</small></h2>`
    : "";
  return doc(L.title, L.rtl, cover(L.title, L.subtitle) + unit + `<table class="gl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
}

/* ------------------------------ التصدير ------------------------------ */

async function share(html: string, title: string): Promise<boolean> {
  const canShare = await Sharing.isAvailableAsync();
  await shareBranded(html, title);
  return canShare;
}

/** يُنشئ ملف «كلماتي» ويفتح الحفظ/المشاركة. يُرجع false إن لم تتوفر المشاركة على الجهاز. */
export function exportWordsPdf(words: SavedWord[], L: Labels): Promise<boolean> {
  return share(wordsHtml(words, L), L.title);
}

/** يُنشئ ملف قاموس الوحدة (جدول ملوّن) ويفتح الحفظ/المشاركة. */
export function exportGlossaryPdf(items: GlossaryItem[], L: GlossaryLabels, unitIndex = 0): Promise<boolean> {
  return share(glossaryHtml(items, L, unitIndex), L.title);
}
