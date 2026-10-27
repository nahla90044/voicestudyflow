// tests/listen.test.ts — «تمارين الاستماع» لكتب اللغة: الجمل والكلمة المخفية والخيارات
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { distractors, makeListenItems, pickBlank, sentencesOf } from "../lib/listenCore.ts";

const TEXT = `Leçon 2 — Grammaire : le passé composé
Le passé composé exprime une action terminée dans le passé.
Exemples : J'ai mangé une pomme. Nous avons regardé un film. Elle est allée au cinéma.
1. Je (regarder) ___ la télévision.
الوحدة الثانية: نص عربي لا يُستعمل في الاستماع.
On ne dit pas « je suis mangé » mais « j'ai mangé ».`;

let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

test("الجمل الصالحة: لاتينية، ٤–١٦ كلمة، بلا فراغات تمارين ولا عربية", () => {
  const s = sentencesOf(TEXT);
  assert.ok(s.includes("Le passé composé exprime une action terminée dans le passé."));
  assert.ok(s.some((x) => x.startsWith("Nous avons regardé")));
  assert.ok(!s.some((x) => x.includes("___")), "جمل التمارين بفراغاتها لا تُستعمل");
  assert.ok(!s.some((x) => /[؀-ۿ]/.test(x)));
});

test("الكلمة المخفية كلمة محتوى لا أداة", () => {
  for (let i = 0; i < 20; i++) {
    const b = pickBlank("Nous avons regardé un film.", rnd)!;
    assert.ok(!["un", "nous"].includes(b.word.toLowerCase()), b.word);
    assert.ok(b.masked.includes("＿＿＿"));
    assert.ok(!b.word.endsWith("."), "علامة الترقيم لا تدخل في الجواب");
  }
});

test("الخيارات من كلمات الدرس، مختلفة عن الجواب، ونهايتها متشابهة أولًا", () => {
  const ds = distractors("mangé", ["regardé", "allée", "film", "mangé", "la", "pomme", "terminée"], 3, () => 0);
  assert.equal(ds.length, 3);
  assert.ok(!ds.includes("mangé"));
  assert.ok(!ds.includes("la"));
  assert.equal(ds[0], "regardé");
});

test("التمرين كاملًا: الجواب بين الخيارات بموضعه الصحيح", () => {
  const items = makeListenItems(TEXT, 5, rnd);
  assert.ok(items.length >= 2);
  for (const it of items) {
    assert.equal(it.options.length, 4);
    assert.equal(it.options[it.answerIndex], it.answer);
    assert.equal(new Set(it.options.map((o) => o.toLowerCase())).size, 4);
  }
});

test("لا خيار من كلمات الجملة نفسها", () => {
  const items = makeListenItems(TEXT, 8, rnd);
  for (const it of items) {
    const inS = new Set(it.sentence.toLowerCase().split(" ").map((w) => w.replace(/[.,;:!?»«"']/g, "")));
    for (const o of it.options) if (o !== it.answer) assert.ok(!inS.has(o.toLowerCase()), `${o} في: ${it.sentence}`);
  }
});
