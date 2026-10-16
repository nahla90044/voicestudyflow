// lib/alignWords.ts
// محاذاة الكلمات المنطوقة بصناديق كلمات الصفحة (PDF) لتزامن التظليل مع النطق.
//
// المشكلة: التقدّم يُقاس في فضاء «الكلمات المنطوقة»، بينما التظليل يرسم على
// «صناديق كلمات الـPDF». وكان الربط بينهما إسقاطًا خطّيًا:
//     index = progress × (boxes.length - 1)
// وهو يفترض تطابق التسلسلين طولًا وترتيبًا، وهذا غير صحيح:
//   • المنطوق يحذف الترويسات المكرّرة والاستشهادات
//   • المنطوق يوسّع الأرقام («1995» تُنطق عدّة كلمات)
//   • صناديق الـPDF تشمل أرقام الصفحات والحواشي والزخارف التي لا تُقرأ
// فينزاح التظليل عن الصوت ويزداد الانزياح كلما تقدّمت الصفحة.
//
// الحل: محاذاة رمزية (token alignment) جشعة مع نظرة أمامية، تُنتج لكل كلمة
// منطوقة فهرس الصندوق المقابل، مع بقاء الترتيب تصاعديًا.

/** تطبيع للمقارنة: بلا تشكيل ولا تطويل ولا ترقيم (آمن على Hermes). */
function norm(w: string): string {
  return w
    .replace(/[ً-ْٰـ]/g, "")
    // توحيد أشكال الحروف (أ/إ/آ←ا، ة←ه، ى←ي) — كانت تُعدّ كلمات مختلفة فتضعف المطابقة
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^0-9A-Za-zء-ي٠-٩ٮ-ۓ۰-۹]/g, "")
    .toLowerCase();
}

/** بلا السوابق الملتصقة (و/ف/ب/ك/ل + ال) — «والاقتصاد» تطابق «الاقتصاد» و«اقتصاد» */
function stem(w: string): string {
  let x = w;
  if (x.length > 3 && /^[وف]/.test(x)) x = x.slice(1);
  if (x.length > 3 && /^[بكل]/.test(x) && !/^ل[ل]/.test(x)) x = x.slice(1);
  if (x.length > 4 && x.startsWith("ال")) x = x.slice(2);
  else if (x.length > 3 && x.startsWith("ل") && w.startsWith("لل")) x = x.slice(1);
  return x;
}

/** مسافة تحرير محدودة (تتوقف مبكرًا بعد الحد) */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/**
 * تطابق مرن بين كلمة منطوقة وكلمة الصفحة (بعد norm): حرفي، أو بعد نزع السوابق،
 * أو بفرق حرف (حرفين للكلمات الطويلة). الصفحات الممسوحة تُصحَّح قبل القراءة
 * والتشكيل قد يغيّر حرفًا — فالمطابقة الحرفية وحدها كانت تُطفئ التظليل.
 */
export function same(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return true;
  const n = Math.min(sa.length, sb.length);
  if (n >= 4) return within(sa, sb, n >= 8 ? 2 : 1);
  return false;
}

/** إلى أي مدى ننظر أمامًا بحثًا عن تطابق قبل أن نعدّه مفقودًا. */
const LOOKAHEAD = 8;

/**
 * لكل كلمة منطوقة: فهرس الصندوق المقابل في الصفحة.
 * الكلمات التي لا يقابلها صندوق (أرقام موسَّعة مثلًا) تأخذ فهرس آخر تطابق،
 * فيظلّ التظليل ثابتًا مكانه بدل أن يقفز عشوائيًا.
 */
/** مراسي آخر محاذاة (للثقة: كم كلمة وُجد لها مقابل فعلًا) */
let lastAnchors: number[] = [];

