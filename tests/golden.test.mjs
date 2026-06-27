// Golden regression samples (section 4): hand-verified reference words.
// Anchored on the SOURCE OF TRUTH (CC-CEDICT) + the deterministic pinyin
// converter — independent of whether a word is in the HSK-derived vocab.
// If the pipeline ever drifts on these, the build breaks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCedict } from "../scripts/lib/cedict.mjs";
import { numToMarks, extractTones } from "../scripts/lib/pinyin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cedict = parseCedict(readFileSync(join(ROOT, "data", "raw", "cedict.u8"), "utf8"));
const vocab = JSON.parse(readFileSync(join(ROOT, "data", "vocab.json"), "utf8"));
const bySimp = new Map(vocab.map((w) => [w.simplified, w]));

// Expected values are hand-verified against CC-CEDICT (not invented).
const GOLDEN = [
  { simplified: "你好", pinyin_num: "ni3 hao3", pinyin_marks: "nǐ hǎo", tones: [3, 3], de_contains: "hello" },
  { simplified: "谢谢", pinyin_num: "xie4 xie5", pinyin_marks: "xiè xie", tones: [4, 5], de_contains: "thank" },
  { simplified: "中国", pinyin_num: "Zhong1 guo2", pinyin_marks: "zhōng guó", tones: [1, 2], de_contains: "China" },
  { simplified: "喜欢", pinyin_num: "xi3 huan5", pinyin_marks: "xǐ huan", tones: [3, 5], de_contains: "like" },
];

for (const g of GOLDEN) {
  test(`golden (CC-CEDICT): ${g.simplified}`, () => {
    const entries = cedict.bySimplified.get(g.simplified);
    assert.ok(entries, `${g.simplified} fehlt in CC-CEDICT`);
    const e = entries.find((x) => x.pinyinNum === g.pinyin_num);
    assert.ok(e, `${g.simplified}: erwartete Lesung '${g.pinyin_num}' nicht in CC-CEDICT`);
    assert.equal(numToMarks(e.pinyinNum), g.pinyin_marks, "pinyin_marks");
    assert.deepEqual(extractTones(e.pinyinNum), g.tones, "tones");
    assert.ok(
      e.glosses.some((d) => d.toLowerCase().includes(g.de_contains.toLowerCase())),
      `Bedeutung enthaelt '${g.de_contains}'`
    );
  });

  // If the word is also part of the HSK-derived vocab, it must match the source.
  test(`golden (vocab consistency): ${g.simplified}`, () => {
    const w = bySimp.get(g.simplified);
    if (!w) return; // not in HSK 2.0 list (e.g. greetings -> Praxis-Track) — fine
    assert.equal(w.pinyin_marks, g.pinyin_marks, "vocab pinyin_marks");
    assert.deepEqual(w.tones, g.tones, "vocab tones");
  });
}
