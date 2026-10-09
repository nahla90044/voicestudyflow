// tests/wordsCore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWord, parseWordInfo, wordKey } from "../lib/wordsCore.ts";

test("clean word strips punctuation but keeps letters, marks and apostrophes", () => {
  assert.equal(cleanWord("«المرونةُ،»"), "المرونةُ");
  assert.equal(cleanWord("(l’argent)."), "l’argent");
  assert.equal(cleanWord("123"), "");
});

test("word key ignores diacritics, hamza forms and case", () => {
  assert.equal(wordKey("أَحمد"), wordKey("احمد"));
  assert.equal(wordKey("Tâche"), "tâche");
});

test("word info parsing with lists as arrays or comma strings", () => {
  const w = parseWordInfo(
    'Here: {"meaning":"مهمة","usage":"للعمل المطلوب","pos":"اسم","synonyms":["عمل","واجب"],"antonyms":"راحة، فراغ","examples":["C\'est une tâche facile."]}'
  );
  assert.ok(w);
  assert.equal(w!.meaning, "مهمة");
  assert.deepEqual(w!.synonyms, ["عمل", "واجب"]);
  assert.deepEqual(w!.antonyms, ["راحة", "فراغ"]);
  assert.equal(w!.examples.length, 1);
  assert.equal(w!.pos, "اسم");
  assert.equal(parseWordInfo("no json"), null);
  assert.equal(parseWordInfo('{"usage":"x"}'), null);
});
