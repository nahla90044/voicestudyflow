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
import { applyKeys, applySolve, chunkPages, dedupe, dropKnown, needsBook, parseExtract, SOLVE_GROUP, unitsHint, type QConfirm, type QFQuestion } from "./questionFilesCore";

export { batchConfirm, type QConfirm } from "./questionFilesCore";
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
  questions: QFQuestion[];
  meta: { key?: Record<string, string>; dropped?: number };
  created_at: string;
};

export type QFProgress = { id: string; stage: "upload" | "check" | "pages" | "extract" | "solve" | "done" | "failed"; done: number; total: number; error?: string };

const t = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;
const MAX_BYTES = 60 * 1024 * 1024;
const PER_SOLVE = SOLVE_GROUP;
/** طلبات تعمل معًا (استخراج أو تحقق): أسرع دون إغراق الخادم */
const PARALLEL = 3;

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

/** يرفع ملفًا واحدًا ويفحصه ويُنشئ سجلّه */
async function uploadOne(bookId: string, userId: string, file: DocumentPicker.DocumentPickerAsset, onStage: (s: "upload" | "check") => void): Promise<QFile | { error: string }> {
  const name = (file.name || "").replace(/\.pdf$/i, "").trim() || t("qfile.untitled");
  if ((file.size ?? 0) > MAX_BYTES) return { error: `${name}: ${t("qfile.err.size")}` };
  onStage("upload");
  const path = `${userId}/${Date.now()}_q${Math.random().toString(36).slice(2, 10)}.pdf`;
  const buffer = await fetch(file.uri).then((r) => r.arrayBuffer());
  const { error: upErr } = await supabase.storage.from("pdfs").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { error: `${name}: ${t("qfile.err.generic")}` };
  // الفحص الإلزامي نفسه للكتب (الأوامر الخفية والمحتوى) — ودوال القراءة لا تعمل بدونه
  onStage("check");
  const chk = await checkBook(path);
  if (chk.status !== "allow") {
    await supabase.storage.from("pdfs").remove([path]).catch(() => {});
    return { error: `${name}: ${chk.status === "error" ? t("qfile.err.check") : chk.advice || t("qfile.err.blocked")}` };
  }
  const { data, error } = await supabase.from("question_files").insert({ book_id: bookId, pdf_path: path, name }).select("*").single();
  if (error || !data) return { error: `${name}: ${t("qfile.err.generic")}` };
  return data as QFile;
}

/**
 * يختار ملف PDF واحدًا أو عدة ملفات معًا (قرار نهلة ٢٦ أكتوبر)، ويرفعها ويفحصها واحدًا واحدًا.
 * null = ألغى الطالب الاختيار. onStage يُبلغ المرحلة ورقم الملف الحالي من المجموع.
 */
export async function pickAndUpload(
  bookId: string,
  onStage: (s: "upload" | "check", i: number, n: number) => void
): Promise<{ files: QFile[]; errors: string[] } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: true });
  if (res.canceled || !res.assets?.length) return null;
  const userId = await getUserId();
  if (!userId) return { files: [], errors: [t("qfile.err.generic")] };
  const files: QFile[] = [];
  const errors: string[] = [];
  for (let i = 0; i < res.assets.length; i++) {
    const r = await uploadOne(bookId, userId, res.assets[i], (s) => onStage(s, i + 1, res.assets.length)).catch(() => ({ error: t("qfile.err.generic") }));
    if ("error" in r) errors.push(r.error);
    else files.push(r);
  }
  return { files, errors };
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

/** عدد الطلبات المتوقع قبل البدء: أجزاء الاستخراج + التحقق من كل الأجوبة من الكتاب (نحو ٣٠ سؤالًا لكل جزء) */
export function estimateRequests(chunks: number): number {
  return chunks + Math.max(1, Math.ceil((chunks * 30) / SOLVE_GROUP));
}

/**
 * يعالج الملف حتى يجهز (أو يكمل من حيث توقف). confirm يُسأل مرة بعدد الطلبات المتوقع بعد قراءة الصفحات.
 * يعمل في الخلفية: مغادرة الشاشة لا توقفه، وإشعار عند الانتهاء.
 */
export function processQFile(f: QFile, bookPdf: string, confirm: QConfirm): Promise<void> {
  const cur = running.get(f.id);
  if (cur) return cur;
  const p = run(f, bookPdf, confirm).finally(() => running.delete(f.id));
  running.set(f.id, p);
  return p;
}

