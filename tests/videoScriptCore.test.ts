// tests/videoScriptCore.test.ts
// اختبارات قراءة سيناريو «ملخّص الفيديو» (كاملًا وأثناء البثّ) وتقسيم الملخّص إلى أجزاء.
import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeVideo, parsePartialVideo, parseVideo, videoParts } from "../lib/videoScriptCore.ts";

const full = JSON.stringify({
  title: "التضخم",
  scenes: [
    { layout: "cover", emoji: "🎬", title: "التضخم", highlight: "ارتفاع الأسعار", bullets: ["أنواعه"], narration: "لنتعرّف على التضخم." },
    { layout: "compare", emoji: "⚖️", title: "مقارنة", columns: [{ title: "أ", bullets: ["١"] }, { title: "ب", bullets: ["٢"] }], bullets: [], narration: "نلاحظ الفرق." },
    { layout: "check", emoji: "🤔", title: "", question: "ما التضخم؟", answer: "ارتفاع عام للأسعار.", narration: "سؤال سريع: ما التضخم؟" },
    { layout: "stat", emoji: "📈", title: "رقم", highlight: "", bullets: ["نقطة"], narration: "رقم مهم." },
    { layout: "list", emoji: "📌", title: "بلا راوٍ", bullets: ["x"], narration: "" },
  ],
});

test("قراءة كاملة: تخطيطات، سؤال سريع، وإصلاح البيانات الناقصة", () => {
  const v = parseVideo(full)!;
  assert.equal(v.title, "التضخم");
  assert.equal(v.scenes.length, 4); // مشهد بلا راوٍ يُستبعد
  assert.equal(v.scenes[0].layout, "cover");
  assert.equal(v.scenes[1].columns?.length, 2);
  assert.equal(v.scenes[2].kind, "check");
  assert.equal(v.scenes[2].answer, "ارتفاع عام للأسعار.");
  assert.equal(v.scenes[3].layout, "list"); // stat بلا رقم بارز → قائمة
});

test("أثناء البثّ: المشاهد المكتملة فقط، ولا يكسرها قوس داخل نص", () => {
  const cut = full.slice(0, full.indexOf('"layout":"check"') + 30);
  const p = parsePartialVideo(cut)!;
  assert.equal(p.scenes.length, 2);
  const tricky = '{"title":"ت","scenes":[{"layout":"list","title":"أقواس { داخل } النص","bullets":["]"],"narration":"شرح فيه } قوس"},{"layout":"list","narr';
  assert.equal(parsePartialVideo(tricky)!.scenes[0].title, "أقواس { داخل } النص");
});

test("ردّ مقطوع: parseVideo يعيد ما اكتمل", () => {
  const v = parseVideo(full.slice(0, full.length - 120));
  assert.ok(v && v.scenes.length >= 2);
});

test("الدمج بالترتيب وعنوان الجزء الأول", () => {
  const a = parseVideo(full)!;
  const m = mergeVideo([a, { title: "آخر", scenes: a.scenes.slice(0, 1) }])!;
  assert.equal(m.title, "التضخم");
  assert.equal(m.scenes.length, 5);
});

test("تقسيم الملخّص: أجزاء ≤ الحد، الأول بالغلاف والأخير بالخلاصة وأهم النقاط", () => {
  const long = "جملة طويلة للشرح. ".repeat(260);
  const s = {
    title: "وحدة",
    intro: "تمهيد",
    sections: [1, 2, 3].map((i) => ({ emoji: "📌", heading: `قسم ${i}`, blocks: [{ type: "text" as const, text: long }] })),
    keypoints: ["نقطة مهمة"],
  };
  const parts = videoParts(s, "الوحدة الأولى");
  assert.equal(parts.length, 3);
  assert.match(parts[0], /ابدأ بمشهد cover/);
  assert.match(parts[1], /لا تضع مشهد cover/);
  assert.match(parts[2], /اختم بمشهد summary/);
  assert.match(parts[2], /نقطة مهمة/);
  assert.doesNotMatch(parts[0], /نقطة مهمة/);
  const one = videoParts({ ...s, sections: s.sections.slice(0, 1) }, "و");
  assert.equal(one.length, 1);
  assert.doesNotMatch(one[0], /الجزء/);
});

