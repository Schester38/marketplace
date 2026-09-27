// CONTRÔLE DE COÛT de la détection de tableaux (client/src/generator/tables.js).
// La détection est appelée depuis CHAQUE ligne lors d'un import (et le bouton 🔳
// relit tout le document) : elle doit rester quasi linéaire. Elle coûtait O(n²)
// jusqu'à cet audit — plusieurs secondes sur des textes à lignes uniformes.
// Usage : node client/src/generator/tmp-tables-bench.mjs   (exit 1 si trop lent)
import { detectTableBlock, planTableBlocks } from "./tables.js";
import { detectStructureHtml } from "./structure.js";

const BUDGET_MS = 2500;
const timings = [];
const time = (label, fn) => {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  timings.push(ms);
  console.log(`${label} : ${ms.toFixed(0)} ms${out === undefined ? "" : ` (${out})`}`);
};

// Cas pathologique n°1 : toutes les lignes ont le MÊME nombre de mots ET une
// ponctuation finale (prose uniforme — la sonde doit couper la collecte).
for (const n of [500, 1500, 3000]) {
  const doc = Array.from({ length: n }, (_, i) => `Ligne ${i} texte uniforme ${i % 5} fin.`).join("\n");
  time(`${n} lignes uniformes ponctuées`, () => detectStructureHtml(doc).length);
}

// Cas pathologique n°2 : lignes uniformes SANS ponctuation finale (la sonde ne
// peut pas les écarter) — la sonde de profondeur doit borner le coût.
const noPunct = Array.from(
  { length: 3000 },
  (_, i) => `titre interne ${i % 7} sequence identique longueur constante ${i % 3}`
).join("\n");
time("3000 lignes uniformes sans ponctuation", () => detectStructureHtml(noPunct).length);

// Cas pathologique n°3 : idem mais avec des DOUBLES espaces partout (colonnes
// « espaces ») — même exigence.
const noPunct2 = Array.from(
  { length: 3000 },
  (_, i) => `titre  interne  ${i % 7}  sequence  identique  longueur  constante  ${i % 3}`
).join("\n");
time("3000 lignes uniformes à doubles espaces", () => detectStructureHtml(noPunct2).length);

// Prose normale : 5000 lignes de longueurs variées.
const varied = Array.from(
  { length: 5000 },
  (_, i) => `Ligne ${i} — une phrase de longueur variable avec ${i % 11} mots parfois plus longue que les autres.`
).join("\n");
time("5000 lignes de prose variée", () => detectStructureHtml(varied).length);

// planTableBlocks (bouton 🔳 / collage) sur le même volume.
time("planTableBlocks 3000 lignes uniformes", () => planTableBlocks(noPunct.split("\n"), { minRows: 3 }).length);

const flat = detectTableBlock(["a b c", "d e f", "g h i"], 0);
console.log(`bloc « a b c » (prose) : ${flat ? flat.separator : "aucun (attendu)"}`);
const total = timings.reduce((a, b) => a + b, 0);
console.log(`\ncoût total : ${total.toFixed(0)} ms (limite ${BUDGET_MS} ms)`);
if (flat || total > BUDGET_MS) {
  console.log("ÉCHEC — détection trop lente ou faux positif");
  process.exit(1);
}
console.log("OK — coût maîtrisé");

