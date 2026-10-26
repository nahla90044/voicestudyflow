// tests/videoPlanCore.test.ts
// «ملخّص الفيديو ٢»: فهرس الخطة، وإصلاح ردّ الخطة، والخطة الآلية، وتقسيم الأجزاء بحدود المواضيع،
// وتوافق نصيب الجزء بين التطبيق والسيرفر (readVpart/planBlock).
import { test } from "node:test";
import assert from "node:assert/strict";

import type { StudySummary, SummaryBlock, SummarySection } from "../lib/studySummary.ts";
import { exerciseSections, fallbackPlan, normalizePlan, planInput, planParts, soloPart, summarySig, type VideoPlan } from "../lib/videoPlanCore.ts";
import { videoParts } from "../lib/videoScriptCore.ts";
import { planBlock, readVpart } from "../supabase/functions/_shared/videoPrompt.ts";

const sec = (heading: string, chars = 300, blocks?: SummaryBlock[]): SummarySection => ({
  emoji: "📌",
  heading,
  blocks: blocks ?? [{ type: "text", text: "جملة شرح طويلة للمادة. ".repeat(Math.max(1, Math.round(chars / 24))) }],
});
const sum = (sections: SummarySection[], extra: Partial<StudySummary> = {}): StudySummary => ({ title: "معنى التنفيذ", intro: "تمهيد الوحدة", sections, keypoints: ["نقطة مهمة أولى", "نقطة مهمة ثانية"], ...extra });
const exSec = (heading: string, n: number): SummarySection => ({
  emoji: "📝",
  heading,
  blocks: Array.from({ length: n }, (_, i) => ({ type: "exercise" as const, q: `سؤال ${i + 1}؟`, steps: [], answer: "الجواب" })),
});

test("planInput: ترقيم الأقسام وعلامة التمارين، والمواد مرة واحدة بأرقام لاتينية", () => {
  const s = sum([
    sec("حالات التنفيذ المعجل", 0, [{ type: "text", text: "تنص المادة (169) على حالات. وتكرر م١٦٩ هنا، وكذلك للمادة ١٠." }, { type: "list", title: "الحالات", items: ["أ", "ب", "ج"] }]),
    sec("مقدمة", 200),
    exSec("تمارين الوحدة", 3),
  ]);
  const t = planInput(s, "الوحدة الأولى");
  assert.match(t, /^عنوان الوحدة: الوحدة الأولى/);
  assert.match(t, /\[ق1\] حالات التنفيذ المعجل — تنص المادة \(169\) على حالات/);
  assert.match(t, /تعدادات: الحالات \(3\)/);
  const arts = t.split("\n")[1].match(/مواد: (.*)$/)![1];
  assert.deepEqual(arts.split("، ").sort(), ["م10", "م169"]);
  assert.match(t, /\[ق3\] تمارين الوحدة \(تمارين: 3\)/);
  assert.match(t, /أهم النقاط:\n- نقطة مهمة أولى/);
  assert.doesNotMatch(t, /عام م|رقم م/);
});

test("planInput: ٨٠ قسمًا طويلًا لا تتجاوز ١٨٠٠٠ حرف", () => {
  const long = "جملة أولى طويلة جدًا تشرح الفكرة الرئيسية للقسم بتفصيل ممتد وكلمات كثيرة متتالية لا تنتهي سريعًا أبدًا";
  const s = sum(Array.from({ length: 80 }, (_, i) => sec(`عنوان القسم رقم ${i + 1} في الوحدة الدراسية الطويلة`, 0, [{ type: "text", text: long + long }, { type: "list", title: `تعداد ${i}`, items: ["١", "٢"] }])));
  const t = planInput(s, "و");
  assert.ok(t.length <= 18000, String(t.length));
  assert.match(t, /\[ق80\]/);
});

const base = () =>
  sum([sec("أ", 800), sec("ب", 800), sec("ج", 800), sec("د", 800), sec("هـ", 800), sec("و", 800), exSec("تمارين", 2)]);

