import { test } from "node:test";
import assert from "node:assert/strict";
import { newCard, schedule, isLearned, DAY, GRADE } from "../app/srs.js";

const T0 = 1_700_000_000_000;

test("newCard defaults", () => {
  const c = newCard("x");
  assert.equal(c.ef, 2.5);
  assert.equal(c.reps, 0);
  assert.equal(c.interval, 0);
  assert.equal(c.due, 0);
});

test("SM-2 success progression: 1 -> 6 -> ef*prev", () => {
  let c = newCard("x");
  c = schedule(c, GRADE.GOOD, T0);
  assert.equal(c.reps, 1);
  assert.equal(c.interval, 1);
  assert.equal(c.due, T0 + 1 * DAY);

  c = schedule(c, GRADE.GOOD, T0);
  assert.equal(c.reps, 2);
  assert.equal(c.interval, 6);

  const prevEf = c.ef;
  const prevInt = c.interval;
  c = schedule(c, GRADE.GOOD, T0);
  assert.equal(c.reps, 3);
  assert.equal(c.interval, Math.round(prevInt * c.ef));
  assert.ok(c.ef >= prevEf - 1e-9); // GOOD keeps ease roughly stable
});

test("lapse (q<3) resets reps, due now, penalises ease, counts lapse", () => {
  let c = schedule(newCard("x"), GRADE.GOOD, T0);
  c = schedule(c, GRADE.GOOD, T0); // interval 6, ef up
  const beforeEf = c.ef;
  c = schedule(c, GRADE.AGAIN, T0 + 10 * DAY);
  assert.equal(c.reps, 0);
  assert.equal(c.interval, 0);
  assert.equal(c.due, T0 + 10 * DAY);
  assert.equal(c.lapses, 1);
  assert.ok(c.ef < beforeEf);
});

test("ease floor 1.3 after repeated lapses", () => {
  let c = newCard("x");
  for (let i = 0; i < 20; i++) c = schedule(c, GRADE.AGAIN, T0);
  assert.ok(c.ef >= 1.3);
});

test("isLearned", () => {
  assert.equal(isLearned(newCard("x")), false);
  assert.equal(isLearned(schedule(newCard("x"), GRADE.GOOD, T0)), true);
});
