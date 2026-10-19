// lib/calcCore.ts
// محرّك الآلة الحاسبة (خالص بلا اعتماديات — مُختبَر في tests/calcCore.test.ts).
// يحسب التعبير بأمان (بلا eval): + − × ÷ والأقواس والنسبة المئوية والأس، مع أولوية العمليات الصحيحة.

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "(" } | { t: ")" };

const PREC: Record<string, number> = { "+": 1, "-": 1, "×": 2, "÷": 2, "^": 3 };

function tokenize(src: string): Tok[] | null {
  const s = src.replace(/\s+/g, "").replace(/\*/g, "×").replace(/\//g, "÷").replace(/−/g, "-").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/٫/g, ".");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const prev = out[out.length - 1];
    const unary = !prev || prev.t === "op" || prev.t === "(";
    if (/[0-9.]/.test(c) || (c === "-" && unary)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if (raw === "-") {
        // سالب أمام قوس: -( … ) = -1 × ( … )
        out.push({ t: "num", v: -1 }, { t: "op", v: "×" });
        i = j;
        continue;
      }
      if ((raw.match(/\./g) || []).length > 1) return null;
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      out.push({ t: "num", v });
      i = j;
      if (s[i] === "%") {
        (out[out.length - 1] as { v: number }).v = v / 100;
        i++;
      }
      continue;
    }
    if (c in PREC) out.push({ t: "op", v: c });
    else if (c === "(") {
      if (prev && (prev.t === "num" || prev.t === ")")) out.push({ t: "op", v: "×" }); // 2(3) = 2×3
      out.push({ t: "(" });
    } else if (c === ")") out.push({ t: ")" });
    else return null;
    i++;
  }
  return out;
}

/** يحسب التعبير؛ null إن كان غير صالح أو قسمة على صفر */
export function evaluate(expr: string): number | null {
  const toks = tokenize(expr);
  if (!toks || !toks.length) return null;
  const nums: number[] = [];
  const ops: (string | "(")[] = [];
  const apply = (): boolean => {
    const op = ops.pop();
    const b = nums.pop();
    const a = nums.pop();
    if (op === undefined || op === "(" || a === undefined || b === undefined) return false;
    let r: number;
    if (op === "+") r = a + b;
    else if (op === "-") r = a - b;
    else if (op === "×") r = a * b;
    else if (op === "÷") {
      if (b === 0) return false;
      r = a / b;
    } else r = Math.pow(a, b);
    if (!Number.isFinite(r)) return false;
    nums.push(r);
    return true;
  };
  for (const tk of toks) {
    if (tk.t === "num") nums.push(tk.v);
    else if (tk.t === "(") ops.push("(");
    else if (tk.t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") if (!apply()) return null;
      if (ops.pop() !== "(") return null;
    } else {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === "(") break;
        // الأس من اليمين لليسار، والباقي من اليسار لليمين
        if (PREC[top] > PREC[tk.v] || (PREC[top] === PREC[tk.v] && tk.v !== "^")) {
          if (!apply()) return null;
        } else break;
      }
      ops.push(tk.v);
    }
  }
  while (ops.length) if (!apply()) return null;
  return nums.length === 1 ? nums[0] : null;
}

/** عرض الناتج بلا أخطاء الفاصلة العشرية (0.1+0.2 = 0.3) */
export function formatResult(n: number): string {
  const r = Math.round(n * 1e10) / 1e10;
  if (Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0)) return r.toExponential(6);
  return String(r);
}
