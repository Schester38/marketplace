import jwt from "jsonwebtoken";
import { q } from "./db.js";

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("ERREUR: la variable JWT_SECRET (au moins 32 caractères) doit être définie.");
  process.exit(1);
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      verified: Boolean(user.verified),
      admin_approved: Boolean(user.admin_approved),
      membership_expires_at: user.membership_expires_at || null,
    },
    SECRET,
    { expiresIn: "24h" }
  );
}

// Comme authRequired, mais ne rejette jamais : si un Bearer token valide est
// présent, req.user est rempli, sinon la requête continue « non connectée ».
// Utilisé sur les routes publiques qui gèrent du contenu connecté (ex :
// /api/sales/livreur qui filtre les livraisons du livreur quand il est connecté).
export function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
  } catch {
    /* session invalide ou expirée : on considère l'utilisateur non connecté */
  }
  next();
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée" });
  }
}

export function roleRequired(...roles) {
  return async (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès réservé aux " + roles.join(" / ") });
    }
    if (["shop", "seller", "creator"].includes(req.user.role)) {
      const current = (
        await q("SELECT admin_approved, membership_expires_at FROM users WHERE id = $1", [
          req.user.id,
        ])
      )[0];
      if (
        current &&
        !current.admin_approved &&
        (!current.membership_expires_at || new Date(current.membership_expires_at) <= new Date())
      ) {
        return res.status(402).json({
          error: "Adhésion requise pour accéder à cet espace",
          code: "MEMBERSHIP_REQUIRED",
        });
      }
    }
    next();
  };
}

export const MEMBERSHIP_FEES = { shop: 2500, seller: 1500, creator: 2500 };
export const MEMBERSHIP_DAYS = 30;

export function membershipRequired(user) {
  return Boolean(user && MEMBERSHIP_FEES[user.role]);
}

export function membershipActive(user) {
  if (!membershipRequired(user) || user.admin_approved) return true;
  return Boolean(user.membership_expires_at && new Date(user.membership_expires_at) > new Date());
}
