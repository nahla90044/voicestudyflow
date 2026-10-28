// tests/certDomain.test.ts — مجال الشهادة المهنية لعرض يناسبها (المالية: قيود ومعادلات وTVM)
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { certDomain, certDomainPrompt } from "../supabase/functions/_shared/certStudyPrompt.ts";

test("اسم الاختبار يحدّد المجال", () => {
  assert.equal(certDomain("CMA — الجزء الأول", ""), "finance");
  assert.equal(certDomain("PMP", ""), "pm");
  assert.equal(certDomain("CISSP", ""), "it");
  assert.equal(certDomain("SHRM-CP", ""), "hr");
});

test("بلا اسم: من عبارات النص المهنية، وبلا إنذار كاذب", () => {
  const fin = "The journal entry debits Cash. Present value of an annuity. NPV and IRR. Contribution margin and break-even. Depreciation expense on the income statement and balance sheet.";
  assert.equal(certDomain("", fin), "finance");
  assert.equal(certDomain("", "إذا كان المدين معسرًا جاز للدائن أن يطلب… والقيد في السجل العقاري"), "general", "مدين/دائن في القانون ليست محاسبة");
  assert.equal(certDomain("", "the irrational, the irreducible, the irremediable absurd"), "general", "IRR لا يطابق irrational");
});

test("الفيديو: مشهد الحساب خطوات والقيد بعمودين", () => {
  const v = certDomainPrompt("finance", true);
  assert.match(v, /steps/);
  assert.match(v, /compare/);
  assert.match(certDomainPrompt("finance", false), /N \| I\/Y \| PV \| PMT \| FV/);
});

test("المالية: دفتر الأستاذ والقوائم وقاعدة المدين والدائن", () => {
  const p = certDomainPrompt("finance", false);
  assert.match(p, /دفتر الأستاذ/);
  assert.match(p, /ميزان مراجعة/);
  assert.match(p, /يزيد بـ \| ينقص بـ \| الرصيد الطبيعي/);
  assert.match(p, /النسبة من المبيعات/);
});
