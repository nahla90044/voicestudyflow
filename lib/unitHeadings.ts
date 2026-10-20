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
