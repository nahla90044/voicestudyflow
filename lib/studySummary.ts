// lib/studySummary.ts
// الملخّص الدراسي الشامل (إجراء studysummary): أقسام مرتّبة فيها فقرات، تعريفات، تعدادات كاملة،
// جداول مقارنة، أمثلة، شرح للنقاط الصعبة، وتنبيهات مهمة — ثم «أهم النقاط» للمراجعة.
// يُعرض في التطبيق (components/brand/summary-view) ويُسمع (summaryToSpeech) ويُطبع PDF (summaryHtml).
// الـPDF بألوان مُصمتة فقط: طباعة آيفون تحوّل الشفافية/التدرّج إلى سواد.
import { parseJsonLenient } from "./jsonRepair.ts";
import { TABLE_CSS, tableBodyHtml, tableSummaryHtml, tableToSpeech } from "./tableSummary.ts";

export type SummaryBlock =
  | { type: "text"; text: string }
  | { type: "definition"; term: string; text: string }
  | { type: "list"; title?: string; ordered?: boolean; items: string[] }
  | { type: "table"; title?: string; headers: string[]; rows: string[][] }
  | { type: "example"; text: string }
  | { type: "explain"; title?: string; text: string }
  | { type: "important"; text: string }
  // تمارين نهاية الوحدة محلولة (الحل بلون مختلف)، ودراسة الحالة بشرح مبسّط موسّع وأسئلتها محلولة
  | { type: "exercise"; q: string; steps: string[]; answer: string; why?: string; quote?: string }
  | { type: "case"; title?: string; text: string; analysis: string; qa: { q: string; a: string }[] };

export type SummarySection = { emoji: string; heading: string; blocks: SummaryBlock[] };
export type StudySummary = {
  title: string;
  intro: string;
  sections: SummarySection[];
  keypoints: string[];
  /** المختصر والمراجعة الأخيرة بالشكل الجدولي (٢٥ أكتوبر): يُعرض ويُطبع ويُسمع هو، والأقسام مشتقة منه */
  table?: import("./tableSummary").TableSummary;
  /** وقت توليد الملخّص كاملًا (٢٨ أكتوبر): يُعرف به ما سبق تحسينات الشرح فيُقترح تحديثه */
  madeAt?: number;
};

/** عبارة قصيرة (≤ max حرفًا بكلمات كاملة) لنقطة في الخريطة */
function shortPhrase(s: string, max = 40): string {
  const t = s.replace(/\s*[(（][^)）]*[)）]/g, "").replace(/^\s*[\d٠-٩]+[.)-]\s*/, "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const k = cut.lastIndexOf(" ");
  return (k > 12 ? cut.slice(0, k) : cut).trim() + "…";
}

const OFF_CORE = /مراجع|مصادر|أنشطة|نشاط|مخرجات|أهداف|أسئلة|تمارين|تمرين|دراسة ال?حالة|مسرد|references|sources|activit|outcomes|objectives|questions|exercise|case study|glossary/i;

/**
 * خريطة ذهنية للوحدة مبنية من ملخّصها نفسه (بلا طلب ذكاء إضافي): المركز عنوان الوحدة،
 * والفروع أقسام الملخّص، والنقاط أهم ما فيها (المصطلحات، رؤوس التعدادات، العمود الأول من الجداول).
 * التمارين ودراسة الحالة لا تصير فروعًا.
 */
