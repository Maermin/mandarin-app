// Deterministic, rule-based conversion of CC-CEDICT numeric pinyin -> tone marks.
// NO data is invented here: input is the verbatim CC-CEDICT pinyin string for a word.
// Tone-mark placement follows the standard rule (a/e win; "ou" -> o; else last vowel).

const TONE_MARKS = {
  a: ["a", "ā", "á", "ǎ", "à", "a"],
  e: ["e", "ē", "é", "ě", "è", "e"],
  i: ["i", "ī", "í", "ǐ", "ì", "i"],
  o: ["o", "ō", "ó", "ǒ", "ò", "o"],
  u: ["u", "ū", "ú", "ǔ", "ù", "u"],
  // ü
  "ü": ["ü", "ǖ", "ǘ", "ǚ", "ǜ", "ü"],
};

// A pinyin syllable like "lu:3", "hao3", "r5", "xie5", "n2" (rare) -> ["lü","hao",...] + tone
function parseSyllable(raw) {
  // CC-CEDICT writes ü as "u:" (sometimes "v")
  let s = raw.replace(/u:/g, "ü").replace(/v/g, "ü");
  const m = s.match(/([a-zA-Zü]+)([1-5])?/);
  if (!m) return null;
  const letters = m[1];
  const tone = m[2] ? Number(m[2]) : 5; // no digit => neutral
  return { letters, tone };
}

// Pick which vowel carries the tone mark.
function markIndex(lower) {
  const a = lower.indexOf("a");
  if (a !== -1) return a;
  const e = lower.indexOf("e");
  if (e !== -1) return e;
  const ou = lower.indexOf("ou");
  if (ou !== -1) return ou; // mark the 'o'
  // else last vowel (a,e,i,o,u,ü)
  for (let i = lower.length - 1; i >= 0; i--) {
    if ("aeiouü".includes(lower[i])) return i;
  }
  return -1;
}

export function syllableToMarks(raw) {
  const p = parseSyllable(raw);
  if (!p) return raw;
  const { letters, tone } = p;
  const lower = letters.toLowerCase();
  if (tone === 5) return lower; // neutral: no diacritic
  const idx = markIndex(lower);
  if (idx === -1) return lower;
  const ch = lower[idx];
  const repl = TONE_MARKS[ch] ? TONE_MARKS[ch][tone] : ch;
  return lower.slice(0, idx) + repl + lower.slice(idx + 1);
}

// "Zhong1 guo2" -> "zhōng guó" (space-separated, lowercased)
export function numToMarks(pinyinNum) {
  return pinyinNum
    .trim()
    .split(/\s+/)
    .map(syllableToMarks)
    .join(" ");
}

// Extract tone numbers, one per syllable. "ni3 hao3" -> [3,3]; neutral -> 5.
export function extractTones(pinyinNum) {
  return pinyinNum
    .trim()
    .split(/\s+/)
    .map((syl) => {
      const m = syl.match(/[1-5]/);
      return m ? Number(m[0]) : 5;
    });
}

// Normalize numeric pinyin for comparison (lowercase, ü-forms unified, collapse spaces).
export function normalizeNum(pinyinNum) {
  return pinyinNum
    .trim()
    .toLowerCase()
    .replace(/u:/g, "ü")
    .replace(/v/g, "ü")
    .replace(/\s+/g, " ");
}

// Map every toned/ü vowel back to its base ascii letter.
const DIACRITIC_TO_BASE = {
  "ā": "a", "á": "a", "ǎ": "a", "à": "a",
  "ē": "e", "é": "e", "ě": "e", "è": "e",
  "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
  "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
  "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
  "ü": "u", "ǖ": "u", "ǘ": "u", "ǚ": "u", "ǜ": "u",
};

export function stripDiacritics(s) {
  return s.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜ]/g, (c) => DIACRITIC_TO_BASE[c] || c);
}

// Loose comparison key for free-text production input: tone-insensitive,
// space/punct-insensitive, ü/v/u: -> u. Accepts numeric, marked, or bare pinyin.
export function looseKey(s) {
  return stripDiacritics(String(s).toLowerCase())
    .replace(/u:/g, "u")
    .replace(/v/g, "u")
    .replace(/[^a-z]/g, "");
}

// Tone-less, space-separated pinyin for tone drills: "ni3 hao3" -> "ni hao".
export function toneless(pinyinNum) {
  return pinyinNum
    .trim()
    .split(/\s+/)
    .map((syl) => stripDiacritics(syl.toLowerCase()).replace(/u:/g, "u").replace(/[^a-zü]/g, ""))
    .join(" ");
}
