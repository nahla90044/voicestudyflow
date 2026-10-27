// lib/unitHeadings.ts
// وحدات الكتاب من «رأس الصفحة المتكرر» (كتب المقررات: كل صفحة يعلوها «الوحدة الثالثة: …»).
// كان الاستخراج القديم يأخذ أول سطر يبدأ بـ«الوحدة» في كل صفحة ويزيل المكرر حرفيًا فقط، فتتكرر الوحدة
// لاختلاف مسافة قبل النقطتين، وتدخل أسطر صفحة الفهرس وأسطر العناوين الداخلية كوحدات بصفحة أو صفحتين.
// هنا: مفتاح الوحدة = كلمتها مع ترتيبها («الوحدة|الثالثة») بعد توحيد الكتابة، وصفحات الفهرس مستثناة،
// والوحدة لا تُعتمد إلا إن تكررت في رؤوس صفحاتها، وتمتد من أول صفحة لها حتى بداية التي بعدها.

export type HeadingUnit = { title: string; page: number; to: number; level: number };

const KIND = "(?:الوحدة|الوحده|الفصل|الباب|الجزء|المحاضرة|المحاضره|chapter|unit|part)";
const ORD =
  "(?:الأول(?:ى)?|الاول(?:ى)?|الثاني(?:ة|ه)?|الثالث(?:ة|ه)?|الرابع(?:ة|ه)?|الخامس(?:ة|ه)?|السادس(?:ة|ه)?|السابع(?:ة|ه)?|الثامن(?:ة|ه)?|التاسع(?:ة|ه)?|العاشر(?:ة|ه)?" +
  "|الحادي(?:ة|ه)?|الحاديه|الحادية|الثاني(?:ة|ه)?|[0-9٠-٩]+|[ivxlc]+)";
// «الوحدة الحادية عشرة» = ترتيب من كلمتين
const HEAD = new RegExp(`^\\s*(${KIND})\\s+(${ORD}(?:\\s+(?:عشر(?:ة|ه)?|والعشرون|و?العشرون))?)\\s*(?:[:：\\-–—.]\\s*(.*))?$`, "i");

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

type Hit = { key: string; label: string; title: string };

/** رأس وحدة في سطر واحد، أو null */
export function parseHeading(line: string): Hit | null {
  const m = line.normalize("NFKC").replace(/\s+/g, " ").trim().match(HEAD);
  if (!m) return null;
  const label = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
  return { key: norm(label), label, title: (m[3] ?? "").replace(/[.:،\s]+$/, "").trim() };
}

/**
 * الوحدات من نصوص صفحات الكتاب. pages: [{page, text}] لكل الكتاب.
 * يُرجع [] إن لم يكن للكتاب رأس وحدة متكرر (فيُستعمل مصدر آخر).
 */
