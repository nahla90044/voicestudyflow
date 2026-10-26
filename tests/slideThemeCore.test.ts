// tests/slideThemeCore.test.ts
// اختبارات نواة أشكال شرائح «ملخّص الفيديو»: الدور، واستنتاج القوالب ورجوعها الآمن، والسؤال وجوابه،
// والترجمة كلمةً كلمة، وتقدير الخط والأعمدة، والشكل في «منوّع».
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildModel,
  captionAt,
  captionChunk,
  fitFont,
  fitGrid,
  isThemePref,
  kindOf,
  linesFor,
  matchAnswer,
  parseQuestion,
  pickTheme,
  revealAt,
  sceneRole,
  TEMPLATES,
  toLatinDigits,
  toLocalDigits,
  type SceneRole,
} from "../lib/slideThemeCore.ts";
import type { VideoScene } from "../lib/videoScriptCore.ts";
import { F, OLD_VIDEO, STRESS_CHECK, STRESS_COMPARE, STRESS_LIST, V2_VIDEO } from "./fixtures-slides.ts";

const Q_TITLES = ["أسئلة الوحدة", "Unit questions"];
const model = (s: VideoScene, role: SceneRole = "body", i = 1, n = 6) => buildModel(s, i, n, role);

test("اختيار الشكل: القيم الصالحة فقط", () => {
  for (const v of ["mixed", "editorial", "visual", "cinematic"]) assert.equal(isThemePref(v), true);
  for (const v of ["", "magazine", null, undefined, 3, "Mixed"]) assert.equal(isThemePref(v), false);
});

test("الدور في فيديو «ملخّص الفيديو ٢»: افتتاح، شرح، فهم، خلاصة، تمهيد، ختامي، تمارين", () => {
  const roles = V2_VIDEO.map((_, i) => sceneRole(V2_VIDEO, i, Q_TITLES));
  assert.deepEqual(roles, ["cover", "body", "check", "body", "summary", "qIntro", "finalQ", "finalQ", "finalEx", "finalEx"]);
});

test("الدور في فيديو قديم بلا layout ولا final: من الموضع", () => {
  const roles = OLD_VIDEO.map((_, i) => sceneRole(OLD_VIDEO, i, Q_TITLES));
  assert.deepEqual(roles, ["cover", "body", "body", "check", "summary"]);
  // أثناء الكتابة (total أكبر): آخر مشهد موجود ليس خلاصة بعد
  assert.equal(sceneRole(OLD_VIDEO, 4, Q_TITLES, 9), "body");
});

test("تمهيد الأسئلة: بالعنوان بعد التطبيع وباللغتين، أو بما بعده — ولا يكون المشهد الأول", () => {
  const intro = { ...F.qIntro, title: "  أسئلةُ الوحدةِ " };
  assert.equal(sceneRole([F.cover, intro], 1, Q_TITLES), "qIntro");
  assert.equal(sceneRole([F.cover, { ...F.qIntro, title: "unit QUESTIONS" }], 1, Q_TITLES), "qIntro");
  assert.equal(sceneRole([F.cover, { ...F.list, title: "مراجعة" }, F.finalQ], 1, Q_TITLES), "qIntro");
  assert.equal(sceneRole([intro, F.list], 0, Q_TITLES), "body"); // الأول لا يكون تمهيدًا (تخطيطه list)
  // خلاصة يليها سؤال ختامي مباشرة تبقى خلاصة
  assert.equal(sceneRole([F.cover, F.list, F.summary, F.finalQ], 2, Q_TITLES), "summary");
  // مشهد غير موجود
  assert.equal(sceneRole([], 3, Q_TITLES), "body");
});

