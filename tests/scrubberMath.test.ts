// tests/scrubberMath.test.ts
// اختبارات منطق اتجاه شريط الصفحات — تعمل بـ `npm test` (node --test، بلا أي حزم).
//
// الاصطلاح المُختبَر: النسبة ٠ عند الصفحة الأولى دائمًا، والاتجاه يقرّر
// أين تقع على الشاشة: أقصى اليمين في RTL، أقصى اليسار في LTR.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pageAtX, fractionForPage } from "../lib/scrubberMath.ts";

const WIDTH = 300;
const PAGES = 10;

test("LTR: أقصى اليسار = الصفحة الأولى، أقصى اليمين = الأخيرة", () => {
  assert.equal(pageAtX(0, WIDTH, PAGES, false), 1);
  assert.equal(pageAtX(WIDTH, WIDTH, PAGES, false), PAGES);
});

test("RTL: أقصى اليمين = الصفحة الأولى، أقصى اليسار = الأخيرة", () => {
  assert.equal(pageAtX(WIDTH, WIDTH, PAGES, true), 1);
  assert.equal(pageAtX(0, WIDTH, PAGES, true), PAGES);
});

test("منتصف الشريط = منتصف الكتاب في الاتجاهين", () => {
  // ١٠ صفحات: المنتصف بين ٥ و٦ — Math.round يحسم، المهم أنهما متطابقان.
  const ltr = pageAtX(WIDTH / 2, WIDTH, PAGES, false);
  const rtl = pageAtX(WIDTH / 2, WIDTH, PAGES, true);
  assert.equal(ltr, rtl);
  assert.ok(ltr >= 5 && ltr <= 6, `توقّعنا ٥ أو ٦، حصلنا ${ltr}`);
});

test("تناظر المرآة: rtl(x) يطابق ltr(width - x) لكل بكسل", () => {
  for (let x = 0; x <= WIDTH; x++) {
    assert.equal(
      pageAtX(x, WIDTH, PAGES, true),
      pageAtX(WIDTH - x, WIDTH, PAGES, false),
      `اختلاف عند x=${x}`,
    );
  }
});

test("اللمس خارج الشريط يُقصّ إلى الحدود ولا يتجاوزها", () => {
  assert.equal(pageAtX(-50, WIDTH, PAGES, false), 1);
  assert.equal(pageAtX(WIDTH + 50, WIDTH, PAGES, false), PAGES);
  assert.equal(pageAtX(-50, WIDTH, PAGES, true), PAGES);
  assert.equal(pageAtX(WIDTH + 50, WIDTH, PAGES, true), 1);
});

test("حالات منحلّة: عرض صفري أو كتاب بلا صفحات → الصفحة ١ بلا انهيار", () => {
  assert.equal(pageAtX(100, 0, PAGES, false), 1);
  assert.equal(pageAtX(100, -5, PAGES, true), 1);
  assert.equal(pageAtX(100, WIDTH, 0, false), 1);
});

test("كتاب من صفحة واحدة: كل لمسة = الصفحة ١، والامتلاء ٠", () => {
  for (const x of [0, WIDTH / 2, WIDTH]) {
    assert.equal(pageAtX(x, WIDTH, 1, false), 1);
    assert.equal(pageAtX(x, WIDTH, 1, true), 1);
  }
  assert.equal(fractionForPage(1, 1), 0);
});

test("fractionForPage: ٠ عند الأولى و١ عند الأخيرة وتدرّج خطّي بينهما", () => {
  assert.equal(fractionForPage(1, PAGES), 0);
  assert.equal(fractionForPage(PAGES, PAGES), 1);
  assert.equal(fractionForPage(5, 9), 0.5); // ٩ صفحات: الخامسة هي المنتصف تمامًا
});

test("fractionForPage يقصّ الصفحات الخارجة عن النطاق", () => {
  assert.equal(fractionForPage(0, PAGES), 0);
  assert.equal(fractionForPage(-3, PAGES), 0);
  assert.equal(fractionForPage(PAGES + 5, PAGES), 1);
});

test("ذهاب وإياب: الصفحة → نسبة → موضع → نفس الصفحة (الاتجاهان)", () => {
  for (const rtl of [false, true]) {
    for (let p = 1; p <= PAGES; p++) {
      const f = fractionForPage(p, PAGES);
      const x = rtl ? (1 - f) * WIDTH : f * WIDTH;
      assert.equal(pageAtX(x, WIDTH, PAGES, rtl), p, `فقدنا الصفحة ${p} في ${rtl ? "RTL" : "LTR"}`);
    }
  }
});
