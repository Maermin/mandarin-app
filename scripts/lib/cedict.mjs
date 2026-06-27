// CC-CEDICT parser. Line format:
//   TRAD SIMP [pin1 yin1] /gloss/gloss/.../
// Comment lines start with '#'. We never alter glosses or pinyin.

const LINE_RE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;

export function parseCedict(text) {
  const bySimplified = new Map(); // simp -> [entry,...]
  const entries = [];
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, traditional, simplified, pinyinNum, glossBlob] = m;
    const glosses = glossBlob.split("/").filter(Boolean);
    const entry = { traditional, simplified, pinyinNum: pinyinNum.trim(), glosses };
    entries.push(entry);
    if (!bySimplified.has(simplified)) bySimplified.set(simplified, []);
    bySimplified.get(simplified).push(entry);
    count++;
  }
  return { bySimplified, entries, count };
}
