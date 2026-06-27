// Deterministic data pipeline (spec section 3).
// Downloads verified sources, merges, validates, emits data/*.json.
// NEVER invents language data: pinyin/meanings come verbatim from the sources.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCedict } from "./lib/cedict.mjs";
import { numToMarks, extractTones, normalizeNum } from "./lib/pinyin.mjs";
import { buildHanDeDictIndex } from "./lib/handedict.mjs";
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
  graphics: {
    name: "Make Me a Hanzi (graphics / Strichdaten)",
    url: "https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt",
    license: "LGPL (code) / Arphic Public License (data)",
    file: "makemeahanzi-graphics.txt",
  },
  handedict: {
    name: "HanDeDict (Chinesisch-Deutsch)",
    url: "http://www.handedict.de/handedict/handedict-20090711.tar.bz2",
    license: "CC BY-SA 2.0 DE",
    tar: "handedict.tar.bz2",
    member: "handedict.u8", // CEDICT-format UTF-8 file inside the archive
    file: "handedict.u8",
  },
  tatoeba: {
    name: "Tatoeba (Satzpaare zh/de)",
    license: "CC BY 2.0 FR",
    cmn: { url: "https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2", bz2: "tatoeba-cmn.tsv.bz2" },
    deu: { url: "https://downloads.tatoeba.org/exports/per_language/deu/deu_sentences.tsv.bz2", bz2: "tatoeba-deu.tsv.bz2" },
    links: { url: "https://downloads.tatoeba.org/exports/links.tar.bz2", tar: "tatoeba-links.tar.bz2" },
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

// Download HanDeDict tar.bz2 and extract the .u8 member (one-time, cached).
// Uses system `tar` (bsdtar on Win10+/git-bash, GNU tar on *nix) — bzip2 is not
// in node's stdlib and we keep zero runtime deps.
async function ensureHandedict() {
  const outPath = join(RAW, SOURCES.handedict.file);
  if (existsSync(outPath)) return outPath;
  const tarPath = await ensureRaw(SOURCES.handedict.url, SOURCES.handedict.tar);
  const exdir = join(RAW, "hd_extract");
  mkdirSync(exdir, { recursive: true });
  process.stdout.write("  extract handedict.u8 ... ");
  // --force-local: GNU tar otherwise reads "C:\..." as a remote host (colon).
  // Forward slashes keep both bsdtar and GNU tar happy on Windows/git-bash.
  const fwd = (p) => p.replace(/\\/g, "/");
  execFileSync("tar", ["--force-local", "-xjf", fwd(tarPath), "-C", fwd(exdir)], {
    stdio: "pipe",
  });
  // locate handedict.u8 within extracted tree
  const found = findFile(exdir, "handedict.u8");
  if (!found) throw new Error("handedict.u8 nicht im Archiv gefunden");
  writeFileSync(outPath, readFileSync(found));
  console.log("ok");
  return outPath;
}

function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const r = findFile(p, name);
      if (r) return r;
    } else if (e.name === name) return p;
  }
  return null;
}

// Extract hanzi-writer-compatible stroke data ({strokes, medians}) for the
// needed characters and write one file per char to data/hanzi/. Returns the
// set of characters actually covered.
function writeStrokeData(neededChars) {
  const outDir = join(DATA, "hanzi");
  mkdirSync(outDir, { recursive: true });
  const text = readFileSync(join(RAW, SOURCES.graphics.file), "utf8");
  const covered = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!neededChars.has(obj.character)) continue;
    if (!Array.isArray(obj.strokes) || !Array.isArray(obj.medians)) continue;
    writeFileSync(
      join(outDir, obj.character + ".json"),
      JSON.stringify({ strokes: obj.strokes, medians: obj.medians })
    );
    covered.add(obj.character);
  }
  return covered;
}

// Decompress a .bz2 with the system bzip2 (kept zero-dep). Returns the path.
function bunzip(bz2Path) {
  const out = bz2Path.replace(/\.bz2$/, "");
  if (!existsSync(out)) execFileSync("bzip2", ["-dkf", bz2Path], { stdio: "pipe" });
  return out;
}

// Parse a Tatoeba "*_sentences.tsv" (id\tlang\ttext) into a Map id->text.
function readTatoebaSentences(path) {
  const m = new Map();
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const tab1 = line.indexOf("\t");
    const tab2 = line.indexOf("\t", tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    m.set(line.slice(0, tab1), line.slice(tab2 + 1));
  }
  return m;
}

