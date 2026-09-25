// Contraste des citations : le TEXTE est en couleur de corps (lisible sur tous
// les décors), seule la barre latérale garde la couleur d'accent du design.
// Vérifie le Studio (styles par défaut) ET les feuilles de style des rendus
// classic (pagination/PDF), EPUB et EPUB du Studio.
import fs from "node:fs";
import { GEN_TEMPLATES } from "./templates.js";
import { defaultStyle } from "./studioModel.js";

let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  if (cond) {
    pass += 1;
    console.log("OK  ", label);
  } else {
    fail += 1;
    console.log("FAIL", label);
  }
};

// 1) Studio : un modèle = un style de citation (texte corps, barre accent).
const badColor = GEN_TEMPLATES.filter((tpl) => defaultStyle(tpl, "quote").color !== tpl.colors.body);
ok(badColor.length === 0, `Studio : ${GEN_TEMPLATES.length} modèles — citation en couleur de corps`);
const badBorder = GEN_TEMPLATES.filter((tpl) => defaultStyle(tpl, "quote").borderColor !== tpl.colors.accent);
ok(badBorder.length === 0, "Studio : barre latérale toujours en accent");
ok(
  GEN_TEMPLATES.every((tpl) => defaultStyle(tpl, "quote").color !== tpl.colors.accent),
  "Studio : aucune citation de la couleur d'accent"
);

// 2) Rendus classic / EPUB / EPUB Studio (feuilles de style).
const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

const quoteLine = read("paginate.js").match(/\n\s*quote:\s*`([^`]*)`/)?.[1] || "";
ok(/color:\$\{template\.colors\.body\}/.test(quoteLine), "paginate/PDF : texte de citation en couleur de corps");
ok(/border-left:3px solid \$\{template\.colors\.accent\}/.test(quoteLine), "paginate/PDF : barre latérale en accent");
ok(!/color:\$\{template\.colors\.accent\};/.test(quoteLine), "paginate/PDF : plus de texte en accent");

const epubLine = read("epub.js").split("\n").find((l) => l.includes("blockquote{")) || "";
ok(/color:\$\{c\.body\}/.test(epubLine), "EPUB : texte de citation en couleur de corps");
ok(!/color:\$\{c\.accent\}/.test(epubLine), "EPUB : plus de texte en accent");

const studioLine = read("studioExport.js").split("\n").find((l) => l.includes("blockquote {")) || "";
ok(
  studioLine.includes("color: ${template.colors.body};") && studioLine.includes("border-left: 3px solid ${template.colors.accent}"),
  "EPUB du Studio : citation corps + barre accent"
);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