test("normalizePlan: يحذف المجهول والمكرر، يُلحق المُغفل بما قبله، وينقل التمارين", () => {
  const s = base();
  const raw = JSON.stringify({
    title: "خطة",
    topics: [
      { title: "الأول", sections: [1, 2, 99], check: true },
      { title: "الثاني", sections: [3, 2, 4, 7] }, // ٢ مكرر، ٧ تمارين
      { title: "فارغ", sections: [99] },
      { title: "الثالث", sections: [6] },
    ],
    exercises: [],
    cover: { highlight: "مهم", narration: "افتتاح" },
    summary: { bullets: ["١", "٢", "٣"], narration: "خلاصة" },
  });
  const p = normalizePlan("نص قبل " + raw + " بعد", s)!;
  assert.ok(p);
  assert.equal(p.auto, false);
  assert.deepEqual(p.topics.map((t) => t.sections), [[1, 2], [3, 4, 5], [6]]); // ٩٩ محذوف، ٥ المُغفل مع ٤، والفارغ حُذف
  assert.deepEqual(p.topics.map((t) => t.id), ["T1", "T2", "T3"]);
  assert.deepEqual(p.exercises.map((e) => [e.id, e.section, e.count]), [["E1", 7, 2]]);
  assert.equal(p.cover?.narration, "افتتاح");
  assert.equal(p.summary?.bullets.length, 3);
  assert.ok(p.topics.every((t) => t.chars > 0));
});

test("normalizePlan: الأسئلة الختامية بين ٤ و٦، وسؤال فهم بعد ٤٥٠٠ حرف بلا سؤال", () => {
  const s = sum(Array.from({ length: 10 }, (_, i) => sec(`ق${i}`, 600)));
  const nine = normalizePlan(JSON.stringify({ topics: Array.from({ length: 10 }, (_, i) => ({ title: `م${i}`, sections: [i + 1], final: i < 9 })) }), s)!;
  assert.equal(nine.topics.filter((t) => t.final).length, 6);
  const one = normalizePlan(JSON.stringify({ topics: Array.from({ length: 10 }, (_, i) => ({ title: `م${i}`, sections: [i + 1], final: i === 0 })) }), s)!;
  assert.equal(one.topics.filter((t) => t.final).length, 4);
  assert.ok(one.topics.filter((t) => t.major).length >= 3);
  const s3 = sum([sec("أ", 2000), sec("ب", 2000), sec("ج", 2000)]);
  const g = normalizePlan(JSON.stringify({ topics: [{ title: "١", sections: [1] }, { title: "٢", sections: [2] }, { title: "٣", sections: [3] }] }), s3)!;
  assert.deepEqual(g.topics.map((t) => t.check), [false, false, true]);
  // أقل من ٤ مواضيع: كل موضوع مادته ١٢٠٠ حرف فأكثر سؤال ختامي
  assert.ok(g.topics.every((t) => t.final));
});

test("normalizePlan: JSON فاسد أو تغطية ٥٠٪ → null", () => {
  const s = base();
  assert.equal(normalizePlan("ليس JSON", s), null);
  assert.equal(normalizePlan('{"topics":[{"title":"x","sections":[1,2,3]}]}', s), null);
});

test("fallbackPlan: «المعجّل» و«المعجل» موضوع واحد، و«للأحكام» لا (حد الخطة الآلية)، بلا افتتاح ولا خلاصة", () => {
  const s = sum([sec("حالات التنفيذ المعجّل"), sec("أنواع الأحكام"), sec("حالات التنفيذ المعجل"), sec("التنفيذ المعجل للأحكام")]);
  const p = fallbackPlan(s);
  assert.equal(p.auto, true);
  assert.deepEqual(p.topics.map((t) => t.sections), [[1, 3], [2], [4]]);
  assert.equal(p.cover, null);
  assert.equal(p.summary, null);
});

test("exerciseSections: أقسام التمارين ودراسة الحالة بعددها", () => {
  const s = sum([
    sec("شرح"),
    exSec("أسئلة الوحدة", 3),
    { emoji: "", heading: "دراسة الحالة", blocks: [{ type: "text", text: "مقدمة" }, { type: "case", text: "حالة", analysis: "تحليل", qa: [{ q: "س١", a: "ج" }, { q: "س٢", a: "ج" }] }] },
    { emoji: "", heading: "مثال محلول", blocks: [{ type: "text", text: "نص" }, { type: "exercise", q: "س", steps: [], answer: "ج" }] }, // عنوان عادي وفيه شرح → ليس قسم تمارين
  ]);
  assert.deepEqual([...exerciseSections(s)], [[2, 3], [3, 2]]);
});

