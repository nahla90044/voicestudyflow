// lib/bilingualCore.ts
// «القراءة الثنائية» لكتب اللغة (قرار نهلة ٢٧ أكتوبر): كل جملة من الصفحة وتحتها ترجمتها، تُخفى وتُظهر بضغطة.
// منطق خالص مُختبَر: تقسيم نص الصفحة إلى جمل، وقراءة ردّ الترجمة المصفوفة جملةً بجملة.
import { parseJsonLenient } from "./jsonRepair.ts";

/** جمل الصفحة: عند علامات نهاية الجملة والأسطر؛ والقطعة القصيرة جدًا (رقم، حرف) تُلحق بما قبلها */
export function splitSentences(text: string, max = 60): string[] {
  // سطر انكسر في منتصف جملة (التفاف PDF: لا ينتهي بعلامة ويبدأ التالي بحرف صغير أو فاصلة) يُوصل بما بعده؛
  // العنوان (بلا علامة ويليه حرف كبير) يبقى سطرًا مستقلًا
  const joined = String(text ?? "")
    .replace(/\r/g, "")
    .replace(/([^.!?…:؟\n])\n+(?=\s*[\p{Ll},;)])/gu, "$1 ");
  const parts = joined
    .split(/\n+|(?<=[.!?…؟])\s+(?=[\p{Lu}\p{Lo}«"“(\d])/u)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  let carry = ""; // اختصار قبل الاسم (M. / Dr. / Mme.) يبقى مع ما بعده
  for (const p0 of parts) {
    const p = carry ? `${carry} ${p0}` : p0;
    carry = "";
    if (/^(?:[A-Z][a-z]{0,2}|Mme|Mlle|St)\.$/.test(p)) {
      carry = p;
      continue;
    }
    const words = p.split(" ").length;
    if (out.length && (p.length < 4 || (words === 1 && !/[.!?…:؟]$/.test(out[out.length - 1]) && p.length < 12))) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  if (carry) out.push(carry);
  return out.slice(0, max);
}

/** ترجمات بعدد الجمل تمامًا (الناقص فارغ) — من مصفوفة JSON، أو كائن {i,t}، أو أسطر مرقّمة */
export function parseAligned(raw: string, n: number): string[] {
  const out: string[] = Array.from({ length: n }, () => "");
  const s = String(raw ?? "");
  const m = s.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const v = parseJsonLenient(m[0]);
      if (Array.isArray(v)) {
        v.forEach((x: any, k: number) => {
          if (typeof x === "string") {
            if (k < n) out[k] = x.trim();
          } else if (x && typeof x === "object") {
            const i = Number(x.i ?? x.n ?? k);
            const t = String(x.t ?? x.tr ?? x.text ?? "").trim();
            if (Number.isInteger(i) && i >= 0 && i < n && t) out[i] = t;
          }
        });
        return out;
      }
    } catch {}
  }
  for (const line of s.split("\n")) {
    const mm = line.match(/^\s*(\d+)[).:\-]\s*(.+)$/);
    if (mm) {
      const i = Number(mm[1]) - 1;
      if (i >= 0 && i < n) out[i] = mm[2].trim();
    }
  }
  return out;
}
