// Persistence (localStorage) + export/import backup. Storage is injectable so
// the pure logic is testable in node without a browser.
export const STORAGE_KEY = "mandarin-app.state.v1";

export function defaultState() {
  return {
    version: 1,
    cards: {},
    settings: { showPinyin: true, dailyNew: 15 },
    stats: { streak: 0, lastStudyDay: null, dayKey: null, reviewsToday: 0, newToday: 0 },
  };
}

// Deep-ish merge of a loaded object onto defaults (forward-compatible).
export function normalize(obj) {
  const d = defaultState();
  if (!obj || typeof obj !== "object") return d;
  return {
    version: 1,
    cards: obj.cards && typeof obj.cards === "object" ? obj.cards : {},
    settings: { ...d.settings, ...(obj.settings || {}) },
    stats: { ...d.stats, ...(obj.stats || {}) },
  };
}

function getStore(store) {
  if (store) return store;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function loadState(store) {
  const s = getStore(store);
  if (!s) return defaultState();
  try {
    const raw = s.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state, store) {
  const s = getStore(store);
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// --- Backup ---
export function exportBackup(state) {
  return JSON.stringify({ app: "mandarin-app", exported: new Date().toISOString(), state }, null, 2);
}

export function importBackup(text) {
  const obj = JSON.parse(text);
  const state = obj && obj.state ? obj.state : obj; // accept raw state too
  return normalize(state);
}