const plan = (s: StudySummary, topics: number[][], o: Partial<VideoPlan> = {}): VideoPlan =>
  normalizePlan(JSON.stringify({ topics: topics.map((sections, i) => ({ title: `موضوع ${i + 1}`, sections, check: true, final: i === 0, example: "مثال من الواقع" })), ...o }), s)!;

test("planParts: الموضوع لا يُقسم تحت ٦٥٠٠، وفوقه «(تابع)»؛ وما قبل الجزء وما بعده صحيحان", () => {
  const s = sum([sec("أ", 3000), sec("ب", 3000), sec("ج", 4500), sec("د", 4500), sec("هـ", 4500)]);
  const p = plan(s, [[1, 2], [3], [4, 5]]);
  const parts = planParts(s, p, "الوحدة", videoParts(s, "الوحدة").length);
  // T1 (٦٠٠٠ تقريبًا) جزء كامل لا يُقسم، وT3 (٩٠٠٠) مقسوم
  assert.equal(parts[0].meta.mine.length, 1);
  assert.equal(parts[0].meta.mine[0].id, "T1");
  assert.ok(!parts[0].meta.mine[0].cont);
  const t3 = parts.flatMap((x) => x.meta.mine.filter((m) => m.id === "T3"));
  assert.equal(t3.length, 2);
  assert.equal(t3[1].cont, true);
  assert.equal(t3[0].check, undefined); // سؤال الفهم بعد اكتمال الموضوع (آخر قطعه)
  assert.equal(t3[1].check, true);
  assert.ok(parts.some((x) => /【T3】 موضوع 3 \(تابع\)/.test(x.text)));
  const last = parts[parts.length - 1].meta;
  assert.ok(last.before.includes("موضوع 1") && last.before.includes("موضوع 2"));
  assert.ok(last.before.includes("موضوع 3 (أوله)"));
  assert.deepEqual(last.after, []);
  assert.ok(parts[0].meta.after.includes("موضوع 2"));
  assert.deepEqual(parts[0].meta.before, []);
  assert.equal(parts[0].meta.mine[0].example, "مثال من الواقع");
});

test("planParts: التمهيد في الأول وحده، لا «أهم النقاط» في أي جزء، والتمارين في الآخر بعددها", () => {
  const s = sum([exSec("تمارين البداية", 4), sec("أ", 3000), sec("ب", 3000), sec("ج", 3000)], { keypoints: ["نقطة الخلاصة السرية"] });
  const p = plan(s, [[2], [3], [4]]);
  const parts = planParts(s, p, "الوحدة", videoParts(s, "الوحدة").length);
  assert.match(parts[0].text, /^عنوان الوحدة: الوحدة\nتمهيد: تمهيد الوحدة\n\n/);
  for (const x of parts.slice(1)) assert.match(x.text, /^عنوان الوحدة: الوحدة\n\n【/);
  for (const x of parts) assert.doesNotMatch(x.text, /نقطة الخلاصة السرية|أهم النقاط/);
  const lastMine = parts[parts.length - 1].meta.mine;
  assert.deepEqual(lastMine[lastMine.length - 1], { id: "E1", t: "تمارين البداية", chars: lastMine[lastMine.length - 1].chars, ex: 4 });
  assert.ok(!parts[parts.length - 1].meta.after.length);
});

