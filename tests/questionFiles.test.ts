// tests/questionFiles.test.ts — ملفات الأسئلة: الاستخراج، مفتاح الإجابات، الحلّ، والاختيار للاختبار
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { answerIndex, answerNote, batchConfirm, pickPages, applyKeys, applySolve, chunkPages, dedupe, dropKnown, needsBook, needsSolve, parseExtract, pickForQuiz } from "../lib/questionFilesCore.ts";

test("تقسيم الصفحات لأجزاء بحد أقصى", () => {
  const pages = Array.from({ length: 5 }, (_, i) => ({ page: i + 1, text: "س".repeat(5000) }));
  const c = chunkPages(pages, 12000);
  assert.equal(c.length, 3);
  assert.equal(chunkPages([{ page: 1, text: "  " }]).length, 0);
});

test("قراءة الاستخراج: الأنواع والخيارات والجواب من الملف فقط", () => {
  const raw = `{"questions":[
    {"n":"١","q":"ما المقصود بالتنفيذ؟","type":"mcq","options":["أ","ب","ج"],"answer":1,"unit":0},
    {"n":"2","q":"التنفيذ المعجل استثناء","type":"tf","options":[],"answer":-1,"unit":2},
    {"n":"3","q":"عدّد شروط التنفيذ","type":"essay","options":[],"answer":-1,"answerText":"","unit":-1}
  ],"key":{"٢":"صح"}}`;
  const { questions, key } = parseExtract(raw);
  assert.equal(questions.length, 3);
  assert.equal(questions[0].n, "1");
  assert.equal(questions[0].from, "file");
  assert.deepEqual(questions[1].options, ["صح", "خطأ"]);
  assert.deepEqual(key, { "2": "صح" });
  const k = applyKeys(questions, key);
  assert.equal(k[1].answer, 0);
  assert.equal(k[1].from, "file");
  assert.ok(needsSolve(k[2]));
  assert.ok(!needsSolve(k[0]));
});

test("مفتاح الإجابات بصيغه المختلفة", () => {
  const q = { type: "mcq" as const, options: ["الحكم النهائي", "السند التنفيذي", "الحجز", "البيع"] };
  assert.equal(answerIndex("ب", q), 1);
  assert.equal(answerIndex("ج", q), 2);
  assert.equal(answerIndex("4", q), 3);
  assert.equal(answerIndex("٣", q), 2);
  assert.equal(answerIndex("c", q), 2);
  assert.equal(answerIndex("السند التنفيذي", q), 1);
  assert.equal(answerIndex("خطأ", { type: "tf", options: ["صح", "خطأ"] }), 1);
  assert.equal(answerIndex("×", { type: "tf", options: ["صح", "خطأ"] }), 1);
  assert.equal(answerIndex("لا شيء", q), -1);
});

test("الحلّ من الكتاب: خيارات للمقالي، وجواب الملف يُتحقق منه", () => {
  const qs = [
    { n: "1", q: "عرّف التنفيذ", type: "essay" as const, options: [], answer: -1, unit: 0 },
    { n: "2", q: "س", type: "mcq" as const, options: ["أ", "ب"], answer: 0, unit: 0, from: "file" as const },
    { n: "3", q: "ص", type: "mcq" as const, options: ["أ", "ب", "ج"], answer: 2, unit: 0, from: "file" as const },
    { n: "4", q: "ع", type: "mcq" as const, options: ["أ", "ب"], answer: 1, unit: 0, from: "file" as const },
  ];
  assert.ok(qs.every(needsBook), "كل سؤال يُعرض على الكتاب حتى لو له جواب");
  const out = applySolve(
    qs,
    [0, 1, 2, 3],
    `[{"i":0,"answer":2,"options":["خطأ١","خطأ٢","إنزال الحكم واقعًا","خطأ٣"],"why":"لأن","quote":"هو إنزال","sure":true},{"i":1,"answer":1,"options":[],"sure":true},{"i":2,"answer":2,"options":[]},{"i":3,"answer":0,"options":[],"sure":false}]`
  );
  assert.equal(out[0].answer, 2);
  assert.equal(out[0].options.length, 4);
  assert.equal(answerNote(out[0]), "book");
  // الكتاب يخالف الملف بيقين: يُعتمد الكتاب ويُذكر جواب الملف
  assert.equal(out[1].answer, 1);
  assert.equal(out[1].fileAnswer, 0);
  assert.equal(answerNote(out[1]), "fileFixed");
  // مطابق
  assert.equal(out[2].answer, 2);
  assert.equal(answerNote(out[2]), "fileOk");
  // خلاف بلا يقين: يبقى جواب الملف مع ما يرجّحه الكتاب
  assert.equal(out[3].answer, 1);
  assert.equal(out[3].bookAnswer, 0);
  assert.equal(answerNote(out[3]), "fileDoubt");
  assert.ok(out.every((q) => q.tried));
});

