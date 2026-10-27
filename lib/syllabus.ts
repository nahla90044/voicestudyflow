// lib/syllabus.ts
// منهج دراسي (syllabus) لكل كتاب: وحدات بعناوين ومواضيع ومخرجات تعلّم،
// مع متابعة التقدّم (تشيك ليست). يُولَّد بالذكاء من نص الكتاب ويُخزّن.
import { parseArrayLenient, parseJsonLenient } from "./jsonRepair";
import { recordPerf } from "./perf";
import { verifiedQuestions } from "./qualityCore";
import { guessStudyKind, type StudyKind } from "./studyKindCore";
import { aiAssist } from "./ai";
import { supabase } from "./supabase";

/** about: نبذة قصيرة عمّا تتناوله الوحدة (ليعرف الطالب ما هو مقبل عليه) */
export type SyllabusUnit = { title: string; topics: string[]; outcome?: string; about?: string; objectives?: string[] };
/** ranges: صفحات كل وحدة المتحقَّق منها (من الفهرس) — محفوظة مع المنهج فتصل كل الأجهزة بالصفحات نفسها */
/** kind/kindOk/exam: «نوع الدراسة» للكتاب (قرار ٢٧ أكتوبر) — مخمَّن عند بناء المنهج ويؤكده الطالب؛ محفوظ مع المنهج فيصل كل الأجهزة */
export type Syllabus = {
  title?: string;
  units: SyllabusUnit[];
  tips?: string[];
  ranges?: { from: number; to: number }[];
  kind?: StudyKind;
  kindOk?: boolean;
  exam?: string;
};

