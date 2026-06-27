// App bootstrap + UI (React.createElement, no JSX). Native ES module.
import { newCard, schedule, GRADE } from "./srs.js";
import { buildSession, progress, rollDay, dayKey } from "./deck.js";
import { loadState, saveState, exportBackup, importBackup } from "./storage.js";
import { toneSegments, TONE_COLOR } from "./tones.js";
import {
  buildMeaningChoices,
  buildToneChoices,
  checkProduction,
  meaningLabel,
  tonePatternLabel,
  toneless,
} from "./exercises.js";
import { speak, ttsAvailable } from "./tts.js";

const React = window.React;
const ReactDOM = window.ReactDOM;
const h = React.createElement;
const { useState, useEffect, useMemo, useRef } = React;

const MODES = [
  { id: "recognition", label: "Erkennung (Zeichen → Bedeutung)" },
  { id: "production", label: "Produktion (Deutsch → Pinyin/Hanzi)" },
  { id: "tone", label: "Ton-Drill (richtiger Tonverlauf)" },
  { id: "listening", label: "Hörverstehen (Audio → Bedeutung)" },
];

function yesterdayKey(now) { return dayKey(now - 86400000); }

function PinyinColored({ marks, tones, size }) {
  const segs = toneSegments(marks, tones);
  return h("span", { className: "pinyin", style: size ? { fontSize: size } : null },
    segs.map((s, i) =>
      h("span", { key: i, style: { color: TONE_COLOR[s.tone] } },
        s.text + (i < segs.length - 1 ? " " : ""))));
}
function ToneDots({ tones }) {
  return h("span", null, tones.map((t, i) =>
    h("span", { key: i, style: { color: TONE_COLOR[t], fontWeight: 700 } },
      t + (i < tones.length - 1 ? "·" : ""))));
}
function Decomp({ word, chars }) {
  return h("div", { className: "decomp" }, word.chars.map((c) =>
    h("span", { key: c, className: "ch" }, c,
      chars[c] && chars[c].radical ? h("span", { className: "rad" }, "Radikal " + chars[c].radical) : null)));
}
function Meaning({ word }) {
  return word.de_fallback || !word.de.length
    ? h("div", { className: "meaning" }, h("span", { className: "badge warn" }, "nur EN"), " ", word.en.join("; "))
    : h("div", { className: "meaning" },
        h("div", { className: "de" }, word.de.join("; ")),
        h("div", { className: "en" }, word.en.join("; ")));
}
function AnswerBlock({ word, chars }) {
  return h("div", { className: "answer" },
    h("div", { className: "hanzi sm" }, word.simplified),
    h(PinyinColored, { marks: word.pinyin_marks, tones: word.tones, size: "1.4rem" }),
    h("span", { className: "badge hsk" }, "HSK " + word.hsk),
    h(Meaning, { word }),
    h(Decomp, { word, chars }));
}

// ---------- Production input ----------
function Production({ word, phase, result, onSubmit, onNext, chars }) {
  const [val, setVal] = useState("");
  useEffect(() => { setVal(""); }, [word.id]);
  if (phase === "answered") {
    return h("div", { className: "ex" },
      h("div", { className: "prompt" }, "Deutsch: ", h("b", null, meaningLabel(word))),
      h("div", { className: result.ok ? "fb ok" : "fb no" },
        result.ok ? "Richtig (" + (result.kind === "hanzi" ? "Hanzi" : "Pinyin") + ")" : "Deine Eingabe: " + (val || "—")),
      h(AnswerBlock, { word, chars }),
      h("button", { className: "primary", onClick: onNext }, "Weiter"));
  }
  return h("div", { className: "ex" },
    h("div", { className: "prompt" }, "Schreibe Pinyin oder Hanzi für:"),
    h("div", { className: "de big" }, meaningLabel(word)),
    h("input", {
      className: "prod-input", autoFocus: true, value: val,
      placeholder: "z.B. ni3hao3 / nǐ hǎo / 你好",
      onChange: (e) => setVal(e.target.value),
      onKeyDown: (e) => { if (e.key === "Enter") onSubmit(val); },
    }),
    h("button", { className: "primary", onClick: () => onSubmit(val) }, "Prüfen"));
}

