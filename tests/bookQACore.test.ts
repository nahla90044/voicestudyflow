// tests/bookQACore.test.ts
// اختبارات «كتابك يجيب»: التطبيع، اختيار الصفحات، واستخراج الاستشهادات.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext,
  lightStem,
  normalizeArabic,
  parseCitations,
  selectPages,
  tokenize,
  type BookPage,
} from "../lib/bookQACore.ts";

test("التطبيع يحذف التشكيل ويوحّد الألف والتاء والأرقام", () => {
  assert.equal(normalizeArabic("مُرُونَةُ الطَّلَبِ"), "مرونه الطلب");
  assert.equal(normalizeArabic("إستراتيجية أسعار ١٢"), "استراتيجيه اسعار 12");
});

test("الجذع الخفيف يحذف «ال» والحروف الملتصقة بها", () => {
  assert.equal(lightStem("والطلب"), "طلب");
  assert.equal(lightStem("بالسعر"), "سعر");
  assert.equal(lightStem("الطلب"), "طلب");
  assert.equal(lightStem("طلب"), "طلب");
});

test("كلمات السؤال الشائعة تُهمل", () => {
  assert.deepEqual(tokenize("لماذا الطلب على الخبز غير مرن؟"), ["طلب", "خبز", "غير", "مرن"]);
});

const pages: BookPage[] = [
  { book: 1, page: 10, text: "مقدمة عن علم الاقتصاد وتاريخه." },
  { book: 1, page: 11, text: "العرض والطلب يحددان السعر في السوق." },
  { book: 1, page: 12, text: "مرونة الطلب السعرية: الخبز سلعة ضرورية فطلبها غير مرن. مرونة الطلب تقيس الاستجابة." },
  { book: 1, page: 13, text: "تكاليف الإنتاج في المدى القصير." },
];

test("أكثر صفحة صلة بالسؤال تُختار، والصفحات غير ذات الصلة تُستبعد", () => {
  const sel = selectPages("ليش طلب الخبز غير مرن؟", pages);
  assert.ok(sel.some((p) => p.page === 12));
  assert.ok(!sel.some((p) => p.page === 13));
  assert.ok(!sel.some((p) => p.page === 10));
});

test("سؤال عام بلا تطابق يأخذ صفحات موزّعة من الكتاب كله", () => {
  const sel = selectPages("لخص", pages);
  assert.ok(sel.length >= 1);
  assert.deepEqual(sel, [...sel].sort((a, b) => a.page - b.page));
});

test("الميزانية تحدّ عدد الأحرف المرسلة", () => {
  const big: BookPage[] = Array.from({ length: 20 }, (_, i) => ({ book: 1, page: i + 1, text: "طلب ".repeat(1000) }));
  const sel = selectPages("طلب", big, 6000, 2500);
  const chars = sel.reduce((s, p) => s + p.text.length, 0);
  assert.ok(chars <= 6000);
  assert.ok(sel.length >= 1);
});

test("السياق يضع علامة الصفحة قبل نصها", () => {
  assert.equal(buildContext([{ book: 1, page: 5, text: " نص " }]), "[ك1 ص5]\nنص");
});

test("الاستشهادات تُستخرج (بأرقام عربية أو غربية) وتُحذف من النص بلا تكرار", () => {
  const r = parseCitations("لأن الخبز ضروري. [ك1 ص12] [ك١ ص١٤] [ك1 ص12]");
  assert.equal(r.text, "لأن الخبز ضروري.");
  assert.deepEqual(r.cites, [
    { book: 1, page: 12 },
    { book: 1, page: 14 },
  ]);
});
