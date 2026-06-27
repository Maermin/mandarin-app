# Attribution & Lizenzen

Diese App leitet **alle** Sprachdaten programmatisch aus offen lizenzierten Quellen
ab. Es wurde keine Vokabel, kein Pinyin, kein Ton und keine Übersetzung von Hand
oder durch ein Sprachmodell erfunden.

| Datensatz | Quelle | Lizenz | Verwendung |
|---|---|---|---|
| **CC-CEDICT** | <https://www.mdbg.net/chinese/dictionary?page=cc-cedict> | CC BY-SA 4.0 | Pinyin-Wahrheit (Töne), englische Bedeutung, vereinfacht/traditionell |
| **Make Me a Hanzi** | <https://github.com/skishore/makemeahanzi> | LGPL (Code) / Arphic Public License (Daten) | Zeichen-Zerlegung, Radikale, später Strichreihenfolge |
| **complete-hsk-vocabulary** | <https://github.com/drkameleon/complete-hsk-vocabulary> | MIT | HSK-2.0-Stufenzuordnung (nur Reihenfolge-Gerüst) |
| **HanDeDict** | <https://handedict.zydeo.net/> | CC BY-SA | Deutsche Übersetzung — **derzeit nicht eingebunden** (siehe unten) |

## Weitergabe-Pflicht (CC BY-SA)

CC-CEDICT und HanDeDict stehen unter **CC BY-SA**: Namensnennung **und** Weitergabe
abgeleiteter Daten unter gleicher Lizenz. Die generierten Dateien in `data/` gelten
als abgeleitetes Werk und stehen daher ebenfalls unter CC BY-SA 4.0.

## Hinweis HanDeDict (Deutsch)

HanDeDict ist über zydeo.net nur als Single-Page-App verfügbar; eine statische,
maschinenlesbare Datei war zum Build-Zeitpunkt nicht abrufbar. Deutsche
Übersetzungen sind daher **noch nicht** enthalten. Stattdessen wird die englische
CC-CEDICT-Bedeutung angezeigt und jeder Eintrag ist mit `de_fallback: true`
markiert (Status in `data/sources.json`). Sobald eine geprüfte HanDeDict-Datei
vorliegt, wird das Deutsch ergänzt — **es wird kein Deutsch geraten**.

## HSK-Version

Verwendet: **HSK 2.0 (6 Stufen)** als Reihenfolge-Gerüst, dokumentiert in
`data/sources.json`. HSK ist keine Pflichtprüfung, nur Lernprogression.
