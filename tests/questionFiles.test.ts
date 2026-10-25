// tests/questionFiles.test.ts — ملفات الأسئلة: الاستخراج، مفتاح الإجابات، الحلّ، والاختيار للاختبار
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { answerIndex, applyKeys, applySolve, chunkPages, dedupe, needsSolve, parseExtract, pickForQuiz } from "../lib/questionFilesCore.ts";

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

test("الحلّ من الكتاب: خيارات للمقالي، ولا يُستبدل جواب الملف", () => {
  const qs = [
    { n: "1", q: "عرّف التنفيذ", type: "essay" as const, options: [], answer: -1, unit: 0 },
    { n: "2", q: "س", type: "mcq" as const, options: ["أ", "ب"], answer: 0, unit: 0, from: "file" as const },
  ];
  const out = applySolve(qs, [0, 1], `[{"i":0,"answer":2,"options":["خطأ١","خطأ٢","إنزال الحكم واقعًا","خطأ٣"],"why":"لأن","quote":"هو إنزال","sure":true},{"i":1,"answer":1,"options":[]}]`);
  assert.equal(out[0].answer, 2);
  assert.equal(out[0].options.length, 4);
  assert.equal(out[0].from, "book");
  assert.equal(out[1].answer, 0, "جواب الملف يبقى");
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
