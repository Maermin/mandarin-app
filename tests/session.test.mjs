// Integration test of the study loop that main.js drives (no DOM):
// buildSession -> grade each card -> persist -> rebuild. Locks core behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSession, progress, rollDay, dayKey } from "../app/deck.js";
import { newCard, schedule, GRADE } from "../app/srs.js";
import { defaultState, normalize, exportBackup, importBackup } from "../app/storage.js";

const NOW = 1_700_000_000_000;
const vocab = [{ id: "a", hsk: 1 }, { id: "b", hsk: 1 }, { id: "c", hsk: 1 }];

function gradeOne(state, id, q, now) {
  const wasNew = !state.cards[id];
  const card = state.cards[id] || newCard(id);
  const scheduled = schedule(card, q, now);
  let stats = rollDay({ ...state.stats }, now);
  const today = dayKey(now);
  if (stats.lastStudyDay !== today) { stats.streak = (stats.streak || 0) + 1; stats.lastStudyDay = today; }
  if (wasNew) stats.newToday = (stats.newToday || 0) + 1;
  stats.reviewsToday = (stats.reviewsToday || 0) + 1;
  return { ...state, cards: { ...state.cards, [id]: scheduled }, stats };
}

test("full new-card session: all graded GOOD become learned, newToday counts", () => {
  let state = defaultState();
  state.settings.dailyNew = 2;
  const s = buildSession(vocab, state.cards, state.settings, rollDay(state.stats, NOW), NOW);
  assert.equal(s.queue.length, 2); // limited by dailyNew

  for (const id of s.queue) state = gradeOne(state, id, GRADE.GOOD, NOW);

  assert.equal(progress(vocab, state.cards).learned, 2);
  assert.equal(state.stats.newToday, 2);
  assert.equal(state.stats.streak, 1);

  // same day again: new budget exhausted, nothing due in future -> empty
  const s2 = buildSession(vocab, state.cards, state.settings, state.stats, NOW);
  assert.equal(s2.queue.length, 0);
});

test("lapse keeps card due (re-studyable same session)", () => {
  let state = defaultState();
  state = gradeOne(state, "a", GRADE.AGAIN, NOW);
  const s = buildSession(vocab, state.cards, { dailyNew: 0 }, state.stats, NOW);
  assert.ok(s.queue.includes("a")); // lapsed card is due now
});

test("persistence round-trip preserves a mid-progress deck", () => {
  let state = defaultState();
  state = gradeOne(state, "a", GRADE.GOOD, NOW);
  const restored = importBackup(exportBackup(state));
  assert.equal(restored.cards.a.reps, 1);
  assert.deepEqual(normalize(restored).settings, state.settings);
});
