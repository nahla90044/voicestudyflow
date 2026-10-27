// lib/formulaSheetCore.ts
// «ورقة المعادلات» لكل وحدة في كتب الشهادات المهنية (قرار نهلة ٢٧ أكتوبر): كل معادلة باسمها ومقابله،
// ومعنى كل رمز، ومثال محلول خطوة بخطوة من الوحدة، والخطأ الشائع. منطق خالص مُختبَر: القراءة والطباعة.
import { parseJsonLenient } from "./jsonRepair.ts";

export type Formula = { name: string; formula: string; symbols: [string, string][]; steps: string[]; example?: string; tip?: string };

const str = (v: unknown) => String(v ?? "").trim();

export function parseFormulas(raw: string): Formula[] {
  const m = String(raw ?? "").match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return [];
  let o: any = null;
  try {
    o = parseJsonLenient(m[0]);
  } catch {
    return [];
  }
  const arr: any[] = Array.isArray(o) ? o : Array.isArray(o?.items) ? o.items : [];
  const seen = new Set<string>();
  return arr
    .map((x): Formula | null => {
      const name = str(x?.name);
      const formula = str(x?.formula);
      if (!name || !formula) return null;
      const symbols = (Array.isArray(x?.symbols) ? x.symbols : [])
        .map((s: any): [string, string] | null => {
          const a = str(Array.isArray(s) ? s[0] : s?.s ?? s?.symbol);
          const b = str(Array.isArray(s) ? s[1] : s?.m ?? s?.meaning);
          return a && b ? [a, b] : null;
        })
        .filter((s: [string, string] | null): s is [string, string] => !!s)
        .slice(0, 8);
      const steps = (Array.isArray(x?.steps) ? x.steps : []).map(str).filter(Boolean).slice(0, 6);
      const f: Formula = { name, formula, symbols, steps };
      const example = str(x?.example);
      const tip = str(x?.tip);
      if (example) f.example = example;
      if (tip) f.tip = tip;
      return f;
    })
    .filter((f): f is Formula => {
      if (!f) return false;
      const k = f.formula.replace(/\s+/g, "").toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 15);
}

const esc = (x: string) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ورقة المعادلات للطباعة: بطاقة لكل معادلة، الصيغة في إطار، والرموز جدول صغير، والمثال خطوات (ألوان مُصمتة) */
export function formulasHtml(units: { title: string; items: Formula[] }[], L: { title: string; symbols: string; example: string; tip: string }): string {
  const card = (f: Formula, i: number) =>
    `<div class="fc"><div class="fn"><span class="n">${i + 1}</span>${esc(f.name)}</div>` +
    `<div class="ff" dir="ltr">${esc(f.formula)}</div>` +
    (f.symbols.length ? `<table class="fs"><tr><th colspan="2">${esc(L.symbols)}</th></tr>${f.symbols.map(([a, b]) => `<tr><td dir="ltr">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table>` : "") +
    (f.example || f.steps.length
      ? `<div class="fe"><b>${esc(L.example)}:</b> ${esc(f.example ?? "")}${f.steps.map((s) => `<div class="st">${esc(s)}</div>`).join("")}</div>`
      : "") +
    (f.tip ? `<div class="ft">⚠️ ${esc(f.tip)}</div>` : "") +
    `</div>`;
  const body = units
    .filter((u) => u.items.length)
    .map((u) => `<h2>${esc(u.title)}</h2>${u.items.map(card).join("")}`)
    .join("");
  const css = `body{font-family:-apple-system,"Geeza Pro",sans-serif;margin:28px;color:#1d2330}
h1{font-size:20pt;margin:0 0 12px}h2{font-size:13pt;background:#eef2ff;color:#3730a3;padding:6px 10px;border-radius:8px;margin:18px 0 8px}
.fc{border:1.5px solid #c7d2fe;border-radius:12px;padding:10px 12px;margin:0 0 10px;break-inside:avoid;background:#fbfcff}
.fn{font-weight:800;font-size:12pt;margin-bottom:6px}.n{display:inline-block;background:#4f46e5;color:#fff;border-radius:6px;padding:0 7px;margin-inline-end:6px}
.ff{font-size:13pt;font-weight:800;color:#3730a3;background:#eef2ff;border-radius:8px;padding:6px 10px;text-align:center;margin:4px 0 8px}
.fs{border-collapse:collapse;font-size:10pt;margin:0 0 8px}.fs th{background:#f1f5f9;text-align:start;padding:3px 8px}.fs td{border-top:1px solid #e2e8f0;padding:3px 8px}
.fe{font-size:10.5pt;line-height:1.6}.st{padding-inline-start:12px}.ft{margin-top:6px;border:1.5px dashed #f43f5e;border-radius:8px;padding:4px 8px;color:#9a2a12;font-weight:700;font-size:10pt}`;
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body><h1>${esc(L.title)}</h1>${body}</body></html>`;
}
