// Tatoeba cloze data is optional; when present every attached sentence MUST
// contain the target word verbatim (no invented associations) and have a
// German translation. This guards the core correctness invariant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sPath = join(ROOT, "data", "sentences.json");

test("every cloze sentence contains its word verbatim + has German", () => {
  if (!existsSync(sPath)) return; // optional feature skipped
  const sentences = JSON.parse(readFileSync(sPath, "utf8"));
  const vocab = JSON.parse(readFileSync(join(ROOT, "data", "vocab.json"), "utf8"));
  const simpById = new Map(vocab.map((w) => [w.id, w.simplified]));

  let checked = 0;
  for (const [id, arr] of Object.entries(sentences)) {
    const simp = simpById.get(id);
    assert.ok(simp, `Satz fuer unbekannte id ${id}`);
    for (const s of arr) {
      assert.ok(s.zh.includes(simp), `'${simp}' nicht in Satz '${s.zh}'`);
      assert.ok(typeof s.de === "string" && s.de.length > 0, `leere DE-Uebersetzung fuer ${id}`);
      checked++;
    }
  }
  // if the feature ran at all, it should have produced data
  if (Object.keys(sentences).length > 0) assert.ok(checked > 0);
});
