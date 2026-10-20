// lib/syllabusEdit.ts
// تعديل المنهج بعد إنشائه: حذفه كاملًا، حذف وحدات مختارة، وإعادة إنشاء وحدات مختارة.
// كل ما يُحفظ لكل وحدة مرقّم برقمها (ملخّص، اختبار، خريطة، فيديو، مصطلحات، محفوظات، إجابات، حدود صفحات)،
// فحذف وحدة يُزيل محتواها ويُعيد ترقيم ما بعدها ليبقى كل محتوى مع وحدته، وإعادة إنشاء وحدة تمسح محتواها هي فقط.
import { aiAssist } from "./ai";
import {
  clearUnitRanges,
  getCachedUnitRanges,
  getUnitRanges,
  keepUnitRanges,
} from "./glossary";
import { remapAnsweredUnits } from "./readiness";
import { remapSavedUnits } from "./savedStudy";
import { supabase } from "./supabase";
import {
  getSyllabus,
  parseSyllabus,
  type Syllabus,
  type SyllabusUnit,
} from "./syllabus";
import { remapUnitContent, type UnitContentKind } from "./unitContent";
import { unitText } from "./unitScope";
import { remapProgress } from "./studyTrack";

export type SyllabusState = { data: Syllabus; done: boolean[] };

// ترميز أرقام محتوى الوحدات المخزّن (انظر unitSummary.summaryCacheKey و videoScript.cacheIds):
// محتوى «الصفحة» و«نطاق الصفحات» بأرقام خارج هذه المجالات فلا يُمس.
const MAX_UNITS = 1_000_000;
const BASE = 2e12;
type Codec = {
  kind: UnitContentKind;
  /** رقم الوحدة من رقم المحتوى، أو null إن لم يكن محتوى وحدة */
  unitOf: (code: number) => number | null;
  /** رقم المحتوى نفسه لوحدة أخرى، أو null إن تعذّر نقله بدقة فيُحذف */
  move: ((code: number, from: number, to: number) => number) | null;
};
const CODECS: Codec[] = [
  ...(["summary", "quiz", "mindmap", "glossary"] as const).map(
    (kind): Codec => ({ kind, unitOf: (c) => c, move: (_c, _f, to) => to }),
  ),
  {
    kind: "studysummary",
    unitOf: (c) => (c < MAX_UNITS ? c : null),
    move: (_c, _f, to) => to,
  },
  {
    kind: "studysummarypart",
    unitOf: (c) =>
      c >= BASE && c < BASE + MAX_UNITS * 1e4
        ? Math.floor((c - BASE) / 1e4)
        : null,
    move: (c, f, to) => c + (to - f) * 1e4,
  },
  {
    kind: "video",
    unitOf: (c) => (c >= BASE && c < BASE + MAX_UNITS ? c - BASE : null),
    move: (_c, _f, to) => BASE + to,
  },
  // أرقام أجزاء الفيديو فوق حد الأعداد الآمنة: تُعرف وحدتها لكن لا تُنقل بدقة، فتُحذف (الفيديو المكتمل محفوظ كاملًا في «video»)
  {
    kind: "videopart",
    unitOf: (c) =>
      c >= BASE * 1e4 && c < (BASE + MAX_UNITS) * 1e4
        ? Math.floor(c / 1e4) - BASE
        : null,
    move: null,
  },
];

/** يطبّق تحويل أرقام الوحدات (قديم → جديد، أو null للحذف) على كل ما يُحفظ لكل وحدة */
async function remapUnits(
  pdfPath: string,
  map: (unit: number) => number | null,
): Promise<void> {
  for (const c of CODECS) {
    await remapUnitContent(pdfPath, c.kind, (code) => {
      const u = c.unitOf(code);
      if (u === null) return undefined;
      const to = map(u);
      if (to === u) return undefined;
      return to === null || !c.move ? null : c.move(code, u, to);
    });
  }
  await remapSavedUnits(pdfPath, map);
  await remapAnsweredUnits(pdfPath, map);
  await remapProgress(pdfPath, map).catch(() => {});
}

// الحفظ يُتحقق من وصوله: صلاحيات الجدول تمنع تعديل منهج كتاب لا يملكه المستخدم (مثل كتب العيّنة المشتركة)
// فيرجع التحديث بلا خطأ وبلا صفوف — نعدّه فشلًا حتى لا تُعرض حالة لم تُحفظ.
async function saveSyllabus(pdfPath: string, s: SyllabusState): Promise<void> {
  const { data, error } = await supabase
    .from("book_syllabus")
    .update({ data: s.data, done: s.done })
    .eq("pdf_path", pdfPath)
    .select("pdf_path");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("NOT_SAVED");
  const { markSynced } = await import("./syllabusSync");
  await markSynced(pdfPath, s.data.units.map((u) => u.title));
}

async function current(pdfPath: string): Promise<SyllabusState> {
  const s = await getSyllabus(pdfPath);
  if (!s) throw new Error("NO_SYLLABUS");
  return { data: s.data, done: s.data.units.map((_, i) => !!s.done[i]) };
}

/** مسح كل محتوى الوحدات على الجهاز (عند إعادة إنشاء المنهج كاملًا بوحدات مختلفة) */
export function resetUnitContent(pdfPath: string): Promise<void> {
  return remapUnits(pdfPath, () => null);
}