// ===== ملخّص الفيديو ٢ =====
import { assembleVideo, isDuplicate, neutralize, type VideoLabels, type VideoScene, type VideoScript } from "../lib/videoScriptCore.ts";
import { fallbackPlan } from "../lib/videoPlanCore.ts";

test("scene: علامة الموضوع والسؤال الختامي تُحفظان، والقيم غير الصالحة تُتجاهل", () => {
  const v = parseVideo(
    JSON.stringify({
      title: "",
      scenes: [
        { topic: "T3", layout: "list", title: "أ", bullets: ["١"], narration: "شرح" },
        { topic: "x9", layout: "check", question: "س؟", answer: "ج", final: true, narration: "سؤال" },
        { topic: "E1", layout: "check", question: "تمرين؟", answer: "ج", final: "ex", narration: "تمرين" },
        { layout: "list", title: "ب", bullets: ["٢"], final: "no", narration: "شرح" },
      ],
    })
  )!;
  assert.equal(v.scenes[0].topic, "T3");
  assert.equal(v.scenes[1].topic, undefined);
  assert.equal(v.scenes[1].final, "q");
  assert.equal(v.scenes[2].final, "ex");
  assert.equal(v.scenes[3].final, undefined);
});

const labels: VideoLabels = { summaryTitle: "الخلاصة", qTitle: "أسئلة الوحدة", qBody: "حان وقت الأسئلة", qBullets: ["سؤال", "وقت للتفكير", "الجواب"], coverAuto: (t, xs) => `${t}: ${xs.join("، ")}` };
const sl = (title: string, bullets: string[], extra: Partial<VideoScene> = {}): VideoScene => ({ kind: "slide", emoji: "📌", layout: "list", title, bullets, narration: `شرح ${title}`, ...extra });
const ck = (question: string, extra: Partial<VideoScene> = {}): VideoScene => ({ kind: "check", emoji: "🤔", title: "", bullets: [], narration: "سؤال", question, answer: "ج", ...extra });
const vplan = () => {
  const p = fallbackPlan({ title: "التنفيذ", intro: "", sections: ["أ", "ب", "ج"].map((h) => ({ emoji: "", heading: `موضوع ${h}`, blocks: [{ type: "text" as const, text: "نص" }] })), keypoints: ["ن١", "ن٢"] });
  return { ...p, cover: { highlight: "لماذا تهم", narration: "افتتاح الخطة" }, summary: { bullets: ["ر١", "ر٢", "ر٣"], narration: "خلاصة الخطة" } };
};
const done = (scenes: VideoScene[]): VideoScript => ({ title: "", scenes, done: true });

test("assembleVideo (أ): افتتاح الخطة أولًا، ولا افتتاح/خلاصة من الأجزاء، ثم الخلاصة وأسئلة الوحدة والختامية والتمارين", () => {
  const plan = vplan();
  const p1 = done([sl("أ ب", ["١"]), ck("سؤال فهم الأول؟"), ck("ختامي ١؟", { final: "q" }), sl("خلاصة جزئية", ["x"], { layout: "summary" })]);
  const p2 = done([sl("افتتاح ثانٍ", ["x"], { layout: "cover" }), sl("ج د", ["٢"]), ck("تمرين ١؟", { final: "ex" }), ck("ختامي ٢؟", { final: "q" })]);
  const v = assembleVideo([p1, p2], { plan, n: 2, labels, unitTitle: "و" });
  assert.equal(v.v, 2);
  assert.deepEqual(
    v.scenes.map((s) => s.layout === "cover" ? "cover" : s.layout === "summary" ? "summary" : s.kind === "check" ? `${s.final ?? "c"}:${s.question}` : s.title),
    ["cover", "أ ب", "c:سؤال فهم الأول؟", "ج د", "summary", "أسئلة الوحدة", "q:ختامي ١؟", "q:ختامي ٢؟", "ex:تمرين ١؟"]
  );
  assert.equal(v.scenes[0].narration, "افتتاح الخطة");
  assert.equal(v.scenes[0].highlight, "لماذا تهم");
  assert.equal(v.scenes[4].title, "الخلاصة");
  assert.equal(v.scenes[4].narration, "خلاصة الخطة");
});