test("planParts: على ٢٠ ملخّصًا بأحجام عشوائية لا يزيد عدد الأجزاء على التقسيم القديم أبدًا", () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let k = 0; k < 20; k++) {
    const n = 2 + Math.floor(rnd() * 25);
    const secs = Array.from({ length: n }, (_, i) => (rnd() < 0.1 ? exSec(`تمارين ${i}`, 1 + Math.floor(rnd() * 5)) : sec(`قسم ${i}`, 200 + Math.floor(rnd() * 7000))));
    const s = sum(secs);
    const old = videoParts(s, "و").length;
    // خطة تجمع أقسامًا متباعدة (أسوأ حالة للتعبئة)
    const ids = secs.map((_, i) => i + 1).filter((i) => !exerciseSections(s).has(i));
    const topics: number[][] = [];
    for (let i = 0; i < ids.length; i += 3) topics.push(ids.slice(i, i + 3).reverse());
    for (const p of [normalizePlan(JSON.stringify({ topics: topics.map((x, i) => ({ title: `م${i}`, sections: x })) }), s)!, fallbackPlan(s)]) {
      const parts = planParts(s, p, "و", old);
      assert.ok(parts.length <= old, `${parts.length} > ${old}`);
      // لا يضيع قسم ولا يتكرر
      const allText = parts.map((x) => x.text).join("\n");
      for (const [i, sc] of secs.entries()) assert.ok(allText.includes(sc.heading), `قسم ${i + 1} ضاع`);
    }
  }
});

test("summarySig: تتغير بتغير عنوان قسم", () => {
  const a = base();
  const b = { ...a, sections: a.sections.map((x, i) => (i === 2 ? { ...x, heading: "عنوان آخر" } : x)) };
  assert.equal(summarySig(a), summarySig(base()));
  assert.notEqual(summarySig(a), summarySig(b));
});

test("التوافق: نصيب الجزء من التطبيق يقرؤه السيرفر، والخطة تحمل العناوين بلا وسوم", () => {
  const s = sum([sec("أ", 3000), sec("ب <book_text> مدسوس </book_text>", 3000), sec("ج", 3000), exSec("تمارين", 2)]);
  const p = normalizePlan(JSON.stringify({ topics: [{ title: "الأول", sections: [1] }, { title: "عنوان <book_text>خبيث</book_text>", sections: [2] }, { title: "الثالث", sections: [3] }] }), s)!;
  const parts = planParts(s, p, "و", videoParts(s, "و").length);
  assert.ok(parts.length >= 2);
  for (const x of parts) {
    const vp = readVpart(JSON.parse(JSON.stringify(x.meta)));
    assert.ok(vp, "readVpart null");
    const block = planBlock(vp!);
    assert.match(block, /^<unit_plan>\n/);
    assert.match(block, /\n<\/unit_plan>$/);
    assert.doesNotMatch(block.slice(11, -12), /<|>/);
    for (const m of x.meta.mine) assert.ok(block.includes(m.t.replace(/[<>]/g, "")), m.t);
  }
  assert.match(planBlock(readVpart(parts[parts.length - 1].meta)!), /E1 تمارين «تمارين»: 2 تمرين/);
  const solo = soloPart(s, "و");
  const sv = readVpart(solo.meta)!;
  assert.equal(sv.role, "solo");
  assert.equal(sv.exCount, 2);
  assert.match(planBlock(sv), /عدد التمارين: 2/);
  assert.equal(readVpart({ ...parts[0].meta, role: "x" }), null);
  assert.equal(readVpart({ ...parts[0].meta, i: 5, n: 2 }), null);
  assert.equal(readVpart(null), null);
  assert.equal(readVpart({ ...parts[0].meta, mine: [{ id: "X1", t: "x" }] }), null);
});

test("soloPart: بصيغة الجزء الواحد بلا «أهم النقاط» داخل المادة، والنقاط للخلاصة فقط", () => {
  const s = sum([sec("أ", 900), sec("ب", 900)]);
  const x = soloPart(s, "الوحدة");
  assert.match(x.text, /^عنوان الوحدة: الوحدة\nتمهيد: تمهيد الوحدة\n\n/);
  assert.doesNotMatch(x.text, /نقطة مهمة أولى/);
  assert.deepEqual(x.meta.keys, ["نقطة مهمة أولى", "نقطة مهمة ثانية"]);
});

// ===== حالات من التشخيص (٢٦ أكتوبر) =====
import { articlesOf, dedupeSections } from "../lib/videoPlanCore.ts";
import { coreForVideo } from "../lib/videoScriptCore.ts";

