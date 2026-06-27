import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCedict } from "../scripts/lib/cedict.mjs";
import { validateVocab } from "../scripts/lib/validate.mjs";
import { numToMarks, extractTones, normalizeNum } from "../scripts/lib/pinyin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const vocabPath = join(ROOT, "data", "vocab.json");
const cedictPath = join(ROOT, "data", "raw", "cedict.u8");

// --- Deterministic pinyin algorithm (rule-based, no invented data) ---
test("numToMarks: standard tone placement", () => {
  assert.equal(numToMarks("ni3 hao3"), "nǐ hǎo");
  assert.equal(numToMarks("xie4 xie5"), "xiè xie");
  assert.equal(numToMarks("Zhong1 guo2"), "zhōng guó");
  assert.equal(numToMarks("lu:3"), "lǚ"); // ü via "u:"
  assert.equal(numToMarks("hao3"), "hǎo"); // a wins
  assert.equal(numToMarks("gou3"), "gǒu"); // ou -> o
  assert.equal(numToMarks("ma5"), "ma"); // neutral, no mark
});

test("extractTones: one per syllable, neutral=5", () => {
  assert.deepEqual(extractTones("ni3 hao3"), [3, 3]);
  assert.deepEqual(extractTones("xie4 xie5"), [4, 5]);
  assert.deepEqual(extractTones("peng2 you5"), [2, 5]);
});

test("normalizeNum unifies ü forms + case", () => {
  assert.equal(normalizeNum("LU:3"), normalizeNum("lü3"));
  assert.equal(normalizeNum("Zhong1  guo2"), "zhong1 guo2");
});

// --- Full built dataset must pass the whole suite (section 4) ---
test("built vocab passes validation suite with zero errors", () => {
  assert.ok(existsSync(vocabPath), "data/vocab.json fehlt — erst `npm run build:data`");
  assert.ok(existsSync(cedictPath), "data/raw/cedict.u8 fehlt — erst `npm run build:data`");
  const vocab = JSON.parse(readFileSync(vocabPath, "utf8"));
  const cedict = parseCedict(readFileSync(cedictPath, "utf8"));
  const { errors } = validateVocab(vocab, cedict);
  assert.equal(errors.length, 0, "Validierungsfehler:\n" + errors.slice(0, 30).join("\n"));
  assert.ok(vocab.length > 100, `zu wenige Vokabeln: ${vocab.length}`);
});

test("validation-report.json has no unresolved errors", () => {
  const rep = JSON.parse(
    readFileSync(join(ROOT, "data", "validation-report.json"), "utf8")
  );
  assert.equal(rep.counts.errors, 0, "Report enthaelt Fehler");
});