test("assembleVideo (ب): لا خلاصة ولا أسئلة قبل اكتمال كل الأجزاء", () => {
  const plan = vplan();
  const parts = [done([sl("أ ب", ["١"])]), done([sl("ج د", ["٢"])]), { title: "", scenes: [sl("هـ و", ["٣"]), ck("ختامي؟", { final: "q" })] }];
  const mid = assembleVideo(parts, { plan, n: 3, labels, unitTitle: "و" });
  assert.ok(!mid.scenes.some((s) => s.layout === "summary" || s.final));
  const all = assembleVideo([...parts.slice(0, 2), { ...parts[2], done: true }], { plan, n: 3, labels, unitTitle: "و" });
  assert.ok(all.scenes.some((s) => s.layout === "summary"));
  assert.equal(all.scenes[all.scenes.length - 1].final, "q");
  // جزء فاشل (ناقص من القائمة): لا خلاصة
  assert.ok(!assembleVideo(parts.slice(0, 2), { plan, n: 3, labels, unitTitle: "و" }).scenes.some((s) => s.layout === "summary"));
});

test("assembleVideo (ج): كل لقطة أثناء البثّ بداية للنتيجة النهائية (أرقام المشاهد لا تتغير)", () => {
  const plan = vplan();
  const a = [sl("حالات التنفيذ المعجّل (م169)", ["الأمور المستعجلة", "النفقة"]), ck("س١؟"), ck("س٢؟"), sl("مثال", ["مثال: ١"]), ck("خ١؟", { final: "q" })];
  const b = [sl("حالات التنفيذ المعجل في المادة ١٦٩", ["الأمور المستعجلة", "النفقة"]), sl("أنواع الأحكام", ["المنشئ"]), ck("ت؟", { final: "ex" }), sl("مثال", ["مثال: ٢"]), sl("خلاصة", ["x"], { layout: "summary" })];
  const fullV = assembleVideo([done(a), done(b)], { plan, n: 2, labels, unitTitle: "و" }).scenes.map((s) => JSON.stringify(s));
  const snaps: VideoScript[][] = [];
  for (let k = 0; k <= a.length; k++) snaps.push([{ title: "", scenes: a.slice(0, k) }]);
  for (let k = 0; k <= b.length; k++) snaps.push([done(a), { title: "", scenes: b.slice(0, k) }]);
  for (const list of snaps) {
    const got = assembleVideo(list, { plan, n: 2, labels, unitTitle: "و" }).scenes.map((s) => JSON.stringify(s));
    assert.deepEqual(got, fullV.slice(0, got.length));
  }
});

test("assembleVideo (د): تكرار حقيقي من ف١ (م169 في ج٢م٩ ثم ج٤م٥) يُحذف، والجديد حقًا يبقى", () => {
  const j2m9 = sl("حالات التنفيذ المعجّل (م169)", [
    "الأحكام الصادرة في الأمور المستعجلة",
    "أحكام نفقة، أو أجرة رضاع، أو سكن، أو رؤية صغير، أو تسليم الحاضن، أو عودة المرأة إلى محرمها، أو تفريق بين زوجين",
    "أحكام أجرة خادم، أو صانع، أو عامل، أو مرضعة، أو حاضن",
  ]);
  const j4m5 = sl("حالات التنفيذ المعجل في المادة ١٦٩", [
    "الأحكام الصادرة في الأمور المستعجلة",
    "النفقة وأجرة الرضاعة والسكن",
    "رؤية الصغير وتسليمه لحاضنه",
    "نقل امرأة إلى محرمها والتفريق بين زوجين",
    "أجرة خادم أو صانع أو عامل أو مرضع أو حاضن",
  ]);
  assert.equal(isDuplicate(j4m5, [j2m9]), true);
  // العنوان نفسه وفيه ٤٠٪ نقاط جديدة → يبقى
  const more = sl("حالات التنفيذ المعجّل (م169)", ["الأحكام الصادرة في الأمور المستعجلة", "أحكام نفقة أو سكن أو رؤية صغير", "الكفالة شرط جوازي للمحكمة", "يقدّر القاضي خطر التأخير"]);
  assert.equal(isDuplicate(more, [j2m9]), false);
  // مشهدا «مثال» بالنقاط نفسها يبقيان (عنوان عام)
  assert.equal(isDuplicate(sl("مثال", ["مثال: حكم نفقة"]), [sl("مثال", ["مثال: حكم نفقة"])]), false);
  // سؤال شبه مطابق يُحذف، ومختلف يبقى
  assert.equal(isDuplicate(ck("هل يصح أن يتفق الخصمان قبل صدور الحكم على عدم الطعن فيه؟ ولماذا؟"), [ck("هل يصح أن يتفق الخصمان قبل صدور الحكم على عدم الطعن فيه ولماذا")]), true);
  assert.equal(isDuplicate(ck("ما مدة الإعذار؟"), [ck("أي أنواع الأحكام سند تنفيذي؟")]), false);
  const stats = { dropped: 0 };
  const v = assembleVideo([done([j2m9]), done([j4m5])], { plan: vplan(), n: 2, labels, unitTitle: "و", stats });
  assert.equal(v.scenes.filter((s) => /المعجل|المعجّل/.test(s.title)).length, 1);
  assert.equal(stats.dropped, 1);
});

