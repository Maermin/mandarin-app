import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultState,
  normalize,
  loadState,
  saveState,
  exportBackup,
  importBackup,
  STORAGE_KEY,
} from "../app/storage.js";

function fakeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    _map: m,
  };
}

test("defaultState shape", () => {
  const d = defaultState();
  assert.deepEqual(d.settings, { showPinyin: true, dailyNew: 15, dailyGoal: 20, mode: "recognition", deck: "all" });
  assert.deepEqual(d.cards, {});
  assert.equal(d.stats.streak, 0);
});

test("normalize guards bad input + merges settings", () => {
  assert.deepEqual(normalize(null), defaultState());
  const n = normalize({ settings: { dailyNew: 30 }, cards: { a: { id: "a" } } });
  assert.equal(n.settings.dailyNew, 30);
  assert.equal(n.settings.showPinyin, true); // default kept
  assert.equal(n.cards.a.id, "a");
});

test("save/load round-trip via injected store", () => {
  const store = fakeStore();
  const st = defaultState();
  st.settings.dailyNew = 42;
  assert.equal(saveState(st, store), true);
  assert.ok(store.getItem(STORAGE_KEY));
  const loaded = loadState(store);
  assert.equal(loaded.settings.dailyNew, 42);
});

test("loadState returns default on empty/corrupt", () => {
  const store = fakeStore();
  assert.deepEqual(loadState(store), defaultState());
  store.setItem(STORAGE_KEY, "{not json");
  assert.deepEqual(loadState(store), defaultState());
});

test("export/import backup round-trip", () => {
  const st = defaultState();
  st.cards.x = { id: "x", reps: 3 };
  const text = exportBackup(st);
  const back = importBackup(text);
  assert.equal(back.cards.x.reps, 3);
  // accepts raw state too
  assert.equal(importBackup(JSON.stringify(st)).cards.x.reps, 3);
});