// ---------- Tone drill ----------
function ToneDrill({ word, choices, phase, chosen, onPick, onNext }) {
  return h("div", { className: "ex" },
    h("div", { className: "hanzi" }, word.simplified),
    h("div", { className: "toneless" }, toneless(word.pinyin_num)),
    ttsAvailable() ? h("button", { className: "speak", onClick: () => speak(word.simplified) }, "🔊 Anhören") : null,
    h("div", { className: "prompt" }, "Welcher Tonverlauf?"),
    h("div", { className: "choices" }, choices.options.map((p, i) => {
      let cls = "choice";
      if (phase === "answered") {
        if (i === choices.correctIndex) cls += " correct";
        else if (i === chosen) cls += " wrong";
      }
      return h("button", { key: i, className: cls, disabled: phase === "answered", onClick: () => onPick(i) },
        h(ToneDots, { tones: p }));
    })),
    phase === "answered"
      ? h("div", null,
          h(PinyinColored, { marks: word.pinyin_marks, tones: word.tones, size: "1.4rem" }),
          h("button", { className: "primary", onClick: onNext }, "Weiter"))
      : null);
}

// ---------- Listening ----------
function Listening({ word, choices, chars, phase, chosen, onPick, onNext }) {
  useEffect(() => { if (phase === "q") speak(word.simplified); }, [word.id, phase]);
  return h("div", { className: "ex" },
    h("button", { className: "speak big", onClick: () => speak(word.simplified) }, "🔊 Abspielen"),
    !ttsAvailable() ? h("div", { className: "fb no" }, "Kein TTS verfügbar — Bedeutung trotzdem wählbar (Hanzi unten).") : null,
    !ttsAvailable() && phase === "q" ? h("div", { className: "hanzi sm" }, word.simplified) : null,
    h("div", { className: "prompt" }, "Welche Bedeutung?"),
    h("div", { className: "choices col" }, choices.options.map((o, i) => {
      let cls = "choice";
      if (phase === "answered") {
        if (i === choices.correctIndex) cls += " correct";
        else if (i === chosen) cls += " wrong";
      }
      return h("button", { key: i, className: cls, disabled: phase === "answered", onClick: () => onPick(i) }, o.label);
    })),
    phase === "answered"
      ? h("div", null, h(AnswerBlock, { word, chars }), h("button", { className: "primary", onClick: onNext }, "Weiter"))
      : null);
}

// ---------- Recognition (manual grades) ----------
function Recognition({ word, chars, phase, showPinyin, onReveal, onGrade }) {
  if (phase === "q") {
    return h("div", { className: "ex", onClick: onReveal },
      h("div", { className: "hanzi" }, word.simplified),
      showPinyin ? h(PinyinColored, { marks: word.pinyin_marks, tones: word.tones, size: "1.6rem" })
                 : h("div", { className: "hint" }, "Pinyin ausgeblendet"),
      h("button", { className: "primary reveal", onClick: onReveal }, "Aufdecken"));
  }
  return h("div", { className: "ex" },
    h("div", { className: "hanzi" }, word.simplified),
    h(AnswerBlock, { word, chars }),
    h("div", { className: "grades" },
      h("button", { className: "g again", onClick: () => onGrade(GRADE.AGAIN) }, "Nochmal"),
      h("button", { className: "g hard", onClick: () => onGrade(GRADE.HARD) }, "Schwer"),
      h("button", { className: "g good", onClick: () => onGrade(GRADE.GOOD) }, "Gut"),
      h("button", { className: "g easy", onClick: () => onGrade(GRADE.EASY) }, "Leicht")));
}

