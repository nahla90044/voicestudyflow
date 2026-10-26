// tests/titleCore.test.ts — حذف وسم «الجزء الأول» من عناوين الوحدة والفيديو
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { stripPartMarker } from "../lib/titleCore.ts";

test("يحذف وسم الجزء بصيغه ويُبقي العنوان", () => {
  assert.equal(stripPartMarker("ماهية التأمين وتعريفه ووظائفه الاجتماعية والاقتصادية (الجزء الأول)"), "ماهية التأمين وتعريفه ووظائفه الاجتماعية والاقتصادية");
  assert.equal(stripPartMarker("شروط السند التنفيذي (الجزء ٢ من ٤): الأهمية"), "شروط السند التنفيذي: الأهمية");
  assert.equal(stripPartMarker("الأموال محل التنفيذ — الجزء الثالث"), "الأموال محل التنفيذ");
  assert.equal(stripPartMarker("الجزء الأول: قاعدة الضمان العام"), "قاعدة الضمان العام");
  assert.equal(stripPartMarker("Insurance basics (Part 1 of 3)"), "Insurance basics");
  // لا يمس عنوانًا بلا وسم، ولا يفرغ العنوان
  assert.equal(stripPartMarker("أجزاء العقد وأركانه"), "أجزاء العقد وأركانه");
  assert.equal(stripPartMarker("(الجزء الأول)"), "(الجزء الأول)");
});
