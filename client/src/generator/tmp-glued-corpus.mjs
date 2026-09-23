// Vérification à GRANDE ÉCHELLE : le correcteur ne doit RIEN changer sur de la
// prose française normale (README.md, AGENTS.md = plusieurs milliers de lignes).
// Usage : node client/src/generator/tmp-glued-corpus.mjs   (depuis la racine)
import { fixGluedText } from "./gluedWords.js";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const files = ["README.md", "AGENTS.md", "WHATSAPP_META_VERIFICATION.md"].map((f) => new URL(f, root));
let lines = 0;
let touched = 0;
const samples = [];
for (const f of files) {
  const name = decodeURIComponent(f.pathname).split("/").pop();
  let text = "";
  try {
    text = readFileSync(f, "utf8");
  } catch {
    console.log(`(fichier absent : ${name})`);
    continue;
  }
  for (const line of text.split(/\r?\n/)) {
    lines += 1;
    const r = fixGluedText(line);
    if (r.text !== line) {
      touched += 1;
      if (samples.length < 60) samples.push({ f: name, line, fixed: r.text, fixes: r.fixes.slice(0, 4) });
    }
  }
}
console.log(`${files.length} fichiers · ${lines} lignes · ${touched} ligne(s) modifiée(s)`);
for (const s of samples) {
  console.log(`\n[${s.f}] ${s.line.slice(0, 150)}`);
  console.log(`   → ${s.fixed.slice(0, 150)}`);
  console.log(`   ${JSON.stringify(s.fixes)}`);
}