export function unitsFromRunningHeads(pages: { page: number; text: string }[], total: number): HeadingUnit[] {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  type Agg = { first: number; count: number; label: string; titles: Map<string, number> };
  const units = new Map<string, Agg>();
  for (const p of sorted) {
    const lines = String(p.text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    // صفحة فهرس: تذكر ثلاث وحدات مختلفة فأكثر → لا تُحسب بداية لأي وحدة
    const keysHere = new Set(lines.map(parseHeading).filter(Boolean).map((h) => h!.key));
    if (keysHere.size >= 3) continue;
    const hit = lines.slice(0, 5).map(parseHeading).find(Boolean);
    if (!hit) continue;
    const a = units.get(hit.key) ?? { first: p.page, count: 0, label: hit.label, titles: new Map<string, number>() };
    a.count++;
    if (hit.title) a.titles.set(hit.title, (a.titles.get(hit.title) ?? 0) + 1);
    units.set(hit.key, a);
  }
  // الرأس المتكرر: الوحدة تظهر في ثلاث صفحات فأكثر (العناوين الداخلية العابرة لا تُعدّ وحدات)
  const real = [...units.values()].filter((u) => u.count >= 3).sort((a, b) => a.first - b.first);
  if (real.length < 2) return [];
  return real.map((u, i) => {
    const best = [...u.titles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const to = i + 1 < real.length ? real[i + 1].first - 1 : Math.max(u.first, total || u.first);
    return { title: best ? `${u.label}: ${best}` : u.label, page: u.first, to: Math.max(u.first, to), level: 0 };
  });
}

// ===== صفحات عناوين الوحدات، وفهرس بلا أرقام صفحات =====
// كتب كثيرة (مقررات الجامعة الإلكترونية مثلًا) تبدأ كل وحدة بصفحة عنوان قصيرة: «الوحدة الأولى — معنى التنفيذ…»
// ثم «أهداف الوحدة». ورأس الصفحة المتكرر فيها قد يكون خاطئًا (صفحات الوحدة الأولى يعلوها «الوحدة الثانية»)،
// وفهرسها يذكر الوحدات بلا أرقام صفحات. صفحة العنوان هي العلامة الأوثق لبداية الوحدة.

const HEAD_ANY = new RegExp(`(${KIND})\\s+(${ORD}(?:\\s+(?:عشر(?:ة|ه)?|والعشرون|و?العشرون))?)(?![\\p{L}])`, "giu");

/** كل عناوين الوحدات في نص (أينما وقعت، لا في أول السطر فقط) بالترتيب */
export function findHeadings(text: string): { key: string; label: string; index: number; end: number }[] {
  const t = String(text || "").normalize("NFKC").replace(/\s+/g, " ");
  const out: { key: string; label: string; index: number; end: number }[] = [];
  for (const m of t.matchAll(HEAD_ANY)) {
    const label = `${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim();
    out.push({ key: norm(label), label, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

const ORD_ROOTS: [RegExp, number][] = [
  [/^(ال)?(اول|حادي)/, 1],
  [/^(ال)?ثاني/, 2],
  [/^(ال)?ثالث/, 3],
  [/^(ال)?رابع/, 4],
  [/^(ال)?خامس/, 5],
  [/^(ال)?سادس/, 6],
  [/^(ال)?سابع/, 7],
  [/^(ال)?ثامن/, 8],
  [/^(ال)?تاسع/, 9],
  [/^(ال)?عاشر/, 10],
];
/** رقم الترتيب من مفتاح الوحدة («الوحده الحاديه عشره» → ١١)، أو null */
export function ordinalOf(key: string): number | null {
  const parts = key.split(" ").slice(1);
  if (!parts.length) return null;
  if (/^[0-9]+$/.test(parts[0])) return Number(parts[0]);
  const r = ORD_ROOTS.find(([re]) => re.test(parts[0]));
  if (!r) return null;
  const rest = parts.slice(1).join(" ");
  if (/عشرون/.test(rest)) return r[1] === 10 ? 20 : 20 + r[1];
  if (/عشر/.test(rest)) return 10 + r[1];
  return r[1];
}

/**
 * الفهرس (ولو بلا أرقام صفحات): أول صفحة في أول الكتاب تذكر ٣ وحدات مختلفة فأكثر، ومعها الصفحات التالية
 * المتصلة بها التي تكمل القائمة (فهرس على صفحتين). يُستخرج منها ترتيب الوحدات وعناوينها الكاملة.
 */
export function tocTitles(pages: { page: number; text: string }[]): { key: string; label: string; title: string }[] {
  const head = [...pages].sort((a, b) => a.page - b.page).slice(0, 30);
  const flat = (p: { text: string }) => String(p.text || "").normalize("NFKC").replace(/\s+/g, " ");
  const start = head.findIndex((p) => new Set(findHeadings(flat(p)).map((h) => h.key)).size >= 3);
  if (start < 0) return [];
  const seen = new Set<string>();
  const out: { key: string; label: string; title: string }[] = [];
  for (let i = start; i < head.length; i++) {
    const t = flat(head[i]);
    const hs = findHeadings(t);
    const fresh = hs.filter((h) => !seen.has(h.key));
    if (i > start && new Set(fresh.map((h) => h.key)).size < 2) break; // انتهت صفحات الفهرس
    hs.forEach((h, k) => {
      if (seen.has(h.key)) return;
      seen.add(h.key);
      const raw = t.slice(h.end, k + 1 < hs.length ? hs[k + 1].index : undefined);
      let title = raw.replace(/^[\s:：\-–—.]+/, "").replace(/\.{2,}.*$/, "").replace(/[\s.…:،0-9٠-٩]+$/, "").trim();
      // قوس ناقص في الفهرس نفسه («… الولائي والمكاني)») لا يُترك مكسورًا في العنوان
      if ((title.match(/\)/g) ?? []).length > (title.match(/\(/g) ?? []).length) title = title.replace(/\)\s*$/, "").trim();
      out.push({ key: h.key, label: h.label, title });
    });
  }
  return out;
}

/**
 * بدايات الوحدات من صفحات عناوينها: صفحة قصيرة (بعد حذف رأس الصفحة لا يبقى إلا العنوان) تذكر «الوحدة …».
 * تُؤخذ آخر وحدة مذكورة فيها (الرأس المتكرر يأتي أولًا ثم عنوان الصفحة الحقيقي).
 * names: عناوين الفهرس (إن وُجد) لتسمية الوحدات بعناوينها الكاملة.
 */
export function unitsFromDividers(pages: { page: number; text: string }[], total: number, names: { key: string; label: string; title: string }[] = []): HeadingUnit[] {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  // إن كان للكتاب صفحات «أهداف الوحدة»: صفحة العنوان الحقيقية تسبقها مباشرة (لا صفحة خريطة أو صفحة قصيرة عابرة)
  const OBJ = /اهداف الوحد/;
  const objPages = new Set(sorted.filter((p) => OBJ.test(norm(String(p.text || "")))).map((p) => p.page));
  const useObj = objPages.size >= 2;
  // وإن كان للكتاب فهرس بعناوين وحدات: لا تُقبل إلا وحداته («المحاضرة الثالثة» ليست وحدة)
  const allowed = names.length >= 3 ? new Set(names.map((n) => n.key)) : null;
  const firstAt = new Map<string, { page: number; label: string; tail: string }>();
  for (const p of sorted) {
    const t = String(p.text || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!t || t.length > 320) continue;
    if (useObj && (objPages.has(p.page) || !(objPages.has(p.page + 1) || objPages.has(p.page + 2)))) continue;
    const hs = findHeadings(t);
    if (!hs.length || new Set(hs.map((h) => h.key)).size >= 3) continue;
    const h = hs[hs.length - 1];
    if (allowed && !allowed.has(h.key)) continue;
    if (firstAt.has(h.key)) continue;
    firstAt.set(h.key, { page: p.page, label: h.label, tail: t.slice(h.end).replace(/^[\s:：\-–—.]+/, "").trim() });
  }
  const list = [...firstAt.entries()].sort((a, b) => a[1].page - b[1].page);
  if (list.length < 2) return [];
  return list.map(([key, u], i) => {
    const named = names.find((n) => n.key === key);
    const title = named?.title || u.tail.slice(0, 120);
    const to = i + 1 < list.length ? list[i + 1][1].page - 1 : Math.max(u.page, total || u.page);
    return { title: title ? `${named?.label ?? u.label}: ${title}` : u.label, page: u.page, to: Math.max(u.page, to), level: 0 };
  });
}

// ===== عنوان الوحدة في أول سطور صفحتها (٢٧ أكتوبر) =====
// كتب مثل «قانون التأمين» (الجامعة السعودية الإلكترونية): كل وحدة تبدأ بصفحة طويلة أولها «المقدمة / الوحدة الأولى /
// عنوانها» ثم النص مباشرة (لا صفحة عنوان قصيرة)، وداخل كل وحدة «المحاضرة الأولى/الثانية/الثالثة» تتكرر — فكان
// الرأس المتكرر يعدّ المحاضرات وحدات (الأولى، الثالثة، الثانية) ويُسقط الوحدات الخمس عشرة. وبعض عناوين الوحدات
// مكسورة في طبقة النص («الوحدةال سادسة»، «الوحدةا خلامسةعشرة») فتُملأ من موضعها بين جارتيها.

const UNIT_KIND = /^(?:الوحده|الفصل|الباب|chapter|unit)(?:\s|$)/i; // ‎\b لا يعمل مع الحروف العربية
const ORD_WORDS = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];
/** «الوحدة» + ترتيبها بالكلمات (١ → الأولى، ١٥ → الخامسة عشرة، ٢٠ → العشرون) */
export function ordinalLabel(n: number, kind = "الوحدة"): string {
  if (n <= 10) return `${kind} ${ORD_WORDS[n]}`;
  if (n === 11) return `${kind} الحادية عشرة`;
  if (n < 20) return `${kind} ${ORD_WORDS[n - 10]} عشرة`;
  if (n === 20) return `${kind} العشرون`;
  return `${kind} ${n}`;
}

/** عنوان مكسور في طبقة نص PDF («خصائ صعقدالتأم ني»): كلمة ملتصقة طويلة جدًا، أو قطعة حرفين ليست كلمة شائعة */
const SHORT_OK = new Set(["و", "في", "من", "عن", "او", "أو", "لا", "ما", "ان", "إن", "أن", "هو", "هي", "به", "له", "مع", "ثم", "قد", "كل", "تم"]);
export function brokenTitle(t: string): boolean {
  const toks = String(t || "").split(/[\s،,:–—\-()]+/).filter((x) => /[\u0600-\u06FF]/.test(x));
  return toks.some((x) => x.length >= 13) || toks.some((x) => x.length <= 2 && !SHORT_OK.has(x));
}

/** سطر قصير يبدأ بـ«الوحدة» ولو انكسرت مسافاته (للملء بين وحدتين معروفتين) */
const looseUnitLine = (line: string) => {
  const ns = norm(line).replace(/\s+/g, "");
  return line.length <= 40 && /^الوحده/.test(ns);
};

export function unitsFromStartLines(pages: { page: number; text: string }[], total: number): HeadingUnit[] {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  type Hit = { ord: number | null; page: number; label: string; title: string };
  const hits: Hit[] = [];
  for (const p of sorted) {
    const text = String(p.text || "");
    // صفحة فهرس (ثلاث وحدات مختلفة فأكثر) لا تُعدّ بداية
    if (new Set(findHeadings(text).map((h) => h.key)).size >= 3) continue;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
    for (let i = 0; i < lines.length && i < 3; i++) {
      const h = parseHeading(lines[i]);
      const next = (lines[i + 1] ?? "").replace(/\s+/g, " ").trim();
      // العنوان المكسور يُترك (يبقى رقم الوحدة، ويكتب المنهج عنوانها من محتواها)
      const titleFrom = (t: string) => (t && t.length <= 140 && !/^(?:المقدمه|المقدمة|املقدمة)$/.test(t) && !brokenTitle(t) ? t : "");
      if (h && UNIT_KIND.test(h.key)) {
        hits.push({ ord: ordinalOf(h.key), page: p.page, label: h.label, title: h.title || titleFrom(next) });
        break;
      }
      if (!h && looseUnitLine(lines[i])) {
        hits.push({ ord: null, page: p.page, label: "", title: titleFrom(next) });
        break;
      }
    }
  }
  // ترقيم يُعاد من أوله («الفصل الأول» ثانيةً بعد الرابع) = أقسام متداخلة (أبواب فيها فصول): المصدر غير موثوق هنا
  const seenOrd = new Set<string>();
  for (const h of hits) {
    if (h.ord == null) continue;
    const k = `${h.label.split(" ")[0]}|${h.ord}`;
    if (seenOrd.has(k)) return [];
    seenOrd.add(k);
  }
  // تسلسل متزايد من العناوين المقروءة (أول ظهور لكل ترتيب)
  const strict: Hit[] = [];
  for (const h of hits) {
    if (h.ord == null) continue;
    const last = strict[strict.length - 1];
    if (!last || (h.ord > last.ord! && h.page > last.page)) strict.push(h);
  }
  if (strict.length < 3 || strict[0].ord! > 2) return [];
  // الملء: ترتيب ناقص بين جارتين، أو بعد الأخيرة، من سطر «الوحدة…» مكسور في موضعه
  const loose = hits.filter((h) => h.ord == null);
  const out: Hit[] = [];
  const take = (ord: number, from: number, to: number) => {
    const c = loose.find((l) => l.page > from && l.page < to);
    if (c) out.push({ ...c, ord, label: ordinalLabel(ord, strict[0].label.split(" ")[0] || "الوحدة") });
    return c;
  };
  if (strict[0].ord === 2) take(1, 0, strict[0].page);
  strict.forEach((s, i) => {
    out.push(s);
    const nx = strict[i + 1];
    if (nx) for (let o = s.ord! + 1; o < nx.ord!; o++) take(o, out[out.length - 1].page, nx.page);
  });
  let lastHit = out[out.length - 1];
  for (let o = lastHit.ord! + 1; ; o++) {
    const c = take(o, lastHit.page, Infinity);
    if (!c) break;
    lastHit = out[out.length - 1];
  }
  out.sort((a, b) => a.page - b.page);
  // التسلسل بعد الملء يجب أن يكون كاملًا (١، ٢، ٣ …) وإلا فالمصدر غير موثوق
  if (!out.every((h, i) => h.ord === out[0].ord! + i)) return [];
  return out.map((h, i) => {
    const to = i + 1 < out.length ? out[i + 1].page - 1 : Math.max(h.page, total || h.page);
    return { title: h.title ? `${h.label}: ${h.title}` : h.label, page: h.page, to: Math.max(h.page, to), level: 0 };
  });
}
