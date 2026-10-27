// tests/bilingual.test.ts — «القراءة الثنائية» لكتب اللغة: تقسيم الجمل ومحاذاة الترجمة
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseAligned, splitSentences } from "../lib/bilingualCore.ts";

test("تقسيم الجمل عند النهايات والأسطر، والقطع القصيرة تُلحق", () => {
  const s = splitSentences("Leçon 2 — Grammaire\nJ'ai mangé une pomme. Nous avons regardé un film! Elle est allée au cinéma.\n1\nVocabulaire : le pain, la pomme.");
  assert.deepEqual(s.slice(0, 4), ["Leçon 2 — Grammaire", "J'ai mangé une pomme.", "Nous avons regardé un film!", "Elle est allée au cinéma. 1"]);
  assert.equal(s[4], "Vocabulaire : le pain, la pomme.");
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences("M. Dupont arrive. Il est content."), ["M. Dupont arrive.", "Il est content."], "الاختصار لا يقطع الجملة");
});

test("محاذاة الترجمة بصيغها", () => {
  assert.deepEqual(parseAligned('["أكلت تفاحة.","شاهدنا فيلمًا."]', 3), ["أكلت تفاحة.", "شاهدنا فيلمًا.", ""]);
  assert.deepEqual(parseAligned('[{"i":1,"t":"ب"},{"i":0,"t":"أ"},{"i":9,"t":"x"}]', 2), ["أ", "ب"]);
  assert.deepEqual(parseAligned("1) الأولى\n2. الثانية", 2), ["الأولى", "الثانية"]);
  assert.deepEqual(parseAligned("بلا شيء", 1), [""]);
});

test("قراءة تصحيح الكتابة", async () => {
  const { parseWriteCheck } = await import("../lib/writeCheckCore.ts");
  const r = parseWriteCheck('{"corrected":"J\'ai mangé une pomme.","errors":[{"wrong":"je suis mangé","right":"j\'ai mangé","why":"manger مع avoir","type":"conj"},{"wrong":"x","right":"x"},{"wrong":"pome","right":"pomme","type":"weird"}],"tip":"راجع أفعال être","good":"جمل قصيرة واضحة"}')!;
  assert.equal(r.errors.length, 2, "الخطأ الذي صوابه مثله يُحذف");
  assert.equal(r.errors[1].type, "grammar", "النوع غير المعروف = قواعد");
  assert.equal(r.tip, "راجع أفعال être");
  assert.equal(parseWriteCheck("لا شيء"), null);
  assert.equal(parseWriteCheck('{"errors":[]}'), null, "بلا نص مصحّح");
});

test("سطر انكسر في منتصف الجملة يُوصل، والعنوان يبقى", () => {
  const s = splitSentences("Conjugaison du verbe parler: je parle, nous parlons, vous\nparlez, ils/elles parlent.\nVocabulaire\nLe pain.");
  assert.deepEqual(s, ["Conjugaison du verbe parler: je parle, nous parlons, vous parlez, ils/elles parlent.", "Vocabulaire", "Le pain."]);
});

test("أرقام التمارين تبدأ جملها", () => {
  assert.deepEqual(splitSentences("Complétez au présent 1. Tu (parler) ___ anglais. 2. Nous (manger) ___ du pain."), [
    "Complétez au présent",
    "1. Tu (parler) ___ anglais.",
    "2. Nous (manger) ___ du pain.",
  ]);
});
