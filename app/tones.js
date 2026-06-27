// Tone-colour mapping for pedagogy. Splits a pinyin_marks string into
// syllable segments aligned with the tones array. Pure.
export const TONE_COLOR = {
  1: "#cc2b2b", // hoch/flach
  2: "#1f9d3a", // steigend
  3: "#1565d8", // fallend-steigend
  4: "#8a2be2", // fallend
  5: "#888888", // neutral
};

export function toneSegments(pinyinMarks, tones) {
  const sylls = (pinyinMarks || "").trim().split(/\s+/).filter(Boolean);
  return sylls.map((s, i) => ({ text: s, tone: tones && tones[i] ? tones[i] : 5 }));
}