const cases = ["الأحكام الصادرة في الأمور المستعجلة", "أحكام النفقة وأجرة الرضاع والسكن", "رؤية الصغير وتسليمه إلى حاضنه", "أجرة الخادم والصانع والعامل"];
const m169 = () =>
  sum([
    sec("حالات التنفيذ المعجّل (م169)", 0, [
      { type: "text", text: "تنص المادة ١٦٩ على حالات يجوز فيها التنفيذ المعجل للأحكام قبل اكتسابها القطعية." },
      { type: "list", title: "حالات التنفيذ المعجل", ordered: false, items: cases },
    ]),
    sec("أنواع الأحكام", 400),
    sec("التنفيذ المعجل في المادة 169", 0, [
      { type: "list", title: "حالات التنفيذ المعجّل", ordered: false, items: cases.slice(0, 3) },
      { type: "text", text: "وتقدّر المحكمة الكفالة بحسب خطر التأخير في كل حالة على حدة." },
    ]),
    sec("إعادة حرفية", 0, [{ type: "text", text: "تنص المادة (169) على حالات يجوز فيها التنفيذ المعجّل للأحكام قبل اكتسابها القطعية." }]),
    sec("نفي", 0, [{ type: "text", text: "لا تنص المادة ١٦٩ على حالات يجوز فيها التنفيذ المعجل للأحكام قبل اكتسابها القطعية." }]),
  ]);

test("قسم م169 المكرر (الخطة الآلية): القسمان اللذان يذكر عنوانهما المادة نفسها موضوع واحد", () => {
  assert.deepEqual(articlesOf("حالات التنفيذ المعجّل (م169)"), ["م169"]);
  assert.deepEqual(articlesOf("التنفيذ المعجل في المادة ١٦٩"), ["م169"]);
  const p = fallbackPlan(m169());
  assert.deepEqual(p.topics.map((t) => t.sections), [[1, 3], [2], [4], [5]]);
  // مادة أخرى أو مادتان معًا: لا دمج
  const q = fallbackPlan(sum([sec("شروط الطعن (م170)"), sec("آثار الطعن (م170، م171)"), sec("مواعيد الطعن (م171)")]));
  assert.deepEqual(q.topics.map((t) => t.sections), [[1], [2], [3]]);
});

test("دمج المكرر قبل التقسيم: الكتلة المعادة حرفيًا تُحذف، وكلمة جديدة («لا»، تفصيل) تُبقيها، والتمارين لا تُمس", () => {
  const s = m169();
  const core = coreForVideo(s);
  const { secs, dropped } = dedupeSections(core, [1, 3, 2, 4, 5]);
  assert.equal(dropped, 2); // القائمة المختصرة في ق٣، والجملة المعادة في ق٤
  assert.deepEqual(secs.get(3)!.blocks.map((b) => b.type), ["text"]);
  assert.equal(secs.get(4)!.blocks.length, 0);
  assert.equal(secs.get(5)!.blocks.length, 1); // النفي معنى آخر
  assert.equal(secs.get(1), core.sections[0]); // الأول كما هو
  // القصير والتمارين المتطابقة تبقى
  const ex = { type: "exercise" as const, q: "ما حكم التنفيذ المعجل للأحكام المستعجلة في النظام؟", steps: [], answer: "يجوز" };
  const t = sum([sec("أ", 0, [{ type: "text", text: "الكفالة شرط جوازي" }, ex]), sec("ب", 0, [{ type: "text", text: "الكفالة شرط جوازي" }, ex])]);
  assert.equal(dedupeSections(coreForVideo(t), [1, 2]).dropped, 0);
  // في الأجزاء: القائمة مرة واحدة، والقسم الذي صار بلا مادة لا يُرسل، والجديد يبقى
  const parts = planParts(s, fallbackPlan(s), "و", videoParts(s, "و").length);
  const all = parts.map((x) => x.text).join("\n");
  assert.equal(all.split("رؤية الصغير").length - 1, 1);
  assert.doesNotMatch(all, /إعادة حرفية/);
  assert.match(all, /وتقدّر المحكمة الكفالة/);
  assert.match(all, /لا تنص المادة/);
});