export function mindmapFromSummary(s: StudySummary, center: string): { center: string; branches: import("./syllabus").MindBranch[] } | null {
  // المختصر الجدولي: الخريطة متفرعة منه مباشرة (موضوع ← عنوان فرعي ← نقاطه/مجموعاته ← عناصرها)
  if (s.table?.topics.length) {
    const clean = (x: string) => shortPhrase(x.replace(/\*\*/g, "").replace(/^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]|\s)+/u, ""), 48);
    type N = import("./syllabus").MindNode;
    const branches = s.table.topics.slice(0, 7).map((tp) => {
      const tree: N[] = tp.rows.map((r) => {
        const sub: N[] = [
          ...(r.lines ?? []).map((l) => ({ t: clean(l) })),
          ...(r.items ?? []).map((x) => ({ t: clean(x) })),
          ...(r.groups ?? []).map((g) => ({ t: clean(g.title), sub: g.items.map((x) => ({ t: clean(x) })) })),
        ].filter((n) => n.t);
        return sub.length ? { t: clean(r.label), sub } : { t: clean(r.label) };
      });
      return { label: shortPhrase(tp.topic, 44), points: tree.map((n) => n.t), tree, ...(tp.hook ? { hook: tp.hook.replace(/\*\*/g, "") } : {}) };
    });
    const c0 = (center || s.table.title).replace(/\s*[(（][^)）]*[)）]/g, "").trim();
    return branches.length >= 2 ? { center: shortPhrase(c0, 44), branches } : null;
  }
  const branches = s.sections
    .map((sec) => {
      const pts: string[] = [];
      const add = (x: string) => {
        const v = shortPhrase(x);
        if (v && !pts.includes(v) && pts.length < 3) pts.push(v);
      };
      for (const b of sec.blocks) {
        if (b.type === "definition" && b.term) add(b.term);
        else if (b.type === "list")
          b.items.forEach((it) => {
            const k = it.search(/[:：]/);
            add(k > 0 && k <= 45 ? it.slice(0, k) : it);
          });
        else if (b.type === "table") b.rows.forEach((r) => r[0] && add(r[0]));
        else if (b.type === "explain" && b.title) add(b.title);
      }
      if (pts.length < 2)
        for (const b of sec.blocks) if (b.type === "text" || b.type === "important") add(b.text.split(/[.!؟?؛]/)[0] ?? "");
      return { label: shortPhrase(sec.heading, 44), points: pts };
    })
    // الخريطة لصلب الوحدة فقط: لا مراجع ولا أنشطة ولا أهداف/مخرجات ولا أسئلة/تمارين ولا مسرد
    .filter((b) => b.label && b.points.length && !OFF_CORE.test(b.label))
    .slice(0, 6);
  // المركز: عنوان الوحدة بلا «الوحدة السابعة:» ولا ما بين قوسين
  const c0 = (center || s.title).replace(/\s*[(（][^)）]*[)）]/g, "").trim();
  const k = c0.search(/[:：]/);
  const c = shortPhrase(k > 0 && k <= 22 && /^(الوحدة|الفصل|الباب|unit|chapter)/i.test(c0) ? c0.slice(k + 1) : c0, 44);
  return branches.length >= 2 ? { center: c || c0, branches } : null;
}