test("القوالب الأصلية تبقى كما هي", () => {
  assert.equal(model(F.list).template, "list");
  assert.equal(model(F.steps).template, "steps");
  assert.equal(model(F.cards).template, "cards");
  assert.equal(model(F.stat).template, "stat");
  assert.equal(model(F.quoteRule).template, "quote");
  assert.equal(model(F.summary, "summary").template, "summary");
  assert.equal(model(F.cover, "cover", 0).template, "cover");
  const c = model(F.compare);
  assert.equal(c.template, "compare");
  assert.equal(c.columns?.length, 2);
  assert.deepEqual(c.columns?.map((x) => x.items.length), [2, 2]);
  // نقاط العمودين متتالية بعتبات متصاعدة، وهي نفس كائنات items
  assert.equal(c.items.length, 4);
  assert.ok(c.items.every((it, i) => i === 0 || it.at > c.items[i - 1].at));
  assert.equal(c.columns?.[1].items[0], c.items[2]);
});

test("النقاط: الرأس والشرح وعتبة الظهور", () => {
  const m = model(F.cards);
  assert.deepEqual(m.items.map((x) => x.head), ["طالب التنفيذ", "المنفذ ضده", "قاضي التنفيذ"]);
  assert.equal(m.items[0].body, "صاحب الحق");
  assert.deepEqual(m.items.map((x) => x.at), [0, 1, 2].map((i) => revealAt(i, 3)));
  assert.equal(revealAt(0, 1), 0.05);
  assert.equal(revealAt(0, 0), 0.05);
  assert.ok(Math.abs(revealAt(5, 6) - (0.05 + (5 / 6) * 0.8)) < 1e-9);
});

test("التعريف: من quote (المصطلح = العنوان) ومعه «لغةً» من النقاط، ومن compare «اللغة/الاصطلاح»", () => {
  const q = model(F.defineQuote);
  assert.equal(q.template, "define");
  assert.equal(q.define?.term, "السند التنفيذي");
  assert.equal(q.define?.istilah, "ورقة تمنح صاحبها حق التنفيذ الجبري");
  assert.equal(q.define?.lugha, "ما يُستند إليه ويُعتمد عليه");
  assert.equal(q.items.length, 1); // نقطة «لغةً» خرجت من القائمة
  const c = model(F.defineCompare);
  assert.equal(c.template, "define");
  assert.equal(c.define?.lugha, "الإنجاز والإتمام");
  assert.equal(c.define?.istilah, "إجراءات تتخذها السلطة لاقتضاء الحق");
  assert.equal(c.items.length, 0);
  // اقتباس قاعدة/نص يبقى quote، و«انتقال» ليست «قال»
  assert.equal(model(F.quoteRule).template, "quote");
  assert.equal(model({ ...F.defineQuote, title: "انتقال الملكية" }).template, "define");
  assert.equal(model({ ...F.defineQuote, title: "الحكم القضائي" }).template, "define");
});

test("المدى: أرقام هندية، شرط from < to، ومسطرة الأيام", () => {
  const r = model(F.range);
  assert.equal(r.template, "range");
  assert.deepEqual(r.range, { from: 15, to: 30, unit: "يومًا", ruler: true });
  const y = model(F.rangeYears);
  assert.equal(y.template, "range");
  assert.equal(y.range?.from, 2015);
  assert.equal(y.range?.ruler, false);
  // مقلوب أو بلا مدى → stat
  assert.equal(model({ ...F.range, highlight: "٣٠–١٥ يومًا" }).template, "stat");
  assert.equal(model({ ...F.range, highlight: "٣٠ يومًا" }).template, "stat");
  // أكثر من ٦٠ يومًا: مدى بلا مسطرة
  assert.equal(model({ ...F.range, highlight: "30-90 يومًا" }).range?.ruler, false);
});

test("الختم: سنة هجرية في highlight أو العنوان", () => {
  const s = model(F.seal);
  assert.equal(s.template, "seal");
  assert.equal(s.seal?.year, "1433");
  assert.equal(model({ ...F.stat, highlight: "1433هـ" }).template, "seal");
  assert.equal(model({ ...F.list, title: "نظام ١٤٢١ هـ" }).template, "list"); // ٤ نقاط: تبقى قائمة
  assert.equal(model({ ...F.list, title: "نظام ١٤٢١ هـ", bullets: ["أ", "ب"] }).template, "seal");
  assert.equal(model({ ...F.compare, title: "نظام ١٤٢١هـ" }).template, "compare");
});

