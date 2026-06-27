import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSession, progress, rollDay, dayKey } from "../app/deck.js";
import { newCard, schedule, GRADE, DAY } from "../app/srs.js";

const NOW = 1_700_000_000_000;
const vocab = [
  { id: "a", hsk: 1 },
  { id: "b", hsk: 1 },
  { id: "c", hsk: 1 },
  { id: "d", hsk: 2 },
];

test("dayKey format YYYY-MM-DD", () => {
  assert.match(dayKey(NOW), /^\d{4}-\d{2}-\d{2}$/);
});

test("rollDay resets counters on new day, keeps on same day", () => {
  const stats = { dayKey: dayKey(NOW), reviewsToday: 5, newToday: 3 };
  assert.equal(rollDay(stats, NOW), stats); // same day -> unchanged ref
  const rolled = rollDay(stats, NOW + DAY);
  assert.equal(rolled.reviewsToday, 0);
  assert.equal(rolled.newToday, 0);
});

test("buildSession: due first, then new limited by dailyNew - newToday", () => {
  const cards = {
    a: { ...newCard("a"), due: NOW - DAY }, // due (lapsed/scheduled in past)
    b: { ...schedule(newCard("b"), GRADE.GOOD, NOW) }, // due in future -> not in queue
  };
  const settings = { dailyNew: 1 };
  const stats = { dayKey: dayKey(NOW), reviewsToday: 0, newToday: 0 };
  const s = buildSession(vocab, cards, settings, stats, NOW);
  assert.equal(s.due, 1); // only 'a'
  assert.equal(s.queue[0], "a"); // due first
  // new = c, d (no card). dailyNew 1 -> only one new appended
  assert.equal(s.queue.length, 2);
  assert.equal(s.queue[1], "c");
});

test("buildSession respects newToday already used", () => {
  const stats = { dayKey: dayKey(NOW), reviewsToday: 0, newToday: 5 };
  const s = buildSession(vocab, {}, { dailyNew: 3 }, stats, NOW);
  assert.equal(s.remainingNew, 0);
  assert.equal(s.queue.length, 0);
});

test("progress counts learned cards", () => {
  const cards = { a: schedule(newCard("a"), GRADE.GOOD, NOW) };
  const p = progress(vocab, cards);
  assert.equal(p.total, 4);
  assert.equal(p.learned, 1);
});
