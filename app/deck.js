// Review-queue construction. Pure functions, testable in node.
import { isLearned } from "./srs.js";

// Local calendar day key "YYYY-MM-DD" for streak/daily-limit bookkeeping.
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Reset per-day counters when the calendar day rolls over. Returns NEW stats.
export function rollDay(stats, now = Date.now()) {
  const k = dayKey(now);
  if (stats.dayKey === k) return stats;
  return { ...stats, dayKey: k, reviewsToday: 0, newToday: 0 };
}

// Does a word belong to the selected learning deck?
//   'all' | 'hsk:N' | 'track:ID'
export function deckMatch(word, deck) {
  if (!deck || deck === "all") return true;
  if (deck.startsWith("hsk:")) return word.hsk === Number(deck.slice(4));
  if (deck.startsWith("track:")) return Array.isArray(word.tracks) && word.tracks.includes(deck.slice(6));
  return true;
}

// Build the session queue.
//   vocab: array of words (data/vocab.json)
//   cards: map id -> cardState
//   settings: { dailyNew, deck }
// New cards are drawn only from the selected deck; due reviews always included.
// Returns { due, newAvail, queue } where queue is ordered word ids.
export function buildSession(vocab, cards, settings, stats, now = Date.now()) {
  const deck = settings.deck || "all";
  const dueIds = [];
  const newIds = [];
  for (const w of vocab) {
    const card = cards[w.id];
    if (!card) {
      if (deckMatch(w, deck)) newIds.push(w.id); // never studied, in selected deck
    } else if (card.due <= now) {
      dueIds.push(w.id); // due review (incl. lapsed), any deck
    }
  }
  // due first, earliest due first
  dueIds.sort((a, b) => (cards[a].due || 0) - (cards[b].due || 0));
  // new cards follow HSK/array order (vocab is already HSK-sorted)
  const remainingNew = Math.max(0, (settings.dailyNew ?? 15) - (stats.newToday || 0));
  const queue = [...dueIds, ...newIds.slice(0, remainingNew)];
  return { due: dueIds.length, newAvail: newIds.length, remainingNew, queue };
}

// Aggregate progress for the dashboard.
export function progress(vocab, cards) {
  let learned = 0;
  for (const w of vocab) if (isLearned(cards[w.id])) learned++;
  return { total: vocab.length, learned };
}
