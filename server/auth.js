import jwt from "jsonwebtoken";
import { q } from "./db.js";
import { MEMBERSHIP_FEES, MEMBERSHIP_DAYS } from "./fees.js";
import { membershipRoles } from "./services/membershipGate.js";

export { MEMBERSHIP_FEES, MEMBERSHIP_DAYS };

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

export function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), SECRET);
    } catch {
      // token invalide → on continue sans user
    }
  }
  next();
}

export function roleRequired(...roles) {
  return async (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès réservé aux " + roles.join(" / ") });
    }
    // Adhésion : le vendeur y est toujours soumis ; boutiques et créateurs
    // seulement quand l'admin a activé le blocage global (bascule
    // « membership_gate » dans le panneau — défaut : accès gratuit). Le
    // contrôle est basé sur la DATE D'EXPIRATION (posée à now() + 30 jours à
    // chaque paiement en ligne ou approbation admin). Expirée ou absente
    // → 402, le client redirige vers la page d'adhésion (/adhesion).
    const gatedRoles = await membershipRoles();
    if (gatedRoles.includes(req.user.role)) {
      const current = (
        await q("SELECT admin_approved, membership_expires_at FROM users WHERE id = $1", [
          req.user.id,
        ])
      )[0];
      const expires = current?.membership_expires_at
        ? new Date(current.membership_expires_at)
        : null;
      // Compte approuvé sans date (régime antérieur au compte à rebours) :
      // accès maintenu jusqu'à la prochaine approbation/paiement.
      const active = expires
        ? expires.getTime() > Date.now()
        : Boolean(current && current.admin_approved);
      if (!active) {
        return res.status(402).json({
          error: "Adhésion requise pour accéder à cet espace",
          code: "MEMBERSHIP_REQUIRED",
        });
      }
    }
    next();
  };
}

// MEMBERSHIP_FEES / MEMBERSHIP_DAYS sont définis dans server/fees.js et
// re-exportés ici pour la rétrocompatibilité des imports existants.

export function membershipRequired(user) {
  return Boolean(user && MEMBERSHIP_FEES[user.role]);
}

export function membershipActive(user) {
  if (!membershipRequired(user)) return true;
  // Compte approuvé sans date (régime antérieur au compte à rebours) :
  // accès maintenu jusqu'à la prochaine approbation/paiement.
  if (user.admin_approved && !user.membership_expires_at) return true;
  // Sinon : actif uniquement si l'adhésion (30 jours) est dans le futur.
  return Boolean(user.membership_expires_at && new Date(user.membership_expires_at) > new Date());
}
