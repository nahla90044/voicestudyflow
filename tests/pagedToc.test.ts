// tests/pagedToc.test.ts — الفهرس ذو أرقام الصفحات (كتب الشهادات المهنية: CMA وأمثالها)
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { MAX_SPAN, parseTocLine, unitsFromPagedToc } from "../lib/pagedToc.ts";

/** كتاب صناعي: صفحة فهرس، ثم صفحات المحتوى بفرق ترقيم off (صفحة الكتاب ١ = صفحة الملف 1+off) */
function book(toc: string[], starts: Record<number, string[]>, bookPages: number, off: number) {
  const pages = [{ page: 1, text: "Copyright notice" }, { page: 2, text: ["Table of Contents", ...toc].join("\n") }];
  for (let b = 1; b <= bookPages; b++) pages.push({ page: b + off, text: (starts[b] ?? [`SECTION RUNNING HEAD`, `body text of page ${b}`]).join("\n") });
  return { pages, total: bookPages + off };
}

test("سطر الفهرس: الرموز والوحدات المسمّاة ورأس القسم", () => {
  assert.deepEqual(parseTocLine("A.2.1 Asset Valuation – Accounts Receivable........... 53"), { code: "A.2.1", level: 3, named: false, title: "A.2.1 Asset Valuation – Accounts Receivable", page: 53 });
  assert.equal(parseTocLine("A EXTERNAL FINANCIAL REPORTING DECISIONS 1")?.level, 1);
  assert.equal(parseTocLine("A Guide to Budgeting 12")?.code, null, "جملة تبدأ بـA ليست رمز قسم");
  assert.equal(parseTocLine("Study Unit 7: D.2. Spoilage in Process Costing........ 53")?.named, true);
  assert.equal(parseTocLine("Section E ± Internal Controls.............. 160")?.level, 0);
  assert.equal(parseTocLine("Body text without page number"), null);
});

test("رموز A.1/A.2 بفرق ترقيم: الوحدات في صفحاتها الفعلية", () => {
  const { pages, total } = book(
    ["A FIRST SECTION 1", "A.1 Topic One 3", "A.2 Topic Two 12", "B SECOND SECTION 22", "B.1 Topic Three 23", "B.2 Topic Four 30"],
    { 3: ["A.1", "Topic One"], 12: ["A.2", "Topic Two"], 23: ["B.1", "Topic Three"], 30: ["B.2", "Topic Four"] },
    40,
    4
  );
  const r = unitsFromPagedToc(pages, total);
  assert.equal(r.verified, true);
  assert.deepEqual(
    r.units.map((u) => [u.title, u.page]),
    [["A.1 Topic One", 7], ["A.2 Topic Two", 16], ["B.1 Topic Three", 27], ["B.2 Topic Four", 34]]
  );
  assert.equal(r.units[r.units.length - 1].to, total);
});

test("الوحدة الأطول من الحد تُقسَّم إلى فروعها في الفهرس", () => {
  const long = MAX_SPAN + 20;
  const { pages, total } = book(
    ["A.1 Big Topic 1", "A.1.1 Part One 2", "A.1.2 Part Two 20", "A.2 Small Topic " + (long + 1), "A.3 Last Topic " + (long + 10)],
    { 1: ["A.1", "Big Topic"], 2: ["A.1.1 Part One"], 20: ["A.1.2 Part Two"], [long + 1]: ["A.2", "Small Topic"], [long + 10]: ["A.3", "Last Topic"] },
    long + 20,
    2
  );
  const r = unitsFromPagedToc(pages, total);
  assert.deepEqual(r.units.map((u) => u.title), ["A.1.1 Part One", "A.1.2 Part Two", "A.2 Small Topic", "A.3 Last Topic"]);
  assert.equal(r.units[0].page, 3, "الفرع الأول يبدأ من أول الوحدة الأم");
});

test("«Study Unit» تتكرر أرقامها في كل قسم: كلها وحدات مستقلة", () => {
  const { pages, total } = book(
    ["Section D ± Costs.......1", "Study Unit 1: D.1. Classification of Costs......2", "Study Unit 2: D.1. Costing Systems......9", "Section E ± Controls......15", "Study Unit 1: E.1. Governance Principles......16", "Study Unit 2: E.1. Internal Controls......22"],
    { 2: ["D.1. Running", "Study Unit 1: D.1. Classification of Costs"], 9: ["Study Unit 2: D.1. Costing Systems"], 16: ["Study Unit 1: E.1. Governance Principles"], 22: ["Study Unit 2: E.1. Internal Controls"] },
    30,
    10
  );
  const r = unitsFromPagedToc(pages, total);
  assert.equal(r.verified, true);
  assert.deepEqual(r.units.map((u) => u.page), [12, 19, 26, 32]);
});

test("فهرس لا تطابق صفحاته المحتوى: لا يُعتمد", () => {
  const { pages, total } = book(["A.1 Topic One 3", "A.2 Topic Two 12", "A.3 Topic Three 20"], {}, 30, 4);
  assert.equal(unitsFromPagedToc(pages, total).verified, false);
});
