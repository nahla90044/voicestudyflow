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

// حالات كانت تُطفئ التظليل (صفحات ممسوحة مصحَّحة، تشكيل، سوابق ملتصقة، دمج/فصل)
const line = (ws: string[]) => ws.map((t, i) => box(t, 0.9 - i * 0.1, 0.1));

test("OCR page corrected before reading still highlights (one-letter fixes)", () => {
  // الصورة: أخطاء مسح؛ المقروء: النص بعد التصحيح
  const page = line(["الاقتصاد", "الكلى", "يدرس", "السلوك", "العام", "للاقتصاذ", "ككل"]);
  const { confidence, rects } = sentenceRects(["الاقتصاد الكلي يدرس السلوك العام للاقتصاد ككل"], page);
  assert.ok(confidence >= 0.5, `confidence ${confidence}`);
  assert.equal(rects[0].length, 1);
});

test("attached conjunction/article prefixes still match", () => {
  const page = line(["والتضخم", "يرفع", "الأسعار", "وبالتالي", "تقل", "القوة"]);
  const { confidence } = sentenceRects(["التضخم يرفع أسعار وبالتالي تقل قوة"], page);
  assert.ok(confidence >= 0.8, `confidence ${confidence}`);
});

test("word split in two boxes, or two words glued in one box", () => {
  const split = line(["البنك", "المر", "كزي", "يرفع", "الفائدة"]);
  assert.ok(sentenceRects(["البنك المركزي يرفع الفائدة"], split).confidence >= 0.75);
  const glued = line(["فيهذا", "الفصل", "نتعلم", "الأنواع"]);
  assert.ok(sentenceRects(["في هذا الفصل نتعلم الأنواع"], glued).confidence >= 0.8);
});

test("a sentence with no matching words is not drawn in a guessed place", () => {
  const page = line(["الاقتصاد", "الكلي", "يدرس", "السلوك"]);
  const { rects } = sentenceRects(["الاقتصاد الكلي يدرس السلوك.", "Completely different english words here."], page);
  assert.equal(rects[0].length, 1);
  assert.equal(rects[1].length, 0);
});
