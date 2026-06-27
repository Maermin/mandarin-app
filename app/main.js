// App bootstrap + UI (React.createElement, no JSX). Native ES module.
import { newCard, schedule, GRADE } from "./srs.js";
import { buildSession, progress, rollDay, dayKey } from "./deck.js";
import {
  loadState,
  saveState,
  defaultState,
  exportBackup,
  importBackup,
} from "./storage.js";
import { toneSegments, TONE_COLOR } from "./tones.js";

const React = window.React;
const ReactDOM = window.ReactDOM;
const h = React.createElement;
const { useState, useEffect, useMemo, useRef } = React;

// ---------- helpers ----------
function yesterdayKey(now) {
  return dayKey(now - 86400000);
}

function PinyinColored({ marks, tones, size }) {
  const segs = toneSegments(marks, tones);
  return h(
    "span",
    { className: "pinyin", style: size ? { fontSize: size } : null },
    segs.map((s, i) =>
      h("span", { key: i, style: { color: TONE_COLOR[s.tone] } }, s.text + (i < segs.length - 1 ? " " : ""))
    )
  );
}

// ---------- card (recognition: Hanzi -> meaning) ----------
function CardView({ word, chars, revealed, showPinyin, onReveal, onGrade }) {
  const front = h("div", { className: "hanzi" }, word.simplified);

  const pinyinEl = h(PinyinColored, { marks: word.pinyin_marks, tones: word.tones, size: "1.6rem" });

  const meaning = h(
    "div",
    { className: "meaning" },
    word.de_fallback
      ? h("div", null, h("span", { className: "badge warn" }, "nur EN"), " ", word.en.join("; "))
      : h(React.Fragment, null,
          h("div", { className: "de" }, word.de.join("; ")),
          h("div", { className: "en" }, word.en.join("; ")))
  );

  const decomp = h(
    "div",
    { className: "decomp" },
    word.chars.map((c) =>
      h("span", { key: c, className: "ch" }, c,
        chars[c] && chars[c].radical ? h("span", { className: "rad" }, "Radikal " + chars[c].radical) : null)
    )
  );

  if (!revealed) {
    return h("div", { className: "card", onClick: onReveal },
      front,
      showPinyin ? pinyinEl : h("div", { className: "hint" }, "Pinyin ausgeblendet"),
      h("button", { className: "reveal", onClick: onReveal }, "Aufdecken")
    );
  }
  return h("div", { className: "card" },
    front,
    pinyinEl,
    h("div", { className: "badge hsk" }, "HSK " + word.hsk),
    meaning,
    decomp,
    h("div", { className: "grades" },
      h("button", { className: "g again", onClick: () => onGrade(GRADE.AGAIN) }, "Nochmal"),
      h("button", { className: "g hard", onClick: () => onGrade(GRADE.HARD) }, "Schwer"),
      h("button", { className: "g good", onClick: () => onGrade(GRADE.GOOD) }, "Gut"),
      h("button", { className: "g easy", onClick: () => onGrade(GRADE.EASY) }, "Leicht")
    )
  );
}

// ---------- About ----------
function About({ sources, onClose }) {
  const s = sources ? sources.sources : {};
  const rows = Object.entries(s).map(([k, v]) =>
    h("li", { key: k },
      h("strong", null, v.name), " — ", v.license,
      v.version ? " (" + (Array.isArray(v.version) ? v.version.join("; ") : v.version) + ")" : "",
      v.status ? h("div", { className: "warn" }, v.status) : null,
      v.url ? h("div", null, h("a", { href: v.url, target: "_blank", rel: "noreferrer" }, v.url)) : null
    )
  );
  return h("div", { className: "modal", onClick: onClose },
    h("div", { className: "modal-box", onClick: (e) => e.stopPropagation() },
      h("h2", null, "Über & Quellen"),
      h("p", null, sources ? "HSK-Version: " + sources.hsk_version : ""),
      h("ul", null, rows),
      h("p", { className: "small" },
        "Alle Sprachdaten stammen aus geprüften, offen lizenzierten Quellen (CC BY-SA u.a.). ",
        "Abgeleitete Daten unter CC BY-SA 4.0. Details: ",
        h("a", { href: "ATTRIBUTION.md", target: "_blank", rel: "noreferrer" }, "ATTRIBUTION.md")),
      h("button", { onClick: onClose }, "Schließen")
    )
  );
}

