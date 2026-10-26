// tests/fixtures-slides.ts
// مشاهد اختبار لأشكال شرائح «ملخّص الفيديو»: كل قالب، وحالات الضغط (نصوص طويلة، أعمدة ممتلئة،
// سؤال طويل بخيارات طويلة)، وفيديو قديم بلا layout ولا final. يستعملها اختبار النواة ومنفّذو الأشكال.
import type { VideoScene } from "../lib/videoScriptCore.ts";

const long = (base: string, n: number) => {
  let s = base;
  while (s.length < n) s += " " + base;
  return s.slice(0, n).trim();
};

export const F = {
  cover: { kind: "slide", layout: "cover", emoji: "🎬", title: "التنفيذ الجبري للأحكام", highlight: "حين يتحول الحكم من ورق إلى واقع", bullets: ["السند التنفيذي", "قاضي التنفيذ", "شروط التنفيذ", "الحجز", "المزاد"], narration: "مرحبًا، نبدأ رحلة التنفيذ الجبري." },
  list: { kind: "slide", layout: "list", emoji: "📌", title: "خصائص السند التنفيذي", bullets: ["مكتوب وموقّع", "يتضمن حقًا محقق الوجود", "معيّن المقدار", "حالّ الأداء"], narration: "للسند التنفيذي خصائص أربع." },
  steps: { kind: "slide", layout: "steps", emoji: "🧭", title: "مراحل التنفيذ", bullets: ["التقديم: طلب التنفيذ إلكترونيًا", "الإبلاغ: إشعار المنفذ ضده", "المهلة: خمسة أيام للوفاء", "الحجز: على الأموال عند الامتناع"], narration: "يمر التنفيذ بأربع مراحل." },
  cards: { kind: "slide", layout: "cards", emoji: "🧩", title: "أطراف التنفيذ", bullets: ["طالب التنفيذ: صاحب الحق", "المنفذ ضده: المدين", "قاضي التنفيذ: المشرف على الإجراءات"], narration: "للتنفيذ ثلاثة أطراف." },
  compare: { kind: "slide", layout: "compare", emoji: "⚖️", title: "التنفيذ الاختياري والجبري", bullets: [], columns: [{ title: "الاختياري", bullets: ["برضا المدين", "بلا إجراءات"] }, { title: "الجبري", bullets: ["بقوة السلطة", "بإجراءات نظامية"] }], narration: "نقارن بين نوعي التنفيذ." },
  stat: { kind: "slide", layout: "stat", emoji: "📈", title: "عدد مواد النظام", highlight: "٩٨ مادة", bullets: ["في ثمانية فصول", "تغطي كل الإجراءات"], narration: "يتكون النظام من ثمان وتسعين مادة." },
  quoteRule: { kind: "slide", layout: "quote", emoji: "📜", title: "نص المادة الأولى", highlight: "لا يجوز التنفيذ الجبري إلا بسند تنفيذي", bullets: ["قاعدة أساسية"], narration: "تنص المادة الأولى على قاعدة مهمة." },
  summary: { kind: "slide", layout: "summary", emoji: "✨", title: "الخلاصة", bullets: ["السند أساس التنفيذ", "القاضي يشرف", "المهلة خمسة أيام"], narration: "خلاصة ما سبق." },
  // القوالب المستنتجة
  defineQuote: { kind: "slide", layout: "quote", emoji: "📘", title: "السند التنفيذي", highlight: "ورقة تمنح صاحبها حق التنفيذ الجبري", bullets: ["لغةً: ما يُستند إليه ويُعتمد عليه", "من أمثلته الأحكام القضائية"], narration: "ما السند التنفيذي؟" },
  defineCompare: { kind: "slide", layout: "compare", emoji: "📘", title: "تعريف التنفيذ", bullets: [], columns: [{ title: "في اللغة", bullets: ["الإنجاز والإتمام"] }, { title: "في الاصطلاح", bullets: ["إجراءات تتخذها السلطة لاقتضاء الحق"] }], narration: "التنفيذ لغةً واصطلاحًا." },
  range: { kind: "slide", layout: "stat", emoji: "📅", title: "مدة الإعلان عن المزاد", highlight: "١٥–٣٠ يومًا", bullets: ["لا تقل عن خمسة عشر", "ولا تزيد على ثلاثين"], narration: "يُعلن عن المزاد قبل موعده." },
  rangeYears: { kind: "slide", layout: "stat", emoji: "📈", title: "فترة التطبيق", highlight: "من 2015 إلى 2020", bullets: ["خمس سنوات"], narration: "طُبّق خمس سنوات." },
  seal: { kind: "slide", layout: "quote", emoji: "📜", title: "نظام التنفيذ", highlight: "صدر بالمرسوم الملكي عام ١٤٣٣هـ", bullets: ["المرجع الأساسي"], narration: "صدر النظام عام ألف وأربعمئة وثلاثة وثلاثين." },
  groups: { kind: "slide", layout: "cards", emoji: "🗂", title: "شروط التنفيذ", highlight: "٤", bullets: ["شروط في السند", "شروط في الحق", "شروط في الأطراف", "شروط في الإجراءات"], narration: "شروط التنفيذ أربع مجموعات." },
  treeCompare: { kind: "slide", layout: "compare", emoji: "🌳", title: "أنواع التنفيذ", bullets: [], columns: [{ title: "التنفيذ المباشر", bullets: ["عيني", "يرد على الشيء نفسه"] }, { title: "التنفيذ بطريق الحجز", bullets: ["على الأموال", "ثم البيع"] }], narration: "للتنفيذ نوعان." },
  treeCards: { kind: "slide", layout: "cards", emoji: "🌳", title: "أقسام السندات التنفيذية", bullets: ["الأحكام: الصادرة من المحاكم", "المحررات: الموثقة رسميًا", "الأوراق التجارية: الشيكات والكمبيالات"], narration: "تنقسم السندات إلى ثلاثة أقسام." },
  // الأسئلة
  checkNoOpts: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "لماذا يشترط النظام أن يكون الحق معيّن المقدار قبل التنفيذ؟", answer: "لأن التنفيذ يقع على مال محدد، فلا يُحجز إلا بقدر الحق.", narration: "سؤال سريع." },
  check2: { kind: "check", emoji: "🤔", title: "سؤال سريع", bullets: [], question: "هل يجوز التنفيذ بلا سند تنفيذي؟\nأ) نعم\nب) لا", answer: "ب) لا، لأن السند أساس التنفيذ.", narration: "سؤال." },
  check4: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "ما المهلة الممنوحة للمنفذ ضده للوفاء؟\n(أ) ثلاثة أيام\n(ب) خمسة أيام\n(ج) عشرة أيام\n(د) شهر", answer: "الجواب: ب، لأن النظام حددها بخمسة أيام من الإبلاغ.", narration: "سؤال." },
  check6: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "أي مما يلي سند تنفيذي؟\nأ- الحكم القضائي\nب- العقد العرفي\nج- الشيك\nد- المحرر الموثق\nهـ- أوراق الدعوى\nو- محضر الصلح المصدق", answer: "د) المحرر الموثق، لأنه سند تنفيذي بنص النظام.", narration: "سؤال." },
  checkByText: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "من يشرف على التنفيذ؟\nأ) قاضي التنفيذ\nب) المدعي العام", answer: "قاضي التنفيذ هو المشرف، لأن النظام أناط به ذلك.", narration: "سؤال." },
  checkTwoTexts: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "أيهما سند تنفيذي؟\nأ) الحكم القضائي\nب) الشيك\nج) العقد العرفي", answer: "الحكم القضائي والشيك كلاهما سند تنفيذي.", narration: "سؤال." },
  checkUnsure: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "اختيار:\nأ) صح\nب) خطأ", answer: "العبارة تحتمل الوجهين حسب الحالة.", narration: "سؤال." },
  finalQ: { kind: "check", emoji: "🤔", title: "", bullets: [], question: "ميّز بين التنفيذ المباشر والتنفيذ بطريق الحجز.", answer: "المباشر يرد على الشيء نفسه، والحجز يرد على المال ثم يباع.", narration: "سؤال ختامي.", final: "q" },
  finalEx: { kind: "check", emoji: "📝", title: "تمرين", bullets: [], question: "تمرين ١: صدر حكم بإلزام خالد بدفع مئة ألف ريال، فامتنع. ما الإجراء التالي؟", answer: "يُحجز على أمواله بعد انقضاء المهلة، لأن الامتناع يبيح التنفيذ الجبري.", narration: "تمرين.", final: "ex" },
  finalExCase: { kind: "slide", layout: "list", emoji: "📝", title: "دراسة حالة", bullets: ["شركة ممتنعة عن الوفاء", "سند تنفيذي صادر لصالح مورّد"], narration: "دراسة حالة.", final: "ex" },
  qIntro: { kind: "slide", layout: "list", emoji: "📝", title: "أسئلة الوحدة", bullets: ["سؤال", "وقت للتفكير", "الجواب وسببه"], narration: "حان وقت أسئلة الوحدة." },
} satisfies Record<string, VideoScene>;

