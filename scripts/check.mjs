// Lightweight syntax check: `node --check` over every source .mjs (no extra deps).
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirs = ["scripts", "scripts/lib", "tests", "app"];
let files = [];
for (const d of dirs) {
  const abs = join(ROOT, d);
  let entries = [];
  try {
    entries = readdirSync(abs);
  } catch {
    continue;
  }
  for (const f of entries) {
    const p = join(abs, f);
    if (statSync(p).isFile() && (f.endsWith(".mjs") || f.endsWith(".js"))) files.push(p);
  }
}

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    bad++;
    console.error(`SYNTAXFEHLER: ${f}\n${e.stderr?.toString() || e.message}`);
  }
}
if (bad) {
  console.error(`check: ${bad} Datei(en) fehlerhaft`);
  process.exit(1);
}
console.log(`check: ${files.length} Datei(en) ok`);
