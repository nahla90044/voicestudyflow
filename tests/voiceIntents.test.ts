// tests/voiceIntents.test.ts
// اختبارات فهم الطلبات الصوتية وأوامر وضع المشي.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, parseIntents, parseTime, parseWalkCommand, unitNumber } from "../lib/voiceIntents.ts";

const types = (s: string, h = 10) => parseIntents(s, h).map((i) => i.type);

test("normalize unifies letters, strips diacritics and converts Arabic digits", () => {
  assert.equal(normalize("ملخّص الوحدةِ ٤؟"), "ملخص الوحده 4");
  assert.equal(normalize("إختبار أسئلة"), "اختبار اسئله");
});

test("unit numbers from ordinals, cardinals and digits", () => {
  assert.equal(unitNumber(normalize("ملخص الوحدة الرابعة")), 4);
  assert.equal(unitNumber(normalize("اختبار الوحدة ٣")), 3);
  assert.equal(unitNumber(normalize("summary of unit two")), 2);
  assert.equal(unitNumber(normalize("ملخص")), null);
});

test("design example: summary + reminder in one request", () => {
  const r = parseIntents("ملخص الوحدة الرابعة، وتذكير بالمراجعة الساعة تسع", 10);
  assert.deepEqual(r[0], { type: "summary", unit: 4 });
  assert.equal(r[1].type, "remind");
  if (r[1].type === "remind") {
    assert.equal(r[1].hour, 21);
    assert.equal(r[1].minute, 0);
    assert.match(r[1].what, /مراجعه/);
  }
});

test("readiness questions are not quiz requests", () => {
  assert.deepEqual(types("كم باقي على اختباري؟"), ["readiness"]);
  assert.deepEqual(types("how many days until my exam"), ["readiness"]);
});

test("resume, quiz, mistakes, cards, focus", () => {
  assert.deepEqual(types("وين وقفت أمس؟"), ["resume"]);
  assert.deepEqual(types("كمّل"), ["resume"]);
  assert.deepEqual(parseIntents("اختبرني في الوحدة الثانية"), [{ type: "quiz", unit: 2 }]);
  assert.deepEqual(types("اختبار من خمسة أسئلة"), ["quiz"]);
  assert.deepEqual(types("راجع أخطائي"), ["mistakes"]);
  assert.deepEqual(types("مراجعة البطاقات"), ["cards"]);
  assert.deepEqual(types("ابدأ جلسة تركيز"), ["focus"]);
});

test("anything else is a question about the book", () => {
  const r = parseIntents("ليش طلب الخبز غير مرن؟");
  assert.deepEqual(r, [{ type: "ask", question: "ليش طلب الخبز غير مرن؟" }]);
});

test("reminder times: evening by default, morning when said, minutes", () => {
  assert.deepEqual(parseTime(normalize("الساعة ٩"), 10), { hour: 21, minute: 0 });
  assert.deepEqual(parseTime(normalize("الساعة ٧ الصبح"), 22), { hour: 7, minute: 0 });
  assert.deepEqual(parseTime(normalize("الساعة تسع ونص الليل"), 10), { hour: 21, minute: 30 });
  assert.deepEqual(parseTime(normalize("at 8:15 pm"), 10), { hour: 20, minute: 15 });
  assert.deepEqual(parseTime(normalize("الساعة 11"), 9), { hour: 11, minute: 0 });
  assert.equal(parseTime(normalize("بكرة"), 9), null);
});

test("reminder about cards does not open cards now", () => {
  assert.deepEqual(types("ذكرني بمراجعة البطاقات الساعة ٨"), ["remind"]);
});

test("walk mode picks the command at the end of what was heard", () => {
  assert.equal(parseWalkCommand("إعادة"), "repeat");
  assert.equal(parseWalkCommand("ممكن شرح أبسط"), "explain");
  assert.equal(parseWalkCommand("احفظها بطاقة"), "card");
  assert.equal(parseWalkCommand("وقّف"), "pause");
  assert.equal(parseWalkCommand("كمل"), "resume");
  assert.equal(parseWalkCommand("معك"), "with");
  assert.equal(parseWalkCommand("الطقس جميل اليوم"), null);
});