// Best-effort: attach verified Tatoeba zh/de sentence pairs to vocab words.
// A sentence is only used if the word's exact characters appear in it — no
// invented content. Returns { byWord, counts } or null on failure.
async function buildSentences(vocab) {
  const t = SOURCES.tatoeba;
  await ensureRaw(t.cmn.url, t.cmn.bz2);
  await ensureRaw(t.deu.url, t.deu.bz2);
  await ensureRaw(t.links.url, t.links.tar);

  const cmnText = readTatoebaSentences(bunzip(join(RAW, t.cmn.bz2)));
  const deuText = readTatoebaSentences(bunzip(join(RAW, t.deu.bz2)));

  // extract links.csv (tar.bz2)
  const exdir = join(RAW, "tatoeba_links");
  mkdirSync(exdir, { recursive: true });
  const fwd = (p) => p.replace(/\\/g, "/");
  if (!findFile(exdir, "links.csv"))
    execFileSync("tar", ["--force-local", "-xjf", fwd(join(RAW, t.links.tar)), "-C", fwd(exdir)], { stdio: "pipe" });
  const linksPath = findFile(exdir, "links.csv");
  if (!linksPath) throw new Error("links.csv nicht gefunden");

  // stream links -> first German translation per Chinese sentence id
  const pairDe = new Map();
  const rl = createInterface({ input: createReadStream(linksPath), crlfDelay: Infinity });
  for await (const line of rl) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const a = line.slice(0, tab);
    const b = line.slice(tab + 1).trim();
    if (cmnText.has(a) && deuText.has(b)) { if (!pairDe.has(a)) pairDe.set(a, deuText.get(b)); }
    else if (cmnText.has(b) && deuText.has(a)) { if (!pairDe.has(b)) pairDe.set(b, deuText.get(a)); }
  }

  // index vocab by simplified, assign matching sentences (longest word wins, cap 2)
  const simpToId = new Map();
  for (const w of vocab) if (!simpToId.has(w.simplified)) simpToId.set(w.simplified, w.id);
  const byWord = {};
  const CAP = 2;
  for (const [cid, zh] of cmnText) {
    const de = pairDe.get(cid);
    if (!de || zh.length > 24) continue;
    const matched = [];
    for (let L = 4; L >= 1; L--)
      for (let i = 0; i + L <= zh.length; i++) {
        const sub = zh.slice(i, i + L);
        if (simpToId.has(sub) && !matched.includes(sub)) matched.push(sub);
      }
    for (const sub of matched) {
      const id = simpToId.get(sub);
      const arr = (byWord[id] ||= []);
      if (arr.length < CAP && !arr.some((s) => s.zh === zh)) arr.push({ zh, de });
    }
  }
  const counts = { words_with_sentences: Object.keys(byWord).length, pairs: pairDe.size };
  return { byWord, counts };
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
  await ensureRaw(SOURCES.graphics.url, SOURCES.graphics.file);
  await ensureHandedict();
  const hskRaw = {};
  for (const lvl of SOURCES.hsk.levels) {
    const file = `hsk2-${lvl}.json`;
    await ensureRaw(`${SOURCES.hsk.urlBase}${lvl}.json`, file);
    hskRaw[lvl] = JSON.parse(readFileSync(join(RAW, file), "utf8"));
  }

  console.log("2) CC-CEDICT parsen");
  const { parsed: cedict, meta: cedictMeta } = readCedict();
  console.log(`   ${cedict.count} Eintraege, ${cedict.bySimplified.size} Stichwoerter`);

  console.log("3) HanDeDict (Deutsch) indizieren");
  const { index: hdeIndex, version: hdeVersion } = buildHanDeDictIndex(
    readFileSync(join(RAW, SOURCES.handedict.file), "utf8")
  );
  const hdeTag = `handedict@${hdeVersion}`;
  console.log(`   ${hdeIndex.size} deutsche Eintraege (Version ${hdeVersion})`);

  console.log("4) HSK + Praxis-Track gegen CC-CEDICT aufloesen + mergen");
  const byId = new Map(); // id -> entry (dedupe across HSK + tracks)
  const unresolved = [];
  const usedIds = new Set();
  const cedictVersion = `cc-cedict@${TODAY}`;

  // Pick the correct CC-CEDICT reading for a word. Never guesses: a pinyin hint
  // disambiguates multi-reading entries; without a hint only single-reading words
  // resolve, the rest are reported.
  // Prefer a common-noun reading (lowercase pinyin) over a proper-noun/surname
  // reading (CC-CEDICT capitalises those), among entries with the same reading.
  const preferLower = (list) => list.find((e) => /^[a-zü]/.test(e.pinyinNum)) || list[0];

  function resolveReading(simplified, hint) {
    const cands = cedict.bySimplified.get(simplified);
    if (!cands || cands.length === 0) return { error: "nicht in CC-CEDICT" };
    const norm = (e) => normalizeNum(e.pinyinNum);
    if (hint) {
      const hn = normalizeNum(hint);
      const hits = cands.filter((e) => norm(e) === hn);
      if (hits.length) return { match: preferLower(hits), mismatch: null };
      if (cands.length === 1) return { match: cands[0], mismatch: { hint, cedict: cands[0].pinyinNum } };
      return { error: `Pinyin-Hinweis '${hint}' nicht in Lesungen`, readings: cands.map((e) => e.pinyinNum) };
    }
    // no hint: unambiguous only if all candidates share one normalized reading
    const distinct = [...new Set(cands.map(norm))];
    if (distinct.length === 1) return { match: preferLower(cands), mismatch: null };
    return { error: "mehrdeutige Lesung, kein Pinyin-Hinweis", readings: distinct };
  }

  // Create or fetch the vocab entry for a resolved reading; merge hsk/track tags.
  function upsert(match, mismatch, { hsk = null, track = null }) {
    const pinyin_num = match.pinyinNum;
    let id = `${match.simplified}-${pinyin_num.replace(/\s+/g, "").replace(/:/g, "")}`;
    if (!byId.has(id) && usedIds.has(id)) { let n = 1; while (usedIds.has(id)) id = `${match.simplified}-${pinyin_num.replace(/\s+/g, "")}-${++n}`; }
    let e = byId.get(id);
    if (!e) {
      const de = hdeIndex.get(`${match.simplified}|${normalizeNum(pinyin_num)}`) || [];
      const deFallback = de.length === 0;
      e = {
        id, simplified: match.simplified, traditional: match.traditional,
        pinyin_num, pinyin_marks: numToMarks(pinyin_num), tones: extractTones(pinyin_num),
        de, de_fallback: deFallback, en: match.glosses,
        hsk: null, tracks: [], chars: cjkChars(match.simplified),
        ...(mismatch ? { pinyin_mismatch: mismatch } : {}),
        sources: {
          pinyin: cedictVersion, en: cedictVersion, de: deFallback ? null : hdeTag,
          hsk: null, tracks: null,
        },
      };
      byId.set(id, e);
      usedIds.add(id);
    }
    if (hsk != null && e.hsk == null) {
      e.hsk = hsk;
      e.sources.hsk = `hsk2.0-complete-hsk-vocabulary@${TODAY}`;
    }
    if (track && !e.tracks.includes(track)) {
      e.tracks.push(track);
      e.sources.tracks = `praxis-track@${TODAY}`;
    }
    return e;
  }

  // HSK words
  for (const lvl of SOURCES.hsk.levels) {
    for (const entry of hskRaw[lvl]) {
      const simplified = entry.simplified;
      const hskNum = entry.forms?.[0]?.transcriptions?.numeric || "";
      const r = resolveReading(simplified, hskNum);
      if (r.error) { unresolved.push({ simplified, hsk: lvl, reason: r.error, readings: r.readings }); continue; }
      upsert(r.match, r.mismatch, { hsk: lvl });
    }
  }

  // Praxis-Track (relationship/family/etc). Curation of WHICH dictionary entries,
  // not invented data: pinyin/meaning/strokes all come from the verified sources.
  const trackDef = JSON.parse(readFileSync(join(ROOT, "scripts", "practice-track.json"), "utf8"));
  const tracksMeta = [];
  for (const t of trackDef.tracks) {
    tracksMeta.push({ id: t.id, label: t.label });
    for (const wd of t.words) {
      const r = resolveReading(wd.s, wd.p);
      if (r.error) { unresolved.push({ simplified: wd.s, track: t.id, reason: r.error, readings: r.readings }); continue; }
      upsert(r.match, r.mismatch, { track: t.id });
    }
  }

  // Tone-introduction anchors: the classic 5 readings of "ma", pulled verbatim
  // from CC-CEDICT (verified), used by the tone lesson.
  const TONE_WORDS = [
    { tone: 1, s: "妈", p: "ma1" }, { tone: 2, s: "麻", p: "ma2" },
    { tone: 3, s: "马", p: "ma3" }, { tone: 4, s: "骂", p: "ma4" },
    { tone: 5, s: "吗", p: "ma5" },
  ];
  tracksMeta.push({ id: "toene", label: "Töne-Beispiele (妈麻马骂吗)" });
  const toneExamples = [];
  for (const tw of TONE_WORDS) {
    const r = resolveReading(tw.s, tw.p);
    if (r.error) { unresolved.push({ simplified: tw.s, tone: tw.tone, reason: r.error }); continue; }
    const e = upsert(r.match, r.mismatch, { track: "toene" });
    toneExamples.push({ tone: tw.tone, id: e.id, simplified: e.simplified, pinyin_marks: e.pinyin_marks,
      de: e.de, en: e.en, de_fallback: e.de_fallback });
  }

  const vocab = [...byId.values()];
  console.log(`   ${vocab.length} Vokabeln, ${tracksMeta.length} Praxis-Tracks, ${unresolved.length} ungeloest`);

  console.log("5) Zeichen-Zerlegung + Strichdaten (Make Me a Hanzi)");
  const neededChars = new Set();
  for (const w of vocab) for (const c of w.chars) neededChars.add(c);
  const charMap = readMakeMeAHanzi(neededChars);
  const chars = {};
  for (const c of neededChars) {
    const info = charMap.get(c);
    chars[c] = { radical: info?.radical ?? null, decomposition: info?.decomposition ?? null };
  }
  // Strichdaten (hanzi-writer) pro Zeichen -> data/hanzi/<char>.json
  const strokeChars = writeStrokeData(neededChars);
  const missingStroke = [...neededChars].filter((c) => !strokeChars.has(c));
  writeFileSync(
    join(DATA, "writing-index.json"),
    JSON.stringify([...strokeChars].sort())
  );
  console.log(
    `   ${charMap.size}/${neededChars.size} mit Zerlegung, ${strokeChars.size}/${neededChars.size} mit Strichdaten`
  );

  console.log("6) Validieren");
  // Schreibuebungen nutzen nur Zeichen mit Strichdaten -> Regel 9 erzwingt das.
  const { errors, warnings } = validateVocab(vocab, cedict, {
    strokeChars,
    writingChars: strokeChars,
  });
  for (const c of missingStroke) warnings.push(`Strichdaten fehlen fuer '${c}' (keine Schreibuebung)`);

  console.log("7) Tatoeba Satzpaare (optional, best-effort)");
  let sentences = {};
  let sentenceCounts = { words_with_sentences: 0, pairs: 0 };
  let tatoebaStatus = "uebersprungen";
  try {
    const res = await buildSentences(vocab);
    sentences = res.byWord;
    sentenceCounts = res.counts;
    tatoebaStatus = "ok";
    console.log(`   ${sentenceCounts.words_with_sentences} Woerter mit Satz, ${sentenceCounts.pairs} zh/de-Paare`);
  } catch (e) {
    console.warn("   Tatoeba uebersprungen: " + e.message);
    tatoebaStatus = "uebersprungen: " + e.message;
  }
  writeFileSync(join(DATA, "sentences.json"), JSON.stringify(sentences));

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
        name: SOURCES.handedict.name,
        url: SOURCES.handedict.url,
        license: SOURCES.handedict.license,
        version: hdeVersion,
        downloaded: TODAY,
        note:
          "Deterministisch gesaeubert (POS/Domain-Tags, (u.E.), Bsp.-Saetze, HTML-Reste entfernt). Kein geratenes Deutsch. Wo kein passender Eintrag: EN-Fallback (de_fallback).",
      },
      makemeahanzi: {
        name: SOURCES.makemeahanzi.name,
        url: SOURCES.makemeahanzi.url,
        license: SOURCES.makemeahanzi.license,
        downloaded: TODAY,
      },
      "makemeahanzi-graphics": {
        name: SOURCES.graphics.name,
        url: SOURCES.graphics.url,
        license: SOURCES.graphics.license,
        downloaded: TODAY,
        note: "Strichdaten (strokes/medians) im hanzi-writer-Format, pro Zeichen unter data/hanzi/.",
      },
      hsk: {
        name: SOURCES.hsk.name,
        url: SOURCES.hsk.urlBase,
        license: SOURCES.hsk.license,
        downloaded: TODAY,
      },
      tatoeba: {
        name: SOURCES.tatoeba.name,
        url: "https://tatoeba.org",
        license: SOURCES.tatoeba.license,
        status: tatoebaStatus,
        words_with_sentences: sentenceCounts.words_with_sentences,
        downloaded: tatoebaStatus === "ok" ? TODAY : null,
        note: "Lückentext-Sätze; nur Sätze, in denen das Zielwort woertlich vorkommt. Nichts erfunden.",
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
      de_present: vocab.filter((w) => !w.de_fallback).length,
      en_fallback: vocab.filter((w) => w.de_fallback).length,
      pinyin_mismatch: vocab.filter((w) => w.pinyin_mismatch).length,
      stroke_covered: strokeChars.size,
      stroke_missing: missingStroke.length,
      tracks: tracksMeta.length,
      track_words: vocab.filter((w) => w.tracks.length > 0).length,
      tone_examples: toneExamples.length,
      words_with_sentences: sentenceCounts.words_with_sentences,
    },
    errors,
    warnings: warnings.slice(0, 2000),
    unresolved,
  };

  writeFileSync(join(DATA, "vocab.json"), JSON.stringify(vocab, null, 1));
  writeFileSync(join(DATA, "chars.json"), JSON.stringify(chars, null, 1));
  writeFileSync(join(DATA, "tracks.json"), JSON.stringify(tracksMeta, null, 1));
  writeFileSync(join(DATA, "tone-examples.json"), JSON.stringify(toneExamples, null, 1));
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
