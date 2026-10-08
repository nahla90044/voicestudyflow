// tests/alignWords.test.ts
// اختبارات هايلايتر الجملة على صفحة الـPDF.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sentenceRects } from "../lib/alignWords.ts";

// صفحة من سطرين: «hello world this is» ثم «a test page»
const box = (t: string, x: number, y: number) => ({ t, x, y, w: 0.1, h: 0.02 });
const boxes = [
  box("Hello", 0.1, 0.1), box("world.", 0.2, 0.1), box("This", 0.3, 0.1), box("is", 0.4, 0.1),
  box("a", 0.1, 0.2), box("test", 0.2, 0.2), box("page.", 0.3, 0.2),
];

test("each sentence gets one rect per line it spans", () => {
  const { rects, confidence } = sentenceRects(["Hello world.", "This is a test page."], boxes);
  assert.equal(confidence, 1);
  assert.equal(rects[0].length, 1);
  const r = rects[0][0];
  assert.ok(Math.abs(r.x - 0.1) < 1e-9 && Math.abs(r.w - 0.2) < 1e-9 && Math.abs(r.h - 0.02) < 1e-9);
  assert.equal(rects[1].length, 2); // يمتد على سطرين
  assert.ok(Math.abs(rects[1][0].x - 0.3) < 1e-9);
  assert.ok(Math.abs(rects[1][1].y - 0.2) < 1e-9);
});

test("unrelated text gives low confidence so nothing wrong is drawn", () => {
  const { confidence } = sentenceRects(["Completely different words here."], boxes);
  assert.ok(confidence < 0.5);
});

test("arabic words with diacritics still match", () => {
  const ar = [box("ذهب", 0.6, 0.1), box("الولد", 0.5, 0.1), box("إلى", 0.4, 0.1), box("المدرسة", 0.3, 0.1)];
  const { confidence, rects } = sentenceRects(["ذَهَبَ الوَلَدُ إلى المدرسةِ"], ar);
  assert.equal(confidence, 1);
  assert.equal(rects[0].length, 1);
});

test("a row split across two columns gives two separate rects", () => {
  const cols = [box("left", 0.1, 0.1), box("side", 0.21, 0.1), box("right", 0.6, 0.1), box("side", 0.71, 0.1)];
  const { rects } = sentenceRects(["left side right side"], cols);
  assert.equal(rects[0].length, 2);
});
