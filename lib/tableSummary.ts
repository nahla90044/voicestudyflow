// lib/tableSummary.ts
// «المختصر» و«المراجعة الأخيرة» بالشكل الجدولي (قرار نهلة ٢٥ أكتوبر، على نمط مذكّرة «ملخص التنفيذ»):
// لكل وحدة جدول هرمي (موضوع ← عنوان فرعي ← محتوى مكثّف) يُذاكر منه بالنظر، مع ربط للذاكرة
// (🔗 جملة ربط لكل موضوع، 🗝️ مفتاح حفظ، روابط الوحدة)، وكلمة مفتاحية بين **نجمتين** في كل نقطة،
// والتعداد الطويل مجموعات بعناوين. منطق خالص (مُختبَر): القراءة، والقراءة أثناء البثّ، ودمج الأجزاء،
// وتمييز الأرقام المهمة (📅 تاريخ، 📘 مادة، 📜 مرسوم، ⏳ مدة، 💰 مبلغ، ⛓️ سجن)، والنص للاستماع، وصفحة الطباعة.
import { parseJsonLenient } from "./jsonRepair.ts";
import { isLatinText, parseLangBlock, ROLE_COLORS, roleKind, textDir, tint, type LangBlock } from "./langLessonCore.ts";
import type { StudySummary, SummarySection } from "./studySummary.ts";

export type TableGroup = { title: string; items: string[] };
export type TableRow = {
  label: string;
  lines?: string[];
  items?: string[];
  groups?: TableGroup[];
  key?: string;
  ex?: string[];
  compare?: { headers: string[]; rows: string[][] };
  /** «مربع الدرس» لكتب اللغة: قاعدة وصيغة وجملة محلّلة وجدول اقتران (قرار نهلة ٢٧ أكتوبر) */
  gram?: LangBlock;
};
export type TableTopic = { topic: string; hook?: string; rows: TableRow[] };
export type TableSummary = { title: string; topics: TableTopic[]; links: string[] };

const s = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const ss = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);

function row(o: any): TableRow | null {
  const r: TableRow = { label: s(o?.label) };
  const lines = ss(o?.lines);
  const items = ss(o?.items);
  const groups = (Array.isArray(o?.groups) ? o.groups : [])
    .map((g: any) => ({ title: s(g?.title), items: ss(g?.items) }))
    .filter((g: TableGroup) => g.items.length);
  const ex = ss(o?.ex);
  if (lines.length) r.lines = lines;
  if (items.length) r.items = items;
  if (groups.length) r.groups = groups;
  if (ex.length) r.ex = ex;
  if (s(o?.key)) r.key = s(o?.key);
  const c = o?.compare;
  if (c && Array.isArray(c.headers) && Array.isArray(c.rows)) {
    const headers = c.headers.map(s);
    const rows = c.rows.filter(Array.isArray).map((x: unknown[]) => {
      const rr = x.map(s);
      while (rr.length < headers.length) rr.push("");
      return rr.slice(0, headers.length);
    });
    if (headers.length && rows.length) r.compare = { headers, rows };
  }
  const gram = parseLangBlock(o?.gram);
  if (gram) r.gram = gram;
  return r.label || lines.length || items.length || groups.length || r.compare || r.gram ? r : null;
}

function topic(o: any): TableTopic | null {
  const rows = (Array.isArray(o?.rows) ? o.rows : []).map(row).filter(Boolean) as TableRow[];
  const t: TableTopic = { topic: s(o?.topic), rows };
  if (s(o?.hook)) t.hook = s(o?.hook);
  return t.topic && rows.length ? t : null;
}

/** يحلّل ردّ الذكاء الكامل (أو المقطوع: ما اكتمل من مواضيعه) */
export function parseTableSummary(raw: string): TableSummary | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = parseJsonLenient(m[0]) as any;
      const topics = (Array.isArray(o?.topics) ? o.topics : []).map(topic).filter(Boolean) as TableTopic[];
      if (topics.length) return { title: s(o?.title), topics, links: ss(o?.links) };
    } catch {}
  }
  return parsePartialTable(raw);
}

