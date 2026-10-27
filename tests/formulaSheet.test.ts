// tests/formulaSheet.test.ts — «ورقة المعادلات» لكتب الشهادات: القراءة والطباعة
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formulasHtml, parseFormulas } from "../lib/formulaSheetCore.ts";

const RAW = `{"items":[
 {"name":"نقطة التعادل بالوحدات (Break-even point in units)","formula":"Fixed costs ÷ CM per unit","symbols":[["Fixed costs","التكاليف الثابتة"],{"s":"CM per unit","m":"هامش المساهمة للوحدة"}],"example":"سعر 50 وتكلفة متغيرة 30 وثابتة 40,000","steps":["١) CM = 50 − 30 = 20","٢) 40,000 ÷ 20","٣) 2,000 وحدة"],"tip":"القسمة على السعر بدل هامش المساهمة"},
 {"name":"مكرر","formula":"Fixed costs ÷ CM per unit"},
 {"name":"بلا صيغة","formula":""}
]}`;

test("قراءة المعادلات: الرموز بصيغتيها، والمكرر والناقص يُحذفان", () => {
  const f = parseFormulas(RAW);
  assert.equal(f.length, 1);
  assert.equal(f[0].symbols.length, 2);
  assert.deepEqual(f[0].symbols[1], ["CM per unit", "هامش المساهمة للوحدة"]);
  assert.equal(f[0].steps.length, 3);
  assert.ok(f[0].tip);
  assert.deepEqual(parseFormulas("لا معادلات"), []);
  assert.equal(parseFormulas('[{"name":"a","formula":"x+y"}]').length, 1, "مصفوفة مباشرة");
});

test("الطباعة: الصيغة باتجاه لاتيني والنص آمن", () => {
  const f = parseFormulas(RAW);
  const html = formulasHtml([{ title: "الوحدة <1>", items: f }, { title: "فارغة", items: [] }], { title: "ورقة المعادلات", symbols: "الرموز", example: "مثال", tip: "تنبيه" });
  assert.ok(html.includes('dir="ltr">Fixed costs ÷ CM per unit'));
  assert.ok(html.includes("الوحدة &lt;1&gt;"));
  assert.ok(!html.includes("<h2>فارغة</h2>"), "الوحدة بلا معادلات لا تُطبع");
  assert.ok(!/rgba|opacity/.test(html), "ألوان مُصمتة للطباعة على آيفون");
});