test("المجموعات: عدد ١..١٢ في highlight مع ٢..٦ نقاط", () => {
  const g = model(F.groups);
  assert.equal(g.template, "groups");
  assert.equal(g.count, 4);
  assert.equal(model({ ...F.list, highlight: "3 شروط" }).template, "groups");
  assert.equal(model({ ...F.groups, highlight: "١٨" }).template, "cards");
  assert.equal(model({ ...F.groups, highlight: "12.5%" }).template, "cards");
  assert.equal(model({ ...F.groups, bullets: ["واحدة"] }).template, "cards");
});

test("الشجرة: compare أو cards بعنوان «أنواع/أقسام» و٢..٤ عقد", () => {
  const t = model(F.treeCompare);
  assert.equal(t.template, "tree");
  assert.equal(t.tree?.root, "أنواع التنفيذ");
  assert.deepEqual(t.tree?.nodes.map((n) => n.leaves.length), [2, 2]);
  assert.equal(t.items.length, 2);
  const c = model(F.treeCards);
  assert.equal(c.template, "tree");
  assert.deepEqual(c.tree?.nodes.map((n) => n.title), ["الأحكام", "المحررات", "الأوراق التجارية"]);
  assert.equal(c.tree?.nodes[0].leaves[0], "الصادرة من المحاكم");
  // ٥ عقد → تبقى بطاقات
  assert.equal(model({ ...F.treeCards, bullets: ["أ: ١", "ب: ٢", "ج: ٣", "د: ٤", "هـ: ٥"] }).template, "cards");
  assert.equal(model({ ...F.treeCards, title: "مفاهيم" }).template, "cards");
});

test("الرجوع الآمن: بيانات ناقصة → القالب الأصلي أو قائمة، ولا خطأ أبدًا", () => {
  assert.equal(model({ ...F.compare, columns: [{ title: "وحيد", bullets: ["١", "٢"] }] }).template, "list");
  assert.deepEqual(model({ ...F.compare, columns: [{ title: "وحيد", bullets: ["١", "٢"] }] }).items.map((x) => x.text), ["١", "٢"]);
  assert.equal(model({ ...F.stat, highlight: undefined }).template, "list");
  assert.equal(model({ ...F.quoteRule, highlight: "" }).template, "list");
  const junk = [{} as VideoScene, { kind: "slide", bullets: null } as unknown as VideoScene, null as unknown as VideoScene, { kind: "check" } as VideoScene];
  for (const s of junk) {
    const m = buildModel(s, 0, 1, "body");
    assert.ok(TEMPLATES.includes(m.template));
    assert.ok(Array.isArray(m.items));
    assert.equal(typeof m.title, "string");
    assert.equal(typeof m.icon, "string");
    assert.ok(m.icon.length > 0);
  }
});

test("تمهيد الأسئلة والختامي والتمرين في النموذج", () => {
  assert.equal(model(F.qIntro, "qIntro").template, "qIntro");
  assert.equal(model(F.qIntro, "qIntro").icon, "megaphone-outline");
  assert.equal(model(F.finalQ, "finalQ").check?.final, "q");
  assert.equal(model(F.finalEx, "finalEx").check?.final, "ex");
  assert.equal(model(F.finalExCase, "finalEx").template, "list");
  assert.equal(model(F.finalExCase, "finalEx").role, "finalEx");
});

test("السؤال: بلا خيارات، وبخيارين وأربعة وستة، والجواب الصحيح", () => {
  const n = model(F.checkNoOpts).check!;
  assert.equal(n.options.length, 0);
  assert.equal(n.correct, -1);
  assert.equal(n.stem, F.checkNoOpts.question);
  const two = model(F.check2).check!;
  assert.deepEqual(two.options, [
    { marker: "أ", text: "نعم" },
    { marker: "ب", text: "لا" },
  ]);
  assert.equal(two.correct, 1);
  const four = model(F.check4).check!;
  assert.equal(four.options.length, 4);
  assert.equal(four.options[2].text, "عشرة أيام");
  assert.equal(four.correct, 1); // «الجواب: ب، …»
  const six = model(F.check6).check!;
  assert.equal(six.options.length, 6);
  assert.equal(six.options[4].marker, "هـ");
  assert.equal(six.correct, 3);
  assert.equal(six.long, true); // أكثر من ٤ خيارات
  assert.equal(model(F.checkByText).check!.correct, 0); // بنص الخيار
  assert.equal(model(F.checkTwoTexts).check!.correct, -1); // خياران في الجواب
  assert.equal(model(F.checkUnsure).check!.correct, -1);
});

