// lib/questionFiles.ts
// ملفات الأسئلة الجاهزة (قرار نهلة ٢٥ أكتوبر): يرفع الطالب ملف أسئلة PDF لكتابه، فيقرأ التطبيق صفحاته،
// ويستخرج كل سؤال كما هو (وجوابه إن كان في الملف أو في مفتاح الإجابات)، ويربطه بوحدته، ثم يحلّ ما لا جواب
// له من **نص الكتاب** مع سبب واقتباس. التقدّم يُحفظ في جدول question_files أولًا بأول، فيكمل من حيث توقف
// إن أُغلق التطبيق، ويتزامن بين أجهزة الطالب. منه تُبنى اختبارات المراجعة (unit-quiz بوضع qbank).
import * as DocumentPicker from "expo-document-picker";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";

import { aiAssist, checkBook } from "./ai";
import { getUserId } from "./auth";
import { getCurrentLang } from "./i18n";
import { dict } from "./i18n/strings";
import "./notify";
import { extractPdfPageText } from "./pdfText";
import { applyKeys, applySolve, chunkPages, dedupe, needsSolve, parseExtract, unitsHint, type QFQuestion } from "./questionFilesCore";
import { supabase } from "./supabase";
import { getBookText, getSyllabus } from "./syllabus";
import { summaryParts } from "./unitSummary";

export type QFile = {
  id: string;
  book_id: string;
  pdf_path: string;
  name: string;
  pages: number;
  status: "reading" | "solving" | "ready" | "failed";
  done_chunks: number;
  total_chunks: number;
  questions: (QFQuestion & { tried?: boolean })[];
  meta: { key?: Record<string, string> };
  created_at: string;
};

export type QFProgress = { id: string; stage: "upload" | "check" | "pages" | "extract" | "solve" | "done" | "failed"; done: number; total: number; error?: string };

const t = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;
const MAX_BYTES = 60 * 1024 * 1024;
const PER_SOLVE = 20;

