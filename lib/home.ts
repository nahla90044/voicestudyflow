// lib/home.ts
// بيانات الرئيسية: آخر كتاب مع نسبة التقدّم، وجلسة خطة اليوم.
import { getUserId } from "./auth";
import { getLastOpenedBook, getLastPage, type LastBook } from "./readerPrefs";
import { supabase } from "./supabase";

export type ContinueBook = LastBook & { page: number; pageCount: number };

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** آخر كتاب فُتح — بشرط أنه ما زال موجودًا وغير مؤرشف لهذا المستخدم. */
export async function getContinueBook(): Promise<ContinueBook | null> {
  const last = await getLastOpenedBook();
  if (!last) return null;
  try {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("books")
      .select("id,title,pdf_path,page_count,is_archived")
      .eq("id", last.id)
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data || data.is_archived) return null;
    const page = await getLastPage(data.id);
    return {
      id: data.id,
      title: data.title || last.title,
      pdf_path: data.pdf_path || last.pdf_path,
      page,
      pageCount: Number(data.page_count) || 0,
    };
  } catch {
    return null; // بلا شبكة → لا نعرض كتابًا قد يكون حُذف
  }
}

export type TodayPlan = { pagesTarget: number; pagesDone: number; bookTitle: string };

/** مجموع جلسات المذاكرة المجدولة اليوم عبر كل الخطط. */
export async function getTodayPlan(): Promise<TodayPlan | null> {
  try {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("plan_sessions")
      .select("pages_target,pages_done,kind,study_plans!inner(user_id,book:books(title))")
      .eq("session_date", todayISO())
      .eq("kind", "study")
      .eq("study_plans.user_id", uid);
    if (error || !data || data.length === 0) return null;
    let pagesTarget = 0;
    let pagesDone = 0;
    let bookTitle = "";
    for (const r of data as any[]) {
      pagesTarget += Number(r.pages_target) || 0;
      pagesDone += Number(r.pages_done) || 0;
      if (!bookTitle) bookTitle = r.study_plans?.book?.title ?? "";
    }
    return pagesTarget > 0 ? { pagesTarget, pagesDone, bookTitle } : null;
  } catch {
    return null;
  }
}
