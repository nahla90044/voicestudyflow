// tests/unitAgent.test.ts — وكيل الوحدات على كتاب رأس صفحاته خاطئ وفهرسه بلا أرقام صفحات
// (حالة «قانون التنفيذ»: صفحات الوحدة الأولى يعلوها «الوحدة الثانية»، والفهرس يسرد الوحدات بلا صفحات)
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ordinalOf, tocTitles, unitsFromDividers } from "../lib/unitHeadings.ts";
import { pickStructure, structureFromPages } from "../lib/unitStructure.ts";

const ORD = ["الأولى", "الثانية", "الثالثة", "الرابعة"];
const TITLES = ["معنى التنفيذ", "المحررات التنفيذية", "الجهة المختصة", "اختصاصات القاضي"];
const body = "نص طويل في شرح المسألة القانونية وأحكامها وشروطها وآثارها. ".repeat(12);

function book() {
  const pages: { page: number; text: string }[] = [];
  pages.push({ page: 1, text: "قانون التنفيذ" });
  pages.push({ page: 2, text: "الفهرس " + TITLES.map((t, i) => `الوحدة ${ORD[i]}: ${t}.`).join(" ") });
  let p = 3;
  TITLES.forEach((t, i) => {
    // رأس الصفحة خاطئ في الوحدة الأولى (يذكر الثانية) كما في الكتاب الحقيقي
    const head = `مقرر قانون التنفيذ: الوحدة ${ORD[i === 0 ? 1 : i]}: ${TITLES[i === 0 ? 1 : i]}`;
    pages.push({ page: p++, text: `${head}\nالوحدة ${ORD[i]}\n${t}` }); // صفحة العنوان
    pages.push({ page: p++, text: `أهداف الوحدة ${head} يتوقع من الطالب ${body}` });
    pages.push({ page: p++, text: `${head} الخريطة الذهنية` }); // صفحة قصيرة ليست بداية وحدة
    for (let k = 0; k < 6; k++) pages.push({ page: p++, text: `${head}\n${body}` });
  });
  return { pages, total: p - 1 };
}

test("ترتيب الوحدة من اسمها", () => {
  assert.equal(ordinalOf("الوحده الاولي"), 1);
  assert.equal(ordinalOf("الوحده الحاديه عشره"), 11);
  assert.equal(ordinalOf("الوحده الخامسه عشره"), 15);
  assert.equal(ordinalOf("الوحده 7"), 7);
});

test("الفهرس بلا أرقام صفحات يُقرأ بعناوينه وترتيبه", () => {
  const toc = tocTitles(book().pages);
  assert.deepEqual(toc.map((t) => ordinalOf(t.key)), [1, 2, 3, 4]);
  assert.equal(toc[0].title, "معنى التنفيذ");
});

test("صفحات العناوين تعطي بدايات الوحدات الصحيحة رغم رأس الصفحة الخاطئ", () => {
  const { pages, total } = book();
  const u = unitsFromDividers(pages, total, tocTitles(pages));
  assert.deepEqual(u.map((x) => x.page), [3, 12, 21, 30]);
  assert.equal(u[3].to, total);
});

test("الوكيل يعتمد المصدر المطابق للفهرس، بعناوين الفهرس الكاملة", () => {
  const { pages, total } = book();
  const v = structureFromPages(pages, total);
  assert.equal(v.source, "dividers");
  assert.ok(v.verified);
  assert.deepEqual(v.units.map((x) => [x.page, x.to]), [[3, 11], [12, 20], [21, 29], [30, total]]);
  assert.equal(v.units[0].title, "الوحدة الأولى: معنى التنفيذ");
});

test("مصدر فيه «محاضرات» دخيلة أو وحدات ناقصة لا يُعتمد ما دام غيره يطابق الفهرس", () => {
  const toc = [1, 2, 3].map((n) => ({ key: `الوحده ${["الاولي", "الثانيه", "الثالثه"][n - 1]}`, label: `الوحدة ${ORD[n - 1]}`, title: TITLES[n - 1] }));
  const bad = { name: "bad", units: [{ title: "الوحدة الثانية: أ", page: 5 }, { title: "المحاضرة الأولى", page: 20 }, { title: "الوحدة الثالثة: ب", page: 40 }] };
  const good = { name: "good", units: [{ title: "الوحدة الأولى", page: 5 }, { title: "الوحدة الثانية", page: 25 }, { title: "الوحدة الثالثة", page: 45 }] };
  const v = pickStructure([bad, good], toc, 60);
  assert.equal(v.source, "good");
  assert.ok(v.verified);
});
