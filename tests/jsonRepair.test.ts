// tests/jsonRepair.test.ts — زلّات تنسيق ردود الذكاء لا تُضيّع العمل كله
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseJsonLenient } from "../lib/jsonRepair.ts";

test("مفتاح معلّق قبل الإغلاق وفاصلة زائدة تُصلحان", () => {
  assert.deepEqual(parseJsonLenient('{"scenes":[{"narration":"نص.","},{"narration":"ب"}]}'), { scenes: [{ narration: "نص." }, { narration: "ب" }] });
  assert.deepEqual(parseJsonLenient('{"a":[1,2,],}'), { a: [1, 2] });
});

test("JSON السليم لا يُلمس، حتى لو احتوى نصًا ينتهي بفاصلة", () => {
  assert.deepEqual(parseJsonLenient('{"t":"a,"}'), { t: "a," });
});

test("الخلل غير المعروف يرمي الخطأ", () => {
  assert.throws(() => parseJsonLenient("{bad"));
});

import { parseArrayLenient } from "../lib/jsonRepair.ts";

test("المصفوفة المقطوعة في آخرها تُحفظ عناصرها المكتملة", () => {
  const cut = '```json\n[{"q":"أ؟","options":["1","2"],"answer":0},{"q":"ب {مع قوس}؟","options":["x"],"answer":0},{"q":"ج؟","opti';
  assert.deepEqual(parseArrayLenient(cut).map((x: any) => x.q), ["أ؟", "ب {مع قوس}؟"]);
  assert.equal(parseArrayLenient('[{"q":"كامل"}]').length, 1);
  assert.deepEqual(parseArrayLenient("لا شيء"), []);
});