test("المكرر بين الملفات: يُحذف ما تحقّق منه ملف آخر، ويبقى المتحقَّق منه عند الدمج", () => {
  const base = { n: "", type: "mcq" as const, options: ["أ", "ب"], unit: 0 };
  const other = [{ ...base, q: "ما الخطر؟", answer: 1, tried: true, checked: true }];
  const mine = [
    { ...base, q: "ما الخَطَر ؟", answer: -1 },
    { ...base, q: "ما القسط؟", answer: 0 },
  ];
  const r = dropKnown(mine, other);
  assert.equal(r.dropped, 1);
  assert.equal(r.questions[0].q, "ما القسط؟");
  // سؤال لم يُتحقق منه في الملف الآخر بعد لا يُحذف (يُحلّ هنا)
  assert.equal(dropKnown(mine, [{ ...other[0], tried: false }]).dropped, 0);
  const d = dedupe([{ ...base, q: "س", answer: 0, from: "file" as const }, { ...base, q: "س", answer: 1, tried: true }]);
  assert.equal(d.length, 1);
  assert.equal(d[0].answer, 1, "المتحقَّق منه من الكتاب أولى");
});

test("حذف المكرر يُبقي الأكمل جوابًا، والاختيار للاختبار يلتزم بالوحدات والعدد", () => {
  const a = { n: "", q: "ما التنفيذ؟", type: "mcq" as const, options: ["أ", "ب"], answer: -1, unit: 0 };
  const b = { ...a, q: "ما  التنفيذ ؟", answer: 1 };
  const d = dedupe([a, b]);
  assert.equal(d.length, 1);
  assert.equal(d[0].answer, 1);
  const pool = [
    { ...a, q: "1", answer: 0, unit: 0 },
    { ...a, q: "2", answer: 0, unit: 1 },
    { ...a, q: "3", answer: -1, unit: 1 },
    { ...a, q: "4", answer: 1, unit: 1 },
  ];
  assert.equal(pickForQuiz(pool, [1], null).length, 2);
  assert.equal(pickForQuiz(pool, null, 2).length, 2);
});

test("دفعة ملفات: سؤال واحد بمجموع الطلبات، والملف المتعثر يُستثنى", async () => {
  const asked: number[] = [];
  const c = batchConfirm(3, async (n) => {
    asked.push(n);
    return true;
  });
  const a = c(5);
  c.skip?.();
  const b = c(7);
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.deepEqual(asked, [12]);
});

test("صفحات التحقق: صفحات الوحدة أولًا، ومن الوحدة الطويلة الأقرب للأسئلة", () => {
  const pages = [
    { page: 1, text: "مقدمة عامة عن القانون" },
    { page: 5, text: "عقد التأمين وسيلة قانونية" },
    { page: 9, text: "القسط يتحدد بقوانين الإحصاء والمقاصة" },
    { page: 12, text: "حديث عن الضرائب" },
  ];
  const a = pickPages(pages, ["كيف يتحدد القسط؟"], 10000, { from: 5, to: 9 });
  assert.ok(a.indexOf("[ص 5]") < a.indexOf("[ص 9]"));
  const b = pickPages(pages, ["كيف يتحدد القسط بقوانين الإحصاء؟"], 45);
  assert.ok(b.includes("[ص 9]"));
  assert.ok(!b.includes("[ص 12]"));
});
