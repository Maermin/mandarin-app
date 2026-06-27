// HanDeDict integration. Same grammar as CC-CEDICT: TRAD SIMP [pinyin] /de/de/.
// We never invent German: we only deterministically strip HanDeDict's own
// editorial markup (POS/domain tags, "(u.E.)", example sentences, HTML remnants)
// from the verbatim source glosses.
import { parseCedict } from "./cedict.mjs";
import { normalizeNum } from "./pinyin.mjs";

// HanDeDict abbreviation set: a parenthetical is a pure tag-group (and removable)
// only if EVERY comma/semicolon-separated token inside is one of these.
const TAGS = new Set(
  (
    "u.E. S V Vt Vi Vr Adj Adv Int Eig Geo Num Z Zähl Pron Konj Präp Part Suf " +
    "Präf Gr abw vulg umg geh scherzh lit hist fig Math Phys Chem Bio Biol Med " +
    "Mil Sport Mus Pol Rel Tech Astron Bot Zool Anat EDV Comp Wirtsch Ling " +
    "Sprachw Philos Psych Recht Arch Kunst Lit Naut Met Geol Elek Sprw"
  ).split(/\s+/)
);

function decodeEntities(s) {
  return s
    .replace(/&gt;?/g, ">")
    .replace(/&lt;?/g, "<")
    .replace(/&quot;?/g, '"')
    .replace(/&#0?39;?/g, "'")
    .replace(/&amp;?/g, "&");
}

// Remove a parenthetical only when it is purely tags (keeps real meaning in parens).
function stripTagParens(s) {
  return s.replace(/\(([^()]*)\)/g, (full, inner) => {
    const tokens = inner.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length > 0 && tokens.every((t) => TAGS.has(t))) return "";
    return full;
  });
}

export function cleanGerman(gloss) {
  let s = gloss;
  // drop example sentences ("Bsp.:" / "Beispiel:") and everything after
  s = s.split(/Bsp\.?\s*:|Beispiel\s*:/)[0];
  s = decodeEntities(s);
  s = s.replace(/<[^>]*>?/g, " "); // strip HTML-ish remnants (incl. unclosed)
  s = stripTagParens(s);
  s = s.replace(/\s+/g, " ").replace(/\s*[;,]\s*$/g, "").trim();
  return s;
}

// Map: `${simplified}|${normPinyin}` -> [cleaned german senses...]
export function buildHanDeDictIndex(text) {
  const { bySimplified } = parseCedict(text);
  const index = new Map();
  // header version
  const verLine = text.split(/\r?\n/).find((l) => l.startsWith("# HanDeDict")) || "";
  const dm = verLine.match(/(\w{3} \w{3} \d{1,2} [\d:]+ \d{4})/);
  const version = dm ? dm[1] : "unknown";
  for (const [simp, entries] of bySimplified) {
    for (const e of entries) {
      const key = `${simp}|${normalizeNum(e.pinyinNum)}`;
      const senses = [];
      for (const g of e.glosses) {
        const c = cleanGerman(g);
        if (c && !senses.includes(c)) senses.push(c);
      }
      if (senses.length === 0) continue;
      if (!index.has(key)) index.set(key, senses);
      else {
        const cur = index.get(key);
        for (const c of senses) if (!cur.includes(c)) cur.push(c);
      }
    }
  }
  return { index, version };
}
