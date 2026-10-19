// tests/calcCore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluate, formatResult } from "../lib/calcCore.ts";

test("أولوية العمليات والأقواس", () => {
  assert.equal(evaluate("2+3×4"), 14);
  assert.equal(evaluate("(2+3)×4"), 20);
  assert.equal(evaluate("10÷4"), 2.5);
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("2(3+1)"), 8);
});

test("السالب والنسبة والكسور", () => {
  assert.equal(evaluate("-5+3"), -2);
  assert.equal(evaluate("3×-2"), -6);
  assert.equal(evaluate("-(2+3)"), -5);
  assert.equal(evaluate("200×15%"), 30);
  assert.equal(formatResult(evaluate("0.1+0.2")!), "0.3");
  assert.equal(evaluate("٣+٤"), 7);
});

test("المدخلات غير الصالحة لا تُسقط شيئًا", () => {
  assert.equal(evaluate("5÷0"), null);
  assert.equal(evaluate("2+"), null);
  assert.equal(evaluate("(2+3"), null);
  assert.equal(evaluate("1..2"), null);
  assert.equal(evaluate(""), null);
  assert.equal(evaluate("abc"), null);
});
