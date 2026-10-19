// lib/askHistory.ts
// محادثات «كتابك يجيب» محفوظة لكل كتاب على حدة (لا خلط بين الكتب):
//  • المحادثة الحالية تستمر ما دام الاستخدام متصلًا؛ بعد ٢٤ ساعة بلا أسئلة تبدأ محادثة جديدة تلقائيًا
//    وتبقى القديمة في «المحادثات السابقة».
//  • حذف إجابة، أو محادثة كاملة، وطباعة إجابة أو محادثة (PDF للحفظ/المشاركة/الطباعة).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { QAAnswer } from "./bookQA";

export type AskTurn = { id: number; q: string; a?: QAAnswer; error?: boolean; saved?: boolean; waiting?: boolean };
export type AskSession = { id: string; startedAt: number; updatedAt: number; turns: AskTurn[] };

/** مدة الخمول التي تبدأ بعدها محادثة جديدة */
export const NEW_SESSION_AFTER_MS = 24 * 3600_000;
const MAX_SESSIONS = 50;
const key = (bookId: string) => `vsf:ask:v1:${bookId}`;

export async function loadSessions(bookId: string): Promise<AskSession[]> {
  try {
    const raw = await AsyncStorage.getItem(key(bookId));
    const list = raw ? (JSON.parse(raw) as AskSession[]) : [];
    return Array.isArray(list) ? list.filter((s) => s && Array.isArray(s.turns)) : [];
  } catch {
    return [];
  }
}

async function store(bookId: string, list: AskSession[]): Promise<void> {
  // المحادثات الفارغة لا تُحفظ، والأقدم يُحذف بعد الحد
  const kept = list.filter((s) => s.turns.length > 0).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
  await AsyncStorage.setItem(key(bookId), JSON.stringify(kept)).catch(() => {});
}

/** المحادثة الحالية: آخر محادثة إن لم يمضِ عليها يوم بلا استخدام، وإلا محادثة جديدة فارغة */
export async function currentSession(bookId: string): Promise<AskSession> {
  const list = await loadSessions(bookId);
  const last = list.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (last && Date.now() - last.updatedAt < NEW_SESSION_AFTER_MS) return last;
  return newSession();
}

export function newSession(): AskSession {
  const now = Date.now();
  return { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, startedAt: now, updatedAt: now, turns: [] };
}

/** يحفظ المحادثة (الإجابات المكتملة فقط؛ ما زال قيد الكتابة لا يُحفظ) */
export async function saveSession(bookId: string, s: AskSession): Promise<void> {
  const turns = s.turns.filter((t) => t.a || t.error);
  const list = (await loadSessions(bookId)).filter((x) => x.id !== s.id);
  list.push({ ...s, turns, updatedAt: turns.length ? Date.now() : s.updatedAt });
  await store(bookId, list);
}

export async function deleteSession(bookId: string, sessionId: string): Promise<void> {
  await store(bookId, (await loadSessions(bookId)).filter((x) => x.id !== sessionId));
}

/* ------------------------------ الطباعة ------------------------------ */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

export type AskPdfLabels = { title: string; bookTitle: string; dateLabel: string; question: string; answer: string; pages: string; rtl: boolean };

function html(turns: AskTurn[], L: AskPdfLabels): string {
  const items = turns
    .filter((t) => t.a)
    .map((t, i) => {
      const pages = t.a!.cites.map((c) => c.page).join("، ");
      return `<section class="qa">
        <div class="q"><span class="n">${i + 1}</span><b>${esc(L.question)}:</b> ${esc(t.q)}</div>
        <div class="a"><b>${esc(L.answer)}:</b><br>${esc(t.a!.text)}</div>
        ${pages ? `<div class="pg">${esc(L.pages)}: ${esc(pages)}</div>` : ""}
      </section>`;
    })
    .join("");
  return `<!doctype html><html dir="${L.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@600;800&family=Noto+Naskh+Arabic:wght@400;600&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 15mm 13mm; }
    body { font-family: "Noto Naskh Arabic", "Geeza Pro", -apple-system, sans-serif; color: #2A2838; font-size: 12pt; line-height: 1.8; margin: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover { border-radius: 18px; padding: 16px 20px; margin-bottom: 16px; background: #EEF6EF; border: 1px solid #D5EAD9; }
    .cover h1 { margin: 0; font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 20pt; color: #1F4D2E; }
    .cover .sub { color: #5D6B60; font-size: 10.5pt; }
    .qa { border: 1px solid #E7E5F2; border-radius: 14px; padding: 12px 16px; margin-bottom: 12px; page-break-inside: avoid; }
    .q { color: #1F4D2E; font-family: "Noto Kufi Arabic", "Geeza Pro", sans-serif; font-size: 11.5pt; margin-bottom: 6px; }
    .n { display: inline-block; min-width: 22px; text-align: center; background: #2F7D4A; color: #fff; border-radius: 999px; margin-inline-end: 6px; font-size: 9.5pt; }
    .a { background: #FAFAF6; border-radius: 10px; padding: 8px 12px; }
    .pg { color: #6B6880; font-size: 9.5pt; margin-top: 6px; }
  </style></head><body>
  <div class="cover"><h1>${esc(L.title)}</h1><div class="sub">${esc(L.bookTitle)} · ${esc(L.dateLabel)}</div></div>
  ${items}</body></html>`;
}

/** ينشئ PDF للإجابة أو المحادثة ويفتح الحفظ/المشاركة/الطباعة */
export async function exportAskPdf(turns: AskTurn[], L: AskPdfLabels): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: html(turns, L) });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: L.title });
  else await Print.printAsync({ uri });
}
