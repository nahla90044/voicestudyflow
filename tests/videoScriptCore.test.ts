// tests/videoScriptCore.test.ts
// اختبارات قراءة سيناريو «ملخّص الفيديو» (كاملًا وأثناء البثّ) وتقسيم الملخّص إلى أجزاء.
import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeVideo, parsePartialVideo, parseVideo, videoParts } from "../lib/videoScriptCore.ts";

const full = JSON.stringify({
  title: "التضخم",
  scenes: [
    { layout: "cover", emoji: "🎬", title: "التضخم", highlight: "ارتفاع الأسعار", bullets: ["أنواعه"], narration: "لنتعرّف على التضخم." },
    { layout: "compare", emoji: "⚖️", title: "مقارنة", columns: [{ title: "أ", bullets: ["١"] }, { title: "ب", bullets: ["٢"] }], bullets: [], narration: "نلاحظ الفرق." },
    { layout: "check", emoji: "🤔", title: "", question: "ما التضخم؟", answer: "ارتفاع عام للأسعار.", narration: "سؤال سريع: ما التضخم؟" },
    { layout: "stat", emoji: "📈", title: "رقم", highlight: "", bullets: ["نقطة"], narration: "رقم مهم." },
    { layout: "list", emoji: "📌", title: "بلا راوٍ", bullets: ["x"], narration: "" },
  ],
});

test("قراءة كاملة: تخطيطات، سؤال سريع، وإصلاح البيانات الناقصة", () => {
  const v = parseVideo(full)!;
  assert.equal(v.title, "التضخم");
  assert.equal(v.scenes.length, 4); // مشهد بلا راوٍ يُستبعد
  assert.equal(v.scenes[0].layout, "cover");
  assert.equal(v.scenes[1].columns?.length, 2);
  assert.equal(v.scenes[2].kind, "check");
  assert.equal(v.scenes[2].answer, "ارتفاع عام للأسعار.");
  assert.equal(v.scenes[3].layout, "list"); // stat بلا رقم بارز → قائمة
});

test("أثناء البثّ: المشاهد المكتملة فقط، ولا يكسرها قوس داخل نص", () => {
  const cut = full.slice(0, full.indexOf('"layout":"check"') + 30);
  const p = parsePartialVideo(cut)!;
  assert.equal(p.scenes.length, 2);
  const tricky = '{"title":"ت","scenes":[{"layout":"list","title":"أقواس { داخل } النص","bullets":["]"],"narration":"شرح فيه } قوس"},{"layout":"list","narr';
  assert.equal(parsePartialVideo(tricky)!.scenes[0].title, "أقواس { داخل } النص");
});

test("ردّ مقطوع: parseVideo يعيد ما اكتمل", () => {
  const v = parseVideo(full.slice(0, full.length - 120));
  assert.ok(v && v.scenes.length >= 2);
});

test("الدمج بالترتيب وعنوان الجزء الأول", () => {
  const a = parseVideo(full)!;
  const m = mergeVideo([a, { title: "آخر", scenes: a.scenes.slice(0, 1) }])!;
  assert.equal(m.title, "التضخم");
  assert.equal(m.scenes.length, 5);
});

test("تقسيم الملخّص: أجزاء ≤ الحد، الأول بالغلاف والأخير بالخلاصة وأهم النقاط", () => {
  const long = "جملة طويلة للشرح. ".repeat(260);
  const s = {
    title: "وحدة",
    intro: "تمهيد",
    sections: [1, 2, 3].map((i) => ({ emoji: "📌", heading: `قسم ${i}`, blocks: [{ type: "text" as const, text: long }] })),
    keypoints: ["نقطة مهمة"],
  };
  const parts = videoParts(s, "الوحدة الأولى");
  assert.equal(parts.length, 3);
  assert.match(parts[0], /ابدأ بمشهد cover/);
  assert.match(parts[1], /لا تضع مشهد cover/);
  assert.match(parts[2], /اختم بمشهد summary/);
  assert.match(parts[2], /نقطة مهمة/);
  assert.doesNotMatch(parts[0], /نقطة مهمة/);
  const one = videoParts({ ...s, sections: s.sections.slice(0, 1) }, "و");
  assert.equal(one.length, 1);
  assert.doesNotMatch(one[0], /الجزء/);
});
