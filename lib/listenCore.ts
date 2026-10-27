// lib/listenCore.ts
// «تمارين الاستماع» لكتب اللغة (قرار نهلة ٢٧ أكتوبر — بلا محادثة): جملة من الدرس تُسمع بصوت أصلي،
// وكلمة منها مخفية يختارها الطالب من أربعة خيارات. منطق خالص مُختبَر وبلا ذكاء ولا تكلفة طلبات:
// الجمل والخيارات من نص الدرس نفسه.
import { isLatinText } from "./langLessonCore.ts";

export type ListenItem = { sentence: string; masked: string; answer: string; options: string[]; answerIndex: number };

/** كلمات وظيفية لا تُخفى (إخفاؤها لا يقيس الاستماع) */
const STOP = new Set(
  "le la les l un une des de du d et à au aux en y ne pas que qui se ce c il elle on je j tu nous vous ils elles me te the a an of to in and is are on at it be".split(" ")
);

const clean = (w: string) => w.replace(/^[«"'(\[]+|[»"'),.;:!?\]]+$/g, "");
const key = (w: string) => clean(w).toLowerCase();

/** جمل الدرس الصالحة للاستماع: بلغة لاتينية، من ٤ إلى ١٦ كلمة، بلا فراغات تمارين ولا أرقام كثيرة */
export function sentencesOf(text: string, max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of String(text ?? "").split(/(?<=[.!?…])\s+|\n+/)) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s || !isLatinText(s) || /_{2,}|\.{3,}|\(\s*\w+\s*\)\s*_/.test(s)) continue;
    const words = s.split(" ");
    if (words.length < 4 || words.length > 16) continue;
    if ((s.match(/\d/g) ?? []).length > 3) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** الكلمة المخفية: كلمة محتوى (٣ أحرف فأكثر، لا وظيفية)، والأطول أرجح */
export function pickBlank(sentence: string, rnd: () => number = Math.random): { index: number; word: string; masked: string } | null {
  const words = sentence.split(" ");
  const cands = words.map((w, i) => ({ w, i, k: key(w) })).filter((x) => x.k.length >= 3 && !STOP.has(x.k) && /\p{L}/u.test(x.k));
  if (!cands.length) return null;
  // ترجيح الأطول: نختار من النصف الأطول
  const sorted = [...cands].sort((a, b) => b.k.length - a.k.length);
  const pool = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  const c = pool[Math.floor(rnd() * pool.length)];
  const word = clean(c.w);
  const masked = words.map((w, i) => (i === c.i ? w.replace(word, "＿＿＿") : w)).join(" ");
  return { index: c.i, word, masked };
}

/** خيارات مضلِّلة من كلمات الدرس نفسه: طول قريب، ونهاية متشابهة إن أمكن (mangé/regardé، mangeons/avons) */
export function distractors(word: string, pool: string[], n = 3, rnd: () => number = Math.random): string[] {
  const w = word.toLowerCase();
  const tail = w.slice(-2);
  const uniq = new Map<string, string>();
  for (const p of pool) {
    const c = clean(p);
    const k = c.toLowerCase();
    if (k.length < 3 || k === w || STOP.has(k) || !/\p{L}/u.test(k) || uniq.has(k)) continue;
    uniq.set(k, c);
  }
  const scored = [...uniq.values()].map((c) => {
    const k = c.toLowerCase();
    const s = (k.endsWith(tail) ? 2 : 0) + (Math.abs(k.length - w.length) <= 2 ? 1 : 0) + rnd() * 0.9;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map((x) => x.c);
}

/** تمارين الاستماع من نص الدرس: count جملة، لكل جملة كلمة مخفية وأربعة خيارات مخلوطة */
export function makeListenItems(text: string, count = 10, rnd: () => number = Math.random): ListenItem[] {
  const sents = sentencesOf(text);
  const pool = sents.flatMap((s) => s.split(" "));
  // ترتيب عشوائي للجمل
  const order = sents.map((s) => ({ s, r: rnd() })).sort((a, b) => a.r - b.r).map((x) => x.s);
  const out: ListenItem[] = [];
  for (const s of order) {
    const b = pickBlank(s, rnd);
    if (!b) continue;
    // لا خيار مضلِّل من كلمات الجملة نفسها (يظهر أمام الطالب فيصير الاختيار سهلًا أو ملتبسًا)
    const inSentence = new Set(s.split(" ").map(key));
    const ds = distractors(b.word, pool.filter((p) => !inSentence.has(key(p))), 3, rnd);
    if (ds.length < 3) continue;
    const opts = [b.word, ...ds].map((o) => ({ o, r: rnd() })).sort((a, b2) => a.r - b2.r).map((x) => x.o);
    out.push({ sentence: s, masked: b.masked, answer: b.word, options: opts, answerIndex: opts.indexOf(b.word) });
    if (out.length >= count) break;
  }
  return out;
}