async function run(f0: QFile, bookPdf: string, confirm: QConfirm): Promise<void> {
  let f = { ...f0 };
  let asked = false;
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
      if (f.done_chunks === 0) {
        asked = true;
        if (!(await confirm(estimateRequests(chunks.length)))) {
          emit({ id: f.id, stage: "failed", done: 0, total: 0, error: "CANCELLED" });
          return;
        }
      }
      await save(f.id, { total_chunks: chunks.length });
      // ٣ أجزاء معًا، والحفظ بعد كل دفعة: يكمل من هنا إن أُغلق التطبيق
      for (let i = f.done_chunks; i < chunks.length; i += PARALLEL) {
        emit({ id: f.id, stage: "extract", done: i, total: chunks.length });
        const idx = Array.from({ length: Math.min(PARALLEL, chunks.length - i) }, (_, k) => i + k);
        const raws = await Promise.all(
          idx.map((j) =>
            aiAssist("qextract", `وحدات المقرر (رقم: عنوان — مواضيع):\n${hint || "(لا منهج بعد: unit = -1)"}\n\nنص ملف الأسئلة (الجزء ${j + 1} من ${chunks.length}):\n${chunks[j]}`, undefined, undefined, undefined, 180000)
          )
        );
        for (const raw of raws) {
          const got = parseExtract(raw);
          qs = [...qs, ...got.questions];
          Object.assign(key, got.key);
        }
        const done = i + idx.length;
        await save(f.id, { questions: qs, done_chunks: done, meta: { ...f.meta, key } });
        f = { ...f, done_chunks: done };
      }
      qs = dedupe(applyKeys(qs, key));
      await save(f.id, { questions: qs, status: "solving" });
      f.status = "solving";
    }

    if (f.status === "solving") {
      // المكرر في ملفات الكتاب الأخرى (متحقَّقًا منه) يُحذف هنا: لا يُحلّ مرتين ولا يتكرر في الاختبار
      const others = (await listQFiles(f.book_id).catch(() => [] as QFile[])).filter((o) => o.id !== f.id).flatMap((o) => o.questions ?? []);
      const kept = dropKnown(qs, others);
      if (kept.dropped) {
        qs = kept.questions;
        f.meta = { ...f.meta, dropped: (f.meta?.dropped ?? 0) + kept.dropped };
        await save(f.id, { questions: qs, meta: f.meta });
      }
      // كل سؤال يُعرض على نص وحدته في الكتاب (قرار نهلة ٢٦ أكتوبر): ما لا جواب له يُحلّ، وجواب الملف يُتحقق منه
      const byUnit = new Map<number, number[]>();
      qs.forEach((q, i) => {
        if (needsBook(q)) byUnit.set(q.unit, [...(byUnit.get(q.unit) ?? []), i]);
      });
      const groups: { unit: number; idx: number[] }[] = [];
      byUnit.forEach((idx, unit) => {
        for (let k = 0; k < idx.length; k += PER_SOLVE) groups.push({ unit, idx: idx.slice(k, k + PER_SOLVE) });
      });
      const ctxCache = new Map<number, Promise<string>>();
      const ctxOf = (unit: number) => {
        let c = ctxCache.get(unit);
        if (!c) {
          c =
            unit >= 0 && units[unit]
              ? summaryParts(bookPdf, { kind: "unit", unit }).then((p) => p.join("\n\n").slice(0, 24000), () => "")
              : getBookText(bookPdf, 24000).catch(() => "");
          ctxCache.set(unit, c);
        }
        return c;
      };
      let doneGroups = 0;
      emit({ id: f.id, stage: "solve", done: 0, total: groups.length });
      for (let g = 0; g < groups.length; g += PARALLEL) {
        const batch = groups.slice(g, g + PARALLEL);
        const raws = await Promise.all(
          batch.map(async ({ unit, idx }) => {
            const ctx = await ctxOf(unit);
            const list = idx.map((i, j) => ({
              i: j,
              q: qs[i].q,
              options: qs[i].options,
              ...(qs[i].answer >= 0 && qs[i].options[qs[i].answer] ? { given: qs[i].options[qs[i].answer] } : {}),
              ...(qs[i].answerText ? { hint: qs[i].answerText } : {}),
            }));
            return aiAssist("qsolve", `نص الكتاب:\n${ctx || "(غير متاح)"}\n\nالأسئلة:\n${JSON.stringify(list)}`, undefined, undefined, undefined, 180000);
          })
        );
        batch.forEach(({ idx }, k) => {
          qs = applySolve(qs, idx, raws[k]);
          idx.forEach((i) => (qs[i] = { ...qs[i], tried: true }));
        });
        doneGroups += batch.length;
        emit({ id: f.id, stage: "solve", done: doneGroups, total: groups.length });
        await save(f.id, { questions: qs });
      }
      await save(f.id, { questions: qs, status: "ready" });
    }
    emit({ id: f.id, stage: "done", done: 1, total: 1 });
    notify(f.name, true);
  } catch (e) {
    if (!asked) confirm.skip?.();
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

/** أسئلة كل ملفات الكتاب (للاختبار)، بلا تكرار بين الملفات */
export async function bookQuestions(bookId: string): Promise<QFQuestion[]> {
  const files = await listQFiles(bookId).catch(() => [] as QFile[]);
  return dedupe(files.flatMap((f) => f.questions ?? []));
}
