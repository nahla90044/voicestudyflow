// tests/tableSummary.test.ts — المختصر الجدولي: القراءة (كاملة/مقطوعة)، الدمج، تمييز الأرقام، والأعمدة
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { itemColumns, mergeTables, parsePartialTable, parseTableSummary, plainItem, segments, tableToSections, tableToSpeech } from "../lib/tableSummary.ts";

const real = readFileSync(new URL("./fixtures-table-unit1.json", import.meta.url).pathname, "utf8");

test("يقرأ ردًّا حقيقيًا (الوحدة الأولى من قانون التنفيذ) بمجموعاته وروابطه", () => {
  const t = parseTableSummary(real)!;
  assert.ok(t.topics.length >= 5);
  const cond = t.topics.flatMap((x) => x.rows).find((r) => r.groups?.length);
  assert.ok(cond, "شروط التنفيذ الجبري مجموعات");
  assert.equal(cond!.groups!.reduce((a, g) => a + g.items.length, 0), 18);
  assert.ok(t.links.length >= 3);
  assert.ok(tableToSections(t).length === t.topics.length);
  assert.ok(tableToSpeech(t).length > 500);
});

test("الرد المقطوع: تبقى المواضيع المكتملة فقط", () => {
  const cut = real.slice(0, Math.floor(real.length / 2));
  const t = parsePartialTable(cut)!;
  assert.ok(t && t.topics.length >= 1);
  assert.ok(t.topics.length < parseTableSummary(real)!.topics.length);
  assert.equal(parseTableSummary(cut)!.topics.length, t.topics.length);
});

test("الدمج: الموضوع المتكرر بين جزأين متتاليين صفّ واحد، والروابط بلا تكرار", () => {
  const a = { title: "أ", topics: [{ topic: "س", rows: [{ label: "١" }] }], links: ["ر"] };
  const b = { title: "ب", topics: [{ topic: "س", rows: [{ label: "٢" }] }, { topic: "ص", rows: [{ label: "٣" }] }], links: ["ر", "ز"] };
  const m = mergeTables([a, b])!;
  assert.equal(m.title, "أ");
  assert.deepEqual(m.topics.map((x) => [x.topic, x.rows.length]), [["س", 2], ["ص", 1]]);
  assert.deepEqual(m.links, ["ر", "ز"]);
});

test("تمييز الأرقام المهمة والكلمة المفتاحية ومرجع المادة", () => {
  const k = (s: string) => segments(s).filter((g) => g.k).map((g) => [g.k, g.t]);
  assert.deepEqual(k("حسب المادة 179 من النظام"), [["art", "المادة 179"]]);
  assert.deepEqual(k("صدر عام 1421 و١٤٣٣هـ"), [["date", "عام 1421"], ["date", "١٤٣٣هـ"]]);
  assert.deepEqual(k("مدة الاعتراض ثلاثون يوما"), [["dur", "ثلاثون يوما"]]);
  assert.deepEqual(k("غرامة 5000 ريال"), [["money", "غرامة 5000 ريال"]]);
  assert.deepEqual(k("بالمرسوم الملكي م/٢١"), [["decree", "المرسوم الملكي م/٢١"]]);
  assert.deepEqual(k("دين **حال** الأداء (م٢٧، ٢٨)"), [["key", "حال"], ["ref", "م٢٧، ٢٨"]]);
  // «عام» ليست «م» مادة
  assert.deepEqual(k("نظام عام"), []);
});

test("عناصر التعداد بلا إيموجي، و⚠️ تبقى", () => {
  assert.equal(plainItem("⚖️ حكم **نهائي**"), "حكم **نهائي**");
  assert.equal(plainItem("⚠️ خلال ٣٠ يومًا"), "⚠️ خلال ٣٠ يومًا");
});

test("الأعمدة: الطويل عمود واحد، والقصير أكثر", () => {
  assert.equal(itemColumns(["عنصر طويل جدا يتجاوز الحد المسموح به في السطر الواحد", "ب", "ج"]), 1);
  assert.equal(itemColumns(["أ", "ب", "ج", "د", "هـ", "و"]), 3);
  assert.equal(itemColumns(["عنصر متوسط الطول", "عنصر آخر متوسط", "ثالث"]), 2);
});
