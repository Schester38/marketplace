// Vérifie que le lien du document sur la page de copyright est bien identifié
// comme cliquable (href) par la source unique `copyrightBlock` — aperçu, PDF,
// EPUB et Studio consomment ce même champ.
import { copyrightBlock, firstUrl } from "./protection.js";

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

ok(firstUrl("voir https://exemple.com/doc/1 pour info") === "https://exemple.com/doc/1", "firstUrl extrait l'URL");
ok(firstUrl("aucun lien ici") === null, "firstUrl renvoie null sans URL");

const doc = { author: "Alice", doc_ref: "DOC-2026-ABCD1234", content_hash: "a".repeat(64) };
const items = copyrightBlock(doc, { detailPt: 9 });
const urlItem = items.find((it) => it.text.startsWith("https://"));
ok(!!urlItem, "la ligne d'URL est présente sur la page de copyright");
ok(
  urlItem.href === urlItem.text && /\/verifier\/DOC-2026-ABCD1234$/.test(urlItem.href),
  "l'URL est cliquable (href = texte, page /verifier/<réf>)"
);
ok(
  items.filter((it) => !String(it.text).startsWith("https://")).every((it) => !it.href),
  "les autres lignes de la page copyright ne sont pas des liens"
);
const custom = copyrightBlock({
  author: "Bob",
  doc_ref: "",
  protection: { copyrightText: "Voir https://exemple.com/x" },
});
ok(custom.some((it) => it.href === "https://exemple.com/x"), "une URL du texte personnalisé devient cliquable");

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
