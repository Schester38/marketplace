// Commandes FamiliCash — stockage des achats de licence (PostgreSQL).
// ----------------------------------------------------------------------------
// Pourquoi la base et pas un fichier : le relais tourne sur Vercel, où chaque
// requête peut s'exécuter dans une instance différente, sans disque partagé et
// sans verrou de fichier (LOCK_EX). Deux instances qui créent une commande en
// même temps doivent être arbitrées par la base — c'est le rôle des index
// uniques ci-dessous, et non d'un compteur applicatif.
//
// Doctrine de sécurité (identique au reste de la plateforme) :
//   — le PRIX vient toujours de ce module, jamais du client : une application
//     modifiée qui envoie « amount: 1 » n'obtient pas une licence annuelle ;
//   — le webhook iKeePay est un DÉCLENCHEUR, jamais une preuve : il est
//     authentifié par le jeton secret, puis confronté à la commande en base
//     (référence inconnue de nous + montant exact + devise) ;
//   — la confirmation est IDEMPOTENTE : rejouer le même webhook ne prolonge pas
//     deux fois une licence (le paiement complet est reconnu et renvoyé tel
//     quel) ;
//   — un RENOUVELLEMENT part de la date d'expiration existante si elle est
//     encore future : payer deux fois d'avance cumule les périodes au lieu de
//     perdre les jours restants.
import { q } from "../db.js";
import { issueLicense } from "./fcLicense.js";

// Catalogue des offres — SOURCE DE VÉRITÉ unique des prix et des durées.
export const FC_PLANS = {
  m: { code: "m", label: "Mensuel", amount: 1500, days: 30 },
  y: { code: "y", label: "Annuel", amount: 15000, days: 365 },
};

export const FC_CURRENCY = "XAF";
// Le franc CFA a une parité fixe 1:1 ; iKeePay documente XOF et la plateforme
// encaisse en XAF — les deux sont acceptés, comme pour les adhésions.
const FC_CURRENCIES = new Set(["XAF", "XOF"]);

// Identifiant local du foyer, fabriqué par l'application (aucune inscription
// requise, donc aucun compte à créer pour acheter). Alphabet sans caractères
// ambigus (ni 0/O, ni 1/I/L) : il sera lu à voix haute et recopié à la main.
export const FC_HOUSEHOLD_RE =
  /^FC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

// Préfixe des références de commande (genExternalRef("MBP-FC") dans la route) :
// il permet au webhook iKeePay de router le paiement vers ce module.
const FC_REFERENCE_RE = /^MBP-FC-[A-Z0-9]{6,}$/;