/** الضغط: ٦ نقاط × ١١٠ أحرف، وعنوان ٩٠ حرفًا */
export const STRESS_LIST: VideoScene = {
  kind: "slide",
  layout: "list",
  emoji: "📌",
  title: long("إجراءات التنفيذ الجبري على الأموال المنقولة والعقارية في النظام", 90),
  bullets: Array.from({ length: 6 }, (_, i) => long(`النقطة ${i + 1}: شرح مفصل للإجراء يذكر شروطه ومدته ومن يقوم به وما يترتب عليه`, 110)),
  narration: "قائمة طويلة.",
};

/** الضغط: مقارنة بعمودين في كل منهما ٥ نقاط */
export const STRESS_COMPARE: VideoScene = {
  kind: "slide",
  layout: "compare",
  emoji: "⚖️",
  title: "الحجز التحفظي والحجز التنفيذي",
  bullets: [],
  columns: [
    { title: "الحجز التحفظي", bullets: Array.from({ length: 5 }, (_, i) => long(`خاصية ${i + 1} للحجز التحفظي تمنع التصرف في المال`, 70)) },
    { title: "الحجز التنفيذي", bullets: Array.from({ length: 5 }, (_, i) => long(`خاصية ${i + 1} للحجز التنفيذي تمهد لبيع المال`, 70)) },
  ],
  narration: "مقارنة طويلة.",
};

