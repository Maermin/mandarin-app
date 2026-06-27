import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashSeed,
  rngFrom,
  buildMeaningChoices,
  buildToneChoices,
  checkProduction,
  meaningLabel,
} from "../app/exercises.js";

function w(id, simp, trad, num, marks, tones, de, en, fb = false) {
  return { id, simplified: simp, traditional: trad, pinyin_num: num, pinyin_marks: marks,
    tones, de, en, de_fallback: fb, hsk: 1, chars: [...simp] };
}
const nihao = w("a", "你好", "你好", "ni3 hao3", "nǐ hǎo", [3, 3], ["Hallo"], ["hello"]);
const vocab = [
  nihao,
  w("b", "谢谢", "謝謝", "xie4 xie5", "xiè xie", [4, 5], ["danken"], ["thank"]),
  w("c", "中国", "中國", "zhong1 guo2", "zhōng guó", [1, 2], ["China"], ["China"]),
  w("d", "好", "好", "hao3", "hǎo", [3], ["gut"], ["good"]),
  w("e", "我", "我", "wo3", "wǒ", [3], ["ich"], ["I"]),
];

test("seeded RNG is deterministic", () => {
  assert.equal(hashSeed("x"), hashSeed("x"));
  const r1 = rngFrom("s")(), r2 = rngFrom("s")();
  assert.equal(r1, r2);
});

test("meaningLabel prefers German, falls back to EN", () => {
  assert.equal(meaningLabel(nihao), "Hallo");
  assert.equal(meaningLabel({ de: [], en: ["x"], de_fallback: true }), "x");
});

test("buildMeaningChoices: correct present, deterministic, unique labels", () => {
  const c1 = buildMeaningChoices(nihao, vocab, 4, "a:0");
  const c2 = buildMeaningChoices(nihao, vocab, 4, "a:0");
  assert.deepEqual(c1, c2); // deterministic
  assert.equal(c1.options.length, 4);
  assert.equal(c1.options[c1.correctIndex].id, "a");
  const labels = c1.options.map((o) => o.label);
  assert.equal(new Set(labels).size, labels.length); // no dup labels
});

test("buildToneChoices: correct pattern at correctIndex, all distinct, right length", () => {
  const c = buildToneChoices(nihao, 4, "a:0");
  assert.equal(c.options.length, 4);
  assert.deepEqual(c.options[c.correctIndex], [3, 3]);
  const keys = c.options.map((p) => p.join(","));
  assert.equal(new Set(keys).size, 4);
  for (const p of c.options) assert.equal(p.length, 2);
});

test("checkProduction accepts hanzi, numeric, marked, toneless, trad; rejects wrong", () => {
  assert.deepEqual(checkProduction("你好", nihao), { ok: true, kind: "hanzi" });
  assert.equal(checkProduction("ni3 hao3", nihao).ok, true);
  assert.equal(checkProduction("ni3hao3", nihao).ok, true);
  assert.equal(checkProduction("nǐ hǎo", nihao).ok, true);
  assert.equal(checkProduction("NIHAO", nihao).ok, true);
  assert.equal(checkProduction("謝謝", vocab[1]).ok, true); // traditional
  assert.equal(checkProduction("nihen", nihao).ok, false);
  assert.equal(checkProduction("", nihao).ok, false);
});