test("ضغط: سؤال ٤٠٠ حرف بأربعة خيارات طويلة وجواب ٣٥٠، وقائمة ٦×١١٠، ومقارنة ٥×٥", () => {
  const c = model(STRESS_CHECK, "finalQ").check!;
  assert.equal(c.options.length, 4);
  assert.ok(c.stem.length >= 390);
  assert.ok(c.options.every((o) => o.text.length >= 70));
  assert.equal(c.correct, 2);
  assert.equal(c.long, true);
  const l = model(STRESS_LIST);
  assert.equal(l.items.length, 6);
  assert.equal(l.density, "l");
  assert.ok(l.title.length >= 85);
  const cmp = model(STRESS_COMPARE);
  assert.deepEqual(cmp.columns?.map((x) => x.items.length), [5, 5]);
  assert.ok(cmp.items[cmp.items.length - 1].at <= 0.85);
});

test("parseQuestion: الرموز المختلفة، والتكملة، والخيارات بلا رموز، والخيارات في السطر نفسه", () => {
  assert.deepEqual(parseQuestion("س؟\n(أ) واحد\nب- اثنان\nج. ثلاثة\n1) أربعة\na) five").options.map((o) => o.marker), ["أ", "ب", "ج", "1", "a"]);
  // سطر بلا رمز بعد خيار = تكملته، وقبل أول خيار = تكملة السؤال
  const p = parseQuestion("نص الحالة\nالسؤال؟\nأ) بداية الخيار\nتكملته");
  assert.equal(p.stem, "نص الحالة\nالسؤال؟");
  assert.equal(p.options[0].text, "بداية الخيار تكملته");
  assert.deepEqual(parseQuestion("س؟\nصح\nخطأ").options, [
    { marker: "", text: "صح" },
    { marker: "", text: "خطأ" },
  ]);
  const essay = parseQuestion(`فقرة أولى طويلة\n${"ب".repeat(120)}`);
  assert.equal(essay.options.length, 0);
  assert.ok(essay.stem.includes("\n"));
  const inl = parseQuestion("ما المهلة؟ (أ) يومان (ب) خمسة أيام (ج) شهر");
  assert.equal(inl.stem, "ما المهلة؟");
  assert.deepEqual(inl.options.map((o) => o.text), ["يومان", "خمسة أيام", "شهر"]);
  assert.deepEqual(parseQuestion(""), { stem: "", options: [] });
  // لا يُحذف شيء من نص الخيار (حتى الأقواس داخله)
  assert.equal(parseQuestion("س\nأ) المادة (٣٤) من النظام").options[0].text, "المادة (٣٤) من النظام");
});

test("matchAnswer: بالرمز وببادئة الجواب، ثم بالنص، و-1 عند الشك", () => {
  const o = parseQuestion("س\nأ) الإعلان\nب) التبليغ\nج) الحجز").options;
  assert.equal(matchAnswer(o, "ب"), 1);
  assert.equal(matchAnswer(o, "(ج) لأن…"), 2);
  assert.equal(matchAnswer(o, "الإجابة الصحيحة: أ، لأن…"), 0);
  assert.equal(matchAnswer(o, "الجواب هو ج"), 2);
  assert.equal(matchAnswer(o, "ب لأن الإبلاغ أولًا"), 1);
  assert.equal(matchAnswer(o, "بسبب أن الحجز يأتي أخيرًا"), 2); // «بسبب» ليست الرمز «ب»
  assert.equal(matchAnswer(o, "التبليغ، لأن…"), 1);
  assert.equal(matchAnswer(o, "الإعلان ثم التبليغ"), -1);
  assert.equal(matchAnswer(o, "لا شيء مما سبق"), -1);
  assert.equal(matchAnswer([], "ب"), -1);
  assert.equal(matchAnswer(o, ""), -1);
  const en = parseQuestion("q\na) Court\nb) Notary").options;
  assert.equal(matchAnswer(en, "A court is the answer"), 0); // «A» كلمة لا رمز → بالنص
  assert.equal(matchAnswer(en, "b) Notary, because…"), 1);
});

