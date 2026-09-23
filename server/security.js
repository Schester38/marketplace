import { q } from "./db.js";

// Origine canonique d'une URL + sa variante www/apex : le site est atteignable
// via `www.mboppishop.com` ET `mboppishop.com` — les deux doivent pouvoir se
// connecter (sans cela, POST depuis l'apex → 403 « Origine non autorisée »).
function originVariants(url) {
  try {
    const u = new URL(url);
    const out = [u.origin];
    const host = u.hostname;
    if (host.includes("localhost") || host.includes("127.0.0.1")) return out;
    if (host.startsWith("www.")) out.push(u.origin.replace("//www.", "//"));
    else out.push(`${u.protocol}//www.${host}${u.port ? `:${u.port}` : ""}`);
    return out;
  } catch {
    return []; // valeur non-URL (ignorée proprement)
  }
}

export const ALLOWED_ORIGINS = [
  ...new Set(
    [
      "http://localhost:5173",
      "http://localhost:4173",
      process.env.ALLOWED_ORIGIN,
      // Domaine public (SITE_URL / PUBLIC_URL définis sur Vercel) : la bascule vers
      // un domaine personnalisé ne demande donc aucune modification du code.
      process.env.SITE_URL,
      process.env.PUBLIC_URL,
      "https://www.mboppishop.com",
      // Ancien alias (redirection 301) : une page encore en cache là-bas doit
      // pouvoir finir ses appels API.
      "https://mboppi-mboppi.vercel.app",
      // iKeePay (webhook de confirmation de paiement, origine du tunnel en iframe)
      "https://ikeepay.com",
      "https://www.ikeepay.com",
    ]
      .filter(Boolean)
      .flatMap((o) => originVariants(o)),
  ),
];

const CSP =
  "default-src 'self' data: blob:; " +
  "script-src 'self' https://www.google.com https://www.gstatic.com https://widget.trustpilot.com https://cdn.trustpilot.net; " +
  "style-src 'self' 'unsafe-inline' https://widget.trustpilot.com https://cdn.trustpilot.net; " +
  "img-src 'self' data: blob: https:; " +
  "font-src 'self' data: https://cdn.trustpilot.net; " +
  "connect-src 'self' https://www.google.com https://www.gstatic.com https://widget.trustpilot.com https://cdn.trustpilot.net https://*.supabase.co; " +
  "frame-src 'self' https://www.google.com https://widget.trustpilot.com https://ikeepay.com https://www.ikeepay.com https://www.youtube.com https://www.youtube-nocookie.com; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self' https://www.google.com https://ikeepay.com https://www.ikeepay.com";

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", CSP);
  next();
}

export function originCheck(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (ALLOWED_ORIGINS.includes(origin)) return next();
  return res.status(403).json({ error: "Origine non autorisée" });
}

export function logAudit(userId, action, detail, ip) {
  // L'admin « virtuel » (id 0) n'existe pas dans users : on enregistre l'action
  // avec user_id NULL (colonne nullable) au lieu de perdre la trace d'audit
  // par violation de clé étrangère.
  const uid = Number(userId);
  return q("INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1, $2, $3, $4)", [
    Number.isInteger(uid) && uid > 0 ? uid : null,
    action,
    detail || null,
    ip || null,
  ]).catch(() => {});
}