/** قراءة أثناء البثّ: كل موضوع اكتمل قوسه يظهر فورًا */
export function parsePartialTable(raw: string): TableSummary | null {
  const tm = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let title = "";
  if (tm) {
    try {
      title = s(JSON.parse(`"${tm[1]}"`));
    } catch {}
  }
  const topics: TableTopic[] = [];
  const k = raw.search(/"topics"\s*:\s*\[/);
  if (k >= 0) {
    let depth = 0;
    let begin = -1;
    let inStr = false;
    for (let i = raw.indexOf("[", k) + 1; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") {
        if (depth === 0) begin = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && begin >= 0) {
          try {
            const t = topic(parseJsonLenient(raw.slice(begin, i + 1)));
            if (t) topics.push(t);
          } catch {}
          begin = -1;
        }
      } else if (ch === "]" && depth === 0) break;
    }
  }
  return topics.length ? { title, topics, links: [] } : null;
}

/** دمج جداول الأجزاء بالترتيب: موضوع يتكرر اسمه في جزأين متتاليين يُدمج صفّه، والروابط بلا تكرار */
export function mergeTables(list: TableSummary[]): TableSummary | null {
  const ok = list.filter((x) => x?.topics?.length);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0];
  const topics: TableTopic[] = [];
  for (const t of ok.flatMap((x) => x.topics)) {
    const last = topics[topics.length - 1];
    if (last && last.topic === t.topic) last.rows.push(...t.rows);
    else topics.push({ ...t, rows: [...t.rows] });
  }
  const seen = new Set<string>();
  const links = ok
    .flatMap((x) => x.links)
    .filter((l) => (seen.has(l) ? false : (seen.add(l), true)))
    .slice(0, 8);
  return { title: ok[0].title, topics, links };
}

const plainText = (x: string) => x.replace(/\*\*/g, "").trim();

/** عناصر التعداد بلا إيموجي في أولها (طلب نهلة: «التعداد عادي») — ⚠️ تبقى */
const LEAD_EMOJI = /^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]|\s)+/u;
export function plainItem(x: string): string {
  return x.startsWith("⚠️") ? x : x.replace(LEAD_EMOJI, "");
}

/** كل عناصر صفّ (العادية أو المجموعات) بترقيم متسلسل */
export function rowItemCount(r: TableRow): number {
  return (r.items?.length ?? 0) + (r.groups ?? []).reduce((a, g) => a + g.items.length, 0);
}

/**
 * أقسام بالشكل القديم مشتقة من الجدول — فيعمل معه كل ما يعتمد على الأقسام كما هو:
 * الخريطة الذهنية من الملخّص، ومدقق الجودة، والبحث، والحفظ.
 */
export function tableToSections(t: TableSummary): SummarySection[] {
  return t.topics.map((tp) => ({
    emoji: "📌",
    heading: tp.topic,
    blocks: tp.rows.flatMap((r) => {
      const out: SummarySection["blocks"] = [];
      for (const l of r.lines ?? []) out.push({ type: "text", text: `${r.label}: ${plainText(l)}` });
      const items = [...(r.items ?? []), ...(r.groups ?? []).flatMap((g) => g.items)].map((x) => plainText(plainItem(x)));
      if (items.length) out.push({ type: "list", title: r.label, ordered: true, items });
      if (r.compare) out.push({ type: "table", title: r.label, headers: r.compare.headers, rows: r.compare.rows });
      for (const e of r.ex ?? []) out.push({ type: "example", text: plainText(e) });
      if (!out.length && r.label) out.push({ type: "text", text: r.label });
      return out;
    }),
  }));
}

