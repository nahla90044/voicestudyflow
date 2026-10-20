// lib/syllabus.ts
// منهج دراسي (syllabus) لكل كتاب: وحدات بعناوين ومواضيع ومخرجات تعلّم،
// مع متابعة التقدّم (تشيك ليست). يُولَّد بالذكاء من نص الكتاب ويُخزّن.
import { aiAssist } from "./ai";
import { supabase } from "./supabase";

/** about: نبذة قصيرة عمّا تتناوله الوحدة (ليعرف الطالب ما هو مقبل عليه) */
export type SyllabusUnit = { title: string; topics: string[]; outcome?: string; about?: string; objectives?: string[] };
export type Syllabus = { title?: string; units: SyllabusUnit[]; tips?: string[] };

export function parseSyllabus(raw: string): Syllabus | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
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
  const done = Array.isArray(data.done) ? (data.done as boolean[]) : [];
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
 * يولّد المنهج ويخزّنه — نفس الطريق في أول إنشاء وفي إعادة الإنشاء:
 * ١) بنية الوحدات من فهرس القارئ نفسه (مدمج/مطبوع متحقَّق منه، أو رأس الصفحة المتكرر)،
 * ٢) فحص صارم للبنية (لا مكرر ولا ترتيب مختل ولا وحدة صفحة أو صفحتين) — المنهج المختل لا يُحفظ أبدًا،
 * ٣) مواضيع كل وحدة وهدفها من صفحاتها هي (طلب ذكي واحد)، ٤) الحفظ وتثبيت صفحات الوحدات.
 * بلا بنية سليمة من الكتاب: يحلّل الذكاء أول الكتاب (كالسابق) ثم تُفحص نتيجته بنفس الفحص.
 */
export async function generateSyllabus(pdfPath: string, onStage?: (s: SyllabusStage) => void): Promise<Syllabus> {
  onStage?.("structure");
  const { data: first } = await supabase.from("page_cache").select("text,page,total_pages").eq("pdf_path", pdfPath).neq("source", "empty").order("page").limit(30);
  const text = (first ?? []).map((p: any) => p.text).join("\n").slice(0, 16000);
  if (text.trim().length < 100) throw new Error("لا يوجد نص كافٍ. يلزم فتح الكتاب وقراءة أول صفحاته أولًا.");
  const total = Number((first ?? [])[0]?.total_pages) || 0;

  // ١) المصادر بالترتيب: فهرس القارئ (نفس ما يظهر في «الفهرس» داخل القارئ)، ثم رأس الصفحة المتكرر
  const { getBookToc } = await import("./bookToc");
  const { bookPages } = await import("./glossary");
  const { unitsFromRunningHeads } = await import("./unitHeadings");
  const { checkStructure } = await import("./unitStructure");
  const sources: { title: string; page: number }[][] = [];
  const bt = await getBookToc(pdfPath, total, true).catch(() => ({ book: [], units: [] }));
  sources.push(bt.book.filter((c) => c.level === 0));
  sources.push(unitsFromRunningHeads(await bookPages(pdfPath).catch(() => []), total));

  // ٢) أول بنية سليمة تُعتمد؛ وإلا أفضل بنية بعد التنظيف إن بقيت وحدتان فأكثر
  onStage?.("check");
  const checks = sources.filter((x) => x.length >= 2).map((x) => checkStructure(x, total));
  let struct = checks.find((c) => c.sound)?.units ?? checks.find((c) => c.units.length >= 2)?.units ?? [];

  // ٣) المحتوى: مواضيع كل وحدة من صفحاتها هي (طلب واحد)، أو تحليل أول الكتاب إن لم توجد بنية
  onStage?.("content");
  let syl: Syllabus | null = null;
  if (struct.length) {
    const ex = await unitExcerpts(pdfPath, struct);
    const brief =
      `هذه وحدات الكتاب الدقيقة (${struct.length} وحدة) من فهرسه، ومع كل وحدة مقتطف من صفحاتها الأولى. ` +
      `أعد المنهج بالوحدات نفسها بالضبط وبالترتيب نفسه وبعناوينها حرفيًا (لا تضف ولا تحذف ولا تدمج)، ` +
      `ولكل وحدة: objectives أهداف الوحدة منقولة حرفيًا كما وردت في مقتطفها تحت «أهداف الوحدة» (بندًا بندًا، بلا إعادة صياغة؛ وإن لم ترد أهداف فاجعلها [])، ` +
      `وabout نبذة من جملتين بلغة سهلة عمّا تتناوله الوحدة (تُستعمل فقط إن لم ترد أهداف)، ` +
      `وtopics محاضراتها أو مواضيعها الفرعية من مقتطفها هي فقط، وoutcome ما يتعلمه الطالب منها. ` +
      `أعد JSON بالشكل {"title":"…","units":[{"title":"…","objectives":["…"],"about":"…","topics":["…"],"outcome":"…"}]}.\n\n` +
      struct.map((u, i) => `### ${i + 1}. ${u.title} (ص ${u.page}–${u.to})\n${ex[i]}`).join("\n\n");
    const ai = parseSyllabus(await aiAssist("syllabus", brief))?.units ?? [];
    syl = {
      title: "",
      units: struct.map((u, i) => {
        const m = ai.length === struct.length ? ai[i] : matchUnit(u.title, ai);
        return { title: u.title, topics: (m?.topics ?? []).map((x) => String(x).trim()).filter(Boolean), outcome: m?.outcome, about: m?.about, objectives: m?.objectives?.length ? m.objectives : undefined };
      }),
      tips: [],
    };
  } else {
    const fromAi = parseSyllabus(await aiAssist("syllabus", text));
    if (!fromAi?.units.length) throw new Error("تعذّر إنشاء المنهج. يُرجى المحاولة مرة أخرى.");
    // نتيجة الذكاء نفسها تُفحص: لا وحدة مكررة
    const { unitKey } = await import("./unitStructure");
    const seen = new Set<string>();
    syl = { ...fromAi, units: fromAi.units.filter((u) => !seen.has(unitKey(u.title)) && !!seen.add(unitKey(u.title))) };
  }

  // ٤) الحفظ: صفحات الوحدات مثبّتة من البنية (الملخص والاختبار والفيديو والفهرس تعتمدها)
  onStage?.("save");
  const { setUnitRanges } = await import("./glossary");
  if (struct.length) await setUnitRanges(pdfPath, struct.map((u) => ({ from: u.page, to: u.to, found: true })));
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
export async function generateUnitQuiz(context: string, count?: number): Promise<QuizQ[]> {
  const raw = await aiAssist("unitquiz", context, undefined, undefined, count);
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
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
  } catch {
    return [];
  }
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

export type MindBranch = { label: string; points: string[] };
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

/** يولّد خريطة ذهنية من محتوى وحدة (بالذكاء). */
export async function generateMindmap(context: string): Promise<MindMap | null> {
  const raw = await aiAssist("mindmap", context);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const branches: MindBranch[] = Array.isArray(obj.branches)
      ? obj.branches
          .map((b: any) => ({
            label: String(b?.label ?? "").trim(),
            points: Array.isArray(b?.points) ? b.points.map((p: any) => String(p).trim()).filter(Boolean) : [],
          }))
          .filter((b: MindBranch) => b.label)
      : [];
    if (branches.length === 0) return null;
    return { center: String(obj.center ?? "").trim() || "الفكرة المركزية", branches };
  } catch {
    return null;
  }
}

/** يحدّث حالة إنجاز وحدة. */
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
