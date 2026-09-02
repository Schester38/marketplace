// Service iKeePay — PAIEMENTS (payin uniquement).
// Intégré pour la collecte automatique des adhésions et des dons. AUCUN payout :
// les versements vers vendeurs/parrains restent manuels.
//
// Flux retenu (doc iKeePay) :
//   1. Inline checkout : on génère l'URL https://ikeepay.com/checkout/v1/inline
//      avec la clé PUBLIQUE (la clé secrète ne quitte jamais le serveur). La
//      page affiche la transaction dans une iframe (messages postMessage
//      « ikeepay-ready / ikeepay-success / ikeepay-close »).
//   2. Webhook : dès confirmation, iKeePay POST un JSON sur notre URL de
//      notification. Deux structures documentées sont gérées :
//        { event: "payment.success", order_id, amount, currency, status, ikeepay_ref }
//        { event: "transaction.updated", data: { type, external_reference,
//          provider_reference, amount, currency, status, ... } }
//
// La confirmation est validée côté serveur (référence inconnue + montant + devise)
// puis applique les effets de bord (activation d'adhésion, notification du parrain,
// complétion du don) de manière idempotente.
import { q, withTransaction } from "../db.js";
import { randomBytes } from "node:crypto";
import { MEMBERSHIP_FEES } from "../fees.js";
import { notifyActivationReferralPaid } from "./activationReferral.js";

const IKEEPAY_CHECKOUT_URL = "https://ikeepay.com/checkout/v1/inline";
export const PAYMENT_MODE_MANUAL = "manual";
export const PAYMENT_MODE_AUTO = "auto";

// XAF (Cameroun) — iKeePay documente XOF ; franc CFA équivalent (parité 1:1),
// on accepte donc indifféremment les deux au webhook.
const FCFA_CURRENCIES = new Set(["XAF", "XOF"]);

async function getSetting(key, fallback = "") {
  try {
    const row = (
      await q("SELECT value FROM platform_settings WHERE key = $1", [key])
    )[0];
    return row && row.value != null ? String(row.value) : fallback;
  } catch (err) {
    console.error("[ikeepay] lecture setting impossible :", err.message);
    return fallback;
  }
}

async function setSetting(key, value) {
  await q(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value == null ? "" : value)]
  );
}

// Mode de paiement actif : "manual" (défaut) | "auto".
export async function getPaymentMode() {
  const mode = await getSetting("payment_mode", PAYMENT_MODE_MANUAL);
  return mode === PAYMENT_MODE_AUTO ? PAYMENT_MODE_AUTO : PAYMENT_MODE_MANUAL;
}

export async function setPaymentMode(mode) {
  const clean =
    mode === PAYMENT_MODE_AUTO ? PAYMENT_MODE_AUTO : PAYMENT_MODE_MANUAL;
  await setSetting("payment_mode", clean);
  return clean;
}

export async function getIkeepayKeys() {
  const [publicKey, secretKey] = await Promise.all([
    getSetting("ikeepay_public_key"),
    getSetting("ikeepay_secret_key"),
  ]);
  return { publicKey, secretKey };
}

export async function isIkeepayConfigured() {
  const { publicKey, secretKey } = await getIkeepayKeys();
  return Boolean(publicKey && secretKey);
}

// Retourne les infos publiques exposées au client (jamais la clé secrète).
export async function getPublicPaymentSettings() {
  const [mode, { publicKey }] = await Promise.all([
    getPaymentMode(),
    getIkeepayKeys(),
  ]);
  return {
    mode,
    currency: "XAF",
    ikeepay_configured: Boolean(publicKey),
  };
}

// NOTE : on ne passe que la clé publique au checkout ; la clé secrète reste
// serveur (la confirmation est vérifiée par webhook, pas par le client).
export function buildInlineCheckoutUrl({ amount, currency = "XAF", orderId, email = "" }) {
  const url = new URL(IKEEPAY_CHECKOUT_URL);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("currency", currency);
  url.searchParams.set("order_id", orderId);
  if (email) url.searchParams.set("email", email);
  return url;
}

export function addPublicKey(url, publicKey) {
  const u = new URL(url);
  u.searchParams.set("pk", publicKey);
  return u.toString();
}

