// Domaine public canonique + normalisation des anciennes URLs.
//
// Le site a d'abord été servi sur l'alias Vercel `mboppi-mboppi.vercel.app` et
// reste joignable sur l'apex sans www. Or une origine différente = un service
// worker différent : une notification affichée par le service worker d'une
// autre origine porte CETTE origine (le navigateur affiche et ouvre l'adresse
// du service worker qui a créé la notification), et les textes déjà enregistrés
// (campagnes, notifications, messages) peuvent encore citer l'ancienne adresse.
// Ce module est la SOURCE UNIQUE de la bascule :
//   - SITE_URL           : domaine officiel AVEC www (SITE_URL / PUBLIC_URL) ;
//   - LEGACY_HOSTS       : hôtes encore servis à rediriger en 301 (apex, alias) ;
//   - canonicalUrl()     : URL absolue officielle d'un chemin ;
//   - absoluteUrl()      : chemin interne → URL ABSOLUE officielle (le clic
//                          d'une notification ouvre donc toujours le domaine
//                          officiel, même si le SW est resté sur l'ancien) ;
//   - canonicalizeText() : remplace toute mention d'un hôte hérité par l'hôte
//                          officiel (titres/corps de notification, e-mails) ;
//   - PUSH_ORIGIN_HOSTS  : seules ces origines reçoivent des push — un
//                          abonnement créé sur une autre origine afficherait
//                          l'ancienne URL, il est donc ignoré (le site se
//                          réabonne automatiquement sur le domaine officiel).

const stripSlash = (value) => String(value || "").replace(/\/+$/, "");
const hostOf = (url) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};

// Parmi les candidats de l'environnement, on privilégie celui AVEC `www.` :
// les notifications et les liens doivent afficher www.mboppishop.com, même si
// SITE_URL a été laissée sur l'apex.
const CANDIDATES = [process.env.SITE_URL, process.env.PUBLIC_URL]
  .map(stripSlash)
  .filter(Boolean);
const WWW_CANDIDATE = CANDIDATES.find((url) => hostOf(url).startsWith("www."));

// Filet de sécurité : la zone officielle est servie en `www.` — si SITE_URL a
// été laissée sur l'apex, on force la variante www (sinon les notifications
// afficheraient « mboppishop.com » au lieu de « www.mboppishop.com »).
const preferWwwHost = (url) => {
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() === "mboppishop.com") u.hostname = "www.mboppishop.com";
    return u.origin;
  } catch {
    return url;
  }
};

export const SITE_URL = preferWwwHost(
  WWW_CANDIDATE || CANDIDATES[0] || "https://www.mboppishop.com"
);
export const SITE_HOST = hostOf(SITE_URL) || "www.mboppishop.com";
// Apex de la zone officielle (« mboppishop.com » quand le site est sur www).
export const APEX_HOST = SITE_HOST.startsWith("www.") ? SITE_HOST.slice(4) : SITE_HOST;

// Hôtes hérités encore servis par Vercel : l'apex sans www de la zone
// officielle et l'ancien alias Vercel. Le domaine officiel lui-même en est
// TOUJOURS exclu (aucune boucle de redirection possible, même si
// l'environnement a été laissé sur l'ancien alias).
export const LEGACY_HOSTS = [
  ...new Set(
    [APEX_HOST !== SITE_HOST ? APEX_HOST : null, "mboppi-mboppi.vercel.app"]
      .filter(Boolean)
      .filter((host) => host !== SITE_HOST)
  ),
];

export function isLegacyHost(host) {
  const h = String(host || "").toLowerCase().split(":")[0];
  return LEGACY_HOSTS.includes(h);
}

// Origines autorisées à RECEVOIR des notifications push : le domaine officiel
// (avec www) et localhost pour le développement. L'apex est VOLONTAIREMENT
// exclu : pour le navigateur c'est une autre origine, ses notifications
// afficheraient « mboppishop.com » au lieu de « www.mboppishop.com » — et il
// redirige désormais vers le domaine officiel, où le site se réabonne.
export const PUSH_ORIGIN_HOSTS = [...new Set([SITE_HOST, "localhost", "127.0.0.1"])];

export function canonicalUrl(pathname) {
  const p = String(pathname || "/");
  return `${SITE_URL}${p.startsWith("/") ? "" : "/"}${p}`;
}

// Chemin interne → URL absolue officielle ; URL absolue → normalisée.
export function absoluteUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return `${SITE_URL}/`;
  if (/^https?:\/\//i.test(raw)) return canonicalizeText(raw);
  return canonicalUrl(raw);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEGACY_RES = LEGACY_HOSTS.map((host) => {
  const h = escapeRe(host);
  return {
    withScheme: new RegExp(`https?://${h}`, "gi"),
    protocolRelative: new RegExp(`//${h}`, "gi"),
    // Mention nue : jamais précédée d'un point/arobase (chemins « /review/… »,
    // adresses e-mail) ni d'un caractère de mot — « www.mboppishop.com », déjà
    // correct, n'est pas touché.
    bare: new RegExp(`(?<![/.@\\w-])${h}`, "gi"),
  };
});

// Remplace les mentions d'un hôte hérité par l'hôte officiel. Ne touche NI les
// chemins qui contiennent le domaine (profil Trustpilot
// « fr.trustpilot.com/review/mboppishop.com »), NI les adresses e-mail
// (contact@mboppishop.com), NI l'hôte officiel lui-même.
export function canonicalizeText(value) {
  let out = String(value ?? "");
  if (!out) return out;
  for (const res of LEGACY_RES) {
    out = out.replace(res.withScheme, `https://${SITE_HOST}`);
    out = out.replace(res.protocolRelative, `//${SITE_HOST}`);
    out = out.replace(res.bare, SITE_HOST);
  }
  return out;
}