/** الضغط: سؤال ٤٠٠ حرف بأربعة خيارات × ٨٠ حرفًا، وجواب ٣٥٠ حرفًا */
export const STRESS_CHECK: VideoScene = {
  kind: "check",
  emoji: "🤔",
  title: "",
  bullets: [],
  question: [
    long("صدر حكم نهائي لصالح مؤسسة تجارية بإلزام مدين بمبلغ كبير، ثم تقدمت المؤسسة بطلب التنفيذ، فأبلغ المدين ولم يوفِ خلال المهلة، وادعى أن لديه اعتراضًا على الحكم", 400),
    ...["أ", "ب", "ج", "د"].map((m) => `${m}) ${long(`خيار ${m} يصف إجراءً محتملًا يتخذه قاضي التنفيذ في هذه الحالة`, 80)}`),
  ].join("\n"),
  answer: long("ج) لأن الاعتراض لا يوقف التنفيذ إلا بأمر من المحكمة المختصة، فيمضي قاضي التنفيذ في الحجز", 350),
  narration: "سؤال طويل.",
  final: "q",
};

/** فيديو قديم: بلا layout ولا final ولا topic — التخطيط يُستنتج من الموضع والنقاط */
export const OLD_VIDEO: VideoScene[] = [
  { kind: "slide", emoji: "🎬", title: "مقدمة الوحدة", bullets: ["المحور الأول", "المحور الثاني"], narration: "مقدمة." },
  { kind: "slide", emoji: "📌", title: "تعريفات", bullets: ["السند: ورقة تنفيذية", "القاضي: المشرف"], narration: "تعريفات." },
  { kind: "slide", emoji: "📌", title: "نقاط", bullets: ["نقطة عادية", "نقطة أخرى"], narration: "نقاط." },
  { kind: "check", emoji: "🤔", title: "", bullets: [], question: "ما السند؟", answer: "ورقة تنفيذية.", narration: "سؤال." },
  { kind: "slide", emoji: "✨", title: "الخلاصة", bullets: ["خلاصة"], narration: "خلاصة." },
];

/** فيديو بصيغة «ملخّص الفيديو ٢» كاملًا: افتتاح، شرح، سؤال فهم، خلاصة، «أسئلة الوحدة»، أسئلة ختامية وتمارين */
export const V2_VIDEO: VideoScene[] = [F.cover, F.list, F.check2, F.compare, F.summary, F.qIntro, F.finalQ, { ...F.check4, final: "q" as const }, F.finalExCase, F.finalEx];
