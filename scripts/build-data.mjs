// Deterministic data pipeline (spec section 3).
// Downloads verified sources, merges, validates, emits data/*.json.
// NEVER invents language data: pinyin/meanings come verbatim from the sources.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCedict } from "./lib/cedict.mjs";
import { numToMarks, extractTones, normalizeNum } from "./lib/pinyin.mjs";
import { validateVocab, cjkChars } from "./lib/validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW = join(ROOT, "data", "raw");
const DATA = join(ROOT, "data");
const TODAY = new Date().toISOString().slice(0, 10);

const SOURCES = {
  cedict: {
    name: "CC-CEDICT",
    url: "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
    license: "CC BY-SA 4.0",
    file: "cedict.u8",
    gz: true,
  },
  makemeahanzi: {
    name: "Make Me a Hanzi (dictionary)",
    url: "https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt",
    license: "LGPL (code) / Arphic Public License (data)",
    file: "makemeahanzi-dictionary.txt",
  },
  hsk: {
    name: "complete-hsk-vocabulary (HSK 2.0, Stufen 1-6)",
    urlBase:
      "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old/",
    license: "MIT",
    levels: [1, 2, 3, 4, 5, 6],
  },
};

async function ensureRaw(url, file) {
  const path = join(RAW, file);
  if (existsSync(path)) return path;
  process.stdout.write(`  download ${file} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  console.log(`${buf.length} bytes`);
  return path;
}

function readCedict() {
  const gzPath = join(RAW, "cedict.txt.gz");
  const outPath = join(RAW, SOURCES.cedict.file);
  if (!existsSync(outPath)) {
    const gz = readFileSync(gzPath);
    writeFileSync(outPath, gunzipSync(gz));
  }
  const text = readFileSync(outPath, "utf8");
  // capture header metadata lines (#! ...)
  const meta = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("#!"))
    .map((l) => l.slice(2).trim());
  return { parsed: parseCedict(text), meta };
}

function readMakeMeAHanzi(neededChars) {
  const text = readFileSync(join(RAW, SOURCES.makemeahanzi.file), "utf8");
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (neededChars.has(obj.character)) {
      map.set(obj.character, {
        radical: obj.radical ?? null,
        decomposition: obj.decomposition ?? null,
      });
    }
  }
  return map;
}

async function main() {
  mkdirSync(RAW, { recursive: true });

  console.log("1) Quellen laden");
  // cedict downloaded as .gz then decompressed
  if (!existsSync(join(RAW, SOURCES.cedict.file))) {
    await ensureRaw(SOURCES.cedict.url, "cedict.txt.gz");
  }
  await ensureRaw(SOURCES.makemeahanzi.url, SOURCES.makemeahanzi.file);
  const hskRaw = {};
  for (const lvl of SOURCES.hsk.levels) {
    const file = `hsk2-${lvl}.json`;
    await ensureRaw(`${SOURCES.hsk.urlBase}${lvl}.json`, file);
    hskRaw[lvl] = JSON.parse(readFileSync(join(RAW, file), "utf8"));
  }

  console.log("2) CC-CEDICT parsen");
  const { parsed: cedict, meta: cedictMeta } = readCedict();
  console.log(`   ${cedict.count} Eintraege, ${cedict.bySimplified.size} Stichwoerter`);

  console.log("3) HSK-Woerter gegen CC-CEDICT aufloesen + mergen");
  const vocab = [];
  const unresolved = [];
  const usedIds = new Set();
  const cedictVersion = `cc-cedict@${TODAY}`;

  for (const lvl of SOURCES.hsk.levels) {
    for (const entry of hskRaw[lvl]) {
      const simplified = entry.simplified;
      const form = (entry.forms && entry.forms[0]) || {};
      const traditional = form.traditional || simplified;
      const hskNum = form.transcriptions?.numeric || "";
      const candidates = cedict.bySimplified.get(simplified);

      if (!candidates || candidates.length === 0) {
        unresolved.push({ simplified, hsk: lvl, reason: "nicht in CC-CEDICT" });
        continue;
      }
      // pick CEDICT reading: prefer the one matching HSK pinyin
      let match = candidates.find(
        (e) => normalizeNum(e.pinyinNum) === normalizeNum(hskNum)
      );
      let mismatch = null;
      if (!match) {
        if (candidates.length === 1) {
          match = candidates[0];
          if (normalizeNum(match.pinyinNum) !== normalizeNum(hskNum)) {
            mismatch = { hsk: hskNum, cedict: match.pinyinNum };
          }
        } else {
          // ambiguous multi-reading + no HSK match -> do NOT guess
          unresolved.push({
            simplified,
            hsk: lvl,
            reason: "mehrdeutige Lesung, kein HSK-Pinyin-Treffer",
            readings: candidates.map((e) => e.pinyinNum),
          });
          continue;
        }
      }

      const pinyin_num = match.pinyinNum;
      let id = `${simplified}-${pinyin_num.replace(/\s+/g, "").replace(/:/g, "")}`;
      let n = 1;
      while (usedIds.has(id)) id = `${simplified}-${pinyin_num.replace(/\s+/g, "")}-${++n}`;
      usedIds.add(id);

      vocab.push({
        id,
        simplified,
        traditional,
        pinyin_num,
        pinyin_marks: numToMarks(pinyin_num),
        tones: extractTones(pinyin_num),
        de: [], // HanDeDict nicht verfuegbar -> Fallback
        de_fallback: true,
        en: match.glosses,
        hsk: lvl,
        chars: cjkChars(simplified),
        ...(mismatch ? { pinyin_mismatch: mismatch } : {}),
        sources: {
          pinyin: cedictVersion,
          en: cedictVersion,
          de: null,
          hsk: `hsk2.0-complete-hsk-vocabulary@${TODAY}`,
        },
      });
    }
  }
  console.log(`   ${vocab.length} Vokabeln, ${unresolved.length} ungeloest`);

  console.log("4) Zeichen-Zerlegung (Make Me a Hanzi)");
  const neededChars = new Set();
  for (const w of vocab) for (const c of w.chars) neededChars.add(c);
  const charMap = readMakeMeAHanzi(neededChars);
  const chars = {};
  const strokeChars = new Set();
  for (const c of neededChars) {
    const info = charMap.get(c);
    chars[c] = { radical: info?.radical ?? null, decomposition: info?.decomposition ?? null };
    if (info) strokeChars.add(c);
  }
  console.log(`   ${charMap.size}/${neededChars.size} Zeichen mit Zerlegungsdaten`);

  console.log("5) Validieren");
  const { errors, warnings } = validateVocab(vocab, cedict, {
    strokeChars,
    writingChars: new Set(), // Phase 1: keine Schreibuebungen
  });

  const sourcesOut = {
    generated: TODAY,
    hsk_version: "HSK 2.0 (6 Stufen)",
    note:
      "HSK nur als Reihenfolge-Geruest, keine Pflichtpruefung. Pinyin-Wahrheit = CC-CEDICT.",
    sources: {
      "cc-cedict": {
        name: SOURCES.cedict.name,
        url: SOURCES.cedict.url,
        license: SOURCES.cedict.license,
        version: cedictMeta,
        downloaded: TODAY,
      },
      handedict: {
        name: "HanDeDict (deutsche Uebersetzung)",
        url: "https://handedict.zydeo.net/",
        license: "CC BY-SA",
        status:
          "NICHT geladen: zydeo liefert nur SPA-HTML, keine statische Datei. Deutsch = EN-Fallback, markiert pro Eintrag (de_fallback).",
        downloaded: null,
      },
      makemeahanzi: {
        name: SOURCES.makemeahanzi.name,
        url: SOURCES.makemeahanzi.url,
        license: SOURCES.makemeahanzi.license,
        downloaded: TODAY,
      },
      hsk: {
        name: SOURCES.hsk.name,
        url: SOURCES.hsk.urlBase,
        license: SOURCES.hsk.license,
        downloaded: TODAY,
      },
    },
  };

  const report = {
    generated: new Date().toISOString(),
    counts: {
      vocab: vocab.length,
      unresolved: unresolved.length,
      errors: errors.length,
      warnings: warnings.length,
      en_fallback: vocab.filter((w) => w.de_fallback).length,
      pinyin_mismatch: vocab.filter((w) => w.pinyin_mismatch).length,
    },
    errors,
    warnings: warnings.slice(0, 2000),
    unresolved,
  };

  writeFileSync(join(DATA, "vocab.json"), JSON.stringify(vocab, null, 1));
  writeFileSync(join(DATA, "chars.json"), JSON.stringify(chars, null, 1));
  writeFileSync(join(DATA, "sources.json"), JSON.stringify(sourcesOut, null, 2));
  writeFileSync(join(DATA, "validation-report.json"), JSON.stringify(report, null, 2));
  console.log(
    `   geschrieben: vocab(${vocab.length}) chars(${Object.keys(chars).length}) ` +
      `errors(${errors.length}) warnings(${warnings.length})`
  );

  if (errors.length > 0) {
    console.error(`\nBUILD ABGEBROCHEN: ${errors.length} Validierungsfehler. Siehe data/validation-report.json`);
    for (const e of errors.slice(0, 20)) console.error("  - " + e);
    process.exit(1);
  }
  console.log("\nOK: Datenfundament validiert.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