/** حذف المنهج كاملًا مع كل محتوى وحداته على الجهاز */
export async function deleteSyllabus(pdfPath: string): Promise<void> {
  const { data, error } = await supabase
    .from("book_syllabus")
    .delete()
    .eq("pdf_path", pdfPath)
    .select("pdf_path");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("NOT_SAVED");
  await remapUnits(pdfPath, () => null);
  await clearUnitRanges(pdfPath);
}

/** حذف وحدات مختارة (أرقامها الحالية). حذف كل الوحدات = حذف المنهج فيُرجع null. */
export async function removeUnits(
  pdfPath: string,
  remove: number[],
): Promise<SyllabusState | null> {
  const cur = await current(pdfPath);
  const gone = new Set(remove);
  const keep = cur.data.units.map((_, i) => i).filter((i) => !gone.has(i));
  if (!keep.length) {
    await deleteSyllabus(pdfPath);
    return null;
  }
  const next: SyllabusState = {
    data: { ...cur.data, units: keep.map((i) => cur.data.units[i]) },
    done: keep.map((i) => cur.done[i]),
  };
  await saveSyllabus(pdfPath, next);
  // الجدول: تبقى تواريخ الوحدات الباقية كما هي
  try {
    const { data } = await supabase.from("book_syllabus").select("schedule").eq("pdf_path", pdfPath).maybeSingle();
    const sc = data?.schedule as { start: string; end: string; units: unknown[] } | null;
    if (sc?.units?.length === cur.data.units.length)
      await supabase.from("book_syllabus").update({ schedule: { ...sc, units: keep.map((i) => sc.units[i]) } }).eq("pdf_path", pdfPath);
  } catch {}
  const newIndex = new Map(keep.map((old, i) => [old, i]));
  await remapUnits(pdfPath, (u) => newIndex.get(u) ?? null);
  await keepUnitRanges(pdfPath, keep);
  return next;
}

/** صفحات وحدة (من حدود الفهرس المثبّتة أو المحسوبة) */
async function unitPages(
  pdfPath: string,
  units: SyllabusUnit[],
  i: number,
): Promise<{ from: number; to: number }> {
  const cached = await getCachedUnitRanges(pdfPath, units.length);
  if (cached?.length === units.length && cached[i]) return cached[i];
  const { data } = await supabase
    .from("page_cache")
    .select("total_pages")
    .eq("pdf_path", pdfPath)
    .limit(1)
    .maybeSingle();
  const r = await getUnitRanges(
    pdfPath,
    units.map((u) => u.title),
    Number(data?.total_pages) || 0,
  );
  if (!r[i]) throw new Error("NO_RANGE");
  return r[i];
}

/** إعادة إنشاء وحدة واحدة من نص صفحاتها (طلب ذكي واحد): عنوانها ومواضيعها وهدفها، ويُمسح محتواها القديم */
async function regenerateOne(
  pdfPath: string,
  cur: SyllabusState,
  i: number,
): Promise<SyllabusState> {
  const old = cur.data.units[i];
  const pages = await unitPages(pdfPath, cur.data.units, i);
  const text = await unitText(pdfPath, pages.from, pages.to);
  if (text.trim().length < 100) throw new Error("NO_TEXT");
  const note =
    `\n\nهذا نص وحدة واحدة فقط من الكتاب (الصفحات ${pages.from}–${pages.to})، وعنوانها المسجّل: «${old.title}». ` +
    "أعد منهجًا من وحدة واحدة بالضبط: عنوانها كما هو مكتوب في أول نصها (وإن لم يظهر فالعنوان المسجّل)، " +
    "وأهدافها objectives منقولة حرفيًا من «أهداف الوحدة» إن وردت في نصها (وإلا [])، ونبذة about من جملتين عمّا تتناوله، ومواضيعها الفرعية بترتيبها في النص نفسه، وما يتعلمه الطالب منها. لا تضف وحدات أخرى.";
  const got =
    parseSyllabus(await aiAssist("syllabus", text + note))?.units ?? [];
  const topics = [
    ...new Set(
      got
        .flatMap((u) => u.topics ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
  if (!topics.length) throw new Error("EMPTY");
  const unit: SyllabusUnit = {
    title: String(got[0]?.title ?? "").trim() || old.title,
    topics,
    outcome: got[0]?.outcome || old.outcome,
    about: got[0]?.about || old.about,
    objectives: got[0]?.objectives?.length ? got[0].objectives : old.objectives,
  };
  const next: SyllabusState = {
    data: {
      ...cur.data,
      units: cur.data.units.map((u, k) => (k === i ? unit : u)),
    },
    done: cur.done.map((d, k) => (k === i ? false : d)),
  };
  await saveSyllabus(pdfPath, next);
  await remapUnits(pdfPath, (u) => (u === i ? null : u));
  return next;
}

/**
 * إعادة إنشاء وحدات مختارة بالترتيب (طلب لكل وحدة). onUnit يُبلَّغ بكل وحدة تنتهي ليُحدَّث العرض أولًا بأول.
 * نفاد الطلبات يوقف الباقي ويُرمى ليظهر للمستخدم؛ أي خطأ آخر يُسجَّل للوحدة ويُكمل غيرها.
 */
export async function regenerateUnits(
  pdfPath: string,
  units: number[],
  onUnit: (i: number, state: SyllabusState | null, error?: string) => void,
): Promise<SyllabusState> {
  let cur = await current(pdfPath);
  for (const i of [...units].sort((a, b) => a - b)) {
    try {
      cur = await regenerateOne(pdfPath, cur, i);
      onUnit(i, cur);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      onUnit(i, null, msg);
      if (msg === "USER_QUOTA") throw e;
    }
  }
  return cur;
}
