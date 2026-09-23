// Vérification à GRANDE ÉCHELLE : le correcteur ne doit RIEN changer sur de la
// prose française normale (README.md, AGENTS.md = plusieurs milliers de lignes).
// Usage : node client/src/generator/tmp-glued-corpus.mjs          (règles seules)
//         node client/src/generator/tmp-glued-corpus.mjs --ref    (comparatif ON)
import { fixGluedText, buildGluedReference } from "./gluedWords.js";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const files = ["README.md", "AGENTS.md", "WHATSAPP_META_VERIFICATION.md"].map((f) => new URL(f, root));
// Mode comparatif : la référence est le vocabulaire du fichier lui-même — le
// pire cas possible (tous les mots légitimes sont « connus » du comparatif).
const withRef = process.argv.includes("--ref");
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
  const opts = withRef ? { reference: buildGluedReference(text) } : {};
  for (const line of text.split(/\r?\n/)) {
    lines += 1;
    const r = fixGluedText(line, opts);
    if (r.text !== line) {
      touched += 1;
      if (samples.length < 60) samples.push({ f: name, line, fixed: r.text, fixes: r.fixes.slice(0, 4) });
    }
  }
}
console.log(`${files.length} fichiers · ${lines} lignes · ${touched} ligne(s) modifiée(s)${withRef ? " (comparatif ON)" : ""}`);
for (const s of samples) {
  console.log(`\n[${s.f}] ${s.line.slice(0, 150)}`);
  console.log(`   → ${s.fixed.slice(0, 150)}`);
  console.log(`   ${JSON.stringify(s.fixes)}`);
}

// ─── Mesure du COMPARATIF : on recolle un espace au hasard dans chaque ligne ──
// et on vérifie que le comparatif (référence = le fichier PROPRE) restaure
// exactement le texte d'origine. Déterministe (LCG à graine fixe).
if (process.argv.includes("--glue")) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let tried = 0;
  let restored = 0;
  let untouched = 0;
  let other = 0;
  const samples = [];
  const samplesOther = [];
  for (const f of files) {
    const name = decodeURIComponent(f.pathname).split("/").pop();
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const reference = buildGluedReference(text);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.length < 40 || line.length > 400) continue;
      // Frontières de mots « propres » (lettre-espace-lettre) de la ligne.
      const spots = [];
      const re = /([A-Za-zÀ-ÖØ-öø-ÿ]{3,}) ([a-zà-öø-ÿ]{3,})/g;
      let m;
      while ((m = re.exec(line))) spots.push(m.index + m[1].length);
      if (!spots.length) continue;
      if (rnd() > 0.25) continue; // ~1 ligne sur 4 échantillonnée
      const at = spots[Math.floor(rnd() * spots.length)];
      const glued = `${line.slice(0, at)}${line.slice(at + 1)}`;
      tried += 1;
      const out = fixGluedText(glued, { reference }).text;
      if (out === line) restored += 1;
      else if (out === glued) {
        untouched += 1;
        if (samples.length < 25) samples.push({ name, glued, out, ref: line });
      } else {
        other += 1;
        if (samplesOther.length < 15) samplesOther.push({ name, glued, out, ref: line });
      }
    }
  }
  console.log(`\n[comparatif] ${tried} espaces recollés · ${restored} restaurés (${Math.round((restored / Math.max(1, tried)) * 100)} %) · ${untouched} inchangés · ${other} autres`);
  for (const s of samplesOther) {
    console.log(`\n[FAUX POSITIF ?][${s.name}] collé : ${s.glued.slice(0, 140)}`);
    console.log(`   obtenu  : ${s.out.slice(0, 140)}`);
    console.log(`   attendu : ${s.ref.slice(0, 140)}`);
  }
  for (const s of samples.slice(0, 8)) {
    console.log(`\n[non détecté][${s.name}] collé : ${s.glued.slice(0, 140)}`);
    console.log(`   attendu : ${s.ref.slice(0, 140)}`);
  }
}
