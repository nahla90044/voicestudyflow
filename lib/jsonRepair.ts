// lib/jsonRepair.ts
// إصلاح زلّات التنسيق الشائعة في ردود الذكاء قبل قراءتها (فلا يضيع ملخّص أو فيديو كامل بسبب علامة واحدة):
// - مفتاح معلّق بلا قيمة قبل الإغلاق: «"…","}» → «"…"}» (زلّة رُصدت في Sonnet 5.5 يوم ٢٠ أكتوبر)
// - فاصلة زائدة قبل الإغلاق: «…,}» / «…,]»
// لا يُلمس ما داخل النصوص: الإصلاح فقط حيث يلي الفاصلةَ إغلاقٌ مباشر.

/** يقرأ JSON، وإن فشل يصلح الزلّات الشائعة ويعيد المحاولة؛ وإلا يرمي الخطأ الأصلي */
export function parseJsonLenient(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    const fixed = s.replace(/,\s*"\s*(?=[}\]])/g, "").replace(/,\s*(?=[}\]])/g, "");
    if (fixed === s) throw e;
    return JSON.parse(fixed);
  }
}

/**
 * مصفوفة JSON ربما قُطعت في آخرها (انتهى سقف الرد): تُحفظ العناصر المكتملة بدل ضياع الكل.
 * يُرجع [] إن لم يكتمل أي عنصر.
 */
export function parseArrayLenient(raw: string): unknown[] {
  const start = raw.indexOf("[");
  if (start < 0) return [];
  const body = raw.slice(start);
  try {
    const whole = parseJsonLenient(body.slice(0, body.lastIndexOf("]") + 1));
    if (Array.isArray(whole)) return whole;
  } catch {}
  // تتبّع العناصر من المستوى الأول وإغلاقها عند آخر عنصر مكتمل
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastEnd = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 1 && c === "}") lastEnd = i;
    }
  }
  if (lastEnd < 0) return [];
  try {
    const arr = parseJsonLenient(body.slice(0, lastEnd + 1) + "]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
