import crypto from "crypto";

/**
 * Sécurité des paiements iKeePay.
 *
 * — Comparaison sécurisée (temps constant, insensible aux longueurs).
 * — Vérification d'authenticité du webhook ENTRANT (fail-closed).
 * — Validation montant / devise d'un webhook.
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
 * FAIT CONFIRMÉ : iKeePay ne fournit AUCUN secret / signature sur les callbacks
 * entrants. Il n'existe donc pas de mécanisme d'authentification fiable → le
 * webhook est VOLONTAIREMENT INACTIF (fail-closed). On ne réutilise JAMAIS
 * `IKEEPAY_API_KEY` (clé des appels SORTANTS) comme secret entrant.
 *
 * Conséquence : `verifyIkeepayWebhook` retourne toujours { ok: false } ; chaque
 * webhook reçu est journalisé (`payment_webhook_logs.authenticated=false`) puis
 * rejeté en 401 sans aucun traitement ni payout. La confirmation de paiement
 * se fait EXCLUSIVEMENT via `/ikeepay/confirm` (JWT propriétaire pour
 * vente/adhésion ; `confirm_token` lié à la transaction pour les dons).
 *
 * La structure ci-dessous préserve la possibilité d'activer une vérification
 * SI un jour iKeePay documente un mécanisme réel — mais tant que ce n'est pas
 * le cas, rien n'est jamais traité.
 *
 * @param {object} req requête Express (req.headers['x-api-key'])
 * @returns {{ok:boolean, reason?:'ok'|'missing_auth'|'invalid_auth'|'no_mechanism'}}
 */
export function verifyIkeepayWebhook(req) {
  // iKeePay ne fournit aucun secret webhook (fait confirmé) → aucune variable
  // n'est utilisée. On garde un point de branchement explicite pour l'avenir,
  // mais par défaut le webhook est toujours refusé.
  const secret = process.env.IKEEPAY_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, reason: "no_mechanism" };
  }
  const key = req?.headers?.["x-api-key"];
  if (!key) {
    return { ok: false, reason: "missing_auth" };
  }
  if (!safeEqual(key, secret)) {
    return { ok: false, reason: "invalid_auth" };
  }
  return { ok: true, reason: "ok" };
}

/**
 * Valide le montant et la devise d'un événement webhook payin contre les
 * valeurs attendues côté serveur. Ne fait JAMAIS confiance au payload entrant
 * comme source de vérité.
 * @param {{amount:number, currency?:string}} data
 * @param {{expectedAmount:number, expectedCurrency?:string}} expected
 * @returns {{ok:boolean, reason?:'amount_mismatch'|'currency_mismatch'}}
 */
export function validateWebhookAmount(data, { expectedAmount, expectedCurrency }) {
  const amount = Number(data?.amount);
  if (!Number.isFinite(amount) || Math.abs(amount - expectedAmount) > 0.01) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if (expectedCurrency && String(data?.currency || "") !== String(expectedCurrency)) {
    return { ok: false, reason: "currency_mismatch" };
  }
  return { ok: true };
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
    // Don avec propriétaire : seul le propriétaire (JWT) peut confirmer.
    if (record.user_id) {
      if (!user) return { ok: false, code: 401, error: "Authentification requise" };
      if (Number(record.user_id) !== Number(user.id))
        return { ok: false, code: 403, error: "Ce don ne vous appartient pas" };
      return { ok: true };
    }
    // Don anonyme : protégé par un jeton secret lié à CETTE transaction
    // (généré par le serveur, comparé en temps constant). Aucun utilisateur
    // connecté quelconque ne peut confirmer un don anonyme.
    if (!record.confirm_token || !safeEqual(token, record.confirm_token)) {
      return { ok: false, code: 401, error: "Confirmation non autorisée" };
    }
    return { ok: true };
  }
  if (kind === "membership") {
    // Adhésion : seul son propriétaire (JWT) peut confirmer.
    if (!user) return { ok: false, code: 401, error: "Authentification requise" };
    if (Number(record.user_id) !== Number(user.id))
      return { ok: false, code: 403, error: "Cette adhésion ne vous appartient pas" };
    return { ok: true };
  }
  if (kind === "sale") {
    // Vente : l'acheteur (JWT) ou un livreur (JWT) peut confirmer.
    if (!user) return { ok: false, code: 401, error: "Authentification requise" };
    const isBuyer = record.buyer_id && Number(record.buyer_id) === Number(user.id);
    const isLivreur = user.role === "livreur";
    if (!isBuyer && !isLivreur)
      return { ok: false, code: 403, error: "Cette vente ne vous appartient pas" };
    return { ok: true };
  }
  return { ok: false, code: 403, error: "Accès refusé" };
}
