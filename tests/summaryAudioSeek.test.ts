// tests/summaryAudioSeek.test.ts — التقديم والإرجاع ١٥ ثانية في صوت الملخّص (بالمقاطع)
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { chunkSeconds, shiftChunk } from "../lib/seekCore.ts";

const secs = [10, 10, 10, 10, 10];

test("التقديم ١٥ ث ينتقل مقطعًا أو اثنين، ولا يتجاوز الأخير", () => {
  assert.equal(shiftChunk(secs, 0, 15), 1);
  assert.equal(shiftChunk(secs, 1, 30), 4); // من ١٠ إلى ٤٠ = المقطع الخامس
  assert.equal(shiftChunk(secs, 4, 15), 4);
});

test("الإرجاع ١٥ ث يرجع للمقطع الذي تقع فيه تلك اللحظة، ولا يقل عن الأول", () => {
  assert.equal(shiftChunk(secs, 2, -15), 0); // من الثانية ٢٠ إلى ٥ = المقطع الأول
  assert.equal(shiftChunk(secs, 3, -5), 2);
  assert.equal(shiftChunk(secs, 0, -15), 0);
});

test("مقاطع طويلة: التقديم يتقدّم مقطعًا على الأقل", () => {
  assert.equal(shiftChunk([60, 60, 60], 0, 15), 1);
  assert.equal(shiftChunk([60, 60, 60], 2, -15), 1);
});

test("مدة كل مقطع من عدد حروفه", () => {
  assert.deepEqual(chunkSeconds(["a".repeat(150), "b"], 15), [10, 2]);
});
