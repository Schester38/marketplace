// Bascule « adhésion obligatoire » pilotée par l'admin (platform_settings :
// membership_gate). "seller" (défaut) = seuls les vendeurs paient, boutiques
// et créateurs accèdent gratuitement ; "all" = les trois rôles sont soumis à
// l'adhésion (30 jours). La valeur est chargée au démarrage de l'app depuis
// GET /api/payments/settings (setMembershipGate) ; le serveur reste l'autorité
// (402 MEMBERSHIP_REQUIRED) — ce module ne fait que synchroniser l'UI.
let GATE = "seller";

export function setMembershipGate(gate) {
  GATE = gate === "all" ? "all" : "seller";
}

export function getMembershipGate() {
  return GATE;
}

export function membershipActive(user) {
  if (!user) return false;
  // Le vendeur est toujours soumis à l'adhésion ; boutique et créateur
  // seulement quand l'admin a activé le blocage global.
  const gatedRoles = GATE === "all" ? ["seller", "shop", "creator"] : ["seller"];
  if (!gatedRoles.includes(user.role)) return true;
  // Compte approuvé sans date (régime antérieur au compte à rebours) :
  // accès maintenu jusqu'à la prochaine approbation/paiement.
  if (user.admin_approved && !user.membership_expires_at) return true;
  // Sinon : actif uniquement si l'adhésion est dans le futur → sinon
  // redirection vers /adhesion (Protected + événement membership-required).
  return Boolean(user.membership_expires_at && new Date(user.membership_expires_at) > new Date());
}