/** ملخّص بالشكل الجدولي ملفوفًا كملخّص عادي (الأقسام مشتقة، والجدول هو ما يُعرض) */
export function tableAsSummary(t: TableSummary): StudySummary {
  return { title: t.title, intro: "", sections: tableToSections(t), keypoints: [], table: t };
}

/** نص الاستماع: الموضوع، ثم كل صف بعنوانه ومحتواه، والتعداد بعدده */
export function tableToSpeech(t: TableSummary): string {
  const out: string[] = [];
  if (t.title) out.push(t.title);
  for (const tp of t.topics) {
    out.push(tp.topic);
    if (tp.hook) out.push(plainText(tp.hook));
    for (const r of tp.rows) {
      const parts: string[] = [];
      for (const l of r.lines ?? []) parts.push(plainText(plainItem(l)));
      if (r.items?.length) parts.push(r.items.map((x) => plainText(plainItem(x))).join("، "));
      for (const g of r.groups ?? []) parts.push(`${g.title}: ${g.items.map((x) => plainText(plainItem(x))).join("، ")}`);
      if (r.compare) for (const cr of r.compare.rows) parts.push(cr.map((c, i) => (i === 0 || !r.compare!.headers[i] ? c : `${r.compare!.headers[i]}: ${c}`)).filter(Boolean).join("، "));
      for (const e of r.ex ?? []) parts.push(plainText(e));
      if (r.gram) parts.push(gramSpeech(r.gram));
      out.push([r.label, ...parts].filter(Boolean).join(". "));
    }
  }
  if (t.links.length) out.push(...t.links.map((l) => plainText(l).replace(/⇄/g, " يرتبط بـ ")));
  return out.filter(Boolean).join(".\n");
}

/* ---------------- الأرقام المهمة ---------------- */

export type NumKind = "decree" | "date" | "art" | "money" | "jail" | "dur";
export const NUM_EMOJI: Record<NumKind, string> = { decree: "📜", date: "📅", art: "📘", money: "💰", jail: "⛓️", dur: "⏳" };

const D = "[0-9٠-٩]";
const W = "(?:ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة|خمسة عشر|عشرين|عشرون|ثلاثين|ثلاثون|أربعين|ستين|ستون|تسعين|مائة وثمانين|مائة)";
const UNIT = "(?:يومًا|يوما|يوم|أيام|ساعة|ساعات|شهرًا|شهر|أشهر|سنة|سنوات|أسبوع|أسابيع)";
const NUM_RULES: [RegExp, NumKind][] = [
  [new RegExp(`(?:المرسوم الملكي|مرسوم ملكي|بالمرسوم|المرسوم)?\\s*\\(?م\\s*/\\s*${D}+\\)?`, "g"), "decree"],
  [new RegExp(`${D}{1,2}/${D}{1,2}/${D}{3,4}\\s*هـ?|${D}{3,4}\\s*هـ|عام\\s+${D}{4}|(?<![0-9٠-٩/])(?:1[34]|١[٣٤])[0-9٠-٩]{2}(?![0-9٠-٩/])`, "g"), "date"],
  [new RegExp(`(?:(?:ال)?مادة|(?<![\\u0600-\\u06FF])م)\\s*\\(?${D}+\\)?`, "g"), "art"],
  [new RegExp(`(?:غرامة[^،.؛]{0,25}?)?${D}[0-9٠-٩,٬.]*\\s*(?:ألف|مليون)?\\s*ريال`, "g"), "money"],
  [new RegExp(`(?:السجن|سجن|الحبس|حبس)[^،.؛]{0,30}?(?:${D}+|${W})\\s*${UNIT}`, "g"), "jail"],
  [new RegExp(`(?:${D}+|${W})\\s*${UNIT}`, "g"), "dur"],
];

/** مقاطع النص: عادي، أو كلمة مفتاحية (**…**)، أو رقم مهم بنوعه، أو مرجع مادة صغير «(م١٠)» */
export type Seg = { t: string; k?: "key" | "ref" | NumKind };

