// tests/support.test.ts — وكيل الدعم: قراءة الإجابة
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseSupport } from "../lib/supportCore.ts";

test("JSON سليم: الإجابة وعدم التأكد كما هما", () => {
  assert.deepEqual(parseSupport('{"answer":"من القائمة الجانبية ← الاشتراكات","unsure":false}'), { answer: "من القائمة الجانبية ← الاشتراكات", unsure: false });
  assert.equal(parseSupport('نص قبل {"answer":"x","unsure":true} بعده').unsure, true);
});

test("نص بلا JSON: يُعرض ويُعدّ غير مؤكَّد (فيظهر الإرسال للدعم)", () => {
  assert.deepEqual(parseSupport("لا أعرف"), { answer: "لا أعرف", unsure: true });
});
