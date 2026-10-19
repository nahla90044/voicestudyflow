// lib/ink.ts
// كتابة قلم الآيباد على صفحات الكتاب: خطوط كل صفحة تُحفظ في حساب المستخدم (جدول page_ink)
// فتظهر على كل أجهزته، مع نسخة على الجهاز للفتح الفوري وبلا شبكة.
// الإحداثيات نسبية لعرض الصفحة (0..1)، والهامش خارجها (x<0 أو x>1) — لا تتأثر بالتكبير أو الشاشة.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";

export type InkTool = "pen" | "marker" | "eraser" | "line"; // line = المسطرة (خط مستقيم)

export type Stroke = {
  /** اللون */
  c: string;
  /** السُّمك نسبةً لعرض الصفحة */
  w: number;
  /** قلم تظليل شفاف */
  m?: boolean;
  /** النقاط مسطّحة [x1,y1,x2,y2,…] نسبةً لعرض الصفحة (y أيضًا بوحدة العرض) */
  p: number[];
};

const localKey = (book: string, page: number) => `ink:${book}:${page}`;
const memory = new Map<string, Stroke[]>();

/** خطوط صفحة: من الذاكرة، ثم الجهاز، ثم الحساب (الأحدث يُعرض عند وصوله عبر onRemote) */
export async function loadInk(book: string, page: number, onRemote?: (s: Stroke[]) => void): Promise<Stroke[]> {
  const k = localKey(book, page);
  let local = memory.get(k);
  if (!local) {
    try {
      const raw = await AsyncStorage.getItem(k);
      local = raw ? (JSON.parse(raw) as Stroke[]) : [];
    } catch {
      local = [];
    }
    memory.set(k, local);
  }
  // الحساب في الخلفية: إن اختلف عن الجهاز (كُتب من جهاز آخر) نحدّث العرض
  void (async () => {
    try {
      const { data, error } = await supabase.from("page_ink").select("strokes").eq("book_id", book).eq("page", page).maybeSingle();
      if (error || pending.has(k)) return; // تعديل محلي لم يُرفع بعد يغلب
      const remote = (data?.strokes as Stroke[] | undefined) ?? [];
      if (JSON.stringify(remote) !== JSON.stringify(memory.get(k) ?? [])) {
        memory.set(k, remote);
        AsyncStorage.setItem(k, JSON.stringify(remote)).catch(() => {});
        onRemote?.(remote);
      }
    } catch {
      // بلا شبكة: نكتفي بنسخة الجهاز
    }
  })();
  return local;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** يحفظ خطوط الصفحة فورًا على الجهاز، ويرفعها للحساب بعد لحظة سكون (لا طلب مع كل خط) */
export function saveInk(book: string, page: number, strokes: Stroke[]): void {
  const k = localKey(book, page);
  memory.set(k, strokes);
  AsyncStorage.setItem(k, JSON.stringify(strokes)).catch(() => {});
  const prev = pending.get(k);
  if (prev) clearTimeout(prev);
  pending.set(
    k,
    setTimeout(() => {
      pending.delete(k);
      void upload(book, page, strokes);
    }, 1200)
  );
}

async function upload(book: string, page: number, strokes: Stroke[], attempt = 0): Promise<void> {
  try {
    const { error } = strokes.length
      ? await supabase.from("page_ink").upsert({ book_id: book, page, strokes, updated_at: new Date().toISOString() })
      : await supabase.from("page_ink").delete().eq("book_id", book).eq("page", page);
    if (error) throw error;
  } catch {
    // إعادة محاولة قليلة (شبكة متقطّعة)؛ النسخة على الجهاز محفوظة على أي حال
    if (attempt < 3) setTimeout(() => void upload(book, page, strokes, attempt + 1), 3000 * (attempt + 1));
  }
}

/** هل في الصفحة كتابة على الهامش؟ (لإبقاء الهوامش ظاهرة بعد إطفاء القلم) */
export function hasMarginInk(strokes: Stroke[]): boolean {
  return strokes.some((s) => {
    for (let i = 0; i < s.p.length; i += 2) if (s.p[i] < 0 || s.p[i] > 1) return true;
    return false;
  });
}
