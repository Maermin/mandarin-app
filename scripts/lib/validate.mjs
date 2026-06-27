// Validation suite (spec section 4). Pure: takes the built vocab + the CC-CEDICT
// index, returns { errors, warnings }. Errors MUST fail the build.
import { numToMarks, extractTones, normalizeNum } from "./pinyin.mjs";

// Valid CJK code-point ranges (Unified + Ext A + Compatibility + Ext B start).
function isCjk(cp) {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0x3400 && cp <= 0x4dbf) || // Ext A
    (cp >= 0xf900 && cp <= 0xfaff) || // Compatibility
    (cp >= 0x20000 && cp <= 0x2a6df) // Ext B
  );
}

function cjkChars(str) {
  return [...str].filter((c) => isCjk(c.codePointAt(0)));
}

// strokeChars: Set of chars that have stroke data (used only for writing-exercise rule 9).
// writingChars: Set of chars actually used in a writing exercise (Phase 1: empty).
export function validateVocab(vocab, cedict, opts = {}) {
  const errors = [];
  const warnings = [];
  const strokeChars = opts.strokeChars || new Set();
  const writingChars = opts.writingChars || new Set();
  const ids = new Set();

  for (const w of vocab) {
    const tag = `${w.id || "?"} (${w.simplified || "?"})`;

    // Rule 10: orphan / required fields + unique id
    if (!w.id) errors.push(`${tag}: fehlende id`);
    if (!w.simplified) errors.push(`${tag}: fehlendes simplified`);
    if (!w.pinyin_num) errors.push(`${tag}: fehlendes pinyin_num`);
    if (w.id) {
      if (ids.has(w.id)) errors.push(`${tag}: doppelte id`);
      ids.add(w.id);
    }

    // Rule 1: Unicode CJK
    for (const field of ["simplified", "traditional"]) {
      for (const c of w[field] || "") {
        if (!isCjk(c.codePointAt(0))) {
          errors.push(`${tag}: Nicht-CJK Zeichen '${c}' in ${field}`);
          break;
        }
      }
    }

    // Rule 2: dictionary existence
    const candidates = cedict.bySimplified.get(w.simplified);
    if (!candidates || candidates.length === 0) {
      errors.push(`${tag}: nicht in CC-CEDICT aufloesbar`);
      continue; // remaining rules need a dict entry
    }

    // Rule 3: pinyin cross-check (stored pinyin must equal a CEDICT reading)
    const wantNorm = normalizeNum(w.pinyin_num);
    const match = candidates.find((e) => normalizeNum(e.pinyinNum) === wantNorm);
    if (!match) {
      errors.push(
        `${tag}: pinyin '${w.pinyin_num}' stimmt mit keinem CC-CEDICT-Eintrag ueberein ` +
          `[${candidates.map((e) => e.pinyinNum).join(" | ")}]`
      );
    }

    // Rule 4: tone validity + length matches syllable count
    const tokens = w.pinyin_num.trim().split(/\s+/);
    if (!Array.isArray(w.tones) || w.tones.length !== tokens.length) {
      errors.push(`${tag}: tones-Laenge ${w.tones?.length} != Silben ${tokens.length}`);
    } else {
      for (const t of w.tones) {
        if (!(Number.isInteger(t) && t >= 1 && t <= 5)) {
          errors.push(`${tag}: ungueltiger Ton ${t}`);
          break;
        }
      }
      const derived = extractTones(w.pinyin_num);
      if (derived.join(",") !== w.tones.join(",")) {
        errors.push(`${tag}: tones ${w.tones} != aus pinyin abgeleitet ${derived}`);
      }
    }

    // Rule 5: pinyin_num <-> pinyin_marks deterministic
    const expectMarks = numToMarks(w.pinyin_num);
    if (w.pinyin_marks !== expectMarks) {
      errors.push(`${tag}: pinyin_marks '${w.pinyin_marks}' != erwartet '${expectMarks}'`);
    }

    // Rule 6: simplified/traditional consistent with matched CEDICT entry
    if (match && w.traditional && match.traditional !== w.traditional) {
      warnings.push(
        `${tag}: traditional '${w.traditional}' != CEDICT '${match.traditional}'`
      );
    }

    // Rule 7: HSK back-binding (HSK optional; tracks are an alternative deck tag)
    const tracks = Array.isArray(w.tracks) ? w.tracks : null;
    if (!tracks) errors.push(`${tag}: tracks-Feld fehlt`);
    if (w.hsk != null) {
      if (!(Number.isInteger(w.hsk) && w.hsk >= 1 && w.hsk <= 6))
        errors.push(`${tag}: ungueltige HSK-Stufe ${w.hsk}`);
      else if (!w.sources || w.sources.hsk == null)
        errors.push(`${tag}: HSK ohne Quellenangabe (geschaetzt?)`);
    }
    // every word must belong to at least one deck (HSK level or a track)
    if (w.hsk == null && (!tracks || tracks.length === 0))
      errors.push(`${tag}: weder HSK-Stufe noch Track (verwaist)`);
    if (tracks && tracks.length > 0 && (!w.sources || w.sources.tracks == null))
      errors.push(`${tag}: Track ohne Quellenangabe`);

    // Rule 8: German present, else must be flagged en-fallback
    const hasDe = Array.isArray(w.de) && w.de.length > 0;
    if (!hasDe && !w.de_fallback) {
      errors.push(`${tag}: keine deutsche Uebersetzung und nicht als EN-Fallback markiert`);
    }
    if (!hasDe) warnings.push(`${tag}: nur EN-Fallback (HanDeDict fehlt)`);

    // Rule 11: source pinyin mismatch (resolved, reported not silently overwritten)
    if (w.pinyin_mismatch) {
      warnings.push(
        `${tag}: Pinyin-Hinweis '${w.pinyin_mismatch.hint}' weicht ab, CC-CEDICT '${w.pinyin_mismatch.cedict}' verwendet`
      );
    }

    // chars must be the CJK chars of simplified
    const expectChars = cjkChars(w.simplified);
    if ((w.chars || []).join("") !== expectChars.join("")) {
      errors.push(`${tag}: chars ${JSON.stringify(w.chars)} != ${JSON.stringify(expectChars)}`);
    }
  }

  // Rule 9: stroke data for every char used in a writing exercise
  for (const c of writingChars) {
    if (!strokeChars.has(c)) errors.push(`Schreibuebung: keine Strichdaten fuer '${c}'`);
  }

  return { errors, warnings };
}

export { isCjk, cjkChars };
