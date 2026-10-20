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