export function parseSyllabus(raw: string): Syllabus | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = parseJsonLenient(m[0]) as any;
    const units: SyllabusUnit[] = Array.isArray(obj.units)
      ? obj.units
          .map((u: any) => ({
            title: String(u?.title ?? "").trim(),
            topics: Array.isArray(u?.topics) ? u.topics.map((t: any) => String(t).trim()).filter(Boolean) : [],
            outcome: u?.outcome ? String(u.outcome).trim() : undefined,
            about: u?.about ? String(u.about).trim() : undefined,
            objectives: Array.isArray(u?.objectives) ? u.objectives.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 12) : undefined,
          }))
          .filter((u: SyllabusUnit) => u.title)
      : [];
    if (units.length === 0) return null;
    return {
      title: obj.title ? String(obj.title).trim() : undefined,
      units,
      tips: Array.isArray(obj.tips) ? obj.tips.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

/** يجلب المنهج المخزّن مع حالة الإنجاز (أو null إن لم يُنشأ بعد). */
export async function getSyllabus(
  pdfPath: string
): Promise<{ data: Syllabus; done: boolean[] } | null> {
  const { data } = await supabase
    .from("book_syllabus")
    .select("data,done")
    .eq("pdf_path", pdfPath)
    .maybeSingle();
  if (!data?.data) return null;
  const syl = data.data as Syllabus;
  // وحدات تغيّرت → يُمسح ما بُني على القديمة قبل أن تقرأه أي شاشة
  const { syncSyllabus } = await import("./syllabusSync");
  await syncSyllabus(pdfPath, (syl.units ?? []).map((u) => u.title)).catch(() => {});
  // صفحات الوحدات المحفوظة مع المنهج هي المرجع على كل جهاز (لا حساب تقريبي)
  if (Array.isArray(syl.ranges) && syl.ranges.length === syl.units.length) {
    const { setUnitRanges, getCachedUnitRanges } = await import("./glossary");
    const cur = await getCachedUnitRanges(pdfPath, syl.units.length);
    if (!cur || cur.some((r, i) => r.from !== syl.ranges![i].from || r.to !== syl.ranges![i].to))
      await setUnitRanges(pdfPath, syl.ranges.map((r) => ({ from: r.from, to: r.to, found: true })));
  }
  const done = Array.isArray(data.done) ? (data.done as boolean[]) : [];
  // الإصلاح الذاتي بالخلفية من أي شاشة تقرأ المنهج (مرة لكل نسخة منهج؛ بلا طلب ذكاء)
  void import("./syllabusHeal").then((m) => m.healSyllabus(pdfPath, syl, done)).catch(() => {});
  return { data: syl, done };
}

const normTitle = (s: string) =>
  s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();

/** وحدة الذكاء المطابقة لعنوان من الفهرس: نفس «الوحدة + ترتيبها» إن وُجد، وإلا أكثر تشابه كلمات (٦٠٪ فأكثر) */
function matchUnit(title: string, ai: SyllabusUnit[]): SyllabusUnit | undefined {
  const t = normTitle(title);
  const head = t.split(" ").slice(0, 3).join(" ");
  const byHead = /^(الوحده|الفصل|الباب)/.test(head) ? ai.find((u) => normTitle(u.title).startsWith(head.split(" ").slice(0, head.includes(" عشر") ? 3 : 2).join(" "))) : undefined;
  if (byHead) return byHead;
  const words = new Set(t.split(" ").filter((w) => w.length > 2));
  let best: { u?: SyllabusUnit; score: number } = { score: 0 };
  for (const u of ai) {
    const uw = normTitle(u.title).split(" ").filter((w) => w.length > 2);
    const score = uw.length ? uw.filter((w) => words.has(w)).length / Math.max(words.size, uw.length) : 0;
    if (score > best.score) best = { u, score };
  }
  return best.score >= 0.6 ? best.u : undefined;
}

export type SyllabusStage = "structure" | "check" | "content" | "save";

/**
 * الوكيل يقرأ الكتاب كاملًا قبل بناء الوحدات: الصفحات التي لم تُفتح بعد لا نص لها، وبدونها لا تُرى
 * صفحات عناوين الوحدات (كتاب ٤٤٠ صفحة فُتح منه ٣٢ = وحدتان فقط). المقروء يُحفظ صفحة صفحة،
 * فالانقطاع لا يضيّع شيئًا ويكمل من حيث وقف.
 */
async function readAllPages(pdfPath: string, total: number, onRead?: (done: number, total: number) => void): Promise<void> {
  if (total <= 0) return;
  const have = new Set<number>();
  for (let from = 0; from < 5000; from += 1000) {
    const { data } = await supabase.from("page_cache").select("page").eq("pdf_path", pdfPath).range(from, from + 999);
    (data ?? []).forEach((r: { page: number }) => have.add(Number(r.page)));
    if ((data ?? []).length < 1000) break;
  }
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((p) => !have.has(p));
  if (!missing.length) return;
  const { extractPdfPageText } = await import("./pdfText");
  let done = total - missing.length;
  onRead?.(done, total);
  const queue = [...missing];
  const worker = async () => {
    for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await extractPdfPageText(pdfPath, p);
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      onRead?.(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

/** نص الصفحات الأولى من كل وحدة (أهدافها ومحاضراتها غالبًا هناك) بميزانية ثابتة للطلب الواحد */
async function unitExcerpts(pdfPath: string, units: { page: number; to: number }[]): Promise<string[]> {
  const { unitText } = await import("./unitScope");
  const per = Math.max(500, Math.min(1600, Math.floor(15000 / Math.max(1, units.length))));
  const out: string[] = new Array(units.length).fill("");
  for (let i = 0; i < units.length; i += 4) {
    await Promise.all(
      units.slice(i, i + 4).map(async (u, k) => {
        const t = (await unitText(pdfPath, u.page, Math.min(u.to, u.page + 3)).catch(() => "")).replace(/\s+/g, " ");
        // «أهداف الوحدة» في الكتاب أدق من أي تخمين: المقتطف يبدأ منها إن وُجدت
        const at = t.search(/أهداف\s+(ال)?(وحدة|وحده|فصل|درس)/);
        out[i + k] = (at > 0 ? t.slice(at) : t).slice(0, per);
      })
    );
  }
  return out;
}

/**
 * طلب المنهج كمهمة سيرفر (مثل الملخّص): لا مهلة تقطعه، ولا يوقفه قفل الشاشة، ويتصل بنفس المهمة بعد
 * الرجوع. onWrite: نسبة ما كُتب تقريبًا (لشريط تقدّم حقيقي بدل التوقف عند رقم ثابت).
 */
async function syllabusJob(pdfPath: string, text: string, units: number, onWrite?: (ratio: number) => void, genId?: string): Promise<Syllabus | null> {
  const { jobPart } = await import("./aiJobs");
  const expected = Math.max(1500, units * 420);
  return jobPart<Syllabus>(
    "syllabus",
    text,
    `syl:${pdfPath}`,
    () => null,
    (raw) => parseSyllabus(raw),
    () => {},
    genId ? { genId } : {},
    (chars) => onWrite?.(Math.min(0.97, chars / expected))
  ).catch((e) => {
    const m = (e as Error).message;
    if (m === "USER_QUOTA" || m === "UNSAFE_CONTENT" || m === "ACCOUNT_LOCKED") throw e;
    return null;
  });
}

/**
 * يولّد المنهج ويخزّنه — نفس الطريق في أول إنشاء وفي إعادة الإنشاء:
 * ١) بنية الوحدات من فهرس القارئ نفسه (مدمج/مطبوع متحقَّق منه، أو رأس الصفحة المتكرر)،
 * ٢) فحص صارم للبنية (لا مكرر ولا ترتيب مختل ولا وحدة صفحة أو صفحتين) — المنهج المختل لا يُحفظ أبدًا،
 * ٣) مواضيع كل وحدة وهدفها من صفحاتها هي (طلب ذكي واحد)، ٤) الحفظ وتثبيت صفحات الوحدات.
 * بلا بنية سليمة من الكتاب: يحلّل الذكاء أول الكتاب (كالسابق) ثم تُفحص نتيجته بنفس الفحص.
 */
export async function generateSyllabus(
  pdfPath: string,
  onStage?: (s: SyllabusStage) => void,
  onRead?: (done: number, total: number) => void,
  onWrite?: (ratio: number) => void
): Promise<Syllabus> {
  onStage?.("structure");
  const { data: book } = await supabase.from("books").select("page_count").eq("pdf_path", pdfPath).limit(1).maybeSingle();
  const { data: head } = await supabase.from("page_cache").select("total_pages").eq("pdf_path", pdfPath).limit(1).maybeSingle();
  const total = Number(book?.page_count) || Number(head?.total_pages) || 0;
  await readAllPages(pdfPath, total, onRead);
  const { data: first } = await supabase.from("page_cache").select("text,page").eq("pdf_path", pdfPath).neq("source", "empty").order("page").limit(30);
  const text = (first ?? []).map((p: any) => p.text).join("\n").slice(0, 16000);
  if (text.trim().length < 100) throw new Error("لا يوجد نص كافٍ في الكتاب لبناء المنهج.");

  // ١) الوكيل: ثلاثة مصادر مستقلة — صفحات عناوين الوحدات (التي تسبق «أهداف الوحدة»)، وفهرس القارئ،
  //    ورأس الصفحة المتكرر — تُقارن بفهرس الكتاب (ولو بلا أرقام صفحات) ويُعتمد المتفق معه
  const { getBookToc } = await import("./bookToc");
  const { bookPages } = await import("./glossary");
  const { structureFromPages } = await import("./unitStructure");
  const pages = await bookPages(pdfPath).catch(() => []);
  const bt = await getBookToc(pdfPath, total, true).catch(() => ({ book: [], units: [] }));

  // ٢) الفحص والاختيار: لا مكرر ولا ترتيب مختل ولا وحدة صفحة أو صفحتين، والمطابق للفهرس أولًا
  onStage?.("check");
  const verdict = structureFromPages(pages, total, [{ name: "reader-toc", units: bt.book.filter((c) => c.level === 0) }]);
  const struct = verdict.units;
  if (!verdict.verified) recordPerf("syllabus.unverified", 0, false, struct.length);

  // ٣) المحتوى: مواضيع كل وحدة من صفحاتها هي (طلب واحد)، أو تحليل أول الكتاب إن لم توجد بنية
  onStage?.("content");
  // معرّف جلسة التوليد = بصمة المنهج المحفوظ: إعادة الإنشاء اليدوية تُخصم (طلب واحد)، أما إعادة محاولة
  // فشلت (المحفوظ لم يتغيّر) أو أول إنشاء تعثّر فمجانية برصيد الجزء على السيرفر
  const { syllabusGenId } = await import("./genIdCore");
  const { data: savedSyl } = await supabase.from("book_syllabus").select("data").eq("pdf_path", pdfPath).maybeSingle();
  const genId = syllabusGenId(savedSyl?.data) || undefined;
  let syl: Syllabus | null = null;
  if (struct.length) {
    const ex = await unitExcerpts(pdfPath, struct);
    // الأهداف تُنقل حرفيًا من صفحة «أهداف الوحدة» في الكتاب نفسه (بلا ذكاء: أدق وأسرع)، والذكاء
    // يكتب النبذة والمواضيع والهدف فقط — طلب أصغر بكثير لا يتجاوز وقته
    const { objectivesFrom } = await import("./syllabusHealCore");
    const objectives = struct.map((u) => objectivesFrom(pages, u));
    const brief =
      `هذه وحدات الكتاب الدقيقة (${struct.length} وحدة) من فهرسه، ومع كل وحدة مقتطف من صفحاتها الأولى. ` +
      `أعد المنهج بالوحدات نفسها بالضبط وبالترتيب نفسه وبعناوينها حرفيًا (لا تضف ولا تحذف ولا تدمج)، ` +
      `ولكل وحدة: about نبذة من جملتين بلغة سهلة عمّا تتناوله الوحدة، ` +
      `وtopics محاضراتها أو مواضيعها الفرعية من مقتطفها هي فقط (حتى ٨ مواضيع قصيرة)، وoutcome ما يتعلمه الطالب منها في جملة. ` +
      `أعد JSON بالشكل {"title":"…","units":[{"title":"…","about":"…","topics":["…"],"outcome":"…"}]}.\n\n` +
      struct.map((u, i) => `### ${i + 1}. ${u.title} (ص ${u.page}–${u.to})\n${ex[i]}`).join("\n\n");
    const ai = (await syllabusJob(pdfPath, brief, struct.length, onWrite, genId))?.units ?? [];
    syl = {
      title: "",
      units: struct.map((u, i) => {
        const m = ai.length === struct.length ? ai[i] : matchUnit(u.title, ai);
        const obj = objectives[i].length ? objectives[i] : m?.objectives ?? [];
        return { title: u.title, topics: (m?.topics ?? []).map((x) => String(x).trim()).filter(Boolean), outcome: m?.outcome, about: m?.about, objectives: obj.length ? obj : undefined };
      }),
      tips: [],
    };
  } else {
    const fromAi = await syllabusJob(pdfPath, text, 10, onWrite, genId);
    if (!fromAi?.units.length) throw new Error("تعذّر إنشاء المنهج. يُرجى المحاولة مرة أخرى.");
    // نتيجة الذكاء نفسها تُفحص: لا وحدة مكررة
    const { unitKey } = await import("./unitStructure");
    const seen = new Set<string>();
    syl = { ...fromAi, units: fromAi.units.filter((u) => !seen.has(unitKey(u.title)) && !!seen.add(unitKey(u.title))) };
  }

  // ٤) الحفظ: صفحات الوحدات مثبّتة من البنية (الملخص والاختبار والفيديو والفهرس تعتمدها)
  onStage?.("save");
  // الوحدات الجديدة: يُمسح ما بُني على القديمة (إن تغيّرت) ثم تُثبَّت صفحاتها الجديدة
  const { syncSyllabus } = await import("./syllabusSync");
  await syncSyllabus(pdfPath, syl.units.map((u) => u.title)).catch(() => {});
  const { setUnitRanges } = await import("./glossary");
  if (struct.length) await setUnitRanges(pdfPath, struct.map((u) => ({ from: u.page, to: u.to, found: true })));
  if (struct.length) syl = { ...syl, ranges: struct.map((u) => ({ from: u.page, to: u.to })) };
  // نوع الدراسة: ما أكّده الطالب يبقى عند إعادة الإنشاء، وإلا يُخمَّن من أول الكتاب ووحداته (بلا طلب)
  const prev = savedSyl?.data as Syllabus | undefined;
  if (prev?.kindOk && prev.kind) syl = { ...syl, kind: prev.kind, kindOk: true, exam: prev.exam };
  else {
    const g = guessStudyKind([syl.title ?? "", text, ...syl.units.map((u) => `${u.title}\n${u.topics.join("\n")}`)]);
    syl = { ...syl, kind: g.kind, exam: g.exam };
  }
  const { error } = await supabase.from("book_syllabus").upsert({ pdf_path: pdfPath, data: syl, done: new Array(syl.units.length).fill(false) });
  if (error) throw new Error("تعذّر حفظ المنهج. يُرجى المحاولة مرة أخرى.");
  return syl;
}

export type QuizLevel = "easy" | "medium" | "hard";
export type QuizType = "mcq" | "tf" | "fill" | "def" | "essay";
export type QuizQ = { q: string; options: string[]; answer: number; level: QuizLevel; type?: QuizType; why?: string; quote?: string };

function normLevel(v: any): QuizLevel {
  const s = String(v ?? "").toLowerCase();
  return s === "hard" ? "hard" : s === "medium" ? "medium" : "easy";
}

/** يولّد كويز اختيار من متعدد متدرّج الصعوبة من محتوى وحدة (بعدد اختياري). */
/** extra: خيارات الطلب — { study: "language" } لكتب اللغة (اختبار مهارة لغوية لا محتوى) */
export async function generateUnitQuiz(context: string, count?: number, extra?: Record<string, unknown>): Promise<QuizQ[]> {
  // الاختبار الكامل قد يأخذ أكثر من دقيقة: مهلة دقيقتين ونصف، والرد المقطوع تُحفظ أسئلته المكتملة
  const raw = await aiAssist("unitquiz", context, undefined, undefined, count, 150000, undefined, undefined, undefined, extra);
  try {
    const arr = parseArrayLenient(raw) as any[];
    if (!arr.length) return [];
    const qs: QuizQ[] = arr
      .map((x: any) => ({
        q: String(x?.q ?? "").trim(),
        options: Array.isArray(x?.options) ? x.options.map((o: any) => String(o).trim()).filter(Boolean) : [],
        answer: Number(x?.answer ?? 0),
        level: normLevel(x?.level),
        type: (["mcq", "tf", "fill", "def", "essay"].includes(String(x?.type)) ? String(x.type) : "mcq") as QuizType,
        why: String(x?.why ?? "").trim() || undefined,
        quote: String(x?.quote ?? "").trim() || undefined,
      }))
      .filter((x: QuizQ) => x.q && x.options.length >= 2 && x.answer >= 0 && x.answer < x.options.length)
      // النموذج يميل لجعل الإجابة الصحيحة أولًا دائمًا → نخلط الخيارات لكسر النمط
      .map((x: QuizQ) => (x.type === "tf" ? x : shuffleOptions(x))); // صح/خطأ يبقى بترتيبه
    return verifyQuiz(qs, context);
  } catch {
    return [];
  }
}

/**
 * مدقق الاختبار: يُحذف السؤال الذي لا يوجد اقتباس دليله في نص الوحدة (اختلاق أو خارج المادة).
 * إن سقط أكثر من النصف فالخلل في المطابقة (نص ممسوح ضوئيًا مثلًا) لا في الأسئلة → تبقى كلها ويُسجَّل.
 */
function verifyQuiz(qs: QuizQ[], context: string): QuizQ[] {
  const { kept, dropped } = verifiedQuestions(qs, context);
  if (!dropped) return qs;
  if (kept.length < qs.length / 2) {
    recordPerf("qa.quiz.unmatched", 0, false, dropped);
    return qs;
  }
  recordPerf("qa.quiz.dropped", 0, true, dropped);
  return kept;
}

/** يخلط ترتيب خيارات السؤال ويعيد حساب موضع الإجابة الصحيحة (كسر نمط «دائمًا أ»). */
function shuffleOptions(q: QuizQ): QuizQ {
  const correct = q.options[q.answer];
  const opts = [...q.options];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { ...q, options: opts, answer: opts.indexOf(correct) };
}

/** عقدة في الخريطة المتفرعة: عبارة قصيرة وما يتفرع منها (حتى ٣ مستويات تحت الفرع) */
export type MindNode = { t: string; sub?: MindNode[] };
/** points = النقاط الأولى (للخريطة الشعاعية)، tree = التفرعات كاملة (٢٥ أكتوبر)، hook = جملة ربط للذاكرة */
export type MindBranch = { label: string; points: string[]; hook?: string; tree?: MindNode[] };
export type MindMap = { center: string; branches: MindBranch[] };

/** يجمع نص الكتاب الفعلي من الصفحات المخزّنة (للخريطة الذهنية المطابقة للكتاب). */
export async function getBookText(pdfPath: string, maxChars = 16000): Promise<string> {
  const { data: pages } = await supabase
    .from("page_cache")
    .select("text,page")
    .eq("pdf_path", pdfPath)
    .neq("source", "empty")
    .order("page")
    .limit(60);
  return (pages ?? [])
    .map((p: any) => p.text)
    .join("\n")
    .slice(0, maxChars);
}

function mindNode(x: any, depth: number): MindNode | null {
  const t = String(x?.t ?? x?.text ?? x ?? "").replace(/\*\*/g, "").trim();
  if (!t) return null;
  const sub = depth < 3 && Array.isArray(x?.sub) ? (x.sub.map((y: any) => mindNode(y, depth + 1)).filter(Boolean) as MindNode[]) : [];
  return sub.length ? { t, sub } : { t };
}

/** يقرأ ردّ الخريطة: المتفرعة (nodes) أو القديمة (points) */
export function parseMindmap(raw: string): MindMap | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = parseJsonLenient(m[0]) as any;
    const branches: MindBranch[] = (Array.isArray(obj.branches) ? obj.branches : [])
      .map((b: any) => {
        const tree = (Array.isArray(b?.nodes) ? b.nodes : []).map((x: any) => mindNode(x, 1)).filter(Boolean) as MindNode[];
        const points = tree.length ? tree.map((n) => n.t) : Array.isArray(b?.points) ? b.points.map((p: any) => String(p).trim()).filter(Boolean) : [];
        const out: MindBranch = { label: String(b?.label ?? "").trim(), points };
        if (tree.some((n) => n.sub?.length)) out.tree = tree;
        if (String(b?.hook ?? "").trim()) out.hook = String(b.hook).trim();
        return out;
      })
      .filter((b: MindBranch) => b.label);
    if (branches.length === 0) return null;
    return { center: String(obj.center ?? "").trim() || "الفكرة المركزية", branches };
  } catch {
    return null;
  }
}

/** يولّد خريطة ذهنية متفرعة من محتوى وحدة (بالذكاء). */
export async function generateMindmap(context: string): Promise<MindMap | null> {
  return parseMindmap(await aiAssist("mindtree", context, undefined, undefined, undefined, 120000));
}

/** يحدّث حالة إنجاز وحدة. */
/** يحفظ «نوع الدراسة» الذي اختاره الطالب أو أكّده (مع المنهج) */
export async function setStudyKind(pdfPath: string, kind: StudyKind, exam?: string): Promise<void> {
  const { data } = await supabase.from("book_syllabus").select("data").eq("pdf_path", pdfPath).maybeSingle();
  if (!data?.data) throw new Error("NO_SYLLABUS");
  const next: Syllabus = { ...(data.data as Syllabus), kind, kindOk: true, exam: kind === "cert" && exam?.trim() ? exam.trim() : undefined };
  const { error } = await supabase.from("book_syllabus").update({ data: next }).eq("pdf_path", pdfPath);
  if (error) throw error;
  const { rememberStudyKind } = await import("./studyKind");
  rememberStudyKind(pdfPath, kind);
}

export async function setUnitDone(pdfPath: string, done: boolean[]): Promise<void> {
  await supabase.from("book_syllabus").update({ done }).eq("pdf_path", pdfPath);
}

export type UnitSchedule = { startISO: string; endISO: string; dayFrom: number; dayTo: number };

/**
 * يوزّع وحدات المنهج على أيام المذاكرة في خطة الكتاب (توزيعًا متناسبًا)،
 * فتحصل كل وحدة على مدى تواريخ تُذاكر فيه. يرجع [] إن لم توجد خطة.
 */
export async function getUnitSchedule(
  bookId: string,
  unitCount: number
): Promise<UnitSchedule[]> {
  if (!bookId || unitCount <= 0) return [];

  const { data: plan } = await supabase
    .from("study_plans")
    .select("id")
    .eq("book_id", bookId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan?.id) return [];

  const { data: sessions } = await supabase
    .from("plan_sessions")
    .select("session_date,kind,pages_target")
    .eq("plan_id", plan.id)
    .order("session_date");

  const studyDates = (sessions ?? [])
    .filter((s: any) => s.kind === "study" && (s.pages_target ?? 0) > 0)
    .map((s: any) => s.session_date as string);

  const D = studyDates.length;
  if (D === 0) return [];

  const out: UnitSchedule[] = [];
  for (let i = 0; i < unitCount; i++) {
    const lo = Math.min(Math.floor((i * D) / unitCount), D - 1);
    const hi = Math.max(lo, Math.min(Math.floor(((i + 1) * D) / unitCount) - 1, D - 1));
    out.push({ startISO: studyDates[lo], endISO: studyDates[hi], dayFrom: lo + 1, dayTo: hi + 1 });
  }
  return out;
}

/** أي وحدة من المنهج تخصّ هذا التاريخ (لعرضها في الجدول). */
export async function getUnitForDate(
  bookId: string,
  dateISO: string
): Promise<{ index: number; title: string } | null> {
  if (!bookId || !dateISO) return null;
  const { data: book } = await supabase
    .from("books")
    .select("pdf_path")
    .eq("id", bookId)
    .maybeSingle();
  if (!book?.pdf_path) return null;

  const syl = await getSyllabus(book.pdf_path);
  if (!syl) return null;

  const sched = await getUnitSchedule(bookId, syl.data.units.length);
  for (let i = 0; i < sched.length; i++) {
    if (dateISO >= sched[i].startISO && dateISO <= sched[i].endISO) {
      return { index: i, title: syl.data.units[i].title };
    }
  }
  return null;
}
