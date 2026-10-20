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
