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