const str = (v: unknown) => String(v ?? "").replace(/\*\*|__|`|^#+\s*/gm, "").trim();
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function block(b: any): SummaryBlock | null {
  switch (b?.type) {
    case "text":
      return str(b.text) ? { type: "text", text: str(b.text) } : null;
    case "definition":
      return str(b.term) || str(b.text) ? { type: "definition", term: str(b.term), text: str(b.text) } : null;
    case "list": {
      const items = strs(b.items);
      return items.length ? { type: "list", title: str(b.title) || undefined, ordered: !!b.ordered, items } : null;
    }
    case "table": {
      const headers = strs(b.headers);
      const rows: string[][] = Array.isArray(b.rows)
        ? b.rows.filter(Array.isArray).map((r: unknown[]) => {
            const row = r.map(str);
            while (headers.length && row.length < headers.length) row.push("");
            return headers.length ? row.slice(0, headers.length) : row;
          })
        : [];
      return headers.length && rows.length ? { type: "table", title: str(b.title) || undefined, headers, rows } : null;
    }
    case "example":
      return str(b.text) ? { type: "example", text: str(b.text) } : null;
    case "explain":
      return str(b.text) ? { type: "explain", title: str(b.title) || undefined, text: str(b.text) } : null;
    case "important":
      return str(b.text) ? { type: "important", text: str(b.text) } : null;
    case "exercise": {
      const q = str(b.q ?? b.question);
      const answer = str(b.answer ?? b.solution);
      return q && (answer || strs(b.steps).length)
        ? { type: "exercise", q, steps: strs(b.steps), answer, why: str(b.why ?? b.reason) || undefined, quote: str(b.quote) || undefined }
        : null;
    }
    case "case": {
      const text = str(b.text);
      const analysis = str(b.analysis);
      const qa = (Array.isArray(b.qa) ? b.qa : [])
        .map((x: any) => ({ q: str(x?.q), a: str(x?.a) }))
        .filter((x: { q: string; a: string }) => x.q && x.a);
      return text || analysis ? { type: "case", title: str(b.title) || undefined, text, analysis, qa } : null;
    }
    default:
      return str(b?.text) ? { type: "text", text: str(b.text) } : null;
  }
}

function section(o: any): SummarySection | null {
  const sec = {
    emoji: str(o?.emoji) || "📌",
    heading: str(o?.heading),
    blocks: (Array.isArray(o?.blocks) ? o.blocks : []).map(block).filter(Boolean) as SummaryBlock[],
  };
  return sec.heading || sec.blocks.length ? sec : null;
}

/** قيمة نصية مكتملة لمفتاح في JSON جزئي (مثل "title") أو "" إن لم تكتمل بعد */
function partialString(raw: string, key: string): string {
  const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return "";
  try {
    return str(JSON.parse(`"${m[1]}"`));
  } catch {
    return "";
  }
}

/**
 * قراءة جزئية أثناء البثّ: العنوان والتمهيد متى اكتملا، وكل قسم اكتمل قوسه — دون انتظار البقية.
 * يمسح مصفوفة sections بعدّاد أقواس يتجاهل ما داخل النصوص.
 */
export function parsePartialSummary(raw: string): StudySummary | null {
  const out: StudySummary = { title: partialString(raw, "title"), intro: partialString(raw, "intro"), sections: [], keypoints: [] };
  const k = raw.search(/"sections"\s*:\s*\[/);
  if (k >= 0) {
    let i = raw.indexOf("[", k) + 1;
    let depth = 0;
    let begin = -1;
    let inStr = false;
    for (; i < raw.length; i++) {
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
            const sec = section(parseJsonLenient(raw.slice(begin, i + 1)));
            if (sec) out.sections.push(sec);
          } catch {
            // قسم غير صالح → نتخطاه
          }
          begin = -1;
        }
      } else if (ch === "]" && depth === 0) break; // انتهت مصفوفة الأقسام
    }
  }
  return out.title || out.intro || out.sections.length ? out : null;
}

/** يحلّل ردّ الذكاء. ردّ غير صالح (أو مقطوع) → ما اكتمل منه، أو قسم نصي واحد بدل لا شيء */
export function parseStudySummary(raw: string): StudySummary | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = parseJsonLenient(m[0]) as any;
      const sections = (Array.isArray(o?.sections) ? o.sections : []).map(section).filter(Boolean) as SummarySection[];
      if (sections.length) return { title: str(o?.title), intro: str(o?.intro), sections, keypoints: strs(o?.keypoints) };
    } catch {
      // ردّ مقطوع → نأخذ ما اكتمل منه
      const part = parsePartialSummary(raw);
      if (part?.sections.length) return part;
    }
  }
  const plain = raw.replace(/[{}\[\]"]/g, "").trim();
  if (!plain) return null;
  return { title: "", intro: "", sections: [{ emoji: "📌", heading: "", blocks: [{ type: "text", text: plain }] }], keypoints: [] };
}
/** نص للاستماع (بلا جداول مرسومة: كل صف جملة) */
export function summaryToSpeech(s: StudySummary): string {
  if (s.table) return tableToSpeech(s.table);
  const out: string[] = [];
  if (s.title) out.push(s.title);
  if (s.intro) out.push(s.intro);
  for (const sec of s.sections) {
    if (sec.heading) out.push(sec.heading);
    for (const b of sec.blocks) {
      if (b.type === "text" || b.type === "example" || b.type === "important") out.push(b.text);
      else if (b.type === "definition") out.push(`${b.term}: ${b.text}`);
      else if (b.type === "explain") out.push([b.title, b.text].filter(Boolean).join(". "));
      else if (b.type === "exercise") out.push([b.q, ...b.steps, b.answer, b.why].filter(Boolean).join(". "));
      else if (b.type === "case") out.push([b.title, b.text, b.analysis, ...b.qa.map((x) => `${x.q} ${x.a}`)].filter(Boolean).join(". "));
      else if (b.type === "list") out.push([b.title, ...b.items.map((x) => x.replace(/[:：]/, "، "))].filter(Boolean).join(". "));
      else if (b.type === "table") {
        if (b.title) out.push(b.title);
        for (const r of b.rows) out.push(r.map((c, i) => (i === 0 ? c : `${b.headers[i]}: ${c}`)).join("، "));
      }
    }
  }
  if (s.keypoints.length) out.push(...s.keypoints);
  return out.filter(Boolean).join(".\n");
}

/** نص عادي (للحفظ/البحث/المشاركة) */
export const summaryToText = summaryToSpeech;

/* ---------------- PDF ---------------- */

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ألوان الأقسام (مُصمتة) — لون رئيسي + خلفية فاتحة محسوبة */
const SECTION_COLORS: [string, string, string][] = [
  // [اللون، خلفية فاتحة، حدّ]
  ["#5B4BF5", "#F0EEFE", "#D6D1FC"],
  ["#0E8F7E", "#E9F6F4", "#C3E6E0"],
  ["#E07A1F", "#FDF2E8", "#F6D7BC"],
  ["#2563EB", "#EBF1FD", "#C6D6F9"],
  ["#B8338C", "#F9EBF4", "#EDC6E0"],
  ["#15803D", "#EAF5EE", "#C2E2CD"],
];

/** محتوى ملخّص واحد (رأس، فهرس، أقسام، أهم النقاط) — يُستعمل وحده أو داخل ملف المذاكرة المجمّع */
function summaryBody(opts: { bookTitle: string; title: string; summary: StudySummary; rtl: boolean; afterHero?: string }): string {
  const { summary: s, rtl } = opts;
  const start = rtl ? "right" : "left";
  const L = rtl
    ? { toc: "محتويات الملخّص", key: "أهم النقاط للمراجعة", ex: "مثال", hard: "توضيح", imp: "مهم", def: "تعريف", exQ: "تمرين", sol: "الحل", why: "سبب الإجابة", steps: "خطوات الحل", cs: "دراسة حالة", an: "الشرح المبسّط", csq: "أسئلة الحالة" }
    : { toc: "Contents", key: "Key points to review", ex: "Example", hard: "Explained", imp: "Important", def: "Definition", exQ: "Exercise", sol: "Solution", why: "Why", steps: "Steps", cs: "Case study", an: "Simple explanation", csq: "Case questions" };

  const blockHtml = (b: SummaryBlock, c: [string, string, string]): string => {
    switch (b.type) {
      case "exercise":
        // الحل بلون مختلف دائمًا (أخضر) عن نص السؤال
        return `<div class="exq"><span class="tag" style="background:#334155">${L.exQ}</span><b>${esc(b.q)}</b></div><div class="sol">${
          b.steps.length ? `<div class="solh">${L.steps}</div><ol>${b.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""
        }${b.answer ? `<div class="solh">${L.sol}</div><div class="ans">${esc(b.answer)}</div>` : ""}${
          b.why ? `<div class="solh">${L.why}</div><div>${esc(b.why)}</div>` : ""
        }${b.quote ? `<div class="qt">«${esc(b.quote)}»</div>` : ""}</div>`;
      case "case":
        return `<div class="case"><span class="tag" style="background:#7C3AED">${L.cs}</span>${b.title ? `<b>${esc(b.title)}</b>` : ""}<p>${esc(b.text)}</p></div>${
          b.analysis ? `<div class="an"><div class="anh">${L.an}</div><p>${esc(b.analysis)}</p></div>` : ""
        }${b.qa.length ? `<div class="lt">${L.csq}</div>${b.qa.map((x) => `<div class="exq"><b>${esc(x.q)}</b></div><div class="sol">${esc(x.a)}</div>`).join("")}` : ""}`;
      case "text":
        return `<p>${esc(b.text)}</p>`;
      case "definition":
        return `<div class="def" style="border-${start}-color:${c[0]}"><span class="tag" style="background:${c[0]}">${L.def}</span><b style="color:${c[0]}">${esc(b.term)}</b> ${esc(b.text)}</div>`;
      case "list": {
        const items = b.items
          .map((x, i) => {
            const k = x.search(/[:：]/);
            const body = k > 0 && k <= 50 ? `<b>${esc(x.slice(0, k))}:</b>${esc(x.slice(k + 1))}` : esc(x);
            return `<li><span class="bul" style="background:${b.ordered ? c[0] : c[2]};color:${b.ordered ? "#fff" : c[0]}">${b.ordered ? i + 1 : "•"}</span><span>${body}</span></li>`;
          })
          .join("");
        return `<div class="list">${b.title ? `<div class="lt" style="color:${c[0]}">${esc(b.title)}</div>` : ""}<ul>${items}</ul></div>`;
      }
      case "table":
        return `<div class="tw">${b.title ? `<div class="lt" style="color:${c[0]}">${esc(b.title)}</div>` : ""}<table><thead><tr>${b.headers
          .map((h) => `<th style="background:${c[0]}">${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${b.rows
          .map((r, ri) => `<tr style="background:${ri % 2 ? c[1] : "#fff"}">${r.map((x, ci) => `<td${ci === 0 ? ` class="first" style="color:${c[0]}"` : ""}>${esc(x)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`;
      case "example":
        return `<div class="box ex"><span class="tag" style="background:#0E8F7E">${L.ex}</span>${esc(b.text)}</div>`;
      case "explain":
        return `<div class="box hard"><span class="tag" style="background:#2563EB">${L.hard}</span>${b.title ? `<b>${esc(b.title)}: </b>` : ""}${esc(b.text)}</div>`;
      case "important":
        return `<div class="box imp"><span class="tag" style="background:#D97706">${L.imp}</span>${esc(b.text)}</div>`;
    }
  };

  const toc = s.sections.filter((x) => x.heading).length > 2
    ? `<div class="toc"><div class="toch">${L.toc}</div><ol>${s.sections
        .filter((x) => x.heading)
        .map((x) => `<li>${esc(x.heading)}</li>`)
        .join("")}</ol></div>`
    : "";

  const sections = s.sections
    .map((sec, i) => {
      const c = SECTION_COLORS[i % SECTION_COLORS.length];
      // العنوان لا يبقى وحيدًا أسفل الصفحة: يُربط بأول محتوى تحته في كتلة لا تنقسم
      const h = sec.heading
        ? `<h2><span class="num" style="background:${c[0]}">${i + 1}</span><span style="color:${c[0]}">${esc(sec.heading)}</span></h2><div class="rule" style="background:${c[2]}"></div>`
        : "";
      const [first, ...rest] = sec.blocks.map((b) => blockHtml(b, c));
      return `<section><div class="lead">${h}${first ?? ""}</div>${rest.join("")}</section>`;
    })
    .join("");

  const key = s.keypoints.length
    ? `<div class="key"><div class="keyh">${L.key}</div><ol>${s.keypoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ol></div>`
    : "";

  return `
    <div class="hero"><div class="book">${esc(opts.bookTitle)}</div><h1>${esc(s.title || opts.title)}</h1>${s.intro ? `<p>${esc(s.intro)}</p>` : ""}</div>
    ${opts.afterHero ?? ""}
    ${toc}
    ${sections}
    ${key}`;
}

/** أنماط صفحة الملخّص (ألوان مُصمتة: طباعة آيفون تحوّل الشفافية إلى سواد) */
function summaryCss(rtl: boolean): string {
  const start = rtl ? "right" : "left";
  return `
    * { font-family: -apple-system, 'SF Arabic', 'Geeza Pro', sans-serif; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 34px 36px; }
    html, body { margin: 0; background: #fff; color: #1F2937; }
    .hero { background: #4338CA; color: #fff; border-radius: 20px; padding: 26px 28px; margin-bottom: 18px; }
    .hero .book { font-size: 12.5px; color: #C7D2FE; font-weight: 700; }
    .hero h1 { font-size: 26px; margin: 6px 0 8px; line-height: 1.45; color: #fff; }
    .hero p { font-size: 14.5px; line-height: 1.9; margin: 0; color: #E0E7FF; }
    .toc { border: 1.5px solid #E5E7EB; border-radius: 16px; padding: 14px 18px; margin-bottom: 20px; background: #F9FAFB; break-inside: avoid; page-break-inside: avoid; }
    .toch { font-weight: 900; font-size: 14px; color: #4338CA; margin-bottom: 6px; }
    .toc ol { margin: 0; padding-${start}: 20px; columns: 2; column-gap: 24px; }
    .toc li { font-size: 13px; line-height: 1.9; color: #374151; }
    section { margin-bottom: 18px; }
    .lead { break-inside: avoid; page-break-inside: avoid; }
    h2 { display: flex; align-items: center; gap: 10px; font-size: 19px; margin: 18px 0 6px; line-height: 1.5; page-break-after: avoid; }
    h2 .num { color: #fff; width: 28px; height: 28px; border-radius: 9px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
    h2 .se { font-size: 20px; }
    .rule { height: 3px; border-radius: 2px; margin-bottom: 12px; }
    p { font-size: 14.5px; line-height: 2; margin: 0 0 10px; text-align: justify; }
    .lt { font-weight: 900; font-size: 15px; margin: 4px 0 8px; }
    .list { margin: 6px 0 12px; break-inside: avoid; }
    ul { list-style: none; margin: 0; padding: 0; }
    ul li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.9; margin-bottom: 6px; }
    .bul { width: 22px; height: 22px; border-radius: 7px; font-size: 12px; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 4px; }
    .tw { margin: 8px 0 14px; break-inside: avoid; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1.5px solid #E5E7EB; border-radius: 14px; overflow: hidden; font-size: 13.5px; }
    th { color: #fff; font-weight: 900; padding: 9px 10px; text-align: ${start}; }
    td { padding: 9px 10px; line-height: 1.75; border-top: 1px solid #E5E7EB; vertical-align: top; }
    td.first { font-weight: 800; }
    .exq { background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 12px; padding: 10px 14px; margin: 10px 0 0; font-size: 14.5px; line-height: 1.9; break-inside: avoid; }
    .sol { background: #ECFDF5; border: 1.5px solid #34D399; border-radius: 12px; padding: 10px 14px; margin: 6px 0 12px; font-size: 14.5px; line-height: 1.9; color: #065F46; break-inside: avoid; }
    .sol ol { margin: 4px 0; padding-${start}: 20px; } .solh { font-weight: 900; color: #047857; margin-top: 4px; }
    .sol .ans { font-weight: 900; color: #064E3B; font-size: 15.5px; } .sol .qt { font-style: italic; color: #374151; margin-top: 6px; padding-${start}: 10px; border-${start}: 3px solid #34D399; }
    .case { background: #F5F3FF; border: 1px solid #DDD6FE; border-radius: 12px; padding: 10px 14px; margin: 10px 0 6px; font-size: 14.5px; line-height: 1.9; }
    .an { background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 12px; padding: 10px 14px; margin: 6px 0 12px; font-size: 14.5px; line-height: 1.95; }
    .anh { font-weight: 900; color: #B45309; }
    .def { background: #F9FAFB; border: 1px solid #E5E7EB; border-${start}: 5px solid; border-radius: 12px; padding: 10px 14px; margin: 8px 0 12px; font-size: 14.5px; line-height: 1.9; break-inside: avoid; }
    .box { border-radius: 14px; padding: 11px 14px; margin: 8px 0 12px; font-size: 14.5px; line-height: 1.95; break-inside: avoid; border: 1.5px solid; }
    .ex { background: #ECFDF5; border-color: #A7F3D0; }
    .hard { background: #EFF6FF; border-color: #BFDBFE; }
    .imp { background: #FFFBEB; border-color: #FCD34D; font-weight: 700; }
    .tag { display: inline-block; color: #fff; font-size: 11.5px; font-weight: 900; padding: 2px 10px; border-radius: 999px; margin-${rtl ? "left" : "right"}: 8px; }
    .key { background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 18px; padding: 16px 20px; margin-top: 22px; break-inside: avoid; }
    .keyh { font-weight: 900; font-size: 17px; color: #15803D; margin-bottom: 8px; }
    .key ol { margin: 0; padding-${start}: 22px; }
    .key li { font-size: 14.5px; line-height: 1.95; }
    .foot { margin-top: 20px; color: #9CA3AF; font-size: 11px; text-align: center; }
`;
}

export function summaryHtml(opts: { bookTitle: string; title: string; summary: StudySummary; rtl: boolean }): string {
  if (opts.summary.table) return tableSummaryHtml({ bookTitle: opts.bookTitle, title: opts.title, table: opts.summary.table });
  const dir = opts.rtl ? "rtl" : "ltr";
  return `<!doctype html><html dir="${dir}" lang="${opts.rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>${summaryCss(opts.rtl)}</style></head><body>
    ${summaryBody(opts)}
    <div class="foot">VoiceStudyFlow</div>
  </body></html>`;
}

/**
 * ملف المذاكرة: ملخّصات وحدات الكتاب كلها بالترتيب في ملف واحد — غلاف، فهرس الوحدات،
 * ثم كل وحدة تبدأ في صفحة جديدة بشريط «الوحدة n». بدل طلب الملخّص صفحة صفحة وجمعه يدويًا.
 */
export function studyFileHtml(opts: { bookTitle: string; units: { title: string; summary: StudySummary; mindmapSvg?: string }[]; rtl: boolean }): string {
  const { rtl } = opts;
  // كل الوحدات بالشكل الجدولي → ملف عرضي: غلاف، ثم صفحة جدول لكل وحدة (مثل مذكّرة نهلة)
  if (opts.units.length && opts.units.every((u) => u.summary.table)) {
    const L2 = rtl ? { file: "ملف المذاكرة", unit: "الوحدة", n: "عدد الوحدات" } : { file: "Study file", unit: "Unit", n: "Units" };
    const pages = opts.units
      .map((u, i) => `<div class="tpage">${tableBodyHtml(u.summary.table!, { badge: `${L2.unit} ${i + 1}`, title: u.title })}</div>`)
      .join("");
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${TABLE_CSS}
      .cover { background: #312E81; color: #fff; border-radius: 22px; padding: 70px 40px; text-align: center; margin-top: 90px; page-break-after: always; }
      .cover .k { font-size: 15px; color: #C7D2FE; font-weight: 800; } .cover h1 { font-size: 32px; margin: 12px 0; color: #fff; } .cover .s { font-size: 15px; color: #E0E7FF; }
      .tpage { page-break-after: always; } .tpage:last-of-type { page-break-after: auto; }
    </style></head><body><div class="cover"><div class="k">${L2.file}</div><h1>${esc(opts.bookTitle)}</h1><div class="s">${L2.n}: ${opts.units.length}</div></div>${pages}<div class="foot">VoiceStudyFlow</div></body></html>`;
  }
  const dir = rtl ? "rtl" : "ltr";
  const start = rtl ? "right" : "left";
  const L = rtl
    ? { file: "ملف المذاكرة", sub: "ملخّص شامل لكل وحدات الكتاب بالترتيب", toc: "الوحدات", unit: "الوحدة", n: "عدد الوحدات", mm: "الخريطة الذهنية للوحدة" }
    : { file: "Study file", sub: "A complete summary of every unit, in order", toc: "Units", unit: "Unit", n: "Units", mm: "Unit mind map" };
  const toc = opts.units.map((u, i) => `<li><span class="un">${i + 1}</span>${esc(u.title)}</li>`).join("");
  const units = opts.units
    .map(
      (u, i) => `<div class="unit"><div class="ubar"><span class="unum">${L.unit} ${i + 1}</span><span class="ut">${esc(u.title)}</span></div>${u.summary.table ? `<style>${TABLE_CSS.replace(/@page[^}]*}/, "")}</style>${tableBodyHtml(u.summary.table, { title: u.title })}` : summaryBody({
        bookTitle: opts.bookTitle,
        title: u.title,
        summary: u.summary,
        rtl,
        // ترتيب الوحدة: العنوان الكبير، ثم خريطتها الذهنية، ثم محتويات الملخّص
        afterHero: u.mindmapSvg ? `<div class="mm"><div class="mmh">${L.mm}</div>${u.mindmapSvg}</div>` : undefined,
      })}</div>`
    )
    .join("");
  return `<!doctype html><html dir="${dir}" lang="${rtl ? "ar" : "en"}"><head><meta charset="utf-8"><style>${summaryCss(rtl)}
    .cover { background: #312E81; color: #fff; border-radius: 24px; padding: 60px 40px; text-align: center; margin-top: 120px; }
    .cover .k { font-size: 15px; color: #C7D2FE; font-weight: 800; letter-spacing: .5px; }
    .cover h1 { font-size: 34px; margin: 12px 0; color: #fff; line-height: 1.4; }
    .cover .s { font-size: 15px; color: #E0E7FF; }
    .utoc { border: 1.5px solid #E5E7EB; border-radius: 18px; padding: 18px 22px; margin-top: 28px; background: #F9FAFB; page-break-after: always; }
    .utoc .h { font-weight: 900; font-size: 17px; color: #312E81; margin-bottom: 10px; }
    .utoc ol { list-style: none; margin: 0; padding: 0; }
    .utoc li { display: flex; gap: 12px; align-items: center; font-size: 14.5px; line-height: 1.8; padding: 7px 0; border-bottom: 1px solid #E5E7EB; }
    .un { width: 26px; height: 26px; border-radius: 8px; background: #4338CA; color: #fff; font-weight: 900; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
    .unit { page-break-before: always; }
    .unit:first-of-type { page-break-before: auto; }
    .ubar { display: flex; align-items: center; gap: 12px; border-${start}: 6px solid #4338CA; background: #EEF2FF; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; }
    .unum { background: #4338CA; color: #fff; font-weight: 900; font-size: 13px; padding: 3px 12px; border-radius: 999px; }
    .ut { font-weight: 900; font-size: 16px; color: #312E81; }
    .mm { border: 1.5px solid #E5E7EB; border-radius: 18px; padding: 12px 10px 6px; margin-bottom: 18px; background: #fff; break-inside: avoid; page-break-inside: avoid; }
    .mmh { font-weight: 900; font-size: 15px; color: #4338CA; text-align: center; margin-bottom: 4px; }
    .mm svg { display: block; width: 100%; height: auto; }
  </style></head><body>
    <div class="cover"><div class="k">${L.file}</div><h1>${esc(opts.bookTitle)}</h1><div class="s">${L.sub} · ${L.n}: ${opts.units.length}</div></div>
    <div class="utoc"><div class="h">${L.toc}</div><ol>${toc}</ol></div>
    ${units}
    <div class="foot">VoiceStudyFlow</div>
  </body></html>`;
}
