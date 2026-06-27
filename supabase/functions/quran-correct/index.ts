// supabase/functions/quran-correct/index.ts
// تصحيح آيات القرآن الكريم في نص الصفحة: نطابق كل آية مقتبسة بمرجعها [السورة : رقم]
// مع نص المصحف الموثّق (Tanzil/quran-simple) ونصحّح أخطاء التعرّف الضوئي (مثل ثُلُنَا→ثُلُثَا).
// الطلب: { text }  →  الرد: { text: corrected }
import quran from "./quran.json" with { type: "json" };
import surahNames from "./surah-names.json" with { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AYAT = quran as Record<string, string>;
const NAMES = surahNames as Record<string, string>;

// تطبيع اسم السورة للمطابقة
function normName(s: string): string {
  return s
    .replace(/[ؐ-ًؚ-ٰٟـۖ-ۭ]/g, "")
    .replace(/سورة|سوره/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "")
    .trim();
}
// خريطة اسم السورة (بعدة صيغ) → رقمها
const NAME_TO_NUM: Record<string, number> = {};
for (const [num, name] of Object.entries(NAMES)) {
  const n = normName(name);
  NAME_TO_NUM[n] = Number(num);
  if (n.startsWith("ال")) NAME_TO_NUM[n.slice(2)] = Number(num);
  else NAME_TO_NUM["ال" + n] = Number(num);
}

// تطبيع كلمة للمطابقة: نحذف كل العلامات ونوحّد الحروف
function normWord(w: string): string {
  return w
    .replace(/[ؐ-ًؚ-ٰٟـۖ-ࣰۭ-ࣿ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^ء-ي]/g, "");
}
// كلمات حقيقية فقط (نتجاهل رموز الوقف المنفصلة)
function realWords(t: string): string[] {
  return t.split(/\s+/).filter((w) => normWord(w).length > 0);
}
// مسافة تحرير ≤ 1 (تتسامح مع خطأ حرف واحد في المسح)
function editLE1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; }
    else { e++; if (e > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  }
  return e + (la - i) + (lb - j) <= 1;
}

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

// يطابق آية مقتبسة (OCR) مع نص مرجعي ويعيد النسخة الصحيحة (أو null لو الثقة منخفضة)
function alignReplace(ocr: string, ref: string): string | null {
  const O = realWords(ocr), C = realWords(ref);
  if (O.length < 3 || C.length === 0) return null;
  const On = O.map(normWord), Cn = C.map(normWord);
  let bestS = -1, best = -1;
  for (let s = 0; s < C.length; s++) {
    let sc = 0;
    for (let i = 0; i < O.length && s + i < C.length; i++) {
      if (On[i] === Cn[s + i]) sc++;
      else if (editLE1(On[i], Cn[s + i])) sc += 0.6;
    }
    if (sc > best) { best = sc; bestS = s; }
  }
  if (bestS < 0 || best / O.length < 0.6) return null; // ثقة منخفضة → لا نغيّر
  const end = Math.min(C.length, bestS + O.length);
  return C.slice(bestS, end).join(" ");
}

// نص مرجعي = الآية المُشار إليها مع ما قبلها وما بعدها (يغطّي الاقتباسات العابرة للآيات)
function refWindow(surah: number, ayah: number): string {
  return [ayah - 1, ayah, ayah + 1]
    .map((a) => AYAT[`${surah}:${a}`])
    .filter(Boolean)
    .join(" ");
}

// يصحّح كل آية مقتبسة متبوعة بمرجع: «(آية) [السورة : رقم]» أو «﴿آية﴾ [السورة : رقم]»
function correctQuran(text: string): string {
  const re =
    /([(﴿])([^()﴿﴾]{8,}?)([)﴾])(\s*[\[(]\s*)([ء-ي\s]{3,}?)(\s*[:：]\s*)([٠-٩\d]{1,3})(\s*[\])])/g;
  return text.replace(re, (m, ob, verse, cb, pre, name, sep, num, post) => {
    try {
      const surah = NAME_TO_NUM[normName(name)];
      const ayah = parseInt(toLatinDigits(num), 10);
      if (!surah || !ayah) return m;
      const ref = refWindow(surah, ayah);
      if (!ref) return m;
      const fixed = alignReplace(verse, ref);
      if (!fixed) return m;
      return `${ob}${fixed}${cb}${pre}${name}${sep}${num}${post}`;
    } catch {
      return m;
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? "");
    if (!text.trim()) return json({ text });
    return json({ text: correctQuran(text) });
  } catch (error) {
    return json({ text: String((await req.json().catch(() => ({})))?.text ?? ""), error: (error as Error).message });
  }
});