// ---------- About ----------
function About({ sources, onClose }) {
  const s = sources ? sources.sources : {};
  const rows = Object.entries(s).map(([k, v]) =>
    h("li", { key: k },
      h("strong", null, v.name), " — ", v.license,
      v.version ? " (" + (Array.isArray(v.version) ? v.version.join("; ") : v.version) + ")" : "",
      v.status ? h("div", { className: "warn" }, v.status) : null,
      v.url ? h("div", null, h("a", { href: v.url, target: "_blank", rel: "noreferrer" }, v.url)) : null));
  return h("div", { className: "modal", onClick: onClose },
    h("div", { className: "modal-box", onClick: (e) => e.stopPropagation() },
      h("h2", null, "Über & Quellen"),
      h("p", null, sources ? "HSK-Version: " + sources.hsk_version : ""),
      h("ul", null, rows),
      h("p", { className: "small" },
        "Alle Sprachdaten stammen aus geprüften, offen lizenzierten Quellen (CC BY-SA u.a.). ",
        "Abgeleitete Daten unter CC BY-SA 4.0. Details: ",
        h("a", { href: "ATTRIBUTION.md", target: "_blank", rel: "noreferrer" }, "ATTRIBUTION.md")),
      h("button", { onClick: onClose }, "Schließen")));
}

