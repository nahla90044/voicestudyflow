// tests/glossaryCore.test.ts
// اختبارات صفحات الوحدات ونوع الكتاب وقراءة القاموس.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlossary, parseKind, titleKeys, unitContext, unitRanges } from "../lib/glossaryCore.ts";

const titles = ["الوحدة الأولى: مرونة الطلب السعرية", "الوحدة الثانية: سلوك المستهلك", "الوحدة الثالثة: تكاليف الإنتاج"];

const filler = (p: number) => ({ page: p, text: "نص عادي عن موضوعات متفرقة في الاقتصاد والأسواق والأسعار " + p });
const pages = [
  // الفهرس يذكر كل العناوين → يجب تجاهله
  { page: 2, text: "الفهرس مرونة الطلب السعرية ٥ سلوك المستهلك ٢٠ تكاليف الإنتاج ٣٥" },
  ...Array.from({ length: 3 }, (_, i) => filler(i + 3)),
  { page: 6, text: "الوحدة الأولى مرونة الطلب السعرية\nتقيس المرونة استجابة الكمية..." },
  ...Array.from({ length: 13 }, (_, i) => filler(i + 7)),
  { page: 20, text: "الوحدة الثانية سلوك المستهلك\nيختار المستهلك..." },
  ...Array.from({ length: 14 }, (_, i) => filler(i + 21)),
];

test("title keys drop generic words and ordinals", () => {
  assert.deepEqual(titleKeys("الوحدة الأولى: مرونة الطلب السعرية"), ["مرونه", "طلب", "سعريه"]);
  assert.deepEqual(titleKeys("Book I: The Spirit of Groups"), ["spirit", "groups"]);
});

test("unit ranges skip the table of contents and estimate missing units", () => {
  const r = unitRanges(titles, pages, 60);
  assert.deepEqual(r[0], { from: 6, to: 19, found: true });
  assert.deepEqual(r[1], { from: 20, to: r[2].from - 1, found: true });
  assert.equal(r[2].found, false); // لم يُعثر على الثالثة → تقدير
  assert.ok(r[2].from > 20 && r[2].to === 60);
});

test("book kind from arabic or english answers", () => {
  assert.equal(parseKind("language"), "language");
  assert.equal(parseKind("كتاب لتعليم اللغة"), "language");
  assert.equal(parseKind("رواية"), "novel");
  assert.equal(parseKind("كتاب منهجي جامعي"), "textbook");
  assert.equal(parseKind("something else"), "general");
});

test("glossary parsing: full array, aliases, and salvage of a cut-off reply", () => {
  const ok = parseGlossary('[{"t":"المرونة","m":"استجابة الكمية للسعر","k":"term","p":6},{"term":"سلعة دنيا","meaning":"يقل طلبها مع الدخل","kind":"def"}]');
  assert.equal(ok.length, 2);
  assert.deepEqual(ok[0], { t: "المرونة", m: "استجابة الكمية للسعر", k: "term", p: 6 });
  assert.equal(ok[1].k, "def");
  const cut = parseGlossary('[{"t":"une tâche","m":"مهمة","k":"word","ex":"C\'est une tâche facile"},{"t":"cuisiner","m":"يطبخ"');
  assert.equal(cut.length, 1);
  assert.equal(cut[0].ex, "C'est une tâche facile");
  assert.equal(parseGlossary('[{"t":"x","m":"y"},{"t":"X","m":"z"}]').length, 1); // بلا تكرار
});

test("unit context keeps page markers and stays within budget", () => {
  const ctx = unitContext(pages, { from: 6, to: 8, found: true }, 300);
  assert.match(ctx, /\[ص6\]/);
  assert.ok(ctx.length <= 300);
  assert.equal(unitContext(pages, { from: 100, to: 110, found: false }), "");
});
