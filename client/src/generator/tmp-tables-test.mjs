// Vérifie la reconstruction automatique des tableaux copiés « à plat »
// (client/src/generator/tables.js) :
//   - séparateurs tabulation / « | » / 2+ espaces / « ; » ;
//   - en-tête (<th>), cellule vide du tableur, colonne finale vide ;
//   - garde-fous anti-prose (aucun paragraphe ne devient un tableau) ;
//   - intégration à l'import (detectStructureHtml) et au collage
//     (looksStructured), qui partagent la même détection.
import {
  detectTableBlock,
  planTableBlocks,
  tableBlockHtml,
  looksNumeric,
} from "./tables.js";
import { detectStructureHtml, looksStructured } from "./structure.js";

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

// Colonnes alignées de façon déterministe (padEnd) : reproduit un tableau de
// PDF collé en texte, colonnes séparées par des espaces multiples.
const align = (rows, widths) =>
  rows.map((r) => r.map((c, i) => String(c ?? "").padEnd(widths[i])).join("")).join("\n");

// ─── 1. Tabulations (tableur, « texte non formaté ») ───────────────────────
const tsv = ["Produit\tQuantité\tPrix", "Stylo\t12\t250", "Cahier\t8\t600", "Règle\t20\t150"].join("\n");
const tsvBlock = detectTableBlock(tsv.split("\n"), 0);
ok(!!tsvBlock && tsvBlock.separator === "tab", "TSV détecté (tabulations)");
ok(tsvBlock?.rows.length === 4 && tsvBlock.rows[0].length === 3, "TSV : 4 lignes × 3 colonnes");
ok(tsvBlock?.header === true, "TSV : première ligne reconnue comme en-tête");
ok(tsvBlock?.end === 4, "TSV : bloc complet (fin = 4)");

// Cellule vide du tableur (« a\t\tc ») : conservée, pas écrasée.
const emptyCell = detectTableBlock(["A\t\t3", "B\t2\t4"], 0);
ok(emptyCell?.rows[0].length === 3 && emptyCell.rows[0][1] === "", "TSV : cellule vide conservée");

// Deux lignes suffisent pour une tabulation (séparateur fiable).
ok(!!detectTableBlock(["a\tb", "c\td"], 0), "TSV : 2 lignes suffisent");

// ─── 2. Tableau de PDF (colonnes espacées, alignées) ───────────────────────
const pdfText = align(
  [
    ["Ville", "Population", "Superficie"],
    ["Douala", "3 663 000", "210 km²"],
    ["Yaoundé", "2 765 000", "180 km²"],
    ["Bafoussam", "800 000", "402 km²"],
  ],
  [14, 13, 20]
).split("\n");
const pdfBlock = detectTableBlock(pdfText, 0);
ok(!!pdfBlock && pdfBlock.separator === "space", "tableau de PDF détecté (espaces)");
ok(pdfBlock?.rows.length === 4 && pdfBlock.rows[1][1] === "3 663 000", "PDF : cellules restituées");
ok(pdfBlock?.header === true, "PDF : en-tête détecté (libellés au-dessus de nombres)");

// Espaces insécables typographiques (copie de PDF français).
const nbsp = [
  "Ville\u00A0\u00A0\u00A0\u00A0Population",
  "Douala\u00A0\u00A0\u00A03\u00A0663\u00A0000",
  "Yaoundé\u00A0\u00A02\u00A0765\u00A0000",
];
const nbspBlock = detectTableBlock(nbsp, 0);
ok(!!nbspBlock && nbspBlock.rows[1][1] === "3 663 000", "espaces insécables traités comme séparateurs");

// Tableau SANS aucun chiffre (libellés capitalisés) : accepté.
const textTable = align(
  [
    ["Nom", "Ville", "Téléphone"],
    ["Ali", "Douala", "6 90 00 00 00"],
    ["Ngo", "Yaoundé", "6 77 11 22 33"],
  ],
  [14, 16, 20]
).split("\n");
ok(!!detectTableBlock(textTable, 0), "tableau de texte (en-tête + valeurs) détecté");

// ─── 3. Garde-fous anti-prose ──────────────────────────────────────────────
const proseLines = [
  "Le premier paragraphe explique la situation.  Il rappelle aussi les règles.",
  "Le deuxième paragraphe continue le raisonnement.  Il ajoute des exemples.",
  "Le troisième paragraphe ferme le sujet.  Il résume les idées du chapitre.",
];
ok(!detectTableBlock(proseLines, 0), "prose à doubles espaces : jamais un tableau");

const proseShort = ["Bonjour  monde  voici", "Salut  planète  ici", "Merci  terre  voilà"];
ok(!detectTableBlock(proseShort, 0), "mots minuscules alignés : jamais un tableau");