// Réutilisation d'une commande en attente : l'utilisateur qui revient sur
// l'écran de paiement (ou qui relance l'application) ne crée pas une seconde
// commande — il retrouve la même URL de checkout pendant ce délai.
const PENDING_REUSE_MINUTES = 15;

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS familicash_orders (
    id BIGSERIAL PRIMARY KEY,
    household_id TEXT NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('m', 'y')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'XAF',
    external_reference TEXT NOT NULL UNIQUE,
    provider_reference TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    license TEXT,
    license_expires_at TIMESTAMPTZ,
    email TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_familicash_orders_household
    ON familicash_orders(household_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_familicash_orders_expires
    ON familicash_orders(license_expires_at DESC) WHERE license_expires_at IS NOT NULL;
`;

let tableReady = null;

// Création défensive de la table : initDb() la crée en production, mais une
// instance qui démarre avant la fin des migrations ne doit pas répondre 500.
// La promesse est mémorisée (une seule interrogation par instance) et remise à
// zéro en cas d'échec pour qu'un appel suivant puisse réessayer.
export async function ensureFcTable() {
  if (!tableReady) {
    tableReady = q(TABLE_SQL)
      .then(async () => {
        // Unicité de la commande EN ATTENTE par foyer et par offre : deux
        // requêtes « payer » simultanées ne peuvent pas créer deux commandes.
        await q(
          `CREATE UNIQUE INDEX IF NOT EXISTS ux_familicash_orders_pending
             ON familicash_orders(household_id, plan) WHERE status = 'pending'`
        );
      })
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

export function normalizeHouseholdId(raw) {
  return String(raw == null ? "" : raw)
    .trim()
    .toUpperCase();
}

export function planOf(code) {
  return (
    FC_PLANS[
      String(code == null ? "" : code)
        .trim()
        .toLowerCase()
    ] || null
  );
}

export function isFcReference(raw) {
  return FC_REFERENCE_RE.test(
    String(raw == null ? "" : raw)
      .trim()
      .toUpperCase()
  );
}

// Comparaison de montants : pg renvoie les NUMERIC en chaîne, d'où le passage
// par Number() des deux côtés.
export function amountMatchesFc(given, expected) {
  const a = Number(given);
  const b = Number(expected);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.01;
}

export function currencyMatchesFc(given) {
  return FC_CURRENCIES.has(
    String(given == null ? "" : given)
      .trim()
      .toUpperCase()
  );
}

// Date de départ d'une nouvelle période : l'expiration existante si elle est
// encore future (les jours déjà payés ne sont jamais perdus — payer deux fois
// d'avance cumule les périodes), sinon maintenant.
export function renewalBase(previousExpiry, now = new Date()) {
  const previous = previousExpiry ? new Date(previousExpiry) : null;
  if (previous && !Number.isNaN(previous.getTime()) && previous.getTime() > now.getTime()) {
    return previous;
  }
  return now;
}

// Fin de période : jours calendaires ajoutés à la date de départ.
export function expiryAfter(base, days) {
  return new Date(new Date(base).getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

function isUniqueViolation(err) {
  return Boolean(err && err.code === "23505");
}

const ORDER_COLUMNS = `id, household_id, plan, amount, currency, external_reference,
  provider_reference, status, license, license_expires_at, email, created_at, completed_at`;

// Vue publique d'une commande : jamais la ligne brute (NUMERIC arrive en chaîne
// depuis pg, et rien n'oblige à exposer email/provider_reference au client).
export function orderView(row) {
  return {
    reference: row.external_reference,
    household_id: row.household_id,
    plan: row.plan,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    license: row.license || null,
    expires_at: row.license_expires_at ? new Date(row.license_expires_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

async function findReusableOrder({ householdId, plan }) {
  // Le délai est une constante du module (jamais une entrée client) : il est
  // donc sûr de l'interpoler, faute de paramètre typé pour un intervalle.
  const row = (
    await q(
      `SELECT ${ORDER_COLUMNS} FROM familicash_orders
        WHERE household_id = $1 AND plan = $2 AND status = 'pending'
          AND created_at > now() - interval '${PENDING_REUSE_MINUTES} minutes'
        ORDER BY created_at DESC LIMIT 1`,
      [householdId, plan]
    )
  )[0];
  return row ? orderView(row) : null;
}

// Crée (ou retrouve) la commande à payer. Le montant n'est JAMAIS un paramètre :
// il est lu dans FC_PLANS à partir du seul code d'offre fourni par le client.
export async function createFcOrder({ householdId, plan, reference, email }) {
  const id = normalizeHouseholdId(householdId);
  const offer = planOf(plan);
  if (!FC_HOUSEHOLD_RE.test(id)) return { ok: false, reason: "invalid_household" };
  if (!offer) return { ok: false, reason: "invalid_plan" };
  await ensureFcTable();

  const existing = await findReusableOrder({ householdId: id, plan: offer.code });
  if (existing) return { ok: true, reused: true, order: existing };

  try {
    const row = (
      await q(
        `INSERT INTO familicash_orders
           (household_id, plan, amount, currency, external_reference, status, email)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         RETURNING ${ORDER_COLUMNS}`,
        [id, offer.code, offer.amount, FC_CURRENCY, reference, email || null]
      )
    )[0];
    return { ok: true, reused: false, order: orderView(row) };
  } catch (err) {
    // Deux « payer » simultanés : l'index unique partiel a désigné un vainqueur,
    // le perdant récupère cette commande au lieu d'échouer.
    if (isUniqueViolation(err)) {
      const again = await findReusableOrder({ householdId: id, plan: offer.code });
      if (again) return { ok: true, reused: true, order: again };
    }
    throw err;
  }
}

export async function getOrderByReference(reference) {
  const ref = String(reference == null ? "" : reference)
    .trim()
    .toUpperCase();
  if (!isFcReference(ref)) return null;
  await ensureFcTable();
  const row = (
    await q(`SELECT ${ORDER_COLUMNS} FROM familicash_orders WHERE external_reference = $1`, [ref])
  )[0];
  return row ? orderView(row) : null;
}

// État d'une commande pour l'application qui interroge le relais après le
// paiement : la référence (aléatoire) ET l'identifiant de foyer doivent
// correspondre — connaître un identifiant de foyer ne suffit pas à lire la
// licence d'un autre.
export async function getOrderState({ householdId, reference }) {
  const id = normalizeHouseholdId(householdId);
  const ref = String(reference == null ? "" : reference)
    .trim()
    .toUpperCase();
  if (!FC_HOUSEHOLD_RE.test(id) || !isFcReference(ref)) {
    return { ok: false, reason: "invalid_request" };
  }
  await ensureFcTable();
  const row = (
    await q(
      `SELECT ${ORDER_COLUMNS} FROM familicash_orders
        WHERE external_reference = $1 AND household_id = $2`,
      [ref, id]
    )
  )[0];
  if (!row) return { ok: false, reason: "unknown_order" };
  return { ok: true, order: orderView(row) };
}

// Confirme un paiement et délivre la licence. Appelée uniquement par le
// webhook iKeePay (authentifié par jeton) et par l'action d'exploitation
// « webhook » du relais — jamais directement par l'application.
export async function confirmFcOrderPayment({ reference, amount, currency, providerRef }) {
  const ref = String(reference == null ? "" : reference)
    .trim()
    .toUpperCase();
  if (!isFcReference(ref)) return { ok: false, reason: "unknown_reference" };
  await ensureFcTable();

  const row = (
    await q(`SELECT ${ORDER_COLUMNS} FROM familicash_orders WHERE external_reference = $1`, [ref])
  )[0];
  if (!row) return { ok: false, reason: "unknown_reference" };
  if (!amountMatchesFc(amount, row.amount)) return { ok: false, reason: "amount_mismatch" };
  if (!currencyMatchesFc(currency) || !currencyMatchesFc(row.currency)) {
    return { ok: false, reason: "currency_mismatch" };
  }

  // Idempotence : un webhook rejoué (iKeePay réessaie tant qu'il n'a pas de 200)
  // ne doit ni prolonger deux fois la licence ni en émettre une seconde.
  if (row.status === "completed" && row.license) {
    return {
      ok: true,
      duplicate: true,
      kind: "familicash",
      household_id: row.household_id,
      expiry: row.license_expires_at ? new Date(row.license_expires_at).toISOString() : null,
      license: row.license,
    };
  }

  // Renouvellement : on repart de l'expiration la plus lointaine déjà payée si
  // elle est encore future (les jours restants ne sont pas perdus).
  const previous = (
    await q(
      `SELECT license_expires_at FROM familicash_orders
        WHERE household_id = $1 AND status = 'completed' AND license_expires_at IS NOT NULL
        ORDER BY license_expires_at DESC LIMIT 1`,
      [row.household_id]
    )
  )[0];
  const now = new Date();
  const previousExpiry = previous ? new Date(previous.license_expires_at) : null;
  const base = renewalBase(previousExpiry, now);
  const renewed = base.getTime() > now.getTime();
  const offer = FC_PLANS[row.plan];
  const expiresAt = expiryAfter(base, offer.days);

  const { token } = await issueLicense({
    householdId: row.household_id,
    plan: row.plan,
    expiresAt,
    reference: ref,
  });

  // La garde « status <> 'completed' » rend la confirmation atomique : si une
  // autre instance a traité le même paiement entre-temps, la mise à jour ne
  // touche aucune ligne et on renvoie SA licence (jamais deux licences).
  const updated = (
    await q(
      `UPDATE familicash_orders
          SET status = 'completed', provider_reference = COALESCE($2, provider_reference),
              license = $3, license_expires_at = $4, completed_at = now(), error = NULL
        WHERE external_reference = $1 AND status <> 'completed'
      RETURNING ${ORDER_COLUMNS}`,
      [ref, providerRef || null, token, expiresAt.toISOString()]
    )
  )[0];

  if (!updated) {
    const current = await getOrderByReference(ref);
    if (current && current.license) {
      return {
        ok: true,
        duplicate: true,
        kind: "familicash",
        household_id: current.household_id,
        expiry: current.expires_at,
        license: current.license,
      };
    }
    return { ok: false, reason: "confirm_failed" };
  }

  return {
    ok: true,
    kind: "familicash",
    household_id: row.household_id,
    expiry: expiresAt.toISOString(),
    license: token,
    renewed,
  };
}

export async function getHouseholdLicense(householdId) {
  const id = normalizeHouseholdId(householdId);
  if (!FC_HOUSEHOLD_RE.test(id)) return { ok: false, reason: "invalid_household" };
  await ensureFcTable();
  const row = (
    await q(
      `SELECT household_id, plan, license, license_expires_at FROM familicash_orders
        WHERE household_id = $1 AND status = 'completed' AND license IS NOT NULL
        ORDER BY license_expires_at DESC LIMIT 1`,
      [id]
    )
  )[0];
  if (!row) return { ok: false, reason: "no_license" };
  return {
    ok: true,
    household_id: row.household_id,
    plan: row.plan,
    license: row.license,
    expires_at: row.license_expires_at ? new Date(row.license_expires_at).toISOString() : null,
  };
}
