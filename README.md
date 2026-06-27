# Mandarin-Lern-App (verifizierte Daten)

Client-seitige Web-App, die deutschsprachigen Anfängern Hochchinesisch (Mandarin,
vereinfachte Zeichen) für Alltag & Familie beibringt. **Oberstes Gebot:
Korrektheit aller Sprachdaten** — nichts wird vom LLM erfunden, alles stammt
programmatisch aus geprüften Quellen.

## Status

| Phase | Inhalt | Stand |
|---|---|---|
| **1. Datenfundament** | Pipeline + Validierungs-Suite + `sources.json` | ✅ **fertig, Gate grün** |
| **2. SRS-Kern + App** | SM-2, localStorage, Review-Queue, Erkennungs-Übung, Backup | ✅ **fertig, Gate grün** |
| **3. Übungstypen** | Produktion (DE→Pinyin/Hanzi), Ton-Drill, Hörverstehen (TTS) | ✅ **fertig, Gate grün** |
| **4. Schreibpraxis** | `hanzi-writer` Quiz-Modus mit Strichfehler-Erkennung | ✅ **fertig, Gate grün** |
| 5. Pädagogik | Ton-Einführung, Praxis-Track, Fortschritts-UI | offen |
| 6. Optional | Tatoeba-Sätze, austauschbare TTS, Backup-UI | offen |

## Datenstand (Phase 1)

- **4986 Vokabeln** (HSK 2.0, Stufen 1–6), alle gegen CC-CEDICT aufgelöst.
- **0 Validierungsfehler**, 5 Wörter bewusst ausgeschlossen (mehrdeutige Lesung /
  nicht in CC-CEDICT) → siehe `data/validation-report.json`.
- **2628 Zeichen** mit Zerlegung/Radikal (Make Me a Hanzi).
- Pinyin + Töne kommen **pro Wort** aus CC-CEDICT (Schutz vor 多音字-Fehlern).
- Deutsch aus **HanDeDict** (2011-05-28, deterministisch gesäubert): 4428 Wörter
  mit Deutsch, 558 EN-Fallback (`de_fallback: true`). Kein geratenes Deutsch.
  Details: `ATTRIBUTION.md`.

## Befehle

```bash
npm run check       # Syntax-Check aller Quelldateien
npm run build:data  # Quellen laden, mergen, validieren -> data/*.json
npm test            # Validierungs-Suite + goldene Stichproben + SRS/Deck/Storage
npm run gate        # check + build:data + test (Build-Gate)
npm run serve       # statischer Server -> http://localhost:5173 (App im Browser)
```

> Node-Toolchain nur für Build/Validierung/Test **und** den lokalen Static-Server.
> Die App selbst läuft rein client-seitig im Browser (React lokal vendored unter
> `app/vendor/` → **voll offline**, keine CDN/Backend-Abhängigkeit zur Laufzeit).
> `npm run serve` ist nur nötig, weil `fetch` der JSON-Daten unter `file://`
> blockiert wird.

## Struktur

```
scripts/build-data.mjs   # deterministische Daten-Pipeline
scripts/lib/             # cedict-Parser, pinyin-Konverter, Validierung
tests/                   # Validierungs-Suite + goldene Stichproben
data/                    # Build-Output (vocab.json, chars.json, sources.json, report)
data/raw/                # heruntergeladene Rohquellen (git-ignoriert)
ATTRIBUTION.md           # Lizenz-Nachweise (CC BY-SA Pflicht)
```

## Lizenz

Abgeleitete Daten in `data/` stehen unter **CC BY-SA 4.0** (Pflicht aus CC-CEDICT).
Siehe `ATTRIBUTION.md`.
