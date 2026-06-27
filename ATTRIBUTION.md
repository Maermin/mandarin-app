# Attribution & Lizenzen

Diese App leitet **alle** Sprachdaten programmatisch aus offen lizenzierten Quellen
ab. Es wurde keine Vokabel, kein Pinyin, kein Ton und keine Übersetzung von Hand
oder durch ein Sprachmodell erfunden.

| Datensatz | Quelle | Lizenz | Verwendung |
|---|---|---|---|
| **CC-CEDICT** | <https://www.mdbg.net/chinese/dictionary?page=cc-cedict> | CC BY-SA 4.0 | Pinyin-Wahrheit (Töne), englische Bedeutung, vereinfacht/traditionell |
| **Make Me a Hanzi** | <https://github.com/skishore/makemeahanzi> | LGPL (Code) / Arphic Public License (Daten) | Zeichen-Zerlegung, Radikale, später Strichreihenfolge |
| **complete-hsk-vocabulary** | <https://github.com/drkameleon/complete-hsk-vocabulary> | MIT | HSK-2.0-Stufenzuordnung (nur Reihenfolge-Gerüst) |
| **React / ReactDOM 18** | <https://react.dev> | MIT | UI-Bibliothek, lokal vendored unter `app/vendor/` (Offline-Betrieb) |
| **HanDeDict** | <http://www.handedict.de/> | CC BY-SA 2.0 DE | Deutsche Übersetzung (Version 2011-05-28) |

## Weitergabe-Pflicht (CC BY-SA)

CC-CEDICT und HanDeDict stehen unter **CC BY-SA**: Namensnennung **und** Weitergabe
abgeleiteter Daten unter gleicher Lizenz. Die generierten Dateien in `data/` gelten
als abgeleitetes Werk und stehen daher ebenfalls unter CC BY-SA 4.0.

## Hinweis HanDeDict (Deutsch)

Verwendet wird die originale HanDeDict-Datei (`handedict.u8`, CEDICT-Format,
Version 2011-05-28) vom HanDeDict-Projekt (handedict.de), CC BY-SA. Das Deutsch
wird **deterministisch gesäubert** — entfernt werden ausschließlich HanDeDicts
eigene Markup-Elemente: POS-/Domänen-Tags wie `(S)`, `(V)`, `(Int)`, der
Redaktionsmarker `(u.E.)`, eingebettete `Bsp.:`-Beispielsätze und HTML-Reste.
**Es wird kein Deutsch geraten oder umformuliert.**

Wörter ohne passenden HanDeDict-Eintrag (gleiches Zeichen **und** gleiche Lesung)
behalten EN-Fallback und sind mit `de_fallback: true` markiert. Aktuell:
4428 mit Deutsch, 558 EN-Fallback (siehe `data/validation-report.json`).

## HSK-Version

Verwendet: **HSK 2.0 (6 Stufen)** als Reihenfolge-Gerüst, dokumentiert in
`data/sources.json`. HSK ist keine Pflichtprüfung, nur Lernprogression.
