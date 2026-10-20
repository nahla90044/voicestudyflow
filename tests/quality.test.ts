// tests/quality.test.ts — وكلاء الجودة: الملخّص المقطوع/القصير، الفيديو الساكت، والسؤال بلا دليل في النص
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkSummaryPart, checkVideoPart, quoteInText, verifiedQuestions } from "../lib/qualityCore.ts";

const src = "التنفيذ الجبري هو إجبار المدين على الوفاء بما التزم به بواسطة السلطة العامة. ".repeat(60); // ~٤٨٠٠ حرف
const ctx = `عنوان الوحدة: معنى التنفيذ\n\n${src}`;
const sec = (text: string) => ({ emoji: "📌", heading: "قسم", blocks: [{ type: "text" as const, text }] });

test("الملخّص: الفارغ والمقطوع والقصير جدًا يُرفض، والسليم يمر", () => {
  assert.equal(checkSummaryPart({ title: "", intro: "", sections: [], keypoints: [] }, ctx), "empty");
  assert.equal(checkSummaryPart({ title: "", intro: "", sections: [sec("نص"), { emoji: "", heading: "قسم", blocks: [] }], keypoints: [] }, ctx), "truncated");
  assert.equal(checkSummaryPart({ title: "", intro: "", sections: [sec("التنفيذ الجبري.")], keypoints: [] }, ctx), "short");
  assert.equal(checkSummaryPart({ title: "", intro: "تمهيد", sections: [sec("شرح وافٍ ".repeat(80))], keypoints: ["نقطة"] }, ctx), null);
  // مادة قصيرة أصلًا (صفحة واحدة): لا يُحكم بالقِصَر
  assert.equal(checkSummaryPart({ title: "", intro: "", sections: [sec("قصير")], keypoints: [] }, "نص قصير"), null);
});

test("الفيديو: الراوي الساكت عن معظم المادة، أو شاشات بلا نقاط في أغلب المشاهد → يُرفض", () => {
  const sc = (narration: string, bullets: string[] = ["نقطة"]) => ({ kind: "slide" as const, emoji: "📌", title: "ع", bullets, narration });
  assert.equal(checkVideoPart({ title: "", scenes: [] }, ctx), "few");
  assert.equal(checkVideoPart({ title: "", scenes: [sc("قليل"), sc("قليل")] }, ctx), "silent");
  const long = "شرح مفصل للفكرة مع مثال واضح ".repeat(12);
  assert.equal(checkVideoPart({ title: "", scenes: Array.from({ length: 6 }, () => sc(long, [])) }, ctx), "bare");
  assert.equal(checkVideoPart({ title: "", scenes: Array.from({ length: 6 }, () => sc(long)) }, ctx), null);
});

test("الاقتباس يُطابق رغم اختلاف الهمزات والتشكيل والترقيم، ولا يُطابق المختلق", () => {
  const text = "يُعَدُّ التنفيذ الجبري إجبارَ المدين على الوفاء بما التزم به، بواسطة السلطة العامة في الدولة.";
  assert.ok(quoteInText("يعد التنفيذ الجبري اجبار المدين على الوفاء", text));
  assert.equal(quoteInText("يجوز للدائن حبس المدين دون حكم قضائي", text), false);
});

test("الأسئلة بلا دليل تُحذف، وبلا اقتباس تبقى", () => {
  const text = "الحجز التحفظي إجراء وقتي يهدف إلى منع المدين من التصرف في أمواله.";
  const qs = [{ quote: "الحجز التحفظي إجراء وقتي" }, { quote: "الحبس جائز دائمًا" }, { quote: "" }];
  const r = verifiedQuestions(qs, text);
  assert.equal(r.dropped, 1);
  assert.equal(r.kept.length, 2);
});
