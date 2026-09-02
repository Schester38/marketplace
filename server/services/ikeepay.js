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
    // Table absente (initDb pas encore abouti) → on la crée puis on relit.
    if (isMissingRelation(err)) {
      try {
        await ensurePlatformSettingsTable();
        const row = (
          await q("SELECT value FROM platform_settings WHERE key = $1", [key])
        )[0];
        return row && row.value != null ? String(row.value) : fallback;
      } catch (err2) {
        console.error("[ikeepay] lecture setting impossible (après création) :", err2.message);
        return fallback;
      }
    }
    console.error("[ikeepay] lecture setting impossible :", err.message);
    return fallback;
  }
}

export async function setSetting(key, value) {
  // Auto-réparation : garantit que la table existe avant l'écriture, même si
  // initDb() n'a pas (encore) créé la table en production.
  await ensurePlatformSettingsTable();
  await q(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value == null ? "" : value)]
  );
}

const SETTINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

async function ensurePlatformSettingsTable() {
  await q(SETTINGS_TABLE_SQL);
}

function isMissingRelation(err) {
  return Boolean(
    err && (err.code === "42P01" || /relation .* does not exist/i.test(err.message || ""))
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
// Premier champ non vide parmi la liste (tolère les différentes signatures
// utilisées par iKeePay : order_id, external_reference, reference, ikeepay_ref…).
function firstString(...values) {
  for (const v of values) {
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// Cherche une référence dans plusieurs objets (racine, data, data.data…) et
// une liste large de noms de champs — iKeePay n'utilise pas toujours order_id.
function pickReference(...objects) {
  const KEYS = [
    "order_id", "orderId", "external_reference", "reference", "reference_number",
    "transaction_id", "payment_reference", "merchant_reference", "callback_ref", "ref",
  ];
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;
    for (const k of KEYS) {
      const v = obj[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

// Normalise les deux formats de webhook documentés vers un objet unique.
// Le champ de référence, le montant et la devise peuvent être au niveau racine,
// dans `data`, ou dans `data.data` — on cherche partout pour être robuste aux
// variations réelles d'iKeePay (ex. payment.success sans order_id racine).
export function normalizeWebhook(body) {
  if (!body || typeof body !== "object") return null;
  const event = String(body.event || "").toLowerCase();
  const d = body && typeof body.data === "object" ? body.data : {};
  const dd = d && typeof d.data === "object" ? d.data : {};

  if (event === "payment.success") {
    const status = String(body.status || d.status || dd.status || "completed").toLowerCase();
    if (status !== "completed" && status !== "success") return null;
    return {
      orderId: pickReference(body, d, dd),
      amount: Number(
        body.amount != null ? body.amount : d.amount != null ? d.amount : dd.amount
      ),
      currency: String(body.currency || d.currency || dd.currency || ""),
      providerRef: firstString(
        body.ikeepay_ref,
        body.provider_reference,
        d.ikeepay_ref,
        d.provider_reference,
        dd.ikeepay_ref,
        dd.provider_reference,
        pickReference(d, dd)
      ),
    };
  }
  if (event === "transaction.updated" || event === "transaction.created") {
    // Le type peut être « payin » en minuscules ou majuscules, voire « PAYIN ».
    const type = String(d.type || dd.type || "").toLowerCase().trim();
    if (!type || type !== "payin") return null;
    const status = String(d.status || dd.status || "").toLowerCase();
    if (status !== "completed" && status !== "success") return null;
    return {
      orderId: pickReference(d, dd),
      amount: Number(d.amount != null ? d.amount : dd.amount),
      currency: String(d.currency || dd.currency || ""),
      providerRef: firstString(
        d.provider_reference,
        d.ikeepay_ref,
        dd.provider_reference,
        dd.ikeepay_ref
      ),
    };
  }
  return null;
}

function currencyMatches(actual, expected) {
  // Si le webhook n'envoie pas de devise (champ absent), on ne bloque pas :
  // la confirmation reste protégée par la référence + le montant.
  if (!actual) return true;
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

// Journalise chaque webhook reçu (table payment_webhook_logs, déjà créée par
// initDb) pour permettre le diagnostic (le don resté « en attente » sans trace).
async function logWebhook({ body, normalized, result }) {
  try {
    await q(
      `INSERT INTO payment_webhook_logs
         (provider, provider_transaction_id, provider_order_id, event, payload, status, handled, error)
       VALUES ('ikeepay', $1, $2, $3, $4, $5, $6, $7)`,
      [
        normalized && normalized.providerRef ? normalized.providerRef : null,
        normalized && normalized.orderId ? normalized.orderId : null,
        body && body.event ? String(body.event) : null,
        JSON.stringify(body || {}),
        result && result.ok ? "handled" : result && result.reason ? `rejected:${result.reason}` : "received",
        Boolean(result && result.ok),
        result && result.reason ? String(result.reason) : null,
      ]
    );
  } catch (err) {
    console.error("[ikeepay] logWebhook impossible :", err.message);
  }
}

// Point d'entrée du webhook iKeePay. Toujours répondre 200 une fois le payload
// reconnu, même si la référence est inconnue (éviter les retries inutiles).
export async function processWebhook(body) {
  const normalized = normalizeWebhook(body);
  let result;
  if (!normalized) {
    result = { ok: false, reason: "unsupported" };
    await logWebhook({ body, normalized: null, result });
    return result;
  }
  const { orderId, amount, currency, providerRef } = normalized;
  if (!orderId) {
    result = { ok: false, reason: "missing_reference" };
    await logWebhook({ body, normalized, result });
    return result;
  }

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
      result = { ok: false, reason: "mismatch" };
      await logWebhook({ body, normalized, result });
      return result;
    }
    if (membership.status === "pending") {
      await completeMembershipPayment(membership, providerRef);
    }
    result = { ok: true, kind: "membership", id: membership.id };
    await logWebhook({ body, normalized, result });
    return result;
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
      result = { ok: false, reason: "mismatch" };
      await logWebhook({ body, normalized, result });
      return result;
    }
    if (donation.status === "pending") {
      await completeDonation(donation, providerRef);
    }
    result = { ok: true, kind: "donation", id: donation.id };
    await logWebhook({ body, normalized, result });
    return result;
  }

  // Réconciliation par montant : iKeePay peut envoyer une référence que nous ne
  // reconnaissons pas. On tente alors de retrouver une adhésion/don « pending »
  // récent (dernières 30 min) du même montant — couvre les légères variations
  // de format de référence.
  if (amount > 0) {
    const recentMembership = (
      await q(
        `SELECT id, user_id, amount, currency, status FROM membership_payments
         WHERE status = 'pending' AND amount = $1 AND created_at >= now() - interval '30 minutes'
         ORDER BY created_at DESC LIMIT 1`,
        [amount]
      )
    )[0];
    if (recentMembership) {
      if (!currencyMatches(currency, recentMembership.currency)) {
        result = { ok: false, reason: "mismatch" };
        await logWebhook({ body, normalized, result });
        return result;
      }
      await completeMembershipPayment(recentMembership, providerRef);
      result = { ok: true, kind: "membership", id: recentMembership.id, reconciled: true };
      await logWebhook({ body, normalized, result });
      return result;
    }
    const recentDonation = (
      await q(
        `SELECT id, amount, currency, status FROM donations
         WHERE status = 'pending' AND amount = $1 AND created_at >= now() - interval '30 minutes'
         ORDER BY created_at DESC LIMIT 1`,
        [amount]
      )
    )[0];
    if (recentDonation) {
      if (!currencyMatches(currency, recentDonation.currency)) {
        result = { ok: false, reason: "mismatch" };
        await logWebhook({ body, normalized, result });
        return result;
      }
      await completeDonation(recentDonation, providerRef);
      result = { ok: true, kind: "donation", id: recentDonation.id, reconciled: true };
      await logWebhook({ body, normalized, result });
      return result;
    }
  }

  // Référence inconnue : on ignore proprement.
  result = { ok: false, reason: "unknown_reference" };
  await logWebhook({ body, normalized, result });
  return result;
}

// Purge les paiements (dons / adhésions) restés « en attente » depuis plus de
// 30 minutes : ils ne seront jamais confirmés (transaction abandonnée ou
// webhook perdu). Exécutée au chargement de la liste admin des paiements.
const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

export async function purgePendingPayments() {
  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString();
  const [donations, memberships] = await Promise.all([
    q(
      `DELETE FROM donations WHERE status = 'pending' AND created_at < $1 RETURNING id`,
      [cutoff]
    ),
    q(
      `DELETE FROM membership_payments WHERE status = 'pending' AND created_at < $1 RETURNING id`,
      [cutoff]
    ),
  ]);
  return { donations: donations.length, memberships: memberships.length };
}

export { MEMBERSHIP_FEES };