function numberSegs(text: string): Seg[] {
  const spans: { a: number; b: number; k: NumKind }[] = [];
  for (const [rx, k] of NUM_RULES) {
    rx.lastIndex = 0;
    for (let m = rx.exec(text); m; m = rx.exec(text)) {
      const a = m.index + (m[0].length - m[0].trimStart().length);
      const b = m.index + m[0].length;
      if (b > a && !spans.some((x) => !(b <= x.a || a >= x.b))) spans.push({ a, b, k });
      if (!m[0].length) rx.lastIndex++;
    }
  }
  spans.sort((x, y) => x.a - y.a);
  const out: Seg[] = [];
  let i = 0;
  for (const sp of spans) {
    if (sp.a > i) out.push({ t: text.slice(i, sp.a) });
    out.push({ t: text.slice(sp.a, sp.b), k: sp.k });
    i = sp.b;
  }
  if (i < text.length) out.push({ t: text.slice(i) });
  return out;
}

/** يقسّم سطرًا للعرض: الكلمة المفتاحية، ومراجع المواد بين قوسين (صغيرة باهتة)، والأرقام المهمة */
export function segments(line: string): Seg[] {
  const out: Seg[] = [];
  for (const part of line.split(/(\*\*[^*]+\*\*|\(م\s*[0-9٠-٩][^)]{0,30}\))/)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) out.push({ t: part.slice(2, -2), k: "key" });
    else if (/^\(م\s*[0-9٠-٩]/.test(part)) out.push({ t: part.slice(1, -1), k: "ref" });
    else out.push(...numberSegs(part));
  }
  return out;
}

/** أعمدة عرض التعداد: الطويل عمود واحد، والقصير عمودان أو ثلاثة — لا تداخل أبدًا */
export function itemColumns(items: string[]): number {
  if (items.length < 3) return 1;
  const L = Math.max(...items.map((x) => x.replace(/\(م[^)]*\)|\*\*/g, "").length));
  return L > 34 ? 1 : L <= 16 && items.length >= 6 ? 3 : 2;
}

/* ---------------- الطباعة ---------------- */

export const TOPIC_COLORS: { bg: string; edge: string }[] = [
  { bg: "#E8F1FB", edge: "#2F6FB5" },
  { bg: "#FDF1E4", edge: "#C7741B" },
  { bg: "#EAF6EE", edge: "#2E8B57" },
  { bg: "#F3ECFB", edge: "#7A4FC0" },
  { bg: "#FBEAEC", edge: "#C0475A" },
  { bg: "#E9F6F7", edge: "#20878F" },
  { bg: "#FBF7E3", edge: "#A68A12" },
];
export const NUM_COLORS: Record<NumKind, { bg: string; fg: string }> = {
  decree: { bg: "#F1E9FF", fg: "#4B2A8A" },
  art: { bg: "#E7EEFF", fg: "#1E3F8F" },
  date: { bg: "#E9F7EF", fg: "#1F6B3A" },
  dur: { bg: "#FFF1DD", fg: "#8A4B00" },
  money: { bg: "#FFF7D1", fg: "#7A5D00" },
  jail: { bg: "#FCE4E4", fg: "#8E1F1F" },
};

const esc = (x: string) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const AR = (n: number) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

function lineHtml(x: string): string {
  return segments(x)
    .map((g) =>
      !g.k
        ? esc(g.t)
        : g.k === "key"
        ? `<b>${esc(g.t)}</b>`
        : g.k === "ref"
        ? `<span class="ref">${esc(g.t)}</span>`
        : `<span class="num" style="background:${NUM_COLORS[g.k].bg};color:${NUM_COLORS[g.k].fg}">${NUM_EMOJI[g.k]} ${esc(g.t)}</span>`
    )
    .join("");
}

