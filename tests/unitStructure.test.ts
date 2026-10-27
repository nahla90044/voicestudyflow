// tests/unitStructure.test.ts — فحص بنية الوحدات قبل حفظ المنهج (لا تكرار ولا ترتيب مختل ولا وحدة صفحة)
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkStructure } from "../lib/unitStructure.ts";

test("بنية سليمة تُقبل كما هي بصفحات متصلة", () => {
  const c = checkStructure(
    [
      { title: "الوحدة الأولى: التعريف", page: 7 },
      { title: "الوحدة الثانية: المصادر", page: 26 },
      { title: "الوحدة الثالثة: الاختصاص", page: 45 },
    ],
    64
  );
  assert.equal(c.sound, true);
  assert.deepEqual(c.units.map((u) => [u.page, u.to]), [[7, 25], [26, 44], [45, 64]]);
});

test("الحالة المبلّغ عنها (مكررات بمسافة قبل «:» ووحدات صفحة) تُرفض وتُنظَّف", () => {
  const c = checkStructure(
    [
      { title: "الوحدة الأولى", page: 4 },
      { title: "الوحدة الثامنة", page: 5 },
      { title: "الوحدة الأولى: التعريف", page: 7 },
      { title: "الوحدة الثانية: المصادر", page: 26 },
      { title: "الوحدة الثالثة: الاختصاص", page: 45 },
      { title: "الوحدة الثالثة : الاختصاص", page: 47 },
      { title: "الوحدة الرابعة: الضابط", page: 65 },
      { title: "الوحدة الثامنة : المنهج", page: 159 },
      { title: "الوحدة الثامنة: المنهج", page: 160 },
    ],
    200
  );
  assert.equal(c.sound, false);
  assert.equal(new Set(c.units.map((u) => u.title.split(":")[0].trim())).size, c.units.length);
});

test("وحدة قصيرة وسط وحدات كبيرة تُدمج ولا تُعد سليمة", () => {
  const c = checkStructure(
    [
      { title: "الفصل الأول", page: 1 },
      { title: "عنوان عابر", page: 20 },
      { title: "الفصل الثاني", page: 21 },
      { title: "الفصل الثالث", page: 40 },
    ],
    60
  );
  assert.equal(c.sound, false);
  assert.deepEqual(c.units.map((u) => [u.page, u.to]), [[1, 20], [21, 39], [40, 60]]);
});

test("الفاحص الآلي: ترقيم مختل ووحدة تغطي الكتاب (كتاب التأمين قبل الإصلاح)", async () => {
  const { suspectSyllabus } = await import("../lib/unitStructure.ts");
  const bad = suspectSyllabus([{ title: "المحاضرة الأولى" }, { title: "المحاضرة الثالثة" }, { title: "المحاضرة الثانية" }], [{ from: 3, to: 20 }, { from: 21, to: 26 }, { from: 27, to: 180 }], 180);
  assert.ok(bad.includes("ترقيم غير متسلسل"));
  assert.ok(bad.includes("وحدة تغطي معظم الكتاب"));
  const good = suspectSyllabus([{ title: "الوحدة الأولى: أ" }, { title: "الوحدة الثانية: ب" }, { title: "الوحدة الثالثة: ج" }], [{ from: 2, to: 14 }, { from: 15, to: 21 }, { from: 22, to: 36 }], 36);
  assert.deepEqual(good, []);
  assert.deepEqual(suspectSyllabus([{ title: "مقدمة" }, { title: "أسس" }], undefined, 0), [], "عناوين بلا ترقيم لا تُتهم");
});

test("عنوان الوحدة في أول صفحتها (لا المحاضرات المتكررة)، وملء العنوان المكسور، والتوقف عند إعادة الترقيم", async () => {
  const { unitsFromStartLines, brokenTitle } = await import("../lib/unitHeadings.ts");
  const body = "نص طويل ".repeat(40);
  const pages = [
    { page: 2, text: `المقدمة\nالوحدة الأولى\nماهية التأمين\n${body}` },
    { page: 3, text: `المحاضرة الأولى\n${body}` },
    { page: 15, text: `المقدمة\nالوحدة الثانية\nمفهوم عقد التأمين\n${body}` },
    { page: 16, text: `المحاضرة الأولى\n${body}` },
    { page: 22, text: `الوحدةال ثالثة\nخصائ صعقدالتأم ني\n${body}` },
    { page: 30, text: `المقدمة\nالوحدة الرابعة\nأنواع التأمين\n${body}` },
  ];
  const u = unitsFromStartLines(pages, 40);
  assert.deepEqual(u.map((x) => [x.page, x.to, x.title]), [
    [2, 14, "الوحدة الأولى: ماهية التأمين"],
    [15, 21, "الوحدة الثانية: مفهوم عقد التأمين"],
    [22, 29, "الوحدة الثالثة"],
    [30, 40, "الوحدة الرابعة: أنواع التأمين"],
  ]);
  assert.ok(brokenTitle("خصائ صعقدالتأم ني"));
  assert.ok(!brokenTitle("تابع أركان عقد التأمين – ركن المحل"));
  const nested = [
    { page: 5, text: `الفصل الأول\nأ\n${body}` },
    { page: 9, text: `الفصل الثاني\nب\n${body}` },
    { page: 12, text: `الفصل الثالث\nج\n${body}` },
    { page: 20, text: `الفصل الأول\nد\n${body}` },
  ];
  assert.deepEqual(unitsFromStartLines(nested, 30), [], "فصول تتكرر داخل أبواب: لا يُعتمد");
});

test("مواضيع الوحدة من عناوينها الداخلية بلا ذكاء", async () => {
  const { topicsFrom } = await import("../lib/syllabusHealCore.ts");
  const pages = [
    { page: 3, text: "توطئة\nالمحاضرة الأولى\nأولاً : ماهية التأمين\nنص" },
    { page: 5, text: "ثانياً : وظائف التأمين\nنص\nأولاً : ماهية التأمين" },
    { page: 9, text: "المحاضرة الأولى :أولاً : الاتجاه الأول : تحريم التأمين" },
    { page: 30, text: "أولاً : خارج الوحدة" },
  ];
  assert.deepEqual(topicsFrom(pages, { title: "الوحدة الأولى", page: 2, to: 14 }), ["ماهية التأمين", "وظائف التأمين", "تحريم التأمين"]);
});
