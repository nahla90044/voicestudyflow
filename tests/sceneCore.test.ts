import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveScene, sceneForHour, sceneGrowth } from "../lib/sceneCore.ts";

test("المشهد حسب الساعة", () => {
  assert.equal(sceneForHour(5), "garden");
  assert.equal(sceneForHour(14), "garden");
  assert.equal(sceneForHour(15), "study");
  assert.equal(sceneForHour(19), "study");
  assert.equal(sceneForHour(20), "sky");
  assert.equal(sceneForHour(2), "sky");
});

test("تثبيت مشهد يتجاوز الوقت", () => {
  assert.equal(resolveScene("sky", 9), "sky");
  assert.equal(resolveScene("auto", 9), "garden");
});

test("السماء: نجمة لكل صفحة حتى ٨", () => {
  const base = { unitsDone: 0, unitCount: 5, readiness: 0 };
  assert.equal(sceneGrowth("sky", { ...base, pagesToday: 3 }).lit, 3);
  assert.equal(sceneGrowth("sky", { ...base, pagesToday: 30 }).lit, 8);
});

test("الرف: كتاب لكل وحدة منجزة وسعة ٦–١٠", () => {
  const g = sceneGrowth("study", { pagesToday: 0, unitsDone: 2, unitCount: 4, readiness: 0 });
  assert.deepEqual([g.lit, g.slots], [2, 6]);
  assert.equal(sceneGrowth("study", { pagesToday: 0, unitsDone: 12, unitCount: 14, readiness: 0 }).slots, 10);
});

test("الشجرة لا تكون جرداء وتمتلئ مع الجاهزية", () => {
  const empty = sceneGrowth("garden", { pagesToday: 0, unitsDone: 0, unitCount: 4, readiness: 0 });
  const full = sceneGrowth("garden", { pagesToday: 0, unitsDone: 4, unitCount: 4, readiness: 100 });
  assert.equal(empty.lit, 16);
  assert.equal(full.lit, 40);
  assert.equal(full.fruits, 4);
});