test("keypoints تعيد الشرح: «أهم النقاط» لا تُرسل مع أي جزء شرح (الخطة أو الآلية أو الجزء الوحيد)، وتذهب للخلاصة فقط", () => {
  const kp = ["التنفيذ المعجل استثناء من قاعدة القطعية", "الكفالة جوازية للمحكمة"];
  const big = sum([sec("أ", 4000), sec("ب", 4000), sec("ج", 4000)], { keypoints: kp });
  // المسار القديم كان يلحقها بآخر جزء فيعيد النموذج شرح المواضيع بعد الخلاصة
  assert.match(videoParts(big, "و").at(-1)!, /التنفيذ المعجل استثناء/);
  for (const p of [fallbackPlan(big), plan(big, [[1], [2], [3]])]) {
    assert.deepEqual(p.keypoints, kp);
    for (const x of planParts(big, p, "و", videoParts(big, "و").length)) {
      assert.doesNotMatch(x.text, /التنفيذ المعجل استثناء|الكفالة جوازية/);
      assert.doesNotMatch(planBlock(readVpart(x.meta)!), /التنفيذ المعجل استثناء/);
    }
  }
  const solo = soloPart(sum([sec("أ", 900)], { keypoints: kp }), "و");
  assert.doesNotMatch(solo.text, /التنفيذ المعجل استثناء/);
  assert.match(planBlock(readVpart(solo.meta)!), /نقاط الخلاصة \(تُذكر في الخلاصة فقط\): التنفيذ المعجل استثناء/);
});

import { partStamp, videoJobKeyOf } from "../lib/videoPlanCore.ts";

test("بصمة الجزء: تتغير بتغير نصه أو نصيبه من الخطة، فلا يُستعمل جزء محفوظ لملخّص قديم أو وحدة أخرى", () => {
  const s = sum([sec("أ", 3000), sec("ب", 3000), sec("ج", 3000)]);
  const p = plan(s, [[1], [2], [3]]);
  const a = planParts(s, p, "و", videoParts(s, "و").length);
  const again = planParts(s, p, "و", videoParts(s, "و").length);
  assert.deepEqual(a.map(partStamp), again.map(partStamp));
  assert.match(partStamp(a[0]), /^s[0-9a-f]+$/);
  const s2 = { ...s, sections: s.sections.map((x, i) => (i === 0 ? { ...x, blocks: [{ type: "text" as const, text: "نص آخر تمامًا بعد إعادة توليد الملخّص" }] } : x)) };
  assert.notEqual(partStamp(planParts(s2, fallbackPlan(s2), "و", 3)[0]), partStamp(a[0]));
  assert.notEqual(partStamp({ ...a[0], meta: { ...a[0].meta, after: [] } }), partStamp(a[0]));
});

test("مفاتيح مهام الفيديو: المساران والخطة وإعادة الجودة، ورقم كتاب فيه نقطتان أو أرقام", () => {
  const id = 2e12 + 7;
  const pdf = "books/u1:2025/12345.pdf";
  const p2 = id * 1024 + 4 * 32 + 3;
  assert.deepEqual(videoJobKeyOf(`vsf:aijob:vid2:${pdf}:${p2}:s1a2b3c`), { pdfPath: pdf, id });
  assert.deepEqual(videoJobKeyOf(`vsf:aijob:vid2:${pdf}:${p2}:s123456:qa`), { pdfPath: pdf, id });
  assert.deepEqual(videoJobKeyOf(`vsf:aijob:vid2:${pdf}:${p2}`), { pdfPath: pdf, id });
  assert.deepEqual(videoJobKeyOf(`vsf:aijob:vid2:${pdf}:${id}:plan:9f3e`), { pdfPath: pdf, id });
  assert.deepEqual(videoJobKeyOf(`vsf:aijob:vid2:${pdf}:${id}:plan`), { pdfPath: pdf, id });
  assert.deepEqual(videoJobKeyOf(`vsf:aijob:vid:${pdf}:${id * 1e4 + 301}:qa`), { pdfPath: pdf, id });
  assert.equal(videoJobKeyOf(`vsf:aijob:sum:${pdf}:${id}`), null);
  assert.ok(Number.isSafeInteger((2e12 + 1e6) * 1024 + 30 * 32 + 29)); // أكبر رقم جزء آمن
});
