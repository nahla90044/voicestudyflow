// lib/questionFilesCore.ts
// ملفات الأسئلة الجاهزة (قرار نهلة ٢٥ أكتوبر) — منطق خالص مُختبَر:
// تقسيم نص الملف لأجزاء، قراءة ردّ الاستخراج، ربط «مفتاح الإجابات» المنفصل بأسئلته (أ/ب، 1/2، a/b، صح/خطأ،
// أو نص الخيار)، حذف المكرر، وما يحتاج حلًّا من الكتاب، وتحويل السؤال لصيغة الاختبار.
import { parseJsonLenient } from "./jsonRepair.ts";

export type QFType = "mcq" | "tf" | "fill" | "essay";
export type QFQuestion = {
  n: string;
  q: string;
  type: QFType;
  options: string[];
  /** رقم الخيار الصحيح، أو -1 إن لم يُعرف بعد */
  answer: number;
  answerText?: string;
  unit: number;
  why?: string;
  quote?: string;
  /** مصدر الجواب: من الملف نفسه، أو حلّه الذكاء من الكتاب */
  from?: "file" | "book";
  sure?: boolean;
};

/** أجزاء نص الملف (~١٢ ألف حرف)، مع رقم أول صفحة وآخرها لكل جزء */
export function chunkPages(pages: { page: number; text: string }[], max = 12000): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of pages) {
    const t = (p.text || "").trim();
    if (!t) continue;
    if (cur && cur.length + t.length > max) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n\n" : "") + t;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
const norm = (s: string) =>
  toLatin(String(s ?? ""))
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();

const TYPES: QFType[] = ["mcq", "tf", "fill", "essay"];

/** يقرأ ردّ الاستخراج (أو ما اكتمل منه) */
export function parseExtract(raw: string): { questions: QFQuestion[]; key: Record<string, string> } {
  let o: any = null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      o = parseJsonLenient(m[0]);
    } catch {}
  }
  const arr: any[] = Array.isArray(o?.questions) ? o.questions : [];
  const questions = arr
    .map((x): QFQuestion | null => {
      const q = String(x?.q ?? "").trim();
      if (!q) return null;
      const type = (TYPES.includes(x?.type) ? x.type : Array.isArray(x?.options) && x.options.length >= 2 ? "mcq" : "essay") as QFType;
      let options = Array.isArray(x?.options) ? x.options.map((y: unknown) => String(y ?? "").trim()).filter(Boolean) : [];
      if (type === "tf" && options.length < 2) options = ["صح", "خطأ"];
      const a = Number(x?.answer);
      const answer = Number.isInteger(a) && a >= 0 && a < options.length ? a : -1;
      const out: QFQuestion = { n: toLatin(String(x?.n ?? "").trim()), q, type, options, answer, unit: Number.isInteger(Number(x?.unit)) ? Number(x.unit) : -1 };
      const at = String(x?.answerText ?? "").trim();
      if (at) out.answerText = at;
      if (answer >= 0) out.from = "file";
      return out;
    })
    .filter((x): x is QFQuestion => !!x);
  const key: Record<string, string> = {};
  if (o?.key && typeof o.key === "object") for (const [k, v] of Object.entries(o.key)) if (String(v ?? "").trim()) key[toLatin(k.trim())] = String(v).trim();
  return { questions, key };
}

const LETTERS = [
  ["ا", "a", "1"],
  ["ب", "b", "2"],
  ["ج", "c", "3"],
  ["د", "d", "4"],
  ["ه", "e", "5"],
  ["و", "f", "6"],
];

/** جواب من مفتاح الإجابات («ب»، «2»، «c»، «صح»، أو نص الخيار) → رقم الخيار، أو -1 */
export function answerIndex(ans: string, q: Pick<QFQuestion, "type" | "options">): number {
  const a = norm(ans);
  const isTf = q.type === "tf" || (q.options.length === 2 && /صح|خطا/.test(norm(q.options.join(" "))));
  // ✓ و× رموز تُحذف عند التطبيع: تُفحص قبله
  if (isTf && /^[✓✔√]$/.test(ans.trim())) return 0;
  if (isTf && /^[×✗✘xX]$/.test(ans.trim())) return 1;
  if (!a) return -1;
  if (isTf) {
    if (/^(صح|صحيح|صحيحه|true|t|نعم)$/.test(a)) return 0;
    if (/^(خطا|خاطي|خاطيه|false|f|لا)$/.test(a)) return 1;
  }
  const first = a.split(" ")[0];
  for (let i = 0; i < Math.min(q.options.length, LETTERS.length); i++) if (LETTERS[i].includes(first) && (a.length <= 2 || a === first)) return i;
  // نص الخيار نفسه
  const hit = q.options.findIndex((o) => norm(o) === a || (a.length > 3 && norm(o).includes(a)));
  return hit;
}