test("captionAt: الجملة والكلمة حسب التقدّم، لا يتراجع، وصحيح عند الأطراف", () => {
  const txt = "هذه جملة أولى قصيرة. وهذه جملة ثانية أطول قليلًا من الأولى! وأخيرًا جملة ثالثة؟";
  const a = captionAt(txt, 0);
  assert.equal(a.sIndex, 0);
  assert.equal(a.current, 0);
  assert.equal(a.spoken, 0);
  assert.equal(a.sentence, "هذه جملة أولى قصيرة.");
  const z = captionAt(txt, 1);
  assert.equal(z.sentence, "وأخيرًا جملة ثالثة؟");
  assert.equal(z.current, z.words.length - 1);
  let prev = captionAt(txt, 0);
  for (let i = 1; i <= 400; i++) {
    const c = captionAt(txt, i / 400);
    assert.ok(c.sIndex >= prev.sIndex);
    assert.ok(c.spoken >= prev.spoken);
    if (c.sIndex === prev.sIndex) assert.ok(c.current >= prev.current);
    assert.ok(c.current >= 0 && c.current < c.words.length);
    prev = c;
  }
  // قيم خارج المدى ونص فارغ
  assert.equal(captionAt(txt, -3).sIndex, 0);
  assert.equal(captionAt(txt, 9).sIndex, 2);
  assert.equal(captionAt(txt, NaN).sIndex, 0);
  assert.deepEqual(captionAt("", 0.5), { sentence: "", words: [], spoken: 0, current: -1, sIndex: 0 });
  assert.equal(captionAt(null, 0.5).current, -1);
  // التقسيم نفسه القديم: الفاصلة العربية تفصل
  assert.equal(captionAt("أولًا، ثانيًا.", 0).sentence, "أولًا");
});

test("captionChunk: مقطع متوازن يضم الكلمة الحالية ولا يتراجع", () => {
  const words = Array.from({ length: 40 }, (_, i) => `ك${i}`);
  assert.deepEqual(captionChunk({ words: ["أ", "ب"], current: 1 }), { words: ["أ", "ب"], current: 1, chunk: 0 });
  let prev = -1;
  for (let cur = 0; cur < 40; cur++) {
    const c = captionChunk({ words, current: cur }, 18);
    assert.ok(c.words.length <= 18);
    assert.equal(c.words[c.current], `ك${cur}`);
    assert.ok(c.chunk >= prev);
    prev = c.chunk;
  }
  // ٤٠ كلمة → ٣ مقاطع متوازنة (١٤ + ١٤ + ١٢) لا ١٨ + ١٨ + ٤
  assert.equal(captionChunk({ words, current: 39 }, 18).words.length, 12);
});

test("fitFont: أكبر خط يتسع، لا يتجاوز base ولا ينزل عن min، وحتمي", () => {
  const box = { w: 1000, h: 300, gap: 12 };
  const short = fitFont(["قصير"], box, 40, 20);
  assert.equal(short, 40);
  const many = fitFont(Array(6).fill("ب".repeat(110)), box, 40, 20);
  assert.ok(many < 40 && many >= 20);
  assert.equal(fitFont(Array(6).fill("ب".repeat(110)), box, 40, 20), many);
  assert.equal(fitFont(Array(40).fill("ب".repeat(300)), box, 40, 20), 20);
  // كلما زاد النص صغر الخط (أو بقي)
  let last = Infinity;
  for (let n = 50; n <= 600; n += 50) {
    const s = fitFont(["ب".repeat(n)], { w: 600, h: 200 }, 48, 16);
    assert.ok(s <= last);
    last = s;
  }
  // maxLines يُحترم
  const s = fitFont(["ب".repeat(200)], { w: 600, h: 2000, maxLines: 2 }, 60, 10);
  assert.ok(linesFor("ب".repeat(200), 600, s) <= 2);
});

