// lib/wordsPdf.ts
// ملف PDF مرتّب من «كلماتي»: مجمّع حسب الكتاب، لكل كلمة المعنى والمرادفات والأضداد
// وجمل الاستخدام. يُنشأ على الجهاز ثم يُفتح خيار الحفظ/المشاركة (الملفات، البريد…)
// فيبقى مع الطالب حتى بلا إنترنت.
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { SavedWord } from "./words";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  rtl: boolean;
};

export function wordsHtml(words: SavedWord[], L: Labels): string {
  const groups = new Map<string, SavedWord[]>();
  for (const w of words) {
    const k = w.bookTitle || L.general;
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }
  const card = (w: SavedWord) => {
    const i = w.info;
    const chips = (xs: string[], cls: string) => xs.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join(" ");
    return `<div class="word">
      <div class="head"><span class="w">${esc(w.word)}</span>${i?.pos ? `<span class="pos">${esc(i.pos)}</span>` : ""}${w.page ? `<span class="pg">${w.page}</span>` : ""}</div>
      ${i ? `<p><b>${L.meaning}:</b> ${esc(i.meaning)}</p>` : ""}
      ${i?.usage ? `<p><b>${L.usage}:</b> ${esc(i.usage)}</p>` : ""}
      ${i?.synonyms.length ? `<p><b>${L.synonyms}:</b> ${chips(i.synonyms, "syn")}</p>` : ""}
      ${i?.antonyms.length ? `<p><b>${L.antonyms}:</b> ${chips(i.antonyms, "ant")}</p>` : ""}
      ${i?.examples.length ? `<p><b>${L.examples}:</b></p><ul>${i.examples.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      ${i?.verb ? `<p><b>${L.verb}:</b> ${L.infinitive}: <b>${esc(i.verb.infinitive)}</b>${i.verb.noun ? ` · ${L.noun}: <b>${esc(i.verb.noun)}</b>` : ""}${i.verb.participle ? ` · <b>${esc(i.verb.participle)}</b>` : ""}</p>
        <div class="tenses">${i.verb.tenses.map((tn) => `<div class="tense"><div class="tn">${esc(tn.name)}</div><div class="forms" dir="auto">${tn.forms.map(esc).join("<br>")}</div>${tn.example ? `<div class="tex" dir="auto">${esc(tn.example)}</div>` : ""}</div>`).join("")}</div>` : ""}
      ${!i && w.context ? `<p class="ctx">«${esc(w.context)}»</p>` : ""}
    </div>`;
  };
  const sections = [...groups.entries()]
    .map(([book, ws]) => `<h2>${esc(book)} <small>(${ws.length})</small></h2>${ws.sort((a, b) => a.word.localeCompare(b.word)).map(card).join("")}`)
    .join("");
  return `<!doctype html><html dir="${L.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>
    @page { margin: 18mm 14mm; }
    body { font-family: -apple-system, "Geeza Pro", "Helvetica Neue", sans-serif; color: #1d1b2a; font-size: 12pt; }
    .cover { border-bottom: 3px solid #7C6CFF; padding-bottom: 10px; margin-bottom: 18px; }
    h1 { font-size: 24pt; margin: 0; color: #4b3fd1; }
    .sub { color: #6b6880; margin-top: 4px; }
    h2 { font-size: 15pt; color: #4b3fd1; margin: 22px 0 8px; border-bottom: 1px solid #e3e0f5; padding-bottom: 4px; }
    h2 small { color: #8e8aa6; font-weight: normal; }
    .word { border: 1px solid #e6e3f3; border-radius: 10px; padding: 10px 12px; margin: 8px 0; page-break-inside: avoid; }
    .head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 4px; }
    .w { font-size: 15pt; font-weight: 800; color: #2a2368; }
    .pos { font-size: 9.5pt; color: #fff; background: #7C6CFF; border-radius: 9px; padding: 1px 8px; }
    .pg { font-size: 9.5pt; color: #6b6880; }
    p { margin: 4px 0; line-height: 1.6; }
    ul { margin: 2px 0; padding-inline-start: 18px; } li { margin: 2px 0; }
    .chip { display: inline-block; border-radius: 9px; padding: 1px 8px; margin: 1px; font-size: 10.5pt; }
    .syn { background: #e3fbf3; color: #127a5a; } .ant { background: #fff0e6; color: #a5521c; }
    .ctx { color: #6b6880; font-style: italic; }
    .tenses { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }
    .tense { background: #f6f5fc; border-radius: 8px; padding: 6px 8px; font-size: 10.5pt; }
    .tn { color: #127a5a; font-weight: 800; margin-bottom: 2px; }
    .tex { color: #4b3fd1; margin-top: 4px; font-style: italic; }
  </style></head><body>
    <div class="cover"><h1>${esc(L.title)}</h1><div class="sub">${esc(L.subtitle)}</div></div>
    ${sections}
  </body></html>`;
}

/** يُنشئ الملف ويفتح الحفظ/المشاركة. يُرجع false إن لم تتوفر المشاركة على الجهاز. */
export async function exportWordsPdf(words: SavedWord[], L: Labels): Promise<boolean> {
  const { uri } = await Print.printToFileAsync({ html: wordsHtml(words, L) });
  if (!(await Sharing.isAvailableAsync())) {
    await Print.printAsync({ uri });
    return false;
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: L.title });
  return true;
}
