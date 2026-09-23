// Banc d'essai du correcteur de mots collés (temporaire — supprimé après tests)
import { fixGluedText, fixGluedInHtml, fixGluedInPages, fixGluedDoc, fixGluedInElement, applyGluedChanges, GLUED_DICT } from "./gluedWords.js";

const debug = process.argv.includes("--debug");
if (debug) {
  console.log("mot,suite ->", JSON.stringify(fixGluedText("mot,suite")));
  console.log("Merci,Le ->", JSON.stringify(fixGluedText("Merci,Le")));
  console.log("clientssatisfaits ->", JSON.stringify(fixGluedText("clientssatisfaits")));
  console.log("element stats ->", JSON.stringify(fixGluedInElement({ id: "e4", type: "stats", data: { items: [{ value: "98 %", label: "clientssatisfaits" }] } })));
}

let pass = 0;
let fail = 0;
const ok = (label, got, want) => {
  if (got === want) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`✗ ${label}\n   obtenu : ${JSON.stringify(got)}\n   attendu: ${JSON.stringify(want)}`);
  }
};

// ─── 1. Mots-outils indispensables au dictionnaire (≥ 3 lettres) ────────────
// (les mots de 2 lettres — le, la, un, de… — sont gérés par SHORT_WORDS.)
const TOOLS = ("les des une est sont dans pour avec plus tout cette leur mais que qui vous nous elle ils ont " +
  "son ses ces mes tes vos nos mon ton aux par pas sur sous vers chez sans entre selon votre notre leurs meme " +
  "toutes autres chaque pourquoi comment combien cas satisfait").split(" ");
const missing = TOOLS.filter((w) => !GLUED_DICT.has(w));
console.log(`dictionnaire : ${GLUED_DICT.size} mots ; mots-outils manquants : ${missing.join(", ") || "aucun"}`);
if (missing.length) fail += missing.length;
else pass += 1;

// ─── 2. Cas à CORRIGER (texte sale type PDF → Word) ─────────────────────────
const POSITIVE = [
  ["lesmots sontcollés dans cette phrase", "les mots sont collés dans cette phrase"],
  ["Ilestimportant de lire.Le chapitre suivant", "Il est important de lire. Le chapitre suivant"],
  ["bonjourMonde", "bonjour Monde"],
  ["intelligenceartificielle", "intelligence artificielle"],
  ["5000francs par mois", "5000 francs par mois"],
  ["chapitre10", "chapitre 10"],
  ["aujourdhui", "aujourd'hui"],
  ["mot,suite", "mot, suite"],
  ["mot .", "mot."],
  ["desproduits", "des produits"],
  ["surlatable", "sur la table"],
  ["votreentreprise", "votre entreprise"],
  ["nosclientssontsatisfaits", "nos clients sont satisfaits"],
  ["fin.Le lendemain", "fin. Le lendemain"],
  ["laformationcontinue", "la formation continue"],
  ["5000FCFA", "5000 FCFA"],
  ["cetteformation", "cette formation"],
  ["Merci,Le livre est prêt", "Merci, Le livre est prêt"],
  ["danscecas", "dans ce cas"],
  ["pourquoipas", "pourquoi pas"], // mot-outil en tête + mot connu en fin
  ["QuelqueChose", "Quelque Chose"],
];

for (const [input, want] of POSITIVE) {
  ok(`corriger : « ${input} »`, fixGluedText(input).text, want);
}

// ─── 3. Textes légitimes : AUCUNE modification (faux positifs = 0) ───────────
const CLEAN = [
  "Le commerce en ligne connaît une croissance rapide en Afrique centrale.",
  "Votre entreprise peut vendre ses produits sur la plateforme MboppiShop sans frais de service.",
  "1. Commencez par choisir un titre. 2. Rédigez ensuite votre introduction ; elle doit être claire.",
  "Le prix est de 12 500 FCFA, soit environ 19,05 €. Livraison offerte pour 3 articles ou plus.",
  "Contactez-nous sur WhatsApp au +237 699 48 61 46 ou par e-mail : contact@mboppishop.com",
  "Rendez-vous sur https://www.mboppishop.com/produit/42 pour plus d'informations.",
  "Le fichier guide.pdf et l'image couverture.PNG sont prêts.",
  "Une intelligence artificielle bien entraînée reste un outil : l'auteur garde la main.",
  "L'entrepreneur camerounais développe son activité grâce à la formation continue.",
  "Il est important de relire son manuscrit avant de le publier aujourd'hui ou demain.",
  "Les clients satisfaits recommandent la boutique à leur entourage : le bouche-à-oreille fonctionne.",
  "Au Cameroun, les MboppiShop vendent en ligne et encaissent par Orange Money ou MTN Mobile Money.",
  "Le portefeuille du vendeur, la chèvre-feuille du jardin et la chauve-souris du grenier.",
  "Ce chapitre présente la méthode : connaître son marché, fixer son prix, livrer à temps.",
  "10ème étape : vérifier le total. Le 1er essai était concluant et le 2nde test aussi.",
  "« Une citation célèbre. » dit-il, avant de reprendre : « encore une autre phrase ! »",
  // Identifiants entre backticks (code en ligne) : jamais coupés, même quand un
  // backtick isolé ou une séquence Markdown désalignerait l'appariement.
  "Les identifiants `localStorage`, `originVariants`, `sceneContentKey` et `base64` sont protégés.",
  "Un backtick isolé ` puis `ImageExtension` et `patchEls` restent intacts.",
];