export async function listQFiles(bookId: string): Promise<QFile[]> {
  const { data, error } = await supabase.from("question_files").select("*").eq("book_id", bookId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QFile[];
}

export async function removeQFile(f: QFile): Promise<void> {
  await supabase.from("question_files").delete().eq("id", f.id);
  await supabase.storage.from("pdfs").remove([f.pdf_path]).catch(() => {});
}

/* ---------- تشغيل في الخلفية (يكمل بعد مغادرة الشاشة) ---------- */

const running = new Map<string, Promise<void>>();
const listeners = new Set<(p: QFProgress) => void>();
const last = new Map<string, QFProgress>();
function emit(p: QFProgress) {
  last.set(p.id, p);
  listeners.forEach((fn) => fn(p));
}
export function watchQFiles(fn: (p: QFProgress) => void): () => void {
  listeners.add(fn);
  last.forEach((p) => fn(p));
  return () => listeners.delete(fn);
}
export const isQFileRunning = (id: string) => running.has(id);

async function save(id: string, patch: Partial<QFile>) {
  await supabase.from("question_files").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** يختار ملف PDF ويرفعه ويفحصه ويُنشئ سجلّه. null = ألغى الطالب الاختيار */
export async function pickAndUpload(bookId: string, onStage: (s: "upload" | "check") => void): Promise<QFile | { error: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const file = res.assets[0];
  if ((file.size ?? 0) > MAX_BYTES) return { error: t("qfile.err.size") };
  const userId = await getUserId();
  if (!userId) return { error: t("qfile.err.generic") };
  onStage("upload");
  const path = `${userId}/${Date.now()}_q${Math.random().toString(36).slice(2, 10)}.pdf`;
  const buffer = await fetch(file.uri).then((r) => r.arrayBuffer());
  const { error: upErr } = await supabase.storage.from("pdfs").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { error: t("qfile.err.generic") };
  // الفحص الإلزامي نفسه للكتب (الأوامر الخفية والمحتوى) — ودوال القراءة لا تعمل بدونه
  onStage("check");
  const chk = await checkBook(path);
  if (chk.status !== "allow") {
    await supabase.storage.from("pdfs").remove([path]).catch(() => {});
    return { error: chk.status === "error" ? t("qfile.err.check") : chk.advice || t("qfile.err.blocked") };
  }
  const name = (file.name || "").replace(/\.pdf$/i, "").trim() || t("qfile.untitled");
  const { data, error } = await supabase.from("question_files").insert({ book_id: bookId, pdf_path: path, name }).select("*").single();
  if (error || !data) return { error: t("qfile.err.generic") };
  return data as QFile;
}

/** عدد صفحات الملف ونصوصها (القراءة الضوئية تلقائية للمصوّر) */
async function readPages(f: QFile, onPage: (done: number, total: number) => void): Promise<{ page: number; text: string }[]> {
  const first = await extractPdfPageText(f.pdf_path, 1);
  const total = Math.max(1, first.totalPages || f.pages || 1);
  if (total !== f.pages) await save(f.id, { pages: total });
  const out: { page: number; text: string }[] = [{ page: 1, text: first.text || "" }];
  let done = 1;
  onPage(done, total);
  const pages = Array.from({ length: total - 1 }, (_, i) => i + 2);
  // ٤ صفحات معًا: أسرع دون إغراق الخادم
  for (let i = 0; i < pages.length; i += 4) {
    const batch = await Promise.all(pages.slice(i, i + 4).map((p) => extractPdfPageText(f.pdf_path, p).then((r) => ({ page: p, text: r.text || "" })).catch(() => ({ page: p, text: "" }))));
    out.push(...batch);
    done += batch.length;
    onPage(done, total);
  }
  return out.sort((a, b) => a.page - b.page);
}

/** عدد الطلبات المتوقع قبل البدء (أجزاء الاستخراج + الحلّ تقريبًا) */
export function estimateRequests(chunks: number): number {
  return chunks + Math.max(1, Math.ceil(chunks / 2));
}

/**
 * يعالج الملف حتى يجهز (أو يكمل من حيث توقف). confirm يُسأل مرة بعدد الطلبات المتوقع بعد قراءة الصفحات.
 * يعمل في الخلفية: مغادرة الشاشة لا توقفه، وإشعار عند الانتهاء.
 */
export function processQFile(f: QFile, bookPdf: string, confirm: (n: number) => Promise<boolean>): Promise<void> {
  const cur = running.get(f.id);
  if (cur) return cur;
  const p = run(f, bookPdf, confirm).finally(() => running.delete(f.id));
  running.set(f.id, p);
  return p;
}

async function run(f0: QFile, bookPdf: string, confirm: (n: number) => Promise<boolean>): Promise<void> {
  let f = { ...f0 };
  activateKeepAwakeAsync("qfile").catch(() => {});
  try {
    const units = (await getSyllabus(bookPdf).catch(() => null))?.data.units ?? [];
    const hint = unitsHint(units);
    let qs = [...(f.questions ?? [])];
    const key = { ...(f.meta?.key ?? {}) };

    if (f.status === "reading") {
      emit({ id: f.id, stage: "pages", done: 0, total: f.pages || 1 });
      const pages = await readPages(f, (done, total) => emit({ id: f.id, stage: "pages", done, total }));
      const chunks = chunkPages(pages);
      if (!chunks.length) throw new Error("EMPTY");
      if (f.done_chunks === 0 && !(await confirm(estimateRequests(chunks.length)))) {
        emit({ id: f.id, stage: "failed", done: 0, total: 0, error: "CANCELLED" });
        return;
      }
      await save(f.id, { total_chunks: chunks.length });
      for (let i = f.done_chunks; i < chunks.length; i++) {
        emit({ id: f.id, stage: "extract", done: i, total: chunks.length });
        const raw = await aiAssist("qextract", `وحدات المقرر (رقم: عنوان — مواضيع):\n${hint || "(لا منهج بعد: unit = -1)"}\n\nنص ملف الأسئلة (الجزء ${i + 1} من ${chunks.length}):\n${chunks[i]}`, undefined, undefined, undefined, 180000);
        const got = parseExtract(raw);
        qs = [...qs, ...got.questions];
        Object.assign(key, got.key);
        // حفظ بعد كل جزء: يكمل من هنا إن أُغلق التطبيق
        await save(f.id, { questions: qs, done_chunks: i + 1, meta: { ...f.meta, key } });
        f = { ...f, done_chunks: i + 1 };
      }
      qs = dedupe(applyKeys(qs, key));
      await save(f.id, { questions: qs, status: "solving" });
      f.status = "solving";
    }

    if (f.status === "solving") {
      // ما لا جواب له يُحلّ من نص وحدته في الكتاب (مجموعات من ٢٠ سؤالًا)
      const byUnit = new Map<number, number[]>();
      qs.forEach((q, i) => {
        if (needsSolve(q) && !q.tried) byUnit.set(q.unit, [...(byUnit.get(q.unit) ?? []), i]);
      });
      const groups: { unit: number; idx: number[] }[] = [];
      byUnit.forEach((idx, unit) => {
        for (let k = 0; k < idx.length; k += PER_SOLVE) groups.push({ unit, idx: idx.slice(k, k + PER_SOLVE) });
      });
      const ctxCache = new Map<number, string>();
      for (let g = 0; g < groups.length; g++) {
        emit({ id: f.id, stage: "solve", done: g, total: groups.length });
        const { unit, idx } = groups[g];
        let ctx = ctxCache.get(unit);
        if (ctx === undefined) {
          ctx =
            unit >= 0 && units[unit]
              ? (await summaryParts(bookPdf, { kind: "unit", unit }).catch(() => [] as string[])).join("\n\n").slice(0, 24000)
              : await getBookText(bookPdf, 24000).catch(() => "");
          ctxCache.set(unit, ctx);
        }
        const list = idx.map((i, j) => ({ i: j, q: qs[i].q, options: qs[i].options, ...(qs[i].answerText ? { hint: qs[i].answerText } : {}) }));
        const raw = await aiAssist("qsolve", `نص الكتاب:\n${ctx || "(غير متاح)"}\n\nالأسئلة:\n${JSON.stringify(list)}`, undefined, undefined, undefined, 180000);
        qs = applySolve(qs, idx, raw);
        idx.forEach((i) => (qs[i] = { ...qs[i], tried: true }));
        await save(f.id, { questions: qs });
      }
      await save(f.id, { questions: qs, status: "ready" });
    }
    emit({ id: f.id, stage: "done", done: 1, total: 1 });
    notify(f.name, true);
  } catch (e) {
    const msg = (e as Error).message;
    // الحصة أو الشبكة: يبقى الملف كما هو ويكمل لاحقًا من حيث توقف (لا يُعلَّم فاشلًا)
    emit({ id: f0.id, stage: "failed", done: 0, total: 0, error: msg });
    if (msg === "EMPTY") await save(f0.id, { status: "failed" });
  } finally {
    deactivateKeepAwake("qfile");
  }
}

async function notify(name: string, ok: boolean) {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: ok ? t("qfile.notify.done") : t("qfile.notify.fail"), body: name, sound: "default" },
      trigger: null,
    });
  } catch {}
}

/** أسئلة كل ملفات الكتاب الجاهزة (للاختبار) */
export async function bookQuestions(bookId: string): Promise<QFQuestion[]> {
  const files = await listQFiles(bookId).catch(() => [] as QFile[]);
  return files.flatMap((f) => f.questions ?? []);
}