export function genExternalRef(prefix) {
  const rand = randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
}
// Normalise les deux formats de webhook documentés vers un objet unique.
// Retourne null si le payload n'est pas un événement exploitable.
export function normalizeWebhook(body) {
  if (!body || typeof body !== "object") return null;
  const event = String(body.event || "");
  if (event === "payment.success") {
    const status = String(body.status || "completed").toLowerCase();
    if (status !== "completed" && status !== "success") return null;
    return {
      orderId: String(body.order_id || ""),
      amount: Number(body.amount),
      currency: String(body.currency || ""),
      providerRef: String(body.ikeepay_ref || ""),
    };
  }
  if (event === "transaction.updated" || event === "transaction.created") {
    const d = body.data || {};
    if (String(d.type || "") !== "payin") return null;
    const status = String(d.status || "").toLowerCase();
    if (status !== "completed") return null;
    return {
      orderId: String(d.external_reference || ""),
      amount: Number(d.amount),
      currency: String(d.currency || ""),
      providerRef: String(d.provider_reference || ""),
    };
  }
  return null;
}

function currencyMatches(actual, expected) {
  const a = String(actual || "").toUpperCase();
  const e = String(expected || "").toUpperCase();
  return a === e || (FCFA_CURRENCIES.has(a) && FCFA_CURRENCIES.has(e));
}

// Vérifie qu'un montant reçu correspond au montant attendu (tolérance 0).
function amountMatches(received, expected) {
  return Math.abs(Number(received) - Number(expected)) < 0.01;
}

// Marque une adhésion payée et active l'utilisateur. La notification au parrain
// est envoyée APRÈS le commit (une erreur de notif ne doit pas annuler
// l'activation de l'adhésion).
async function completeMembershipPayment(payment, providerRef) {
  let activated = null;
  await withTransaction(async (tx) => {
    const changed = await tx.query(
      `UPDATE membership_payments
       SET status = 'completed', completed_at = now(),
           provider_reference = COALESCE(provider_reference, $2)
       WHERE id = $1 AND status = 'pending'
       RETURNING user_id, amount, currency`,
      [payment.id, providerRef]
    );
    if (!changed.rows.length) return; // déjà traité (idempotent)
    const user = (
      await tx.query(
        `SELECT id, name, role, referred_by FROM users WHERE id = $1`,
        [changed.rows[0].user_id]
      )
    )[0];
    if (!user) return;
    // Activation immédiate : adhésion payée → accès sans intervention admin.
    await tx.query(
      `UPDATE users
       SET membership_paid_at = COALESCE(membership_paid_at, now()),
           admin_approved = TRUE,
           membership_expires_at = now() + interval '30 days'
       WHERE id = $1`,
      [user.id]
    );
    activated = user;
  });
  if (activated && activated.referred_by) {
    try {
      await notifyActivationReferralPaid({
        id: activated.id,
        name: activated.name,
        role: activated.role,
        referred_by: activated.referred_by,
      });
    } catch (err) {
      console.error("[ikeepay] notification parrain impossible :", err.message);
    }
  }
}

// Marque un don comme complété.
async function completeDonation(donation, providerRef) {
  await q(
    `UPDATE donations
     SET status = 'completed', completed_at = now(),
         provider_reference = COALESCE(provider_reference, $2)
     WHERE id = $1 AND status = 'pending'`,
    [donation.id, providerRef]
  );
}
// Point d'entrée du webhook iKeePay. Toujours répondre 200 une fois le payload
// reconnu, même si la référence est inconnue (éviter les retries inutiles).
export async function processWebhook(body) {
  const normalized = normalizeWebhook(body);
  if (!normalized) return { ok: false, reason: "unsupported" };
  const { orderId, amount, currency, providerRef } = normalized;
  if (!orderId) return { ok: false, reason: "missing_reference" };

  // Adhésion ?
  const membership = (
    await q(
      `SELECT id, user_id, amount, currency, status FROM membership_payments
       WHERE external_reference = $1`,
      [orderId]
    )
  )[0];
  if (membership) {
    if (!amountMatches(amount, membership.amount) || !currencyMatches(currency, membership.currency)) {
      return { ok: false, reason: "mismatch" };
    }
    if (membership.status === "pending") {
      await completeMembershipPayment(membership, providerRef);
    }
    return { ok: true, kind: "membership", id: membership.id };
  }

  // Don ?
  const donation = (
    await q(
      `SELECT id, amount, currency, status FROM donations WHERE external_reference = $1`,
      [orderId]
    )
  )[0];
  if (donation) {
    if (!amountMatches(amount, donation.amount) || !currencyMatches(currency, donation.currency)) {
      return { ok: false, reason: "mismatch" };
    }
    if (donation.status === "pending") {
      await completeDonation(donation, providerRef);
    }
    return { ok: true, kind: "donation", id: donation.id };
  }

  // Référence inconnue : on ignore proprement.
  return { ok: false, reason: "unknown_reference" };
}

export { MEMBERSHIP_FEES };

