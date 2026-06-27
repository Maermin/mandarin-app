// Exercise generators + answer checking. Pure & deterministic (seeded), so the
// same card always yields the same choices and everything is node-testable.
import { looseKey, toneless } from "../scripts/lib/pinyin.mjs";

// --- deterministic RNG (mulberry32) seeded from a string ---
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rngFrom(seedStr) {
  return mulberry32(hashSeed(seedStr));
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Display label for a word's meaning (German preferred, EN fallback).
export function meaningLabel(word) {
  return word.de_fallback || !word.de.length ? word.en.join("; ") : word.de.join("; ");
}
export function tonePatternLabel(tones) {
  return tones.join("·");
}

// Multiple-choice over meanings (used by recognition-MC + listening).
export function buildMeaningChoices(word, vocab, n, seedStr) {
  const rng = rngFrom("m:" + seedStr);
  const correctLabel = meaningLabel(word);
  const pool = shuffle(vocab, rng);
  const chosen = [{ id: word.id, label: correctLabel }];
  const usedLabels = new Set([correctLabel]);
  for (const w of pool) {
    if (chosen.length >= n) break;
    if (w.id === word.id) continue;
    const lbl = meaningLabel(w);
    if (usedLabels.has(lbl)) continue;
    usedLabels.add(lbl);
    chosen.push({ id: w.id, label: lbl });
  }
  const options = shuffle(chosen, rng);
  return { options, correctIndex: options.findIndex((o) => o.id === word.id) };
}

// Multiple-choice over tone patterns.
export function buildToneChoices(word, n, seedStr) {
  const rng = rngFrom("t:" + seedStr);
  const L = word.tones.length;
  const correct = word.tones.join(",");
  const set = new Set([correct]);
  const patterns = [word.tones.slice()];
  let guard = 0;
  while (patterns.length < n && guard++ < 200) {
    const p = Array.from({ length: L }, () => 1 + Math.floor(rng() * 5));
    const key = p.join(",");
    if (!set.has(key)) {
      set.add(key);
      patterns.push(p);
    }
  }
  const options = shuffle(patterns, rng);
  return { options, correctIndex: options.findIndex((p) => p.join(",") === correct) };
}

// Free-text production check: accept exact Hanzi (simpl/trad) or tone-insensitive pinyin.
export function checkProduction(input, word) {
  const t = (input || "").trim();
  if (!t) return { ok: false, kind: null };
  if (t === word.simplified || t === word.traditional) return { ok: true, kind: "hanzi" };
  if (looseKey(t) === looseKey(word.pinyin_num)) return { ok: true, kind: "pinyin" };
  return { ok: false, kind: null };
}

export { toneless };