test("assembleVideo (هـ): سؤالا فهم متتاليان → الثاني ختامي في النهاية", () => {
  const v = assembleVideo([done([sl("أ ب", ["١"]), ck("س١؟"), ck("س٢؟"), sl("ج د", ["٢"])])], { plan: vplan(), n: 1, labels, unitTitle: "و" });
  const qs = v.scenes.map((s) => (s.kind === "check" ? `${s.final ?? "c"}:${s.question}` : ""));
  assert.ok(qs.indexOf("c:س١؟") < qs.indexOf("q:س٢؟"));
  assert.ok(v.scenes.findIndex((s) => s.layout === "summary") < qs.indexOf("q:س٢؟"));
});

test("assembleVideo (و): الجزء الوحيد بلا خطة — افتتاحه يبقى أولًا، وخلاصته بعد الشرح ثم الأسئلة", () => {
  const v = assembleVideo(
    [done([sl("عنوان", ["x"], { layout: "cover" }), sl("أ ب", ["١"]), ck("خ؟", { final: "q" }), sl("الخلاصة", ["ر"], { layout: "summary" }), sl("ج د", ["٢"])])],
    { plan: null, n: 1, labels, unitTitle: "و" }
  );
  assert.deepEqual(
    v.scenes.map((s) => s.layout === "cover" ? "cover" : s.layout === "summary" ? "summary" : s.final ? "q" : s.title),
    ["cover", "أ ب", "ج د", "summary", "أسئلة الوحدة", "q"]
  );
});

test("assembleVideo (ز): الصيغة المذكّرة تُحيَّد في كل نصوص المشهد", () => {
  const v = assembleVideo([done([sl("أ ب", ["انتبه لهذا الفرق"], { narration: "انتبه لهذا الفرق. فكّر قليلًا في السبب." })])], { plan: vplan(), n: 1, labels, unitTitle: "و" });
  const s = v.scenes[1];
  assert.equal(s.narration, "من المهم الانتباه لهذا الفرق. لنفكّر قليلًا في السبب.");
  assert.equal(s.bullets[0], "من المهم الانتباه لهذا الفرق");
});

test("neutralize: يحوّل أفعال الأمر المذكّرة في أول الجملة ولا يمسّ غيرها", () => {
  assert.equal(neutralize("فكّر قليلًا في الإلزام والاختيار"), "لنفكّر قليلًا في الإلزام والاختيار");
  assert.equal(neutralize("لاحظ أن الحكم نهائي"), "نلاحظ أن الحكم نهائي");
  assert.equal(neutralize("الحكم نهائي. تذكَّر أن الطعن مقيّد"), "الحكم نهائي. لنتذكّر أن الطعن مقيّد");
  assert.equal(neutralize("احفظ هذه القاعدة"), "من المفيد حفظ هذه القاعدة");
  assert.equal(neutralize("وانتبه إلى الاستثناء"), "ومن المهم الانتباه إلى الاستثناء");
  for (const same of ["لاحظ المشرّع ذلك", "الانتباه مهم هنا", "يُلاحظ أن الحكم", "نلاحظ أن الحكم", "يفكّر القاضي مليًا", "تذكر المادة العاشرة ثلاثة شروط", "ركّز المشرّع على الحماية", "والله أعلم", "انتبه المشرع إلى الخطر"]) {
    assert.equal(neutralize(same), same);
  }
});

