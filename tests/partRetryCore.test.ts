// tests/partRetryCore.test.ts
// «رصيد الجزء» (قرار نهلة ٢٦ أكتوبر): الطالب يدفع مرة واحدة لكل جزء، وكل إعادة آلية مجانية — بلا ثغرة
// لطلبات مجانية بلا حد. القواعد نفسها في دالتي SQL (0038_part_retry.sql).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attemptOutcome,
  chainRefund,
  decideRetry,
  FREE_RETRIES,
  partHash,
  partKey,
  partScope,
  RETRY_WINDOW_MS,
  stableStringify,
  type LedgerRow,
  type Outcome,
} from "../supabase/functions/_shared/partRetryCore.ts";

const H = 3600_000;

test("stableStringify: ترتيب الحقول لا يغيّر النص، والحقول غير المعرّفة تُهمل", () => {
  assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }), stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
  assert.equal(stableStringify({ a: 1, x: undefined }), stableStringify({ a: 1 }));
  assert.equal(stableStringify(null), "null");
});

test("partKey/partHash: نفس الجزء = نفس البصمة، وأي تغيير في النص أو الخيارات أو الجلسة = بصمة جديدة", async () => {
  const base = { action: "videoscript", text: "نص الجزء الأول", targetLang: "ar", vpart: { v: 1, i: 0, n: 4, mine: [{ id: "T1", t: "أ" }] } };
  const h = await partHash(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await partHash({ ...base, vpart: { mine: [{ t: "أ", id: "T1" }], n: 4, i: 0, v: 1 } }), "ترتيب حقول vpart لا يهم");
  for (const changed of [
    { ...base, text: "نص الجزء الأول." },
    { ...base, action: "studysummary" },
    { ...base, targetLang: "en" },
    { ...base, vpart: { ...base.vpart, i: 1 } },
    { ...base, mode: "brief" },
    { ...base, table: true },
    { ...base, deep: true },
    { ...base, genId: "lx1abc" },
  ]) {
    assert.notEqual(await partHash(changed), h, partKey(changed));
  }
  // genId غير نصي يُهمل، والطويل يُقصّ (لا يُكبّر البصمة)
  assert.equal(partKey({ ...base, genId: 42 }), partKey(base));
  assert.equal(partKey({ ...base, genId: "x".repeat(200) }), partKey({ ...base, genId: "x".repeat(64) }));
});

test("partScope: الملخّص والفيديو دائمًا، والمنهج بمهمة السيرفر فقط (إعادة إنشاء وحدة يدويًا طلب مباشر يُخصم)", () => {
  assert.equal(partScope("videoscript", {}), true);
  assert.equal(partScope("studysummary", { job: true }), true);
  assert.equal(partScope("syllabus", { job: true }), true);
  assert.equal(partScope("syllabus", {}), false);
  assert.equal(partScope("syllabus", { qaRetryOf: "id" }), true);
  assert.equal(partScope("ask", { job: true }), false);
  assert.equal(partScope("unitquiz", {}), false);
});

test("attemptOutcome: الحصيلة من ناتج السيرفر الفعلي", () => {
  assert.equal(attemptOutcome({ text: "{...}", stopReason: "end_turn" }), "ok");
  assert.equal(attemptOutcome({ text: "{...", stopReason: "max_tokens" }), "cut");
  assert.equal(attemptOutcome({ text: "", stopReason: "max_tokens" }), "empty", "التفكير استهلك السقف كله");
  assert.equal(attemptOutcome({ text: " \n ", stopReason: "end_turn" }), "empty", "مسافة النبض ليست نصًا");
  assert.equal(attemptOutcome({ text: "", error: true }), "failed");
  assert.equal(attemptOutcome({ text: "نص", error: true, delivered: 0 }), "failed", "مهمة فشلت: ما كُتب لا يُستعمل");
  assert.equal(attemptOutcome({ text: "نص", error: true, delivered: 3 }), "partial", "بثّ وصل منه نص ثم انقطع");
});

// ===== دفتر خصم في الذاكرة يطبّق القواعد كما تطبّقها دالتا SQL =====
class Ledger {
  rows: LedgerRow[] = [];
  counter = 0;
  nextId = 1;
  now = 0;
  /** طلب جزء: يُرجع رقم المحاولة، أو null عند سقف الإعادات */
  request(hash: string, o: { userId?: string; action?: string; regen?: boolean } = {}): number | null {
    const userId = o.userId ?? "u1";
    const action = o.action ?? "videoscript";
    const d = decideRetry(this.rows, { userId, action, hash, now: this.now, regen: o.regen });
    if (d.kind === "limit") return null;
    const id = this.nextId++;
    const free = d.kind === "free";
    if (!free) this.counter++;
    this.rows.push({ id, userId, action, hash, amount: free ? 0 : 1, refunded: false, retryOf: free ? d.rootId : null, createdAt: this.now, outcome: null });
    return id;
  }
  done(id: number | null, outcome: Outcome): void {
    const a = this.rows.find((r) => r.id === id);
    if (!a || a.outcome !== null) return;
    a.outcome = outcome;
    const rootId = a.retryOf ?? a.id;
    if (chainRefund(this.rows, rootId)) {
      this.rows.find((r) => r.id === rootId)!.refunded = true;
      this.counter--;
    }
  }
}

test("decideRetry: الأول يُخصم، ثم ٣ إعادات مجانية، ثم السقف بلا خصم", () => {
  const L = new Ledger();
  const root = L.request("P");
  assert.equal(L.counter, 1);
  for (let k = 0; k < FREE_RETRIES; k++) L.done(L.request("P"), "ok");
  assert.equal(L.counter, 1, "الإعادات لم تُخصم");
  assert.equal(L.request("P"), null, "السقف");
  assert.equal(L.counter, 1);
  assert.ok(root);
});