export function alignSpokenToBoxes(spoken: string[], boxes: string[]): number[] {
  const S = spoken.map(norm);
  const B = boxes.map(norm);
  const map = new Array<number>(S.length).fill(0);
  if (S.length === 0 || B.length === 0) return map;

  // تمريرة ١: ثبّت المراسي — الكلمات المنطوقة التي لها مقابل نصّي في الصفحة
  const anchor = new Array<number>(S.length).fill(-1);
  let bi = 0;
  for (let si = 0; si < S.length; si++) {
    const s = S[si];
    if (!s) continue;
    const limit = Math.min(B.length, bi + LOOKAHEAD);
    let found = -1;
    let merged = false; // كلمتان منطوقتان = صندوق واحد (دمج)
    for (let k = bi; k < limit; k++) {
      if (same(s, B[k])) {
        found = k;
        break;
      }
      // كلمة واحدة مقسومة على صندوقين في الصفحة (مسح ضوئي/مسافة زائدة)
      if (k + 1 < B.length && B[k + 1] && s === B[k] + B[k + 1]) {
        found = k;
        break;
      }
      // كلمتان منطوقتان ملتصقتان في الصفحة صندوقًا واحدًا
      if (si + 1 < S.length && S[si + 1] && B[k] === s + S[si + 1]) {
        found = k;
        merged = true;
        break;
      }
    }
    // إعادة تزامن: كتلة كلمات في الصفحة لا تُقرأ (ترويسة متخطّاة، حاشية، جدول) أطول من
    // النظرة الأمامية → نبحث أبعد، لكن بمطابقة كلمتين متتاليتين حتى لا نقفز لتطابق عابر.
    // (بدونها كانت المطابقة تفشل للصفحة كلها فيختفي التظليل في صفحات ويظهر في أخرى)
    if (found < 0 && si + 1 < S.length && S[si + 1]) {
      // ثلاث كلمات متتالية أولًا (أوثق: الترويسة قد تبدأ بنفس كلمتي المحتوى)، ثم كلمتان
      for (const n of [3, 2]) {
        if (si + n > S.length) continue;
        for (let k = limit; k + n <= B.length; k++) {
          let ok = true;
          for (let j = 0; j < n && ok; j++) ok = B[k + j] === S[si + j] || stem(B[k + j]) === stem(S[si + j]);
          if (ok) {
            found = k;
            break;
          }
        }
        if (found >= 0) break;
      }
    }
    if (found >= 0) {
      anchor[si] = found;
      bi = found + 1;
      if (merged) {
        anchor[si + 1] = found;
        si++;
      }
    }
  }
  lastAnchors = anchor;

  // تمريرة ٢: وزّع ما بين كل مرساتين على الصناديق الواقعة بينهما.
  // بهذا تقع كلمات توسيع الرقم («nineteen forty-five») على صندوق الرقم نفسه
  // («1945») بدل أن تتجمّد على الكلمة السابقة له.
  let prevS = -1;
  let prevB = 0;
  for (let si = 0; si <= S.length; si++) {
    const isEnd = si === S.length;
    if (!isEnd && anchor[si] < 0) continue;
    const curB = isEnd ? B.length - 1 : anchor[si];
    const gap = si - prevS - 1; // عدد الكلمات غير المرتبطة بين المرساتين
    for (let k = 1; k <= gap; k++) {
      const t = k / (gap + 1);
      map[prevS + k] = Math.round(prevB + (curB - prevB) * t);
    }
    if (!isEnd) map[si] = curB;
    prevS = si;
    prevB = curB;
  }

  // التظليل لا يرجع للخلف أبدًا
  for (let i = 1; i < map.length; i++) {
    if (map[i] < map[i - 1]) map[i] = map[i - 1];
  }
  return map;
}

/**
 * موضع التظليل ضمن صناديق الصفحة عند نسبة تقدّم في فضاء الكلمات المنطوقة.
 * تُرجع فهرسًا كسريًا ليتحرّك التظليل بنعومة بين صندوقين.
 */
export function boxIndexAtProgress(
  progress: number,
  map: number[],
  boxCount: number,
): number {
  if (boxCount <= 0) return 0;
  if (map.length === 0) {
    // بلا محاذاة → الإسقاط الخطّي القديم كحلٍّ أخير
    return Math.min(boxCount - 1, Math.max(0, progress * (boxCount - 1)));
  }
  const f = Math.min(map.length - 1, Math.max(0, progress * (map.length - 1)));
  const i0 = Math.floor(f);
  const i1 = Math.min(map.length - 1, i0 + 1);
  const t = f - i0;
  const v = map[i0] * (1 - t) + map[i1] * t;
  return Math.min(boxCount - 1, Math.max(0, v));
}

