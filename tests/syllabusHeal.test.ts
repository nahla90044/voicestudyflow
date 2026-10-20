// tests/syllabusHeal.test.ts — الإصلاح الذاتي للمنهج: الأهداف حرفيًا، وبقاء محتوى الوحدة المطابقة فقط
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { healedSyllabus, objectivesFrom, sameStructure } from "../lib/syllabusHealCore.ts";

const pages = [
  { page: 9, text: "الوحدة الأولى معنى التنفيذ" },
  { page: 10, text: "أهداف الوحدة يتوقع من الطالب بعد الانتهاء من دراسة هذه الوحدة تحقيق الأهداف التالية: أن يشرح مفهوم التنفيذ. أن يوضح معنى التنفيذ في الاصطلاح. • أن يبين أنواع التنفيذ" },
  { page: 29, text: "الوحدة الثانية المحررات" },
];
const units = [
  { title: "الوحدة الأولى: معنى التنفيذ", page: 9, to: 28 },
  { title: "الوحدة الثانية: المحررات", page: 29, to: 44 },
];

test("الأهداف تُنقل حرفيًا بندًا بندًا من صفحة «أهداف الوحدة»", () => {
  assert.deepEqual(objectivesFrom(pages, units[0]), ["أن يشرح مفهوم التنفيذ", "أن يوضح معنى التنفيذ في الاصطلاح", "أن يبين أنواع التنفيذ"]);
  assert.deepEqual(objectivesFrom(pages, units[1]), []);
});

test("محتوى الوحدة القديمة يبقى فقط إن كانت نفس الوحدة بنفس صفحاتها", () => {
  const old = {
    units: [
      { title: "الوحدة الثانية: المحررات", topics: ["قديم-خطأ"], about: "عن صفحات أخرى" },
      { title: "الوحدة الأولى: معنى التنفيذ", topics: ["صحيح"], objectives: ["أن يعرف"] },
    ],
    ranges: [{ from: 9, to: 45 }, { from: 9, to: 28 }],
  };
  assert.equal(sameStructure(old, units), false);
  const h = healedSyllabus(old, units, pages);
  assert.deepEqual(h.units[0].topics, ["صحيح"]); // نفس الوحدة بنفس الصفحات (كانت في موضع آخر)
  assert.deepEqual(h.units[1].topics, []); // صفحاتها تغيّرت: لا يبقى محتوى مبني على صفحات خاطئة
  assert.deepEqual(h.ranges, [{ from: 9, to: 28 }, { from: 29, to: 44 }]);
  assert.ok(sameStructure(h, units));
});