// ---------- App ----------
function App({ vocab, chars, sources }) {
  const [state, setState] = useState(() => loadState());
  const [view, setView] = useState("dashboard");
  const [session, setSession] = useState(null); // {ids,pos,mode,phase,pendingGrade,chosen,result}
  const [showAbout, setShowAbout] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { saveState(state); }, [state]);

  const prog = useMemo(() => progress(vocab, state.cards), [vocab, state.cards]);
  const sess = useMemo(
    () => buildSession(vocab, state.cards, state.settings, rollDay(state.stats), Date.now()),
    [vocab, state.cards, state.settings, state.stats]);
  const byId = useMemo(() => new Map(vocab.map((w) => [w.id, w])), [vocab]);
  const mode = state.settings.mode || "recognition";

  const word = session ? byId.get(session.ids[session.pos]) : null;
  const seedStr = session ? session.ids[session.pos] + ":" + session.pos : "";
  const meaningChoices = useMemo(
    () => (word && (mode === "listening") ? buildMeaningChoices(word, vocab, 4, seedStr) : null),
    [word, mode, seedStr, vocab]);
  const toneChoices = useMemo(
    () => (word && mode === "tone" ? buildToneChoices(word, 4, seedStr) : null),
    [word, mode, seedStr]);

  function startReview() {
    const built = buildSession(vocab, state.cards, state.settings, rollDay(state.stats), Date.now());
    if (built.queue.length === 0) return;
    setSession({ ids: built.queue.slice(), pos: 0, mode, phase: "q", pendingGrade: null, chosen: null, result: null });
    setView("review");
  }

  function advance(q) {
    const now = Date.now();
    const id = session.ids[session.pos];
    const wasNew = !state.cards[id];
    const card = state.cards[id] || newCard(id);
    const scheduled = schedule(card, q, now);
    setState((prev) => {
      let stats = rollDay({ ...prev.stats }, now);
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
      if (q < 3) ids.push(id);
      const pos = prev.pos + 1;
      if (pos >= ids.length) { setView("dashboard"); return null; }
      return { ...prev, ids, pos, phase: "q", pendingGrade: null, chosen: null, result: null };
    });
  }

  const reveal = () => setSession((p) => ({ ...p, phase: "answered" }));
  const answerAuto = (correct, extra) =>
    setSession((p) => ({ ...p, phase: "answered", pendingGrade: correct ? GRADE.GOOD : GRADE.AGAIN, ...extra }));

  function submitProduction(val) {
    const r = checkProduction(val, word);
    answerAuto(r.ok, { result: r });
  }
  function pickTone(i) { answerAuto(i === toneChoices.correctIndex, { chosen: i }); }
  function pickMeaning(i) { answerAuto(i === meaningChoices.correctIndex, { chosen: i }); }

  function doExport() {
    const blob = new Blob([exportBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mandarin-backup.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function doImport(ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { setState(importBackup(r.result)); } catch { alert("Import fehlgeschlagen: ungültige Datei"); } };
    r.readAsText(f);
  }

  const header = h("header", null,
    h("h1", null, "中文 lernen"),
    h("div", { className: "stats" },
      h("span", null, "Fällig ", h("b", null, sess.due)),
      h("span", null, "Neu ", h("b", null, Math.min(sess.remainingNew, sess.newAvail))),
      h("span", null, "🔥 ", h("b", null, rollDay(state.stats).streak || 0)),
      h("span", null, "Gelernt ", h("b", null, prog.learned), "/", prog.total)));

  let body;
  if (view === "review" && session && word) {
    let card;
    if (session.mode === "production")
      card = h(Production, { word, chars, phase: session.phase, result: session.result, onSubmit: submitProduction, onNext: () => advance(session.pendingGrade) });
    else if (session.mode === "tone")
      card = h(ToneDrill, { word, choices: toneChoices, phase: session.phase, chosen: session.chosen, onPick: pickTone, onNext: () => advance(session.pendingGrade) });
    else if (session.mode === "listening")
      card = h(Listening, { word, chars, choices: meaningChoices, phase: session.phase, chosen: session.chosen, onPick: pickMeaning, onNext: () => advance(session.pendingGrade) });
    else
      card = h(Recognition, { word, chars, phase: session.phase, showPinyin: state.settings.showPinyin, onReveal: reveal, onGrade: advance });

    body = h("div", { className: "review" },
      h("div", { className: "progress" }, (session.pos + 1) + " / " + session.ids.length + " · " + (MODES.find((m) => m.id === session.mode)?.label || "")),
      h("div", { className: "card" }, card),
      h("button", { className: "link", onClick: () => { setSession(null); setView("dashboard"); } }, "Sitzung beenden"));
  } else {
    body = h("div", { className: "dashboard" },
      h("p", { className: "lead" }, "Wähle eine Übung. Spaced-Repetition steuert die Reihenfolge."),
      h("label", { className: "modepick" }, "Übungstyp: ",
        h("select", {
          value: mode,
          onChange: (e) => setState((p) => ({ ...p, settings: { ...p.settings, mode: e.target.value } })),
        }, MODES.map((m) => h("option", { key: m.id, value: m.id }, m.label)))),
      h("button", { className: "primary", disabled: sess.queue.length === 0, onClick: startReview },
        sess.queue.length === 0 ? "Heute nichts fällig 🎉" : "Lernen starten (" + sess.queue.length + ")"),
      h("div", { className: "settings" },
        h("label", null,
          h("input", { type: "checkbox", checked: state.settings.showPinyin,
            onChange: (e) => setState((p) => ({ ...p, settings: { ...p.settings, showPinyin: e.target.checked } })) }),
          " Pinyin auf Vorderseite zeigen (Erkennung)"),
        h("label", null, "Neue Karten/Tag: ",
          h("input", { type: "number", min: 0, max: 200, value: state.settings.dailyNew,
            onChange: (e) => setState((p) => ({ ...p, settings: { ...p.settings, dailyNew: Math.max(0, Number(e.target.value) || 0) } })) }))),
      h("div", { className: "backup" },
        h("button", { onClick: doExport }, "Backup exportieren"),
        h("button", { onClick: () => fileRef.current.click() }, "Backup importieren"),
        h("input", { type: "file", accept: "application/json", ref: fileRef, style: { display: "none" }, onChange: doImport })));
  }

  return h("div", { className: "app" },
    header, body,
    h("footer", null,
      h("button", { className: "link", onClick: () => setShowAbout(true) }, "Über & Quellen"),
      " · Daten: CC-CEDICT, HanDeDict, Make Me a Hanzi, HSK 2.0 (CC BY-SA)"),
    showAbout ? h(About, { sources, onClose: () => setShowAbout(false) }) : null);
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
