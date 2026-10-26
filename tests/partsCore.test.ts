// tests/partsCore.test.ts
// العرض أولًا بأول في محرك الأجزاء: الترتيب الصارم للفيديو، وعدم رجوع العرض للخلف عند إعادة جزء.
import { test } from "node:test";
import assert from "node:assert/strict";

import { keepPartial, visibleParts } from "../lib/partsCore.ts";

test("visibleParts: مع inOrder لا يُعرض جزء بعد جزء غير مكتمل", () => {
  // الجزء ٠ يُكتب (جزئي) والجزء ١ يُكتب أيضًا: يظهر الجزء ٠ وحده
  assert.deepEqual(visibleParts([undefined, undefined], ["أ", "ب"], true), ["أ"]);
  // الجزء ٠ مكتمل والجزء ١ يُكتب والجزء ٢ مكتمل: يظهر ٠ ثم ما كُتب من ١ فقط
  assert.deepEqual(visibleParts(["أ", undefined, "ج"], [null, "ب", null], true), ["أ", "ب"]);
  // جزء لم يظهر منه شيء: يتوقف العرض عنده
  assert.deepEqual(visibleParts(["أ", undefined, "ج"], [null, null, null], true), ["أ"]);
});

test("visibleParts: الجزء الفاشل (null) يُتخطى، وبلا inOrder السلوك القديم كما هو", () => {
  assert.deepEqual(visibleParts(["أ", null, "ج"], [null, null, null], true), ["أ", "ج"]);
  assert.deepEqual(visibleParts([undefined, undefined, undefined], ["أ", "ب", null], false), ["أ", "ب"]);
  assert.deepEqual(visibleParts(["أ", undefined, "ج"], [null, "ب", null], false), ["أ", "ب", "ج"]);
});

test("keepPartial: محاولة جديدة بمشهدين لا تحلّ محل جزئي فيه ستة، وتحلّ حين تبلغه", () => {
  const size = (p: { n: number }) => p.n;
  const six = { n: 6 };
  assert.equal(keepPartial(six, { n: 2 }, size), six);
  assert.deepEqual(keepPartial(six, { n: 6 }, size), { n: 6 });
  assert.deepEqual(keepPartial(six, { n: 7 }, size), { n: 7 });
  assert.deepEqual(keepPartial(null, { n: 1 }, size), { n: 1 });
  assert.deepEqual(keepPartial(six, { n: 1 }), { n: 1 }); // بلا قياس: الأحدث دائمًا (السلوك القديم)
});

// ===== إعادة الجزء بعد خطأ (٢٦ أكتوبر) =====
import { afterPartError, MAX_AWAY, MAX_TRIES } from "../lib/partsCore.ts";

test("afterPartError: الحصة/المحتوى/الحساب توقف كل شيء، وسقف الإعادات المجانية يُفشل الجزء فورًا", () => {
  for (const m of ["USER_QUOTA", "UNSAFE_CONTENT", "ACCOUNT_LOCKED"]) assert.equal(afterPartError(m, 0, 0).verdict, "stop");
  const r = afterPartError("RETRY_LIMIT", 0, 0);
  assert.equal(r.verdict, "fail");
  assert.equal(r.tries, 0);
});

test("afterPartError: الأخطاء العادية تُعاد بمهلة متزايدة حتى ٣ محاولات", () => {
  let tries = 0;
  const seen: string[] = [];
  for (let k = 0; k < MAX_TRIES; k++) {
    const r = afterPartError("JOB_STALLED", tries, 0);
    tries = r.tries;
    seen.push(r.verdict);
    if (r.verdict === "retry") assert.equal(r.delayMs, 1500 * tries);
  }
  assert.deepEqual(seen, ["retry", "retry", "fail"]);
});

test("afterPartError: الخروج من الواجهة ينتظر الرجوع ولا يُحسب محاولة — حتى ٥ مرات ثم يُحسب (كان بلا حد)", () => {
  let aways = 0;
  let tries = 0;
  for (let k = 0; k < MAX_AWAY; k++) {
    const r = afterPartError("WENT_AWAY", tries, aways);
    assert.equal(r.verdict, "waitActive");
    aways = r.aways;
    tries = r.tries;
  }
  assert.equal(tries, 0);
  const r = afterPartError("WENT_AWAY", tries, aways);
  assert.equal(r.verdict, "retry");
  assert.equal(r.tries, 1);
});
