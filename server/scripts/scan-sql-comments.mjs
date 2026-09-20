// Scan des commentaires // à l'intérieur des template literals (SQL) d'un fichier.
import fs from "fs";
const file = process.argv[2] || "db.js";
const lines = fs.readFileSync(file, "utf8").split("\n");
let inTpl = false;
const out = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  const bts = (L.match(/`/g) || []).length;
  if (inTpl && L.includes("//")) out.push(`${i + 1}: ${L.trim().slice(0, 90)}`);
  if (bts % 2 === 1) inTpl = !inTpl;
}
console.log(out.length ? out.join("\n") : "aucun // dans les template literals");