// ===== حالات من التشخيص (٢٦ أكتوبر) =====
import { isClosingTitle } from "../lib/qualityCore.ts";

test("isClosingTitle: عناوين الخاتمة وحدها، لا عناوين الشرح التي تبدأ بكلمة «ملخص/خلاصة»", () => {
  for (const t of ["الخلاصة", "خلاصة الجزء", "خلاصة الجزء الأول", "في الختام", "ختامًا", "مراجعة سريعة لما سبق", "أهم النقاط", "ملخّص الوحدة", "وأخيرًا", "Summary", "Recap"]) assert.equal(isClosingTitle(t), true, t);
  for (const t of ["ملخص الحكم", "خلاصة نظرية الالتزام", "حالات التنفيذ المعجل", "مثال", "", "أهم النقاط في الكفالة والضمان"]) assert.equal(isClosingTitle(t), false, t);
});

test("خاتمة وسطية: «خلاصة الجزء» و«في الختام» في وسط الفيديو لا تبقى، والخلاصة الوحيدة بعد كل الشرح", () => {
  const p1 = done([sl("أ ب", ["١"]), sl("خلاصة الجزء", ["تكرار أ"]), sl("في الختام", ["تكرار ب"], { layout: "quote" })]);
  const p2 = done([sl("ج د", ["٢"]), ck("ختامي؟", { final: "q" })]);
  const v = assembleVideo([p1, p2], { plan: vplan(), n: 2, labels, unitTitle: "و" });
  assert.deepEqual(
    v.scenes.map((s) => (s.layout === "cover" ? "cover" : s.layout === "summary" ? "summary" : s.kind === "check" ? `${s.final ?? "c"}:${s.question}` : s.title)),
    ["cover", "أ ب", "ج د", "summary", "أسئلة الوحدة", "q:ختامي؟"]
  );
  // أثناء الكتابة أيضًا: لا تظهر الخاتمة الوسطية ثم تختفي (أرقام المشاهد ثابتة)
  const mid = assembleVideo([p1, { title: "", scenes: p2.scenes.slice(0, 1) }], { plan: vplan(), n: 2, labels, unitTitle: "و" });
  assert.deepEqual(mid.scenes.map((s) => JSON.stringify(s)), v.scenes.slice(0, mid.scenes.length).map((s) => JSON.stringify(s)));
  assert.ok(!mid.scenes.some((s) => isClosingTitle(s.title) || s.layout === "summary"));
});

test("خاتمة وسطية بلا خطة (الجزء الوحيد): تُستعمل الخلاصة الحقيقية في آخره لا «خلاصة الجزء» الوسطية", () => {
  const v = assembleVideo(
    [done([sl("عنوان", ["x"], { layout: "cover" }), sl("أ ب", ["١"]), sl("خلاصة الجزء", ["وسطية"]), sl("ج د", ["٢"]), sl("الخلاصة", ["الحقيقية"], { layout: "summary" }), ck("خ؟", { final: "q" })])],
    { plan: null, n: 1, labels, unitTitle: "و" }
  );
  assert.deepEqual(v.scenes.map((s) => (s.layout === "summary" ? `summary:${s.bullets[0]}` : s.final ? "q" : s.title)), ["عنوان", "أ ب", "ج د", "summary:الحقيقية", "أسئلة الوحدة", "q"]);
});

test("الفيديوهات المحفوظة قبل التحديث تُقرأ كما هي (بلا topic ولا final ولا v)", () => {
  const old = parseVideo(full)!;
  assert.equal(old.v, undefined);
  assert.ok(old.scenes.every((s) => s.topic === undefined && s.final === undefined));
  assert.equal(mergeVideo([old])!.scenes.length, old.scenes.length);
});

test("سؤال فهم قبل أي شرح (بعد الافتتاح مباشرة) يُنقل لأسئلة النهاية", () => {
  const v = assembleVideo([done([ck("مبكر؟"), sl("أ ب", ["١"]), ck("بعد الشرح؟")])], { plan: vplan(), n: 1, labels, unitTitle: "و" });
  const qs = v.scenes.map((s) => (s.kind === "check" ? `${s.final ?? "c"}:${s.question}` : s.layout ?? s.title));
  assert.deepEqual(qs, ["cover", "list", "c:بعد الشرح؟", "summary", "list", "q:مبكر؟"]);
});