/** يطبّق مفاتيح الإجابات المجمّعة من كل الأجزاء على الأسئلة التي بلا جواب (بالرقم) */
export function applyKeys(qs: QFQuestion[], key: Record<string, string>): QFQuestion[] {
  return qs.map((q) => {
    if (q.answer >= 0 || !q.n || !(q.n in key)) return q;
    if (q.options.length < 2) return { ...q, answerText: q.answerText || key[q.n] };
    const i = answerIndex(key[q.n], q);
    return i >= 0 ? { ...q, answer: i, from: "file" } : q;
  });
}

/** حذف المكرر (نفس نص السؤال)؛ يبقى الأكمل جوابًا */
export function dedupe(qs: QFQuestion[]): QFQuestion[] {
  const seen = new Map<string, number>();
  const out: QFQuestion[] = [];
  for (const q of qs) {
    const k = norm(q.q);
    const j = seen.get(k);
    if (j === undefined) {
      seen.set(k, out.length);
      out.push(q);
    } else if (out[j].answer < 0 && q.answer >= 0) out[j] = q;
  }
  return out;
}

/** يحتاج حلًّا من الكتاب: بلا جواب، أو بلا خيارات (أكمل/مقالي) */
export const needsSolve = (q: QFQuestion) => q.answer < 0 || q.options.length < 2;

/** يطبّق ردّ الحلّ على الأسئلة (بأرقامها في المجموعة المرسلة) */
export function applySolve(qs: QFQuestion[], idx: number[], raw: string): QFQuestion[] {
  let arr: any[] = [];
  const m = raw.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const v = parseJsonLenient(m[0]);
      if (Array.isArray(v)) arr = v;
    } catch {}
  }
  const out = [...qs];
  for (const s of arr) {
    const i = Number(s?.i);
    if (!Number.isInteger(i) || i < 0 || i >= idx.length) continue;
    const q = { ...out[idx[i]] };
    const opts = Array.isArray(s?.options) ? s.options.map((y: unknown) => String(y ?? "").trim()).filter(Boolean) : [];
    if (q.options.length < 2 && opts.length >= 2) q.options = opts;
    const a = Number(s?.answer);
    if (Number.isInteger(a) && a >= 0 && a < q.options.length) {
      // جواب الملف (إن وُجد) لا يُستبدل
      if (q.answer < 0 || q.from !== "file") {
        q.answer = a;
        q.from = q.from === "file" ? "file" : "book";
      }
    }
    if (String(s?.why ?? "").trim()) q.why = String(s.why).trim();
    if (String(s?.quote ?? "").trim()) q.quote = String(s.quote).trim();
    if (s?.sure === false) q.sure = false;
    out[idx[i]] = q;
  }
  return out;
}

/** قائمة وحدات المقرر لتعليمات الاستخراج (رقم: عنوان — مواضيعه) */
export function unitsHint(units: { title: string; topics?: string[] }[]): string {
  return units.map((u, i) => `${i}: ${u.title}${u.topics?.length ? ` — ${u.topics.slice(0, 6).join("، ")}` : ""}`).join("\n");
}

/** الأسئلة الجاهزة للاختبار (لها خيارات وجواب) من وحدات مختارة، بخلط وعدد */
export function pickForQuiz(qs: QFQuestion[], units: number[] | null, count: number | null, rnd: () => number = Math.random): QFQuestion[] {
  const ok = qs.filter((q) => q.options.length >= 2 && q.answer >= 0 && (!units || units.includes(q.unit)));
  const a = [...ok];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return count ? a.slice(0, count) : a;
}
