// Vérification à GRANDE ÉCHELLE de la détection de tableaux : sur de la prose
// française normale (README.md, AGENTS.md, documentations = ~735 lignes), le
// détecteur ne doit RIEN voir — seuls les vrais tableaux Markdown (« | ») du
// corpus sont légitimes. Un seul bloc `space`, `space1`, `semicolon` ou `tab`
// détecté dans de la prose = régression (garde anti-prose percée) → exit 1.
// Usage : node client/src/generator/tmp-tables-corpus.mjs
import { planTableBlocks } from "./tables.js";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const files = ["README.md", "AGENTS.md", "WHATSAPP_META_VERIFICATION.md"].map((f) => new URL(f, root));
// Seuls les tableaux Markdown écrits avec des barres verticales sont attendus.
const EXPECTED = new Set(["pipe"]);
const counts = new Map();
const samples = [];
let linesTotal = 0;
for (const f of files) {
  const name = decodeURIComponent(f.pathname).split("/").pop();
  let text = "";
  try {
    text = readFileSync(f, "utf8");
  } catch {
    console.log(`(fichier absent : ${name})`);
    continue;
  }
  const lines = text.split(/\r?\n/);
  linesTotal += lines.length;
  for (const b of planTableBlocks(lines, { minRows: 3 })) {
    counts.set(b.separator, (counts.get(b.separator) || 0) + 1);
    if (!EXPECTED.has(b.separator) && samples.length < 10) {
      samples.push({ name, separator: b.separator, from: b.start + 1, rows: b.rows.slice(0, 5) });
    }
  }
}
console.log(`${files.length} fichiers · ${linesTotal} lignes`);
for (const [kind, n] of counts) console.log(`  ${kind} : ${n} bloc(s)`);
for (const s of samples) {
  console.log(`\n[FAUX POSITIF ${s.separator}] ${s.name}:${s.from}`);
  for (const r of s.rows) console.log("    ", JSON.stringify(r));
}
if (samples.length) {
  console.log(`\n${samples.length} faux positif(s) — ÉCHEC`);
  process.exit(1);
}
console.log(`\nOK — aucun faux positif anti-prose (${counts.get("pipe") || 0} tableau(x) Markdown attendu(s))`);