test("decideRetry: المحاولة التي لم تُسلّم شيئًا لا تُحسب من السقف", () => {
  const L = new Ledger();
  L.done(L.request("P"), "ok");
  for (let k = 0; k < 10; k++) L.done(L.request("P"), "failed");
  assert.equal(L.counter, 1);
  for (let k = 0; k < FREE_RETRIES; k++) assert.notEqual(L.request("P"), null);
  assert.equal(L.request("P"), null);
});

test("decideRetry: العزل — مستخدم آخر، إجراء آخر، بصمة أخرى، خارج النافذة، أو regen → خصم عادي", () => {
  const L = new Ledger();
  L.done(L.request("P"), "ok");
  L.request("P", { userId: "u2" });
  L.request("P", { action: "studysummary" });
  L.request("Q");
  L.request("P", { regen: true });
  assert.equal(L.counter, 5);
  // الأصل الأحدث (regen) هو الساري: إعادة مجانية مربوطة به
  const free = L.request("P");
  assert.equal(L.rows.find((r) => r.id === free)!.retryOf, 5);
  L.now += RETRY_WINDOW_MS + 1;
  L.request("P");
  assert.equal(L.counter, 6, "بعد ٦ ساعات: خصم جديد");
});

test("chainRefund: يُردّ الأصل فقط إن انتهت كل المحاولات بلا تسليم أي شيء", () => {
  const L = new Ledger();
  const r = L.request("P");
  const f = L.request("P"); // إعادة تعمل
  L.done(r, "empty");
  assert.equal(L.counter, 1, "إعادة ما زالت تعمل → لا ردّ بعد");
  L.done(f, "failed");
  assert.equal(L.counter, 0, "كلها بلا تسليم → يُردّ الأصل");
  L.done(r, "failed");
  assert.equal(L.counter, 0, "لا ردّ مرتين");
  // بعد الردّ: الطلب التالي أصل جديد يُخصم
  L.request("P");
  assert.equal(L.counter, 1);
  const L2 = new Ledger();
  const r2 = L2.request("P");
  L2.done(r2, "partial");
  assert.equal(L2.counter, 1, "وصل نص (ولو قطعه التطبيق) → لا ردّ");
});

test("محاكاة ٢٦ أكتوبر: نفس تسلسل الطلبات (نسخة التطبيق السابقة) مع السيرفر الجديد = طلب واحد لكل جزء", () => {
  const L = new Ledger();
  const at = (m: number) => (L.now = m * 60_000);
  at(10);
  const a = L.request("A");
  const b = L.request("B");
  const c = L.request("C");
  const d = L.request("D");
  at(12); // التطبيق ظن المهام متوقفة (لا نص ٩٠ ث) → بثّ لكل من ب وج ود
  const sb = L.request("B");
  const sc = L.request("C");
  const sd = L.request("D");
  at(12.9);
  L.done(a, "ok");
  L.done(b, "ok"); // المهمة الأصلية اكتملت (وتركها التطبيق)
  at(13);
  L.done(sb, "failed"); // البثّ قُطع بعد ٤٥ ث صمت بلا أي نص
  L.done(sc, "failed");
  L.done(sd, "failed");
  const pb = L.request("B"); // طلب عادي
  const pc = L.request("C");
  const pd = L.request("D");
  L.done(c, "cut");
  L.done(d, "empty"); // التفكير استهلك السقف
  at(15);
  L.done(pb, "ok");
  L.done(pc, "ok");
  L.done(pd, "ok"); // اكتمل على السيرفر بعد أن ترك التطبيق انتظاره
  // الجزء د: إعادة ١ (مهمة) ثم بثّ، ثم خروج ورجوع: بثّ، ثم طلب عادي، ثم إعادة ٢…
  const tries: (number | null)[] = [];
  for (const out of ["ok", "ok", "failed", "ok", "ok", "failed", "ok"] as Outcome[]) {
    const x = L.request("D");
    tries.push(x);
    L.done(x, out);
  }
  assert.equal(L.counter, 4, "٤ أجزاء = ٤ طلبات (كانت ١٢)");
  assert.ok(tries.some((x) => x === null), "الإعادات التي تجاوزت السقف رُفضت بلا خصم ولا توليد");
});

test("محاكاة: التطبيق الجديد — جزء انتهى فارغًا ثم نجح، ثم رفضه وكيل الجودة فأُعيد = طلب واحد", () => {
  const L = new Ledger();
  L.done(L.request("D"), "empty"); // يُردّ فورًا (لا شيء وصل)
  assert.equal(L.counter, 0);
  L.done(L.request("D"), "ok"); // المحاولة التالية أصل جديد
  L.done(L.request("D"), "ok"); // إعادة وكيل الجودة: مجانية
  assert.equal(L.counter, 1);
});

test("الثغرات: إعادة نفس الجزء بلا حد = ٤ توليدات لكل خصم فقط، وتغيير الجلسة/النص كل مرة = خصم كل مرة", () => {
  const L = new Ledger();
  let generated = 0;
  for (let k = 0; k < 20; k++) {
    const x = L.request("SAME");
    if (x !== null) {
      generated++;
      L.done(x, "ok");
    }
  }
  assert.equal(L.counter, 1);
  assert.equal(generated, 1 + FREE_RETRIES);
  const L2 = new Ledger();
  for (let k = 0; k < 20; k++) L2.done(L2.request(`G${k}`), "ok");
  assert.equal(L2.counter, 20);
});
