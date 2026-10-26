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

test("جزء الفيديو المقطوع قبل نهايته يُرفض (تضيع مشاهد آخره)", () => {
  const sc = { kind: "slide" as const, emoji: "📌", title: "ع", bullets: ["نقطة"], narration: "شرح مفصل ".repeat(40) };
  assert.equal(checkVideoPart({ title: "", scenes: [sc, sc, sc], truncated: true }, ctx), "truncated");
});

// ===== ملخّص الفيديو ٢: الفحص مع نصيب الجزء من الخطة =====
import type { VPart } from "../lib/videoPlanCore.ts";
import type { VideoScene } from "../lib/videoScriptCore.ts";

// مادة قصيرة: الفحوص الجديدة وحدها (الساكت/القليل لهما اختباراتهما أعلاه)
const ctx2 = "عنوان الوحدة: و\n\nمادة الجزء";
const longN = "شرح مفصل للفكرة مع مثال واضح من الواقع يبين السبب ".repeat(6);
const sl2 = (topic: string, title = "عنوان المشهد هنا", extra: Partial<VideoScene> = {}): VideoScene => ({ kind: "slide", emoji: "📌", title, bullets: ["نقطة"], narration: longN, topic, ...extra });
const ck2 = (topic: string, final?: "q" | "ex"): VideoScene => ({ kind: "check", emoji: "🤔", title: "", bullets: [], narration: "سؤال للتفكير", question: `سؤال ${topic} ${final ?? ""}؟`, answer: "ج", topic, ...(final ? { final } : {}) });
const meta = (mine: VPart["mine"], o: Partial<VPart> = {}): VPart => ({ v: 1, role: "part", i: 1, n: 3, mine, before: [], after: [], map: [], scenes: 6, ...o });

test("الفيديو ٢: غياب الأسئلة الختامية أو أغلب التمارين → nofinal", () => {
  const m = meta([{ id: "T1", t: "الأول", final: true, chars: 900 }, { id: "E1", t: "تمارين", ex: 5 }]);
  const exs = (k: number) => Array.from({ length: k }, () => ck2("E1", "ex"));
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1"), sl2("T1"), ...exs(5)] }, ctx2, m), "nofinal"); // لا q
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1"), sl2("T1"), ck2("T1", "q"), ...exs(2)] }, ctx2, m), "nofinal"); // تمرينان من خمسة
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1"), sl2("T1"), ck2("T1", "q"), ...exs(4)] }, ctx2, m), null); // ٤ من ٥ ≥ ٧٠٪
});

test("الفيديو ٢: موضوعان بسؤال فهم ولا سؤال فهم أصلًا → nocheck؛ وموضوع معتبر بلا مشهد → skipped", () => {
  const m = meta([{ id: "T1", t: "الأول", check: true, chars: 900 }, { id: "T2", t: "الثاني", check: true, chars: 900 }]);
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1"), sl2("T1"), sl2("T2"), sl2("T2")] }, ctx2, m), "nocheck");
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1"), sl2("T1"), ck2("T1"), sl2("T2"), ck2("T2")] }, ctx2, m), null);
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1"), sl2("T1"), sl2("T1"), ck2("T1")] }, ctx2, m), "skipped");
  // بلا وسوم مواضيع (النموذج لم يلتزم بها): لا يُحكم بالإغفال
  const untagged = [sl2(""), sl2(""), sl2(""), ck2("")].map((s) => ({ ...s, topic: undefined }));
  assert.equal(checkVideoPart({ title: "", scenes: untagged }, ctx2, m), null);
});

test("الفيديو ٢: مشاهد بعناوين مواضيع أجزاء أخرى → overlap؛ ومشهد واحد مقبول", () => {
  const m = meta([{ id: "T4", t: "التنفيذ المعجل للأحكام", chars: 900 }], { before: ["حالات التنفيذ المعجّل (م169)", "شروط التنفيذ الجبري (أوله)"], after: ["قاضي التنفيذ"] });
  const own = [sl2("T4", "التنفيذ المعجل للأحكام"), sl2("T4", "مبررات التنفيذ المعجل"), sl2("T4", "الكفالة")];
  assert.equal(checkVideoPart({ title: "", scenes: [...own, sl2("T4", "حالات التنفيذ المعجل في المادة ١٦٩"), sl2("T4", "شروط التنفيذ الجبري")] }, ctx2, m), "overlap");
  assert.equal(checkVideoPart({ title: "", scenes: [...own, sl2("T4", "حالات التنفيذ المعجل في المادة ١٦٩")] }, ctx2, m), null);
});

test("الفيديو ٢: أربع صيغ مذكّرة باقية بعد التحييد → masc؛ وأول الجمل يُحيَّد فلا يُعدّ", () => {
  const m = meta([{ id: "T1", t: "الأول", chars: 900 }]);
  const mid = "الحكم نهائي ولذلك انتبه لهذا الفرق ثم فكّر في سببه.";
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1", "أ", { narration: longN + mid }), sl2("T1", "ب", { narration: longN + mid })] }, ctx2, m), "masc");
  const start = "انتبه لهذا الفرق. فكّر قليلًا في سببه. احفظ القاعدة.";
  assert.equal(checkVideoPart({ title: "", scenes: [sl2("T1", "أ", { narration: longN + start }), sl2("T1", "ب", { narration: longN + start })] }, ctx2, m), null);
});

test("الفيديو ٢: الجزء الوحيد يُفحص بعدد تمارينه؛ والاستدعاء بلا meta كما كان", () => {
  const solo = meta([], { role: "solo", i: 0, n: 1, exCount: 3 });
  assert.equal(checkVideoPart({ title: "", scenes: [sl2(""), sl2(""), ck2("", "ex")] }, ctx2, solo), "nofinal");
  assert.equal(checkVideoPart({ title: "", scenes: [sl2(""), sl2(""), ck2("", "ex"), ck2("", "ex"), ck2("", "ex")] }, ctx2, solo), null);
  assert.equal(checkVideoPart({ title: "", scenes: [sl2(""), sl2("")] }, ctx2), null);
});

import { mascCount } from "../lib/qualityCore.ts";

test("الفيديو ٢: الصيغ المذكّرة تُعدّ بعد أدوات الربط فقط — الفعل الماضي بعد اسم لا يُرفض به شرح سليم", () => {
  const m = meta([{ id: "T1", t: "الأول", chars: 900 }]);
  const past = "المشرّع ركّز على حماية الدائن، والقاضي لاحظ أن الحكم نهائي، والمادة تذكر أن الشروط ثلاثة.";
  const scenes = [sl2("T1", "أ", { narration: longN + past }), sl2("T1", "ب", { narration: longN + past })];
  assert.equal(mascCount(scenes), 0);
  assert.equal(checkVideoPart({ title: "", scenes }, ctx2, m), null);
  assert.equal(mascCount([sl2("T1", "أ", { narration: "الحكم نهائي، وهنا انتبه إلى الاستثناء ثم تذكّر القاعدة. ولكن لاحظ أن المدة قصيرة." })]), 3);
});