function rowHtml(r: TableRow, edge: string): string {
  const out: string[] = [];
  for (const l of r.lines ?? []) out.push(`<div class="ln${l.startsWith("⚠️") ? " warn" : ""}">${lineHtml(l)}</div>`);
  const li = (x: string, n: number) => `<li><span class="n" style="background:${edge}">${AR(n)}</span><span>${lineHtml(plainItem(x))}</span></li>`;
  if (r.items?.length) out.push(`<ol class="items" style="grid-template-columns:repeat(${itemColumns(r.items)},1fr)">${r.items.map((x, i) => li(x, i + 1)).join("")}</ol>`);
  if (r.groups?.length) {
    let k = r.items?.length ?? 0;
    out.push(
      `<div class="grps">${r.groups
        .map(
          (g) =>
            `<div class="grp"><div class="gt" style="color:${edge};border-color:${edge}">${esc(g.title.replace(/\s*\([0-9٠-٩]+\)\s*$/, ""))} <span class="gc">(${AR(g.items.length)})</span></div><ol class="items">${g.items.map((x) => li(x, ++k)).join("")}</ol></div>`
        )
        .join("")}</div>`
    );
  }
  for (const e of r.ex ?? []) out.push(`<div class="ex">💡 ${lineHtml(e)}</div>`);
  if (r.key) out.push(`<div class="key">🗝️ ${lineHtml(r.key)}</div>`);
  if (r.compare)
    out.push(
      `<table class="cmp"><tr>${r.compare.headers.map((h) => `<th>${lineHtml(h)}</th>`).join("")}</tr>${r.compare.rows
        .map((cr) => `<tr>${cr.map((c) => `<td>${lineHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</table>`
    );
  if (r.gram) out.push(gramHtml(r.gram));
  return out.join("");
}

/** «مربع الدرس» مطبوعًا: القاعدة وصيغتها، والجملة كلمة كلمة بدورها (والفعل بأصله وزمنه)، وجدول الاقتران، والخطأ الشائع */
export function gramHtml(g: LangBlock): string {
  const out: string[] = [];
  if (g.rule) out.push(`<div class="g-rule">📐 ${esc(g.rule)}</div>`);
  if (g.formula) out.push(`<div class="g-form" dir="ltr">${esc(g.formula)}</div>`);
  for (const sn of g.parse ?? []) {
    const ltr = isLatinText(sn.words.map((w) => w.w).join(" "));
    out.push(
      `<div class="g-sent" dir="${ltr ? "ltr" : "rtl"}">${sn.words
        .map((w) => {
          const c = ROLE_COLORS[roleKind(w.role)];
          const sub = [w.base, w.tense].filter(Boolean).join(" · ");
          return `<span class="g-w"><b style="border-color:${c};background:${tint(c)}">${esc(w.w)}</b>${w.role ? `<i dir="${textDir(w.role)}" style="color:${c}">${esc(w.role)}</i>` : ""}${sub ? `<small dir="${textDir(sub)}">${esc(sub)}</small>` : ""}</span>`;
        })
        .join("")}</div>`
    );
    if (sn.tr) out.push(`<div class="g-tr">«${esc(sn.tr)}»</div>`);
  }
  if (g.conj) {
    const c = ROLE_COLORS.verb;
    out.push(
      `<table class="g-conj" dir="ltr"><tr><th colspan="2" style="background:${tint(c)}">${esc(g.conj.verb)}${g.conj.tense ? ` <span style="color:${c}">${esc(g.conj.tense)}</span>` : ""}</th></tr>${g.conj.rows
        .map(([p, f]) => `<tr><td style="color:${ROLE_COLORS.pronoun}">${esc(p)}</td><td><b>${esc(f)}</b></td></tr>`)
        .join("")}</table>`
    );
  }
  if (g.mistake) out.push(`<div class="g-mis">⚠️ ${esc(g.mistake)}</div>`);
  return `<div class="gram">${out.join("")}</div>`;
}

/** نص «مربع الدرس» للاستماع */
export function gramSpeech(g: LangBlock): string {
  const parts: string[] = [];
  if (g.rule) parts.push(g.rule);
  if (g.formula) parts.push(g.formula);
  for (const sn of g.parse ?? []) {
    parts.push(sn.words.map((w) => w.w).join(" "));
    parts.push(sn.words.map((w) => [w.w, w.role, w.base, w.tense].filter(Boolean).join(" ")).join("، "));
    if (sn.tr) parts.push(sn.tr);
  }
  if (g.conj) parts.push(`${g.conj.verb} ${g.conj.tense}: ${g.conj.rows.map(([p, f]) => `${p} ${f}`).join("، ")}`);
  if (g.mistake) parts.push(g.mistake);
  return parts.join(". ");
}

/** جسم الجدول لوحدة واحدة (يُستعمل وحده أو داخل ملف المذاكرة) */
export function tableBodyHtml(t: TableSummary, opts: { badge?: string; title?: string }): string {
  const rows: string[] = [];
  t.topics.forEach((tp, ti) => {
    const c = TOPIC_COLORS[ti % TOPIC_COLORS.length];
    tp.rows.forEach((r, ri) => {
      let tr = "<tr>";
      if (ri === 0)
        tr += `<td class="topic" rowspan="${tp.rows.length}" style="background:${c.bg};border-right:5px solid ${c.edge}"><div class="tname" style="color:${c.edge}">${lineHtml(tp.topic)}</div>${
          tp.hook ? `<div class="hook">🔗 ${lineHtml(tp.hook)}</div>` : ""
        }</td>`;
      tr += `<td class="sub" style="background:${c.bg}">${lineHtml(r.label)}</td><td class="body">${rowHtml(r, c.edge)}</td></tr>`;
      rows.push(tr);
    });
  });
  const links = t.links.length
    ? `<div class="links"><div class="lh">🔗 روابط الوحدة — اربط ولا تحفظ منفصلًا</div><ul>${t.links.map((l) => `<li>${lineHtml(l)}</li>`).join("")}</ul></div>`
    : "";
  return `<div class="tsum">${opts.badge ? `<div class="badge">${esc(opts.badge)}</div>` : ""}<h1>${esc(t.title || opts.title || "")}</h1><table class="map">${rows.join("")}</table>${links}</div>`;
}

/** أنماط الجدول (ألوان مُصمتة فقط: طباعة آيفون تحوّل الشفافية إلى سواد) — صفحة عرضية */
export const TABLE_CSS = `
@page { size: A4 landscape; margin: 9mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: -apple-system, 'SF Arabic', 'Geeza Pro', sans-serif; }
html, body { margin: 0; background: #fff; color: #1d2330; }
.tsum { direction: rtl; }
.tsum .badge { display: inline-block; background: #1d2330; color: #fff; font-size: 11px; padding: 2px 10px; border-radius: 99px; margin-bottom: 6px; }
.tsum h1 { font-size: 18px; margin: 2px 0 10px; text-align: center; border: 2px solid #1d2330; padding: 7px; border-radius: 8px; }
.tsum table.map { width: 100%; border-collapse: collapse; font-size: 12.5px; line-height: 1.7; }
.tsum table.map td { border: 1px solid #c9ced8; vertical-align: middle; padding: 5px 8px; }
.tsum table.map tr { break-inside: avoid; page-break-inside: avoid; }
.tsum td.topic { width: 14%; text-align: center; }
.tsum .tname { font-weight: 800; font-size: 14px; }
.tsum .hook { margin-top: 5px; font-size: 11.5px; color: #39404d; background: #fff; border-radius: 6px; padding: 3px 6px; line-height: 1.6; }
.tsum td.sub { width: 13%; font-weight: 700; text-align: center; }
.tsum td.body { background: #fff; }
.tsum .ln { padding: 1px 0; }
.tsum .ln + .ln { border-top: 1px dashed #e3e6ec; }
.tsum .ln.warn { color: #9a2a12; font-weight: 600; }
.tsum ol.items { list-style: none; margin: 3px 0; padding: 0; display: grid; gap: 2px 16px; }
.tsum ol.items li { display: flex; gap: 6px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
.tsum .n { flex: none; color: #fff; border-radius: 99px; min-width: 18px; height: 18px; font-size: 10.5px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; }
.tsum .grps { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 7px; margin: 4px 0; }
.tsum .grp { border: 1px solid #dfe3ea; border-radius: 8px; padding: 5px 8px; background: #fbfcfe; break-inside: avoid; }
.tsum .gt { font-weight: 800; font-size: 12.5px; border-bottom: 2px solid; padding-bottom: 3px; margin-bottom: 4px; }
.tsum .gc { font-weight: 600; color: #8a93a3; }
.tsum .grp ol.items { grid-template-columns: 1fr; }
.tsum .ex { font-size: 12px; color: #2E6B3F; margin-top: 2px; }
.tsum .key { margin-top: 4px; font-size: 12px; background: #FFF7D6; border-radius: 6px; padding: 3px 8px; display: inline-block; }
.tsum b { color: #0f3d78; background: #EAF2FF; border-radius: 4px; padding: 0 3px; }
.tsum .num { display: inline-block; border-radius: 6px; padding: 0 5px; font-weight: 700; white-space: nowrap; }
.tsum .ref { font-size: 10.5px; color: #8a93a3; margin-right: 4px; white-space: nowrap; }
.tsum table.cmp { border-collapse: collapse; margin: 4px 0; font-size: 12px; }
.tsum table.cmp th, .tsum table.cmp td { border: 1px solid #d5d9e1; padding: 3px 8px; }
.tsum table.cmp th { background: #eef1f6; }
.tsum .gram { border: 2px solid #c9d2e3; border-radius: 12px; padding: 8px 10px; margin: 6px 0; background: #fbfcfe; break-inside: avoid; }
.tsum .g-rule { font-weight: 700; margin-bottom: 4px; }
.tsum .g-form { display: inline-block; border: 1.5px solid #B8892B; color: #8a6418; border-radius: 999px; padding: 2px 12px; font-weight: 800; margin: 2px 0 6px; }
.tsum .g-sent { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 6px 0 2px; }
.tsum .g-w { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
.tsum .g-w b { border: 2px solid; border-radius: 8px; padding: 2px 10px; font-size: 14px; }
.tsum .g-w i { font-style: normal; font-weight: 800; font-size: 11px; }
.tsum .g-w small { color: #5b6475; font-size: 10px; }
.tsum .g-tr { color: #5b6475; text-align: center; font-size: 12px; }
.tsum table.g-conj { border-collapse: collapse; margin: 6px auto; font-size: 13px; min-width: 220px; }
.tsum table.g-conj th, .tsum table.g-conj td { border: 1px solid #d5d9e1; padding: 3px 12px; }
.tsum .g-mis { border: 1.5px dashed #F43F5E; border-radius: 8px; padding: 4px 8px; margin-top: 6px; color: #9a2a12; font-weight: 700; }
.tsum .links { margin-top: 10px; border: 2px dashed #7A4FC0; border-radius: 10px; padding: 7px 14px; background: #FAF7FF; break-inside: avoid; }
.tsum .lh { font-weight: 800; color: #5b36a0; margin-bottom: 4px; }
.tsum .links ul { margin: 0; padding-right: 20px; line-height: 1.9; font-size: 12.5px; }
.foot { margin-top: 14px; color: #9CA3AF; font-size: 10px; text-align: center; }
`;

export function tableSummaryHtml(opts: { bookTitle: string; title: string; table: TableSummary; badge?: string }): string {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${TABLE_CSS}</style></head><body>${tableBodyHtml(opts.table, {
    badge: opts.badge ? `${opts.bookTitle} · ${opts.badge}` : opts.bookTitle,
    title: opts.title,
  })}<div class="foot">VoiceStudyFlow</div></body></html>`;
}
