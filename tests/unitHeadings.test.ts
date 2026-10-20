// tests/unitHeadings.test.ts — وحدات رأس الصفحة المتكرر (بلاغ كتاب القانون الدولي الخاص: ٢٦ وحدة مكررة بدل ١٥)
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseHeading, unitsFromRunningHeads } from "../lib/unitHeadings.ts";

const head = (u: string) => `مقرر القانون الدولي الخاص\n${u}\nنص الصفحة`;

test("رأس الوحدة بمسافة أو بدونها قبل النقطتين = وحدة واحدة", () => {
  assert.equal(parseHeading("الوحدة الثالثة : قواعد")!.key, parseHeading("الوحدة الثالثة: قواعد")!.key);
  assert.equal(parseHeading("الوحدة الحادية عشرة: الجنسية")!.label, "الوحدة الحادية عشرة");
  assert.equal(parseHeading("نص عادي"), null);
});

test("وحدات متصلة بصفحاتها، صفحة الفهرس مستثناة، والعنوان العابر لا يُعدّ وحدة", () => {
  const pages = [
    { page: 1, text: "الفهرس\nالوحدة الأولى\nالوحدة الثانية .\nالوحدة الثالثة ." },
    { page: 2, text: "مقدمة عامة للكتاب" },
    ...[3, 4, 5, 6].map((p) => ({ page: p, text: head(p % 2 ? "الوحدة الأولى: التعريف" : "الوحدة الأولى : التعريف") })),
    { page: 7, text: "الوحدة الثامنة\nعنوان عابر" },
    ...[8, 9, 10].map((p) => ({ page: p, text: head("الوحدة الثانية: المصادر") })),
    ...[11, 12, 13].map((p) => ({ page: p, text: head("الوحدة الثالثة : الاختصاص") })),
  ];
  const u = unitsFromRunningHeads(pages, 13);
  assert.deepEqual(
    u.map((x) => [x.page, x.to]),
    [[3, 7], [8, 10], [11, 13]]
  );
  assert.equal(u[0].title, "الوحدة الأولى: التعريف");
});

test("كتاب بلا رأس وحدة متكرر → [] (يُستعمل مصدر آخر)", () => {
  assert.deepEqual(unitsFromRunningHeads([{ page: 1, text: "الفصل الأول" }, { page: 2, text: "نص" }], 2), []);
});
