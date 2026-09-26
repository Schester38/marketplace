// Validation temporaire de server/urls.js (normalisation des anciennes URLs).
process.env.SITE_URL = "https://www.mboppishop.com";
const {
  SITE_URL,
  SITE_HOST,
  isLegacyHost,
  absoluteUrl,
  canonicalizeText,
  PUSH_ORIGIN_HOSTS,
} = await import("../urls.js");

let pass = 0;
let fail = 0;
const ok = (got, want, label) => {
  if (got === want) {
    pass += 1;
    console.log("OK  ", label);
  } else {
    fail += 1;
    console.log(`FAIL ${label}\n   obtenu : ${got}\n   attendu: ${want}`);
  }
};

ok(SITE_URL, "https://www.mboppishop.com", "SITE_URL canonique");
ok(SITE_HOST, "www.mboppishop.com", "SITE_HOST");
ok(isLegacyHost("mboppi-mboppi.vercel.app"), true, "ancien alias détecté");
ok(isLegacyHost("mboppi-mboppi.vercel.app:443"), true, "alias avec port détecté");
ok(isLegacyHost("www.mboppishop.com"), false, "domaine officiel non redirigé");
ok(isLegacyHost("preview-abc.vercel.app"), false, "préversion non redirigée");

ok(absoluteUrl("/suivi/5?code=AB"), `${SITE_URL}/suivi/5?code=AB`, "chemin interne → absolu officiel");
ok(absoluteUrl("/"), `${SITE_URL}/`, "racine → absolu officiel");
ok(
  absoluteUrl("https://mboppi-mboppi.vercel.app/produit/12"),
  "https://www.mboppishop.com/produit/12",
  "URL absolue héritée → officielle"
);
ok(absoluteUrl(""), `${SITE_URL}/`, "valeur vide → racine officielle");

ok(
  canonicalizeText("https://mboppi-mboppi.vercel.app/produit/12"),
  "https://www.mboppishop.com/produit/12",
  "mention http de l'ancien alias"
);
ok(canonicalizeText("voir mboppi-mboppi.vercel.app"), "voir www.mboppishop.com", "mention nue de l'ancien alias");
ok(canonicalizeText("https://mboppishop.com/x"), "https://www.mboppishop.com/x", "apex → www");
ok(canonicalizeText("mboppishop.com"), "www.mboppishop.com", "apex nu → www");
ok(canonicalizeText("//mboppishop.com"), "//www.mboppishop.com", "apex protocole-relatif → www");
ok(
  canonicalizeText("https://www.mboppishop.com/x"),
  "https://www.mboppishop.com/x",
  "domaine officiel inchangé"
);
ok(
  canonicalizeText("https://fr.trustpilot.com/review/mboppishop.com"),
  "https://fr.trustpilot.com/review/mboppishop.com",
  "chemin Trustpilot préservé"
);
ok(canonicalizeText("contact@mboppishop.com"), "contact@mboppishop.com", "adresse e-mail préservée");
ok(canonicalizeText(""), "", "texte vide");

ok(PUSH_ORIGIN_HOSTS.includes("www.mboppishop.com"), true, "origine officielle autorisée (push)");
ok(PUSH_ORIGIN_HOSTS.includes("mboppishop.com"), false, "apex EXCLU des push (autre origine navigateur)");
ok(PUSH_ORIGIN_HOSTS.includes("mboppi-mboppi.vercel.app"), false, "ancien alias refusé (push)");
ok(isLegacyHost(SITE_HOST), false, "aucune boucle : le domaine officiel n'est pas redirigé");

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
