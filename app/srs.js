// SM-2 spaced-repetition algorithm. Pure, no DOM/storage — importable by tests.
// Card state is plain data; scheduling is deterministic given (card, quality, now).

export const DAY = 86400000; // ms

// Quality grades used by the UI (subset of SM-2's 0..5 scale):
//   1 = "Nochmal" (lapse), 3 = "Schwer", 4 = "Gut", 5 = "Leicht"
export const GRADE = { AGAIN: 1, HARD: 3, GOOD: 4, EASY: 5 };

export function newCard(id) {
  return { id, ef: 2.5, reps: 0, interval: 0, due: 0, lapses: 0, last: null };
}

function clampEf(ef) {
  return ef < 1.3 ? 1.3 : ef;
}

// Returns a NEW card object (does not mutate input).
export function schedule(card, quality, now = Date.now()) {
  const q = quality;
  const c = { ...card };
  // SM-2 ease update (applied for all grades, then clamped)
  c.ef = clampEf(c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // lapse: relearn this session (due now), penalise
    c.reps = 0;
    c.interval = 0;
    c.lapses = (c.lapses || 0) + 1;
    c.due = now;
  } else {
    c.reps += 1;
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 6;
    else c.interval = Math.round(card.interval * c.ef);
    if (c.interval < 1) c.interval = 1;
    // "Schwer" (q=3) shortens the step a bit
    if (q === 3 && c.reps > 2) c.interval = Math.max(1, Math.round(c.interval * 0.7));
    c.due = now + c.interval * DAY;
  }
  c.last = now;
  return c;
}

// A card is "learned" once it has at least one successful rep and a real interval.
export function isLearned(card) {
  return !!card && card.reps >= 1 && card.interval >= 1;
}
