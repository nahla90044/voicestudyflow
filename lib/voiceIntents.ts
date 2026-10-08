// lib/voiceIntents.ts
// فهم الطلبات الصوتية (بلا شبكة ولا ذكاء اصطناعي) — قابل للاختبار.
//
// المساعد الصوتي يحوّل الكلام لنص (بخدمة آبل)، ثم يفهم هذا الملف الأوامر المعروفة
// باللهجة والفصحى والإنجليزية: «كمّل»، «ملخص الوحدة الرابعة»، «اختبرني»، «أخطائي»،
// «كم باقي على اختباري»، «ذكّرني الساعة تسع»… والطلب الواحد قد يحوي أكثر من أمر.
// ما لا يطابق أمرًا يُعامل سؤالًا عن الكتاب («كتابك يجيب»).

export type Intent =
  | { type: "resume" }
  | { type: "summary"; unit: number | null } // unit: رقم الوحدة من ١ (null = الحالية/الأضعف)
  | { type: "quiz"; unit: number | null }
  | { type: "mistakes" }
  | { type: "readiness" }
  | { type: "cards" }
  | { type: "focus" }
  | { type: "remind"; hour: number; minute: number; what: string }
  | { type: "ask"; question: string };

/** يوحّد الحروف العربية ويزيل التشكيل والتطويل، ويحوّل الأرقام الهندية */
export function normalize(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[،؟?!.,؛«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// الأعداد الترتيبية والأصلية (مذكّر ومؤنث) بعد التوحيد.
// ملاحظة: \b في JavaScript لا يعرف الحروف العربية، فالحدّ هنا مسافة أو طرف النص.
const word = (alts: string) => new RegExp(`(?:^|\\s)(?:${alts})(?=\\s|$)`);
const NUM_WORDS: [RegExp, number][] = [
  [word("الاولي|الاول|اولي|اول|واحد|واحده|first|one"), 1],
  [word("الثانيه|الثاني|ثاني|ثانيه|اثنين|اثنان|ثنتين|second|two"), 2],
  [word("الثالثه|الثالث|ثالث|ثالثه|ثلاث|ثلاثه|third|three"), 3],
  [word("الرابعه|الرابع|رابع|رابعه|اربع|اربعه|fourth|four"), 4],
  [word("الخامسه|الخامس|خامس|خامسه|خمس|خمسه|fifth|five"), 5],
  [word("السادسه|السادس|سادس|سادسه|ست|سته|sixth|six"), 6],
  [word("السابعه|السابع|سابع|سابعه|سبع|سبعه|seventh|seven"), 7],
  [word("الثامنه|الثامن|ثامن|ثامنه|ثمان|ثمانيه|eighth|eight"), 8],
  [word("التاسعه|التاسع|تاسع|تاسعه|تسع|تسعه|ninth|nine"), 9],
  [word("العاشره|العاشر|عاشر|عاشره|عشر|عشره|tenth|ten"), 10],
];

/** أول عدد (رقم أو كلمة) في المقطع */
function numberIn(s: string): number | null {
  const d = s.match(/\b(\d{1,2})\b/);
  if (d) return Number(d[1]);
  for (const [re, n] of NUM_WORDS) if (re.test(s)) return n;
  return null;
}

/** رقم الوحدة المذكورة بعد «الوحده/وحده/unit/الفصل» */
export function unitNumber(t: string): number | null {
  const m = t.match(/(?:الوحده|وحده|الفصل|فصل|الدرس|unit|chapter|lesson)\s+(?:رقم\s+|number\s+)?(\S+(?:\s+\S+)?)/);
  return m ? numberIn(m[1]) : null;
}

/**
 * ساعة التذكير من النص («الساعه تسع الليل»، «at 9 pm»، «9:30»).
 * بلا «صباح» نفترض المساء للساعات ١–٧، وما مضى من اليوم يُحسب مساءً.
 */
export function parseTime(t: string, nowHour: number): { hour: number; minute: number } | null {
  const m = t.match(/(?:الساعه|ساعه|at)\s+(\d{1,2})(?::(\d{2}))?|(\d{1,2}):(\d{2})|(\d{1,2})\s*(?:pm|am)/);
  let hour: number | null = null;
  let minute = 0;
  if (m) {
    hour = Number(m[1] ?? m[3] ?? m[5]);
    minute = Number(m[2] ?? m[4] ?? 0);
  } else {
    const w = t.match(/(?:الساعه|ساعه)\s+(\S+)/);
    if (w) hour = numberIn(w[1]);
    if (/(احدعش|حداش|احدي عشر)/.test(t)) hour = 11;
    if (/(اطنعش|اثنا عشر|اثني عشر)/.test(t)) hour = 12;
  }
  if (hour === null || hour > 23) return null;
  if (/(ونص|والنصف|half)/.test(t)) minute = 30;
  const morning = /(صباح|الصبح|الفجر|\bam\b)/.test(t);
  const evening = /(مساء|المسا|الليل|العصر|المغرب|العشاء|بالليل|\bpm\b|tonight|evening)/.test(t);
  if (hour < 12 && !morning && (evening || hour <= 7 || hour <= nowHour)) hour += 12;
  if (hour === 24) hour = 12;
  return { hour, minute };
}

const RE = {
  resume: /(كمل|اكمل|تابع|استمر|وين وقفت|اين توقفت|شغل الكتاب|continue|resume|where did i (stop|leave))/,
  summary: /(ملخص|لخص|تلخيص|summary|summari[sz]e)/,
  mistakes: /(اخطائي|الاخطاء|اخطاء|غلطاتي|اغلاطي|mistakes)/,
  quiz: /(اختبرني|اختبار|امتحني|امتحان قصير|اسئله|سؤالين|quiz|test me)/,
  readiness: /(جاهزيت|كم باقي|كم بقي|متي اختبار|متي الاختبار|موعد الاختبار|ready|readiness|how many days)/,
  cards: /(بطاقات|البطاقات|بطاقه|flash ?cards|\bcards\b)/,
  focus: /(جلسه تركيز|وقت تركيز|بومودورو|pomodoro|focus session)/,
  remind: /(ذكرني|تذكير|نبهني|remind)/,
};

/** يفهم الطلب ويُرجع الأوامر بترتيب ذكرها؛ وإن لم يُفهم أمر فهو سؤال */
export function parseIntents(raw: string, nowHour = new Date().getHours()): Intent[] {
  const t = normalize(raw);
  if (!t) return [];
  const found: { at: number; intent: Intent }[] = [];
  const at = (re: RegExp) => t.search(re);

  const unit = unitNumber(t);

  // «كم باقي على اختباري» سؤال جاهزية لا طلب اختبار
  const isReadiness = at(RE.readiness) >= 0;
  if (isReadiness) found.push({ at: at(RE.readiness), intent: { type: "readiness" } });

  if (at(RE.summary) >= 0) found.push({ at: at(RE.summary), intent: { type: "summary", unit } });
  if (at(RE.mistakes) >= 0) found.push({ at: at(RE.mistakes), intent: { type: "mistakes" } });
  else if (!isReadiness && at(RE.quiz) >= 0) found.push({ at: at(RE.quiz), intent: { type: "quiz", unit } });
  if (at(RE.focus) >= 0) found.push({ at: at(RE.focus), intent: { type: "focus" } });

  if (at(RE.remind) >= 0) {
    const time = parseTime(t, nowHour);
    if (time) {
      const after = t.slice(at(RE.remind)).replace(RE.remind, "").replace(/(?:الساعه|ساعه|at)\s+\S+(\s+(الليل|مساء|صباحا|الصبح|pm|am))?/, "");
      const what = after.replace(/^(ب|بال|عن|to)\s*/, "").trim();
      found.push({ at: at(RE.remind), intent: { type: "remind", hour: time.hour, minute: time.minute, what } });
    }
  }
  // «بطاقه» داخل التذكير («ذكرني بمراجعة البطاقات») لا تعني فتح البطاقات الآن
  if (at(RE.cards) >= 0 && !found.some((f) => f.intent.type === "remind")) {
    found.push({ at: at(RE.cards), intent: { type: "cards" } });
  }
  // «كمّل» وحدها تعني متابعة القراءة؛ مع أوامر أخرى فهي ربط («وكمل…») فلا تُحسب
  if (at(RE.resume) >= 0 && found.length === 0) found.push({ at: at(RE.resume), intent: { type: "resume" } });

  if (found.length === 0) return [{ type: "ask", question: raw.trim() }];
  return found.sort((a, b) => a.at - b.at).map((f) => f.intent);
}

// ===== وضع المشي: كلمة واحدة أثناء الاستماع =====

export type WalkCommand = "repeat" | "explain" | "card" | "pause" | "resume" | "with";

/** آخر أمر قصير في النص المسموع (يُفحص آخر الكلام فقط حتى لا يلتقط كلامًا قديمًا) */
export function parseWalkCommand(raw: string): WalkCommand | null {
  const words = normalize(raw).split(" ").slice(-3).join(" ");
  if (!words) return null;
  if (/(اعاده|اعيد|عيد|كرر|repeat|again)/.test(words)) return "repeat";
  if (/(اشرح|شرح|ابسط|وضح|explain|simpler)/.test(words)) return "explain";
  if (/(بطاقه|احفظ|save|card)/.test(words)) return "card";
  if (/(وقف|توقف|اسكت|ايقاف|pause|stop)/.test(words)) return "pause";
  if (/(كمل|اكمل|تابع|شغل|continue|resume|play)/.test(words)) return "resume";
  if (/(معك|معاك|معاي|نعم|ايوه|اي|yes|with you)/.test(words)) return "with";
  return null;
}
