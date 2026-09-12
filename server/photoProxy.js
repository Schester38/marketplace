// Proxy de photos : les images Supabase sont servies via NOTRE domaine avec un
// cache « eternal » (CDN Vercel + navigateur). Résultat : Supabase n'est appelé
// qu'une seule fois par image et par région CDN au lieu de CHAQUE vue visiteur
// (les objets Storage de ce projet ne peuvent pas recevoir de cache-control : le
// Storage de cette instance ignore les headers d'upload, cf. maintenance).
//
// - proxyPhotoUrl()  : réécrit une URL canonique (.storage/.co/.../photos/…) en
//   URL relative /api/photo?p=<chemin> (utilisée dans toutes les réponses API).
// - unproxyPhotoUrl() : inverse — avant persist, une URL proxée est reconvertie
//   en URL canonique (pour ne jamais stocker /api/photo en base).
// - photoProxyPath()  : valide un chemin de photo (anti-SSRF).
const MARK = "/storage/v1/object/public/photos/";
const PATH_RE = /^(products|offers)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/;

export function photoProxyPath(value) {
  const v = String(value || "");
  return PATH_RE.test(v) ? v : null;
}

export function proxyPhotoUrl(url) {
  if (typeof url !== "string" || !url) return url;
  if (!process.env.SUPABASE_URL) return url; // dev sans Storage : URLs telles quelles
  const i = url.indexOf(MARK);
  if (i < 0) return url;
  const path = url.slice(i + MARK.length);
  if (!photoProxyPath(path)) return url;
  return `/api/photo?p=${encodeURIComponent(path)}`;
}

export function unproxyPhotoUrl(url) {
  if (typeof url !== "string" || !url) return url;
  const m = /\/api\/photo(?:\?|&)p=([^&]+)/.exec(url);
  if (!m) return url;
  try {
    const path = decodeURIComponent(m[1]);
    if (!photoProxyPath(path)) return url;
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${path}`.replace(
      /\/\/storage\/v1/,
      "//storage/v1"
    );
  } catch {
    return url;
  }
}