import assert from "node:assert/strict";
import { test } from "node:test";

import { inferOffset, printedNumber } from "../lib/pageLabelCore.ts";

const w = (t: string, y: number) => ({ t, x: 0.5, y, w: 0.03, h: 0.015 });

test("رقم الصفحة في الهامش السفلي", () => {
  assert.equal(printedNumber([w("Hello", 0.4), w("12", 0.5), w("21", 0.95)]), 21);
});

test("الأرقام الهندية والعلوية", () => {
  assert.equal(printedNumber([w("٣٤", 0.02), w("نص", 0.3)]), 34);
});

test("لا رقم في الهوامش", () => {
  assert.equal(printedNumber([w("7", 0.5), w("كلمة", 0.97)]), null);
});

test("الفرق بالأغلبية", () => {
  assert.equal(inferOffset([{ pdf: 32, printed: 21 }, { pdf: 33, printed: 22 }, { pdf: 34, printed: 5 }]), 11);
});

test("عيّنتان متعارضتان → لا نخمّن", () => {
  assert.equal(inferOffset([{ pdf: 32, printed: 21 }, { pdf: 33, printed: 9 }]), null);
});

test("عيّنة وحيدة تكفي", () => {
  assert.equal(inferOffset([{ pdf: 10, printed: 4 }, { pdf: 11, printed: null }]), 6);
});