// ---------- App ----------
function App({ vocab, chars, sources }) {
  const [state, setState] = useState(() => loadState());
  const [view, setView] = useState("dashboard"); // dashboard | review
  const [session, setSession] = useState(null); // { ids, pos, revealed }
  const [showAbout, setShowAbout] = useState(false);
  const fileRef = useRef(null);

  // persist on change
  useEffect(() => { saveState(state); }, [state]);

  const prog = useMemo(() => progress(vocab, state.cards), [vocab, state.cards]);
  const sess = useMemo(
    () => buildSession(vocab, state.cards, state.settings, rollDay(state.stats), Date.now()),
    [vocab, state.cards, state.settings, state.stats]
  );
  const byId = useMemo(() => new Map(vocab.map((w) => [w.id, w])), [vocab]);

  function startReview() {
    const built = buildSession(vocab, state.cards, state.settings, rollDay(state.stats), Date.now());
    if (built.queue.length === 0) return;
    setSession({ ids: built.queue.slice(), pos: 0, revealed: false });
    setView("review");
  }

  function grade(q) {
    const now = Date.now();
    const id = session.ids[session.pos];
    const wasNew = !state.cards[id];
    const card = state.cards[id] || newCard(id);
    const scheduled = schedule(card, q, now);

    setState((prev) => {
      let stats = rollDay({ ...prev.stats }, now);
      // streak: count first study action of the day
      const today = dayKey(now);
      if (stats.lastStudyDay !== today) {
        stats.streak = stats.lastStudyDay === yesterdayKey(now) ? (stats.streak || 0) + 1 : 1;
        stats.lastStudyDay = today;
      }
      if (wasNew) stats.newToday = (stats.newToday || 0) + 1;
      stats.reviewsToday = (stats.reviewsToday || 0) + 1;
      return { ...prev, cards: { ...prev.cards, [id]: scheduled }, stats };
    });

    setSession((prev) => {
      const ids = prev.ids.slice();
      if (q < 3) ids.push(id); // lapse -> revisit this session
      const pos = prev.pos + 1;
      if (pos >= ids.length) {
        setView("dashboard");
        return null;
      }
      return { ids, pos, revealed: false };
    });
  }

  function doExport() {
    const blob = new Blob([exportBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mandarin-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function doImport(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { setState(importBackup(r.result)); } catch { alert("Import fehlgeschlagen: ungültige Datei"); }
    };
    r.readAsText(f);
  }

  const header = h("header", null,
    h("h1", null, "中文 lernen"),
    h("div", { className: "stats" },
      h("span", null, "Fällig ", h("b", null, sess.due)),
      h("span", null, "Neu ", h("b", null, Math.min(sess.remainingNew, sess.newAvail))),
      h("span", null, "🔥 ", h("b", null, rollDay(state.stats).streak || 0)),
      h("span", null, "Gelernt ", h("b", null, prog.learned), "/", prog.total)
    )
  );

  let body;
  if (view === "review" && session) {
    const word = byId.get(session.ids[session.pos]);
    body = h("div", { className: "review" },
      h("div", { className: "progress" }, (session.pos + 1) + " / " + session.ids.length),
      h(CardView, {
        word, chars,
        revealed: session.revealed,
        showPinyin: state.settings.showPinyin,
        onReveal: () => setSession((p) => ({ ...p, revealed: true })),
        onGrade: grade,
      }),
      h("button", { className: "link", onClick: () => { setSession(null); setView("dashboard"); } }, "Sitzung beenden")
    );
  } else {
    body = h("div", { className: "dashboard" },
      h("p", { className: "lead" }, "Erkennungs-Übung: Zeichen → Bedeutung (SRS)."),
      h("button", { className: "primary", disabled: sess.queue.length === 0, onClick: startReview },
        sess.queue.length === 0 ? "Heute nichts fällig 🎉" : "Lernen starten (" + sess.queue.length + ")"),
      h("div", { className: "settings" },
        h("label", null,
          h("input", {
            type: "checkbox", checked: state.settings.showPinyin,
            onChange: (e) => setState((p) => ({ ...p, settings: { ...p.settings, showPinyin: e.target.checked } })),
          }), " Pinyin auf Vorderseite zeigen"),
        h("label", null, "Neue Karten/Tag: ",
          h("input", {
            type: "number", min: 0, max: 200, value: state.settings.dailyNew,
            onChange: (e) => setState((p) => ({ ...p, settings: { ...p.settings, dailyNew: Math.max(0, Number(e.target.value) || 0) } })),
          }))
      ),
      h("div", { className: "backup" },
        h("button", { onClick: doExport }, "Backup exportieren"),
        h("button", { onClick: () => fileRef.current.click() }, "Backup importieren"),
        h("input", { type: "file", accept: "application/json", ref: fileRef, style: { display: "none" }, onChange: doImport })
      )
    );
  }

  return h("div", { className: "app" },
    header,
    body,
    h("footer", null,
      h("button", { className: "link", onClick: () => setShowAbout(true) }, "Über & Quellen"),
      " · Daten: CC-CEDICT, HanDeDict, Make Me a Hanzi, HSK 2.0 (CC BY-SA)"),
    showAbout ? h(About, { sources, onClose: () => setShowAbout(false) }) : null
  );
}

// ---------- bootstrap ----------
async function main() {
  const root = document.getElementById("root");
  try {
    const [vocab, chars, sources] = await Promise.all([
      fetch("data/vocab.json").then((r) => r.json()),
      fetch("data/chars.json").then((r) => r.json()),
      fetch("data/sources.json").then((r) => r.json()).catch(() => null),
    ]);
    ReactDOM.createRoot(root).render(h(App, { vocab, chars, sources }));
  } catch (e) {
    root.textContent = "Fehler beim Laden der Daten: " + e.message + " — erst `npm run build:data` ausführen.";
  }
}
main();
