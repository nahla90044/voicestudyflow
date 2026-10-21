// lib/seekCore.ts
// التقديم والإرجاع في صوت الملخّص بالمقاطع (منطق خالص، مُختبَر).

/** ثوانٍ تقريبية لكل مقطع (للعرض وللتقديم/الإرجاع ١٥ ثانية بالمقاطع) */
export function chunkSeconds(chunks: string[], cps: number): number[] {
  return chunks.map((c) => Math.max(2, c.length / Math.max(5, cps)));
}

/**
 * رقم المقطع بعد إزاحة sec ثانية من بداية المقطع الحالي (+ تقديم، − إرجاع): المقطع الذي تقع فيه
 * تلك اللحظة. وأي إزاحة تتحرك مقطعًا واحدًا على الأقل (الضغط على ⏩/⏪ لا يبقى بلا أثر).
 */
export function shiftChunk(secs: number[], index: number, sec: number): number {
  let start = 0;
  for (let i = 0; i < index; i++) start += secs[i];
  const target = Math.max(0, start + sec);
  let acc = 0;
  let at = secs.length - 1;
  for (let i = 0; i < secs.length; i++) {
    if (target < acc + secs[i]) {
      at = i;
      break;
    }
    acc += secs[i];
  }
  if (at === index) at = sec > 0 ? Math.min(secs.length - 1, index + 1) : Math.max(0, index - 1);
  return at;
}
