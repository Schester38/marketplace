// Validation temporaire : quand SITE_URL est resté sur l'apex et PUBLIC_URL sur
// www (situation fréquente sur Vercel), le domaine officiel choisi doit être
// celui AVEC www, et l'apex doit être un hôte hérité redirigé.
process.env.SITE_URL = "https://mboppishop.com";
process.env.PUBLIC_URL = "https://www.mboppishop.com/";
const { SITE_URL, SITE_HOST, LEGACY_HOSTS, PUSH_ORIGIN_HOSTS, canonicalizeText, isLegacyHost } =
  await import("../urls.js");

const ok = (cond, label) => console.log(cond ? "OK  " : "FAIL", label);
ok(SITE_URL === "https://www.mboppishop.com", "SITE_URL préfère la variante www");
ok(SITE_HOST === "www.mboppishop.com", "hôte officiel = www");
ok(LEGACY_HOSTS.includes("mboppishop.com"), "apex déclaré hérité (redirigé)");
ok(isLegacyHost("mboppishop.com") === true, "apex → 301");
ok(isLegacyHost("www.mboppishop.com") === false, "www non redirigé");
ok(PUSH_ORIGIN_HOSTS.join(",") === "www.mboppishop.com,localhost,127.0.0.1", "push : www seulement");
ok(canonicalizeText("https://mboppishop.com/x") === "https://www.mboppishop.com/x", "texte apex → www");

// Cas désastreux évité : l'environnement est resté sur l'ancien alias (aucun
// candidat www) → l'alias est le domaine officiel, donc il ne doit JAMAIS
// figurer dans les hôtes « hérités » (sinon redirection vers lui-même).
process.env.SITE_URL = "https://mboppi-mboppi.vercel.app";
delete process.env.PUBLIC_URL;
const aliasCase = await import(`../urls.js?alias=${Date.now()}`);
ok(aliasCase.SITE_URL === "https://mboppi-mboppi.vercel.app", "alias seul → domaine officiel");
ok(aliasCase.isLegacyHost("mboppi-mboppi.vercel.app") === false, "aucune boucle si l'alias est officiel");
