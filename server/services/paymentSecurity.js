import crypto from "crypto";

/**
 * Sécurité des paiements iKeePay.
 *
 * — Comparaison sécurisée (temps constant, insensible aux longueurs).
 * — Vérification d'authenticité du webhook ENTRANT (fail-closed).
 * — Autorisation des confirmations client (/ikeepay/confirm) par type.
 */

/** Comparaison en temps constant, normalisée par SHA-256 (longueurs sûres). */
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hb = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Jeton aléatoire fort (32 octets, base64url). */
export function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Vérification d'authenticité d'un webhook iKeePay ENTRANT.
 *
 * ÉTAT : AUCUN mécanisme d'authentification entrant n'est documenté ni confirmé
 * par iKeePay. La documentation du dépôt (`intégration ikkepay/`) ne couvre
 * l'en-tête `x-api-key` que pour les appels H2H SORTANTS ; on ne réutilise donc
 * PAS `IKEEPAY_API_KEY` pour les callbacks entrants sans confirmation officielle.
 *
 * → FAIL-CLOSED : tout webhook est refusé (aucun traitement, aucun payout).
 * Le flux nominal continue via `/ikeepay/confirm` (authentifié par
 * utilisateur / jeton de transaction).
 * La réactivation exigera la confirmation du mécanisme réel (secret / signature)
 * puis l'implémentation de sa vérification ici.
 */
export function verifyIkeepayWebhookAuth() {
  return { ok: false, reason: "auth_unconfirmed_no_mechanism" };
}

/**
 * Autorise une confirmation de paiement côté client (/ikeepay/confirm).
 * @param {{kind:'donation'|'membership'|'sale', record:object, user:object|null, token:string|null}} p
 * @returns {{ok:boolean, code?:number, error?:string}}
 */
export function authorizeConfirm({ kind, record, user, token }) {
  if (!record) {
    return { ok: false, code: 404, error: "Aucun paiement en attente pour cette référence" };
  }
  if (kind === "donation") {
    // Don d'invité : protégé par un jeton secret lié à CETTE transaction.
    if (!record.confirm_token || !safeEqual(token, record.confirm_token)) {
      return { ok: false, code: 401, error: "Confirmation non autorisée" };
    }
    return { ok: true };
  }
  if (kind === "membership") {
    // Adhésion : seul son propriétaire (JWT) peut confirmer.
    if (!user || Number(record.user_id) !== Number(user.id)) {
      return { ok: false, code: 403, error: "Cette adhésion ne vous appartient pas" };
    }
    return { ok: true };
  }
  if (kind === "sale") {
    // Vente : l'acheteur (JWT) ou un livreur (JWT) peut confirmer.
    const isBuyer = user && record.buyer_id && Number(record.buyer_id) === Number(user.id);
    const isLivreur = user && user.role === "livreur";
    if (!isBuyer && !isLivreur) {
      return { ok: false, code: 403, error: "Cette vente ne vous appartient pas" };
    }
    return { ok: true };
  }
  return { ok: false, code: 403, error: "Accès refusé" };
}