test("fitGrid: النص الطويل يُحل بعمودين قبل التصغير", () => {
  const texts = STRESS_LIST.bullets;
  const g = fitGrid(texts, { w: 1136, h: 430, gap: 14, colGap: 22, padX: 18, padY: 10 }, 34, 20, 2);
  assert.equal(g.cols, 2);
  assert.equal(g.rows, 3);
  assert.ok(g.size >= 20 && g.size <= 34);
  const one = fitGrid(["قصير", "قصير"], { w: 1136, h: 430 }, 34, 20, 2);
  assert.deepEqual(one, { size: 34, cols: 1, rows: 2 });
  assert.deepEqual(fitGrid([], { w: 100, h: 100 }, 30, 20), { size: 30, cols: 1, rows: 0 });
});

test("منوّع: الأسئلة سينمائي، والافتتاح والخلاصة والأرقام مجلة، والقوائم والتفرّعات بصري", () => {
  const pick = (s: VideoScene, role: SceneRole) => pickTheme("mixed", model(s, role));
  assert.equal(pick(F.cover, "cover"), "editorial");
  assert.equal(pick(F.summary, "summary"), "editorial");
  assert.equal(pick(F.stat, "body"), "editorial");
  assert.equal(pick(F.range, "body"), "editorial");
  assert.equal(pick(F.seal, "body"), "editorial");
  assert.equal(pick(F.groups, "body"), "editorial");
  assert.equal(pick(F.quoteRule, "body"), "editorial");
  assert.equal(pick(F.defineQuote, "body"), "editorial");
  assert.equal(pick(F.list, "body"), "visual");
  assert.equal(pick(F.cards, "body"), "visual");
  assert.equal(pick(F.steps, "body"), "visual");
  assert.equal(pick(F.compare, "body"), "visual");
  assert.equal(pick(F.treeCompare, "body"), "visual");
  assert.equal(pick(F.check4, "check"), "cinematic");
  assert.equal(pick(F.finalQ, "finalQ"), "cinematic");
  assert.equal(pick(F.finalEx, "finalEx"), "cinematic");
  assert.equal(pick(F.finalExCase, "finalEx"), "cinematic");
  assert.equal(pick(F.qIntro, "qIntro"), "cinematic");
  // غير «منوّع»: الاختيار نفسه دائمًا
  for (const t of ["editorial", "visual", "cinematic"] as const) assert.equal(pickTheme(t, model(F.check4, "check")), t);
});

test("الأرقام: هندية ↔ لاتينية حسب اللغة", () => {
  assert.equal(toLatinDigits("١٥–٣٠ يومًا"), "15–30 يومًا");
  assert.equal(toLatinDigits("۱۲"), "12");
  assert.equal(toLocalDigits(1433, "ar"), "١٤٣٣");
  assert.equal(toLocalDigits("1.5", "ar"), "١٫٥");
  assert.equal(toLocalDigits("١٨", "en"), "18");
});

test("نوع المعلومة لوسم القالب", () => {
  assert.equal(kindOf(model(F.defineQuote)), "define");
  assert.equal(kindOf(model(F.treeCompare)), "types");
  assert.equal(kindOf(model(F.groups)), "cond");
  assert.equal(kindOf(model(F.range)), "time");
  assert.equal(kindOf(model(F.compare)), "compare");
  assert.equal(kindOf(model(F.steps)), "steps");
  assert.equal(kindOf(model(F.list)), "points");
  assert.equal(kindOf(model(F.check4, "check")), "question");
  assert.equal(kindOf(model(F.stat)), "number");
  assert.equal(kindOf(model(F.quoteRule)), "text");
});

test("الأيقونة من رمز المشهد إن عُرف، وإلا حسب القالب", () => {
  assert.equal(model(F.compare).icon, "scale-outline"); // ⚖️ مع محدد التنويع
  assert.equal(model({ ...F.list, emoji: "🦄" }).icon, "list-outline");
  assert.equal(model({ ...F.list, emoji: "" }).icon, "list-outline");
});
