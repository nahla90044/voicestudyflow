// tests/genIdCore.test.ts
// معرّف جلسة التوليد: يتغيّر عند إعادة التوليد اليدوية فقط (تُخصم)، وثابت لإعادات الجزء الآلية (مجانية).
import { test } from "node:test";
import assert from "node:assert/strict";

import { fingerprint, newGenId, syllabusGenId } from "../lib/genIdCore.ts";

test("newGenId: قصير ومختلف بين جلستين", () => {
  const a = newGenId(1_700_000_000_000, () => 0.1);
  const b = newGenId(1_700_000_000_001, () => 0.1);
  const c = newGenId(1_700_000_000_000, () => 0.2);
  assert.ok(a.length <= 24 && /^[0-9a-z]+$/.test(a));
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("fingerprint: ثابت لنفس النص ومختلف لغيره", () => {
  assert.equal(fingerprint("منهج"), fingerprint("منهج"));
  assert.notEqual(fingerprint("منهج ١"), fingerprint("منهج ٢"));
});

test("syllabusGenId: بلا منهج محفوظ فارغ (أول إنشاء وإعادته بعد فشل مجانية)، ومع منهج = بصمته", () => {
  assert.equal(syllabusGenId(null), "");
  assert.equal(syllabusGenId(undefined), "");
  const s = { units: [{ title: "الوحدة الأولى", topics: ["أ"] }] };
  assert.equal(syllabusGenId(s), syllabusGenId(JSON.parse(JSON.stringify(s))));
  assert.notEqual(syllabusGenId(s), syllabusGenId({ units: [{ title: "الوحدة الأولى", topics: ["ب"] }] }));
  assert.match(syllabusGenId(s), /^s[0-9a-z]+$/);
});
