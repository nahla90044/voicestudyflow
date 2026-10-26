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
