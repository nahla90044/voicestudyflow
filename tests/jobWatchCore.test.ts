// tests/jobWatchCore.test.ts
// متابعة مهمة السيرفر: خلل ٢٦ أكتوبر كان عدّ «لا نص خلال ٩٠ ث» موتًا للمهمة أثناء تفكير النموذج،
// فتُترك مهمة حية ويُطلب غيرها (وكلٌّ يُخصم). الآن الحياة = نبض updated_at أو نص يزيد.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ERROR_LIMIT, jobText, MISSING_LIMIT, STALL_MS, WATCH_MAX_MS, watchInit, watchResume, watchStep, type JobRead, type WatchState } from "../lib/jobWatchCore.ts";

const running = (partial: string, updated_at: string): JobRead => ({ kind: "row", row: { status: "running", partial, result: null, updated_at } });

/** يشغّل قراءات كل ٢ ث ويُرجع أول حكم غير «انتظر» */
function run(reads: (t: number) => JobRead, ms: number, step = 2000, s0?: WatchState) {
  let s = s0 ?? watchInit(0);
  for (let t = step; t <= ms; t += step) {
    const r = watchStep(s, reads(t), t);
    s = r.state;
    if (r.verdict !== "wait") return { verdict: r.verdict, at: t, state: s };
  }
  return { verdict: "wait" as const, at: ms, state: s };
}

test("تفكير طويل بلا نص مع نبض السيرفر كل ١٠ ث: المهمة حية (كانت تُترك بعد ٩٠ ث)", () => {
  const r = run((t) => running(" ", `beat-${Math.floor(t / 10_000)}`), 5 * 60_000);
  assert.equal(r.verdict, "wait");
});

test("لا نبض ولا نص ٩٠ ث والتطبيق في الواجهة: متوقفة", () => {
  const r = run(() => running("", "fixed"), 5 * 60_000);
  assert.equal(r.verdict, "stalled");
  assert.ok(r.at > STALL_MS && r.at <= STALL_MS + 4000);
});

test("النص يزيد بلا تحديث updated_at (السيرفر السابق): حية", () => {
  const r = run((t) => running("x".repeat(t / 100), "fixed"), 4 * 60_000);
  assert.equal(r.verdict, "wait");
});

test("الرجوع من الخلفية لا يُحسب توقّفًا: الغياب الطويل ثم قراءة بنفس الحالة", () => {
  let s = watchInit(0);
  s = watchStep(s, running("", "fixed"), 2000).state;
  // التطبيق مجمّد ١٠ دقائق دون أن يلاحظ (فجوة كبيرة بين قراءتين)
  const r = watchStep(s, running("", "fixed"), 10 * 60_000);
  assert.equal(r.verdict, "wait");
  // وكذلك بعد watchResume الصريح
  const s2 = watchResume(r.state, 20 * 60_000);
  assert.equal(watchStep(s2, running("", "fixed"), 20 * 60_000 + 2000).verdict, "wait");
});

test("تعذّر القراءة (شبكة/مهلة) ليس فقدًا ولا توقّفًا، وبعد تعذّر طويل جدًا: lost (يُعاد الاتصال بنفس المهمة)", () => {
  const r = run(() => ({ kind: "error" }), 60_000);
  assert.equal(r.verdict, "wait");
  const r2 = run(() => ({ kind: "error" }), (ERROR_LIMIT + 1) * 2000);
  assert.equal(r2.verdict, "lost");
  // قراءة سليمة تصفّر العدّاد
  let s = watchInit(0);
  for (let k = 1; k < ERROR_LIMIT; k++) s = watchStep(s, { kind: "error" }, k * 2000).state;
  s = watchStep(s, running("", "a"), ERROR_LIMIT * 2000).state;
  assert.equal(s.errors, 0);
});

test("غير موجودة فعلًا (ردّ فارغ بلا خطأ) عدة مرات متتالية: missing", () => {
  const r = run(() => ({ kind: "missing" }), 60_000);
  assert.equal(r.verdict, "missing");
  assert.equal(r.at, MISSING_LIMIT * 2000);
});

test("منتهية أو فاشلة على السيرفر تُعرف فورًا", () => {
  assert.equal(watchStep(watchInit(0), { kind: "row", row: { status: "done", partial: "", result: "{}" } }, 2000).verdict, "done");
  assert.equal(watchStep(watchInit(0), { kind: "row", row: { status: "failed", partial: " ", result: null } }, 2000).verdict, "failed");
});

test("الحد الأقصى للمتابعة من وقت الواجهة لا من إنشاء المهمة", () => {
  const r = run((t) => running("", `b${t}`), WATCH_MAX_MS + 10_000);
  assert.equal(r.verdict, "expired");
});

test("jobText: مسافة النبض ليست نصًا، والنتيجة النهائية أولى من الجزئي", () => {
  assert.equal(jobText({ status: "running", partial: " ", result: null }), "");
  assert.equal(jobText({ status: "running", partial: "{\"a\"", result: null }), "{\"a\"");
  assert.equal(jobText({ status: "done", partial: "قديم", result: "النهائي" }), "النهائي");
  assert.equal(jobText({ status: "done", partial: "جزئي", result: null }), "جزئي");
});