const proseOneSpace = ["Une phrase normale ici.", "Une autre phrase normale.", "Encore une phrase."];
ok(!detectTableBlock(proseOneSpace, 0), "prose à espaces simples : aucun tableau");

const proseSemi = [
  "Il faut agir rapidement; le temps presse",
  "Nous devons décider maintenant; tout de suite",
  "Les équipes travaillent dur; sans relâche",
];
ok(!detectTableBlock(proseSemi, 0), "prose à points-virgules : jamais un tableau");

// Un tableau espacé de 2 lignes seulement est trop ambigu : refusé.
ok(!detectTableBlock(["A  B", "C  D"], 0), "2 lignes espacées : trop ambigu (refusé)");

// ─── 4. Markdown et CSV ────────────────────────────────────────────────────
const markdown = ["| Produit | Prix |", "|---|---|", "| Stylo | 250 |", "| Cahier | 600 |"];
const mdBlock = detectTableBlock(markdown, 0);
ok(!!mdBlock && mdBlock.separator === "pipe", "tableau Markdown détecté (|)");
ok(mdBlock?.rows.length === 3 && mdBlock.header === true, "Markdown : règle |---| → en-tête, ligne retirée");
ok(mdBlock?.end === 4, "Markdown : la règle fait partie du bloc (fin = 4)");

const csv = ["Nom;Prix;Ville", "Stylo;250;Douala", "Cahier;600;Yaoundé"];
const csvBlock = detectTableBlock(csv, 0);
ok(!!csvBlock && csvBlock.separator === "semicolon" && csvBlock.header === true, "CSV « ; » détecté avec en-tête");

// ─── 5. Blocs multiples et lignes suivantes intactes ───────────────────────
const mixedLines = align(
  [
    ["Nom", "Ville", "Téléphone"],
    ["Ali", "Douala", "6 90 00 00 00"],
    ["Ngo", "Yaoundé", "6 77 11 22 33"],
  ],
  [14, 16, 20]
).split("\n");
mixedLines.push("Fin de la section.");
const plans = planTableBlocks(mixedLines, { minRows: 2 });
ok(
  plans.length === 1 && plans[0].start === 0 && plans[0].end === 3,
  "planTableBlocks : bloc unique, ligne finale intacte"
);

// Aucune mutation des entrées (déterminisme).
const before = JSON.stringify(pdfText);
const first = detectTableBlock(pdfText, 0);
const second = detectTableBlock(pdfText, 0);
ok(
  JSON.stringify(first) === JSON.stringify(second) && JSON.stringify(pdfText) === before,
  "détection déterministe, entrée non modifiée"
);

// ─── 6. HTML produit et collage ────────────────────────────────────────────
const mdHtml = tableBlockHtml(mdBlock.rows, { header: mdBlock.header });
ok(/<table><thead><tr><th><p>Produit<\/p><\/th>/.test(mdHtml), "HTML : en-tête en <th>");
ok(/<td><p>250<\/p><\/td>/.test(mdHtml), "HTML : données en <td>");
const escaped = tableBlockHtml([["A & B", "3 < 5"]], { header: false });
ok(escaped.includes("A &amp; B") && escaped.includes("3 &lt; 5"), "HTML : cellules échappées");

ok(
  looksStructured("Produit\tQuantité\nStylo\t12\nCahier\t8"),
  "collage : un texte qui n'est qu'un tableau est structuré"
);
ok(
  !looksStructured("Bonjour à tous.\nCeci est un paragraphe.\nMerci beaucoup."),
  "collage : de la prose reste de la prose"
);

const docHtml = detectStructureHtml(
  `Répartition des ventes\n\n${pdfText.join("\n")}\n\nLes chiffres sont indicatifs.`
);
ok(docHtml.includes("<h1>Répartition des ventes</h1>"), "import : titre du document conservé");
ok(
  docHtml.includes("<table>") && docHtml.includes("<th><p>Ville</p></th>"),
  "import : tableau reconstruit avec en-tête"
);
ok(!/<h[1-4]>[^<]*Ville/.test(docHtml), "import : aucune ligne du tableau transformée en titre");
ok(docHtml.includes("<p>Les chiffres sont indicatifs.</p>"), "import : le paragraphe suivant reste un paragraphe");

const onlyTable = detectStructureHtml(pdfText.join("\n"));
ok(
  onlyTable.startsWith("<table>") && !onlyTable.includes("<h1>"),
  "import : un document-tableau n'a pas de faux titre"
);

ok(
  !looksNumeric("Population") && looksNumeric("3 663 000") && looksNumeric("250 F"),
  "looksNumeric : libellé ≠ donnée"
);

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