for (const text of CLEAN) {
  const r = fixGluedText(text);
  ok(`neutre : « ${text.slice(0, 52)}… »`, r.text, text);
  if (r.fixes.length) console.log(`   (corrections proposées : ${JSON.stringify(r.fixes)})`);
}

// ─── 4. HTML riche : balises et attributs intacts ───────────────────────────
{
  const html = '<p>bonjourMonde <strong>lesmots</strong></p><img src="data:image/png;base64,AAAA" alt="fichier.PNG">';
  const r = fixGluedInHtml(html);
  ok(
    "html riche",
    r.html,
    '<p>bonjour Monde <strong>les mots</strong></p><img src="data:image/png;base64,AAAA" alt="fichier.PNG">'
  );
}

// ─── 5. Pages du Studio (html + tableau + sommaire + stats) ─────────────────
{
  const pages = [
    {
      id: "p1",
      elements: [
        { id: "e1", type: "paragraph", html: "bonjourMonde toutle monde" },
        {
          id: "e2",
          type: "table",
          data: { rows: [[{ text: "Élément", header: true }], [{ text: "5000francs" }]] },
        },
        { id: "e3", type: "toc", data: { entries: [{ level: 1, text: "Chapitre1.Le début", page: 3 }] } },
        { id: "e4", type: "stats", data: { items: [{ value: "98 %", label: "clientssatisfaits" }] } },
      ],
    },
  ];
  const { changes, count } = fixGluedInPages(pages);
  ok("pages : nombre de corrections", count > 0, true);
  ok("pages : éléments touchés", changes.map((c) => c.elId).join(","), "e1,e2,e3,e4");
  console.log("   détail:", JSON.stringify(changes.map((c) => c.fixes.map((f) => `${f.before}→${f.after}`))));
}

// ─── 6. Métadonnées (couverture) ────────────────────────────────────────────
{
  const { patch, count } = fixGluedDoc({ title: "Leguidedu vendeur", author: "JeanPierre Mbappe", cover: { subtitle: "5000francs" } });
  ok("meta : titre", patch.title || "", "Le guide du vendeur");
  ok("meta : auteur", patch.author || "", "Jean Pierre Mbappe");
  ok("meta : sous-titre", (patch.cover || {}).subtitle || "", "5000 francs");
  ok("meta : total", count, 3);
}

// ─── 7. Idempotence : un second passage ne change PLUS rien ─────────────────
{
  const src = "Ilestimportant de comprendreque lesmots sontfréquents surla plateforme. 5000francs par mois.";
  const first = fixGluedText(src);
  const second = fixGluedText(first.text);
  ok("idempotence : texte", second.text, first.text);
  ok("idempotence : plus aucune correction", second.fixes.length, 0);
  const pages = [
    { id: "p1", elements: [{ id: "e1", type: "paragraph", html: "lesmots sontcollés danscecas" }] },
  ];
  const { changes } = fixGluedInPages(pages);
  const fixed = applyGluedChanges(pages, changes);
  ok("idempotence : pages corrigées", fixGluedInPages(fixed).changes.length, 0);
  const meta = fixGluedDoc({ title: "Leguidedu vendeur", cover: { subtitle: "5000francs" } });
  const meta2 = fixGluedDoc({ title: meta.patch.title, cover: meta.patch.cover });
  ok("idempotence : métadonnées", meta2.count, 0);
  const html = fixGluedInHtml('<p>bonjourMonde <strong>lesmots</strong></p>');
  ok("idempotence : html", fixGluedInHtml(html.html).fixes.length, 0);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
