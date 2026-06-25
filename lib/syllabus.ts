// lib/syllabus.ts
// منهج دراسي (syllabus) لكل كتاب: وحدات بعناوين ومواضيع ومخرجات تعلّم،
// مع متابعة التقدّم (تشيك ليست). يُولَّد بالذكاء من نص الكتاب ويُخزّن.
import { aiAssist } from "./ai";
import { supabase } from "./supabase";

export type SyllabusUnit = { title: string; topics: string[]; outcome?: string };
export type Syllabus = { title?: string; units: SyllabusUnit[]; tips?: string[] };

function parseSyllabus(raw: string): Syllabus | null {
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

/** يولّد المنهج من نص الكتاب (أول الصفحات) ويخزّنه. */
export async function generateSyllabus(pdfPath: string): Promise<Syllabus> {
  // اجمع نص أوّل الصفحات الحقيقية
  const { data: pages } = await supabase
    .from("page_cache")
    .select("text,page")
    .eq("pdf_path", pdfPath)
    .neq("source", "empty")
    .order("page")
    .limit(15);
  const text = (pages ?? [])
    .map((p: any) => p.text)
    .join("\n")
    .slice(0, 6000);
  if (text.trim().length < 100) {
    throw new Error("لا يوجد نص كافٍ. افتحي الكتاب واقرئي أول صفحاته أولًا.");
  }

  const raw = await aiAssist("syllabus", text);
  const syl = parseSyllabus(raw);
  if (!syl) throw new Error("تعذّر إنشاء المنهج. حاولي مرة أخرى.");

  await supabase.from("book_syllabus").upsert({
    pdf_path: pdfPath,
    data: syl,
    done: new Array(syl.units.length).fill(false),
  });
  return syl;
}

/** يحدّث حالة إنجاز وحدة. */
export async function setUnitDone(pdfPath: string, done: boolean[]): Promise<void> {
  await supabase.from("book_syllabus").update({ done }).eq("pdf_path", pdfPath);
}
