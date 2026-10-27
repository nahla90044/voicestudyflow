// tests/langLesson.test.ts — «مربع الدرس» لكتب اللغة: القراءة والحدود وتصنيف الأدوار
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { GRAM_LIMITS, isLatinText, parseLangBlock, roleKind } from "../lib/langLessonCore.ts";

test("قراءة القاعدة والجملة المحلّلة وجدول الاقتران", () => {
  const b = parseLangBlock({
    rule: "Le passé composé = حدث انتهى في الماضي",
    formula: "sujet + avoir/être + participe passé",
    parse: [
      {
        words: [
          { w: "Je", role: "فاعل (ضمير)" },
          { w: "ai mangé", role: "فعل", base: "manger", tense: "الماضي المركّب" },
          { w: "une pomme", role: "مفعول به" },
        ],
        tr: "أكلتُ تفاحة",
      },
    ],
    conj: { verb: "manger", tense: "présent", rows: [["je", "mange"], ["tu", "manges"], ["il/elle", "mange"], { p: "nous", f: "mangeons" }] },
    mistake: "لا يُقال je suis mangé",
  });
  assert.ok(b);
  assert.equal(b!.parse![0].words[1].base, "manger");
  assert.equal(b!.parse![0].words[1].tense, "الماضي المركّب");
  assert.equal(b!.conj!.rows.length, 4);
  assert.deepEqual(b!.conj!.rows[3], ["nous", "mangeons"]);
});

test("الحدود: لا ازدحام، وما لا يصلح يُهمل", () => {
  const many = Array.from({ length: 5 }, () => ({ words: Array.from({ length: 15 }, (_, i) => ({ w: "w" + i, role: "اسم" })) }));
  const b = parseLangBlock({ parse: many })!;
  assert.equal(b.parse!.length, GRAM_LIMITS.sentences);
  assert.equal(b.parse![0].words.length, GRAM_LIMITS.words);
  assert.equal(parseLangBlock({}), null);
  assert.equal(parseLangBlock({ conj: { verb: "être", rows: [["je", "suis"]] } }), null, "جدول بصف واحد لا يُعرض");
  assert.equal(parseLangBlock({ parse: [{ words: [{ w: "Bonjour", role: "" }] }] }), null, "كلمة واحدة ليست جملة");
  const same = parseLangBlock({ parse: [{ words: [{ w: "manger", role: "فعل", base: "Manger" }, { w: "x", role: "" }] }] })!;
  assert.equal(same.parse![0].words[0].base, undefined, "الأصل المطابق للكلمة لا يُكرر");
});

test("تصنيف الدور بالعربية والفرنسية والإنجليزية", () => {
  assert.equal(roleKind("فاعل"), "subject");
  assert.equal(roleKind("Sujet"), "subject");
  assert.equal(roleKind("مفعول به"), "object");
  assert.equal(roleKind("COD"), "object");
  assert.equal(roleKind("فعل مساعد"), "verb");
  assert.equal(roleKind("verbe"), "verb");
  assert.equal(roleKind("صفة"), "adj");
  assert.equal(roleKind("اسم"), "noun");
  assert.equal(roleKind("article"), "prep");
  assert.equal(roleKind("ضمير متصل"), "pronoun");
  assert.equal(roleKind("؟"), "other");
});

test("اتجاه النص", () => {
  assert.equal(isLatinText("Je mange une pomme"), true);
  assert.equal(isLatinText("أكلت تفاحة"), false);
});

test("اللون الفاتح المُصمت للطباعة", async () => {
  const { tint } = await import("../lib/langLessonCore.ts");
  assert.equal(tint("#000000", 0.5), "#808080");
  assert.equal(tint("#FFFFFF"), "#ffffff");
  assert.match(tint("#3B82F6"), /^#[0-9a-f]{6}$/);
});

test("الاقتران بلا تكرار الضمير", async () => {
  const { stripPronoun, parseLangBlock } = await import("../lib/langLessonCore.ts");
  assert.equal(stripPronoun("tu", "tu as"), "as");
  assert.equal(stripPronoun("il/elle", "il/elle a"), "a");
  assert.equal(stripPronoun("je", "j'ai"), "j'ai");
  assert.equal(stripPronoun("nous", "nous avons"), "avons");
  assert.equal(stripPronoun("I", "I am"), "am");
  const b = parseLangBlock({ conj: { verb: "avoir", rows: [["je", "j'ai"], ["tu", "tu as"], ["nous", "nous avons"]] } })!;
  assert.deepEqual(b.conj!.rows.map((r) => r[1]), ["j'ai", "as", "avons"]);
});

test("اسم المفعول جزء من الفعل لا مفعول به", () => {
  assert.equal(roleKind("اسم المفعول (معنى الفعل)"), "verb");
  assert.equal(roleKind("participe passé"), "verb");
  assert.equal(roleKind("اسم، مفعول به"), "object");
});

test("أدوار بالفرنسية من الفيديو الفرنسي", () => {
  assert.equal(roleKind("sujet (pronom)"), "subject");
  assert.equal(roleKind("auxiliaire avoir, avec je"), "verb");
  assert.equal(roleKind("nom, objet"), "object");
  assert.equal(roleKind("article indéfini"), "prep");
});

test("مقياس المربع: المحتوى الكثير يصغر ولا يفيض", async () => {
  const { gramScale } = await import("../lib/langLessonCore.ts");
  const w = (n: number) => Array.from({ length: n }, (_, i) => ({ w: "w" + i, role: "اسم", base: i === 1 ? "b" : undefined, tense: i === 1 ? "t" : undefined }));
  const one = { rule: "قاعدة قصيرة", formula: "a + b", parse: [{ words: w(4), tr: "ترجمة" }] };
  assert.equal(gramScale(one), 1);
  const two = { ...one, parse: [{ words: w(5), tr: "x" }, { words: w(5), tr: "y" }], mistake: "خطأ شائع" };
  const k = gramScale(two);
  assert.ok(k < 1 && k >= 0.6, String(k));
  assert.equal(gramScale({ conj: { verb: "avoir", tense: "", rows: Array.from({ length: 6 }, () => ["p", "f"] as [string, string]) } }), 1);
});

test("اتجاه التسمية", async () => {
  const { textDir } = await import("../lib/langLessonCore.ts");
  assert.equal(textDir("فاعل (ضمير)"), "rtl");
  assert.equal(textDir("(فاعل)"), "rtl");
  assert.equal(textDir("sujet (pronom)"), "ltr");
  assert.equal(textDir("manger · الماضي المركّب"), "ltr");
});