export type Rect = { x: number; y: number; w: number; h: number };
type Box = { t: string } & Rect;

/**
 * مستطيلات كل جملة على الصفحة (سطر لكل مستطيل) — هايلايتر الجملة كاملة مثل «حاكي»
 * بدل تقدير سطر واحد من تقدّم الصوت. confidence = نسبة الكلمات المنطوقة التي وُجد لها
 * مقابل حرفي في الصفحة؛ إن كانت ضعيفة فالأفضل عدم الرسم من رسمه في مكان خاطئ.
 */
export type SentenceLayout = {
  rects: Rect[][]; // مستطيلات أسطر كل جملة
  confidence: number; // ٠..١
  map: number[]; // لكل كلمة منطوقة: فهرس صندوقها في الصفحة
  starts: number[]; // فهرس أول كلمة لكل جملة في map
};

export function sentenceRects(sentences: string[], boxes: Box[]): SentenceLayout {
  const words = sentences.map((s) => s.match(/\S+/g) ?? []);
  const spoken = words.flat();
  if (!spoken.length || !boxes.length) return { rects: sentences.map(() => []), confidence: 0, map: [], starts: [] };

  const map = alignSpokenToBoxes(spoken, boxes.map((b) => b.t));
  const anchored = lastAnchors.slice();
  // الثقة: كم كلمة منطوقة وُجد لها مقابل (تطابق مرن) — من الكلمات القابلة للمقارنة
  const comparable = spoken.filter((w) => norm(w)).length || 1;
  const matched = anchored.filter((a) => a >= 0).length;
  const confidence = matched / comparable;

  const rects: Rect[][] = [];
  const starts: number[] = [];
  let k = 0;
  for (const ws of words) {
    starts.push(k);
    if (!ws.length) {
      rects.push([]);
      continue;
    }
    // جملة بلا أي كلمة مطابقة (مثلًا نص مُضاف/مترجم) → لا نرسمها في مكان تخميني
    let hits = 0;
    for (let j = k; j < k + ws.length; j++) if (anchored[j] >= 0) hits++;
    const from = map[k];
    const to = Math.max(from, map[k + ws.length - 1]);
    k += ws.length;
    rects.push(hits === 0 && ws.length > 2 ? [] : groupLines(boxes.slice(from, to + 1)));
  }
  return { rects, confidence, map, starts };
}

/** فجوة أفقية تفصل عمودين في نفس السطر (جداول/أعمدة) — كنسبة من عرض الصفحة */
const COLUMN_GAP = 0.03;

/**
 * يجمع صناديق الكلمات في أسطر (حسب المركز العمودي) — مستطيل لكل سطر، ويفصل أجزاء
 * السطر التي بينها فجوة عمود حتى لا يمتد الهايلايتر عبر عمودين.
 */
function groupLines(bs: Box[]): Rect[] {
  const lines: { x0: number; x1: number; y0: number; y1: number; cy: number; h: number }[] = [];
  for (const b of bs) {
    const cy = b.y + b.h / 2;
    const ln = lines.find(
      (l) =>
        Math.abs(l.cy - cy) < Math.max(l.h, b.h) * 0.6 &&
        b.x <= l.x1 + COLUMN_GAP &&
        b.x + b.w >= l.x0 - COLUMN_GAP
    );
    if (ln) {
      ln.x0 = Math.min(ln.x0, b.x);
      ln.x1 = Math.max(ln.x1, b.x + b.w);
      ln.y0 = Math.min(ln.y0, b.y);
      ln.y1 = Math.max(ln.y1, b.y + b.h);
    } else {
      lines.push({ x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, cy, h: b.h });
    }
  }
  return lines.sort((a, b) => a.y0 - b.y0).map((l) => ({ x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 }));
}
