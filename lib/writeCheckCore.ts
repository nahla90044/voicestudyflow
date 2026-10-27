// lib/writeCheckCore.ts
// «تصحيح الكتابة» لكتب اللغة (قرار نهلة ٢٧ أكتوبر): قراءة ردّ التصحيح. منطق خالص مُختبَر.
import { parseJsonLenient } from "./jsonRepair.ts";

export type WriteError = { wrong: string; right: string; why: string; type: string };
export type WriteCheck = { corrected: string; errors: WriteError[]; tip?: string; good?: string };

const str = (v: unknown) => String(v ?? "").trim();
const TYPES = new Set(["grammar", "conj", "spelling", "vocab", "style"]);

export function parseWriteCheck(raw: string): WriteCheck | null {
  const m = String(raw ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: any;
  try {
    o = parseJsonLenient(m[0]);
  } catch {
    return null;
  }
  const corrected = str(o?.corrected);
  if (!corrected) return null;
  const errors = (Array.isArray(o?.errors) ? o.errors : [])
    .map((e: any): WriteError | null => {
      const wrong = str(e?.wrong);
      const right = str(e?.right);
      if (!wrong || !right || wrong === right) return null;
      const t = str(e?.type).toLowerCase();
      return { wrong, right, why: str(e?.why), type: TYPES.has(t) ? t : "grammar" };
    })
    .filter((e: WriteError | null): e is WriteError => !!e)
    .slice(0, 30);
  const out: WriteCheck = { corrected, errors };
  if (str(o?.tip)) out.tip = str(o.tip);
  if (str(o?.good)) out.good = str(o.good);
  return out;
}
