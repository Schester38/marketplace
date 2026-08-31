import { q } from "../db.js";
import {
  countryCode,
  currencyForCountry,
  normalizePhone,
  payout,
  providerStatus,
} from "../ikeepay.js";
import { sendPush } from "../push.js";

// Frais prélevés sur chaque reversement SORTANT Ikeepay :
// le bénéficiaire reçoit 90 % du montant (règle Mboppi : entrée 100 %, sortie 90 %).
const IKEEPAY_FEE_RATE = 0.1;

const OPERATOR_MAP = [
  ["orange", "ORANGE"],
  ["mtn", "MTN"],
  ["wave", "WAVE"],
  ["moov", "MOOV"],
  ["free", "FREE"],
  ["airtel", "AIRTEL"],
  ["vodacom", "VODACOM"],
  ["mpesa", "VODACOM"],
  ["m-pesa", "VODACOM"],
  ["mobicash", "MOBICASH"],
  ["tigo", "TIGO"],
  ["halopesa", "HALOPESA"],
  ["zamtel", "ZAMTEL"],
  ["opay", "OPAY"],
  ["moniepoint", "MONIEPOINT"],
];

export function paymentTarget(methods, country) {
  const list = Array.isArray(methods?.wallets) ? methods.wallets : [];
  // Sélection du moyen de paiement PRINCIPAL :
  //  1. le wallet marqué `primary: true` s'il est valide (nom + valeur) et
  //     correspond à un opérateur connu ;
  //  2. sinon le premier wallet valide (rétrocompatibilité avec les données
  //     déjà enregistrées avant l'introduction de `primary`).
  const byPrimary = list.find((item) => item?.primary === true && item?.value && item?.name);
  const wallet = byPrimary || list.find((item) => item?.value && item?.name);
  if (!wallet) return null;
  const name = String(wallet.name).trim().toLowerCase();
  const found = OPERATOR_MAP.find(([label]) => name.includes(label));
  if (!found) return null;
  return {
    operator: found[1],
    phoneNumber: normalizePhone(wallet.value, country),
    country: countryCode(country),
    currency: currencyForCountry(country),
  };
}

/**
 * Normalise une liste de moyens de paiement : garantit qu'AU PLUS UN wallet est
 * marqué `primary`. Si aucun n'est marqué, le premier wallet valide devient le
 * principal par défaut. Nettoie aussi les champs (name/value trimmés, primary
 * booléen). Rétrocompat : les anciens {name,value} sans primary restent valides.
 */
export function normalizeWalletPrimary(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((w) => ({
      name: String(w?.name || "").trim(),
      value: String(w?.value || "").trim(),
      primary: w?.primary === true,
    }))
    .filter((w) => w.name && w.value);
  const anyPrimary = cleaned.some((w) => w.primary);
  if (!anyPrimary && cleaned.length > 0) {
    cleaned[0].primary = true;
  }
  // Au plus un primary : garder uniquement le premier marqué.
  let seen = false;
  return cleaned.map((w) => {
    if (w.primary && seen) return { ...w, primary: false };
    if (w.primary) seen = true;
    return w;
  });
}

export async function methodsFor(userId, kind) {
  const table =
    kind === "shop"
      ? "shop_payment_methods"
      : kind === "livreur"
        ? "livreur_payment_methods"
        : kind === "creator"
          ? "shop_payment_methods"
          : "seller_payment_methods";
  const column =
    kind === "shop" || kind === "creator"
      ? "shop_id"
      : kind === "livreur"
        ? "livreur_id"
        : "seller_id";
  return (
    (await q(`SELECT full_name, wallets FROM ${table} WHERE ${column} = $1`, [userId]))[0] || null
  );
}

/**
 * Classe une erreur de payout iKeePay :
 *  - 'rejected' : échec EXPLICITE (le provider a répondu — refus 4xx / status failed)
 *  - 'unknown'  : résultat INCONNU (timeout, réseau, 5xx, réponse perdue)
 * Règle financière : UNKNOWN ≠ FAILED. Un résultat inconnu ne doit PAS être
 * traité comme un échec définitif (le transfert a pu être effectué) et ne doit
 * PAS déclencher de renvoi automatique.
 */
export function payoutErrorCategory(error) {
  const code = Number(error?.statusCode || 0);
  const message = String(error?.message || "").toLowerCase();
  if (code >= 400 && code < 500) return "rejected";
  if (code >= 500) return "unknown";
  if (message.includes("injoignable")) return "unknown";
  // Par prudence financière : toute autre erreur est considérée inconnue.
  return "unknown";
}

export async function providerPayout({ user, methods, amount, saleId, kind, reference }) {
  const target = paymentTarget(methods, user.country);
  if (!target || !target.country || !target.phoneNumber) {
    // GAP : jusqu'ici l'acteur était ignoré sans aucune trace ni notification :
    // il croyait recevoir l'argent mais n'avait aucun moyen de paiement valide.
    // On enregistre l'échec et on le notifie pour qu'il configure son opérateur.
    try {
      await q(
        `INSERT INTO automatic_payouts (external_reference, user_id, sale_id, kind, amount, currency, status, error, retryable, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7, TRUE, now()) ON CONFLICT (external_reference) DO NOTHING`,
        [
          reference,
          user.id,
          saleId || null,
          kind,
          amount,
          currencyForCountry(user.country),
          "Moyen de paiement automatique non configuré",
        ]
      );
      await sendPush(user.id, {
        type: "payout_method_missing",
        title: "Paiement non reçu",
        body: `Votre reversement de ${amount} ${currencyForCountry(user.country)} n'a pas pu être envoyé : configurez votre opérateur Mobile Money pour recevoir vos gains.`,
      });
    } catch (logError) {
      console.error("[payout] échec de traçage du moyen manquant :", logError.message);
    }
    return { ok: false, error: "Moyen de paiement automatique non configuré", retryable: true };
  }

  // Sortie = 90 % du montant : Ikeepay ne transfère que le net au bénéficiaire.
  const fee = Math.round(amount * IKEEPAY_FEE_RATE * 100) / 100;
  const netAmount = Math.round((amount - fee) * 100) / 100;

  // Réservation atomique : UN SEUL worker obtient la ligne.
  // INSERT ... ON CONFLICT (external_reference) DO NOTHING RETURNING id
  // → si aucune ligne n'est retournée, un autre processus possède déjà ce payout.
  const reserved = (
    await q(
      `INSERT INTO automatic_payouts (external_reference, user_id, sale_id, kind, amount, currency, fee, status, attempts, retryable, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', 1, TRUE, now())
       ON CONFLICT (external_reference) DO NOTHING RETURNING id`,
      [reference, user.id, saleId || null, kind, amount, target.currency, fee]
    )
  )[0];

  if (!reserved) {
    // Un autre worker a déjà la ligne (ou l'a eue avant). Lire son état.
    const existing = (
      await q("SELECT status FROM automatic_payouts WHERE external_reference = $1", [reference])
    )[0];
    if (!existing) return { ok: false, error: "Impossible de réserver le reversement" };
    if (existing.status === "completed") return { ok: true, already: true };
    if (existing.status === "processing" || existing.status === "pending")
      return { ok: true, pending: true, already: true };
    // failed / retryable : un autre worker est déjà en charge ; pas de double envoi.
    return { ok: false, retryable: existing.status === "failed", already: true };
  }

  // Nous avons gagné la réservation → envoyer le payout (logique centralisée).
  return executePayout({
    reference,
    amount,
    fee,
    netAmount,
    currency: target.currency,
    target,
    user,
  });
}

/**
 * Envoie réellement le payout iKeePay et met à jour le statut automatique.
 * Logique CENTRALISÉE partagée par providerPayout (premier envoi) et
 * retryPayout (renvoi contrôlé) — une seule source de vérité pour la gestion
 * des résultats (completed / failed / unknown).
 */
async function executePayout({ reference, amount, fee, netAmount, currency, target, user }) {
  try {
    const result = await payout({
      amount: netAmount,
      currency,
      country: target.country,
      phoneNumber: target.phoneNumber,
      operator: target.operator,
      external_reference: reference,
    });
    const status = providerStatus(result);
    if (status === "failed") {
      await q(
        "UPDATE automatic_payouts SET status = 'failed', error = $1, attempts = attempts + 1, retryable = TRUE, updated_at = now() WHERE external_reference = $2",
        ["Le prestataire a refusé le retrait", reference]
      );
      await sendPush(user.id, {
        type: "payout_failed",
        title: "Paiement échoué",
        body: `Le reversement de ${amount} ${currency} a échoué : le prestataire a refusé le retrait.`,
      });
      return { ok: false, error: "Le prestataire a refusé le retrait", retryable: true };
    }
    if (status !== "completed") {
      await q(
        "UPDATE automatic_payouts SET status = 'pending', provider_reference = $1, error = NULL, attempts = attempts + 1, updated_at = now() WHERE external_reference = $2",
        [result.provider_reference || result.data?.provider_reference || null, reference]
      );
      return { ok: true, pending: true, provider: result, amount, fee };
    }
    await completeAutomaticPayout(
      reference,
      result.provider_reference || result.data?.provider_reference || null
    );
    return { ok: true, provider: result, amount, fee };
  } catch (error) {
    const category = payoutErrorCategory(error);
    if (category === "unknown") {
      await q(
        "UPDATE automatic_payouts SET status = 'processing', error = $1, attempts = attempts + 1, retryable = FALSE, updated_at = now() WHERE external_reference = $2",
        ["payout_result_unknown", reference]
      );
      return { ok: false, error: "payout_result_unknown", pending: true, retryable: false };
    }
    await q(
      "UPDATE automatic_payouts SET status = 'failed', error = $1, attempts = attempts + 1, retryable = TRUE, updated_at = now() WHERE external_reference = $2",
      [error.message, reference]
    );
    await sendPush(user.id, {
      type: "payout_failed",
      title: "Paiement échoué",
      body: `Le reversement de ${amount} ${currency} a échoué : ${error.message}`,
    });
    return { ok: false, error: error.message, retryable: true };
  }
}

/**
 * Garde de résolution (pure, testable) — transitions autorisées pour sortir de
 * `processing` / `pending` / `failed`.
 *  - completed : autorisé tant que le payout n'est pas déjà completed
 *    (completeAutomaticPayout est idempotent : ledger créé UNE seule fois).
 *  - failed    : autorisé tant que le payout n'est pas déjà completed.
 */
export function resolveGuard(status, resolution) {
  if (status === "completed") return { ok: false, reason: "already_completed" };
  if (resolution === "completed" || resolution === "failed") return { ok: true };
  return { ok: false, reason: "invalid_resolution" };
}

/**
 * Garde de retry (pure, testable). RÈGLE FINANCIÈRE : le renvoi n'est autorisé
 * QUE depuis un échec EXPLICITE (`failed`). Depuis `processing`/`pending`
 * (résultat inconnu), il faut d'abord résoudre explicitement en `failed`
 * (resolvePayout) pour confirmer que le transfert n'a pas eu lieu — sinon on
 * risquerait un double transfert.
 */
export function retryGuard(status) {
  if (status === "failed") return { ok: true };
  if (status === "processing" || status === "pending")
    return { ok: false, reason: "must_resolve_failed_first" };
  return { ok: false, reason: "not_retryable" };
}

/**
 * Liste les reversements en attente / bloqués (admin) pour réconciliation.
 * @param {{status?:string[], olderThanMinutes?:number, limit?:number}} opts
 */
export async function listPendingPayouts({ status, olderThanMinutes = 0, limit = 100 } = {}) {
  const statuses = Array.isArray(status) && status.length
    ? status
    : ["processing", "pending", "failed"];
  const params = [];
  const where = [];
  where.push(`status = ANY($${params.length + 1}::text[])`);
  params.push(statuses);
  if (Number(olderThanMinutes) > 0) {
    where.push(`updated_at < now() - make_interval(mins => $${params.length + 1}::int)`);
    params.push(Number(olderThanMinutes));
  }
  const rows = await q(
    `SELECT p.*, u.name AS user_name, u.email AS user_email, u.country AS user_country
     FROM automatic_payouts p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.updated_at ASC
     LIMIT ${Math.min(Number(limit) || 100, 500)}`,
    params
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount), fee: Number(r.fee || 0) }));
}

/**
 * Résolution MANUELLE (admin) d'un reversement bloqué — permet de sortir de
 * `processing` / `pending` / `failed`.
 *  - resolution='completed' : le transfert a été vérifié effectué (dashboard
 *    iKeePay) → on finalise via completeAutomaticPayout (idempotent).
 *  - resolution='failed'    : le transfert a été vérifié NON effectué → on
 *    marque failed + retryable (le retry devient alors possible).
 */
export async function resolvePayout(reference, { resolution, note } = {}) {
  const row = (
    await q("SELECT * FROM automatic_payouts WHERE external_reference = $1", [reference])
  )[0];
  if (!row) return { ok: false, error: "Reversement introuvable" };
  const guard = resolveGuard(row.status, resolution);
  if (!guard.ok) return { ok: false, error: guard.reason };
  if (resolution === "completed") {
    const res = await completeAutomaticPayout(reference, row.provider_reference || null);
    return { ok: true, ...res, note: note || null };
  }
  await q(
    `UPDATE automatic_payouts SET status = 'failed', error = $1, attempts = attempts + 1, retryable = TRUE, updated_at = now()
     WHERE external_reference = $2 AND status <> 'completed' RETURNING id`,
    [note || "Résolution manuelle : transfert non effectué", reference]
  );
  await sendPush(row.user_id, {
    type: "payout_failed",
    title: "Paiement échoué",
    body: `Votre reversement de ${Number(row.amount)} ${row.currency} a été marqué échoué après vérification manuelle.`,
  });
  return {
    ok: true,
    payout: { ...row, status: "failed", retryable: true, error: note || null },
  };
}

/**
 * Retry CONTRÔLÉ (admin) d'un reversement — UNIQUEMENT depuis `failed`
 * (l'admin a d'abord résolu en `failed`, confirmant que le transfert n'a pas eu
 * lieu). Réservation atomique : un seul retry gagne. Réutilise la MÊME
 * external_reference (idempotence) et la logique centralisée executePayout.
 */
export async function retryPayout(reference, { note } = {}) {
  // Réclamer atomiquement : le second retry concurrent ne matche plus car le
  // statut passe à 'processing'.
  const claimed = (
    await q(
      `UPDATE automatic_payouts SET status = 'processing', error = $1, retryable = FALSE, updated_at = now()
       WHERE external_reference = $2 AND status = 'failed' AND retryable = TRUE RETURNING *`,
      [note || "retry manuel admin", reference]
    )
  )[0];
  if (!claimed) {
    const row = (
      await q("SELECT * FROM automatic_payouts WHERE external_reference = $1", [reference])
    )[0];
    if (!row) return { ok: false, error: "Reversement introuvable" };
    const guard = retryGuard(row.status);
    if (!guard.ok) return { ok: false, error: guard.reason };
    return { ok: false, error: "Un retry est déjà en cours ou déjà résolu" };
  }
  const user = (
    await q("SELECT id, name, country FROM users WHERE id = $1", [claimed.user_id])
  )[0];
  if (!user) return { ok: false, error: "Bénéficiaire introuvable" };
  const methods = await methodsFor(user.id, claimed.kind);
  const target = paymentTarget(methods, user.country);
  if (!target || !target.country || !target.phoneNumber) {
    await q(
      "UPDATE automatic_payouts SET status = 'failed', error = $1, retryable = TRUE, updated_at = now() WHERE external_reference = $2",
      ["Moyen de paiement automatique non configuré", reference]
    );
    return { ok: false, error: "Moyen de paiement automatique non configuré", retryable: true };
  }
  const amount = Number(claimed.amount);
  const fee = Math.round(amount * IKEEPAY_FEE_RATE * 100) / 100;
  const netAmount = Math.round((amount - fee) * 100) / 100;
  return executePayout({
    reference,
    amount,
    fee,
    netAmount,
    currency: target.currency,
    target,
    user,
  });
}

export async function completeAutomaticPayout(reference, providerReference) {
  // IDEMPOTENCE EXPLICITE : si le payout est déjà completed, on ne recrée aucun
  // mouvement ledger et on ne renvoie aucune notification.
  const existing = (
    await q("SELECT * FROM automatic_payouts WHERE external_reference = $1", [reference])
  )[0];
  if (!existing) return { ok: false, error: "Reversement introuvable" };
  if (existing.status === "completed")
    return { ok: true, already: true, payout: existing };

  // Transition atomique processing/pending/failed -> completed. La clause
  // `status <> 'completed'` garantit qu'un second appel concurrent ne passe pas.
  const completed = (
    await q(
      "UPDATE automatic_payouts SET status = 'completed', provider_reference = COALESCE($1, provider_reference), completed_at = COALESCE(completed_at, now()), error = NULL, updated_at = now() WHERE external_reference = $2 AND status <> 'completed' RETURNING *",
      [providerReference || null, reference]
    )
  )[0];
  if (!completed) {
    // Course : un autre appel l'a déjà passé à completed entre-temps.
    const again = (
      await q("SELECT * FROM automatic_payouts WHERE external_reference = $1", [reference])
    )[0];
    return again && again.status === "completed"
      ? { ok: true, already: true, payout: again }
      : { ok: false, error: "Reversement introuvable" };
  }
  const transactionType =
    completed.kind === "referral" || completed.kind === "activation_referral"
      ? "referral_credit"
      : completed.kind === "seller"
        ? "commission_credit"
        : completed.kind === "livreur"
          ? "online_payout"
          : completed.kind === "creator"
            ? "commission_credit"
            : "online_collect";
  const netAmount = Math.round((completed.amount - (completed.fee || 0)) * 100) / 100;
  await q(
    `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description, fee)
     VALUES ($1, $2, $3, $4, 'ikeepay_payout', $5, $6, $7)
     ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
    [
      completed.user_id,
      netAmount,
      completed.currency,
      transactionType,
      completed.id,
      `Paiement automatique Ikeepay — ${completed.kind}`,
      completed.fee || 0,
    ]
  );
  if (completed.kind === "seller" && completed.sale_id)
    await q(
      "UPDATE sales SET paid = TRUE, paid_at = COALESCE(paid_at, now()), commission_claimed_at = NULL WHERE id = $1",
      [completed.sale_id]
    );
  if (completed.kind === "referral")
    await q(
      "UPDATE sales SET referral_paid = TRUE, referral_paid_at = now() WHERE referred_by = $1 AND status = 'delivered' AND payment_status = 'paid' AND referral_paid = FALSE",
      [completed.user_id]
    );
  await sendPush(completed.user_id, {
    type: "payout_completed",
    title: "Paiement reçu",
    body: `Votre reversement de ${completed.amount} ${completed.currency} a été effectué via Ikeepay.`,
  });
  return { ok: true, payout: completed };
}

export async function completeMembershipPayment(paymentId, providerReference) {
  const payment = (await q("SELECT * FROM membership_payments WHERE id = $1", [paymentId]))[0];
  if (!payment) return { ok: false, error: "Paiement d’adhésion introuvable" };
  const user = (
    await q("SELECT id, role, referred_by FROM users WHERE id = $1", [payment.user_id])
  )[0];
  if (!user) return { ok: false, error: "Utilisateur introuvable" };
  await q(
    "UPDATE membership_payments SET status = 'completed', provider_reference = COALESCE($1, provider_reference), completed_at = COALESCE(completed_at, now()), error = NULL WHERE id = $2",
    [providerReference || null, payment.id]
  );
  await q(
    `UPDATE users SET membership_paid_at = COALESCE(membership_paid_at, now()), membership_expires_at = GREATEST(COALESCE(membership_expires_at, now()), now()) + interval '30 days', membership_payment_reference = $1 WHERE id = $2`,
    [payment.external_reference, user.id]
  );
  // Règle Mboppi : 90 % des frais d'adhésion sont reversés sur les portefeuilles
  // Mboppi (les 10 % couvrent les frais de traitement Ikeepay).
  const membershipShare = await payoutPlatformShare({
    kind: "membership",
    sourceId: payment.id,
    amount: Number(payment.amount),
    currency: payment.currency,
  });
  if ((user.role === "seller" || user.role === "creator") && user.referred_by) {
    const referrer = (
      await q("SELECT id, country FROM users WHERE id = $1 AND role = 'seller'", [user.referred_by])
    )[0];
    if (referrer) {
      const methods = await methodsFor(referrer.id, "seller");
      const referralPayout = await providerPayout({
        user: referrer,
        methods,
        amount: 1000,
        kind: "activation_referral",
        reference: `ACTIVATION_REFERRAL:${user.id}`,
      });
      // Part plateforme : les 500 XAF de l'activation d'un vendeur/créateur
      // affilié suivent la même logique (90 % versés nets aux portefeuilles Mboppi).
      if (referralPayout.ok) {
        await payoutPlatformShare({
          kind: "activation_referral",
          sourceId: user.id,
          amount: 500,
          currency: payment.currency,
        });
      }
    }
  }
  return { ok: true, membershipShare };
}

export async function completePlatformPayout(reference, providerReference) {
  const row = (
    await q(
      "UPDATE platform_payouts SET status = 'completed', provider_reference = COALESCE($1, provider_reference), completed_at = COALESCE(completed_at, now()), error = NULL WHERE external_reference = $2 RETURNING *",
      [providerReference || null, reference]
    )
  )[0];
  return row
    ? { ok: true, payout: row }
    : { ok: false, error: "Reversement plateforme introuvable" };
}

// Reversement vers les portefeuilles Mboppi : règle « sortie = 90 % ».
// Appelé pour les frais d'adhésion, les dons et la part plateforme (500 XAF)
// de l'activation d'un vendeur/créateur affilié.
export async function payoutPlatformShare({ kind, sourceId, amount, currency }) {
  const country = process.env.MBOPPI_PAYOUT_COUNTRY || "CM";
  const targetCurrency = currency || currencyForCountry(country);
  const phone = normalizePhone(process.env.MBOPPI_PAYOUT_PHONE || "+237699486146", country);
  const operator = String(process.env.MBOPPI_PAYOUT_OPERATOR || "ORANGE")
    .trim()
    .toUpperCase();
  const reference = `MBOPPI_SHARE:${kind}:${sourceId}`;
  const amt = Math.round(Number(amount || 0) * 100) / 100;
  if (!(amt > 0)) return { ok: false, error: "Montant de reversement invalide" };

  // Sortie = 90 % : seul le net part vers le portefeuille Mboppi.
  const fee = Math.round(amt * IKEEPAY_FEE_RATE * 100) / 100;
  const netAmount = Math.round((amt - fee) * 100) / 100;

  // Réservation atomique : UN SEUL worker obtient la ligne `platform_payouts`.
  // Si l'INSERT ne retourne aucune ligne, un autre processus a déjà réservé ce
  // part plateforme (ou il est déjà traité) → on n'envoie JAMAIS iKeePay deux fois.
  const reserved = (
    await q(
      `INSERT INTO platform_payouts (external_reference, amount, currency)
       VALUES ($1, $2, $3) ON CONFLICT (external_reference) DO NOTHING RETURNING id`,
      [reference, amt, targetCurrency]
    )
  )[0];
  if (!reserved) {
    const existing = (
      await q("SELECT status FROM platform_payouts WHERE external_reference = $1", [reference])
    )[0];
    if (!existing) return { ok: false, error: "Impossible de réserver la part plateforme" };
    if (existing.status === "completed") return { ok: true, already: true };
    if (existing.status === "pending" || existing.status === "processing")
      return { ok: true, pending: true, already: true };
    // failed : retry contrôlé (pas de double envoi automatique).
    return { ok: false, already: true, error: "Part plateforme déjà traitée en échec" };
  }
  try {
    const result = await payout({
      amount: netAmount,
      currency: targetCurrency,
      country,
      phoneNumber: phone,
      operator,
      external_reference: reference,
    });
    const status = providerStatus(result);
    if (status === "failed") throw new Error("Le prestataire a refusé le reversement Mboppi");
    if (status === "completed") {
      await q(
        "UPDATE platform_payouts SET status = 'completed', provider_reference = $1, completed_at = now(), updated_at = now() WHERE external_reference = $2",
        [result.provider_reference || result.data?.provider_reference || null, reference]
      );
    }
    return {
      ok: true,
      pending: status !== "completed",
      operator,
      provider: result,
      amount: amt,
      fee,
      netAmount,
    };
  } catch (error) {
    await q(
      "UPDATE platform_payouts SET status = 'failed', error = $1, updated_at = now() WHERE external_reference = $2",
      [error.message, reference]
    );
    return { ok: false, error: error.message };
  }
}

export function computeRedistribution(sale) {
  const totalPrice = Number(sale.total_price || 0);
  const commission = Number(sale.commission || 0);
  const referralCommission = Number(sale.referral_commission || 0);
  const deliveryFee = Number(sale.delivery_fee || 0);

  const shopAmount = Math.round((totalPrice - commission - referralCommission) * 100) / 100;
  const sellerAmount = commission;
  const referrerAmount = referralCommission;
  const livreurAmount = deliveryFee;

  return { totalPrice, shopAmount, sellerAmount, referrerAmount, livreurAmount };
}

/**
 * Sélection PURE des bénéficiaires d'une vente + leur montant.
 * N'effectue aucune requête : les utilisateurs sont passés explicitement
 * ({ shop, seller, referrer, livreur }). Testable sans base.
 */
export function planSalePayouts(sale, users = {}) {
  const r = computeRedistribution(sale);
  const targets = [];
  if (r.shopAmount > 0 && users.shop)
    targets.push({ user: users.shop, kind: "shop", amount: r.shopAmount });
  if (r.sellerAmount > 0 && users.seller)
    targets.push({ user: users.seller, kind: "seller", amount: r.sellerAmount });
  if (r.referrerAmount > 0 && users.referrer)
    targets.push({ user: users.referrer, kind: "referral", amount: r.referrerAmount });
  if (r.livreurAmount > 0 && users.livreur)
    targets.push({ user: users.livreur, kind: "livreur", amount: r.livreurAmount });
  return targets;
}

export async function paySaleAutomatically(saleId) {
  const sale = (await q("SELECT * FROM sales WHERE id = $1", [saleId]))[0];
  if (!sale || sale.payment_status !== "paid") return { ok: false, error: "Paiement non confirmé" };
  const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
  if (!product) return { ok: false, error: "Produit introuvable" };
  const shop = (await q("SELECT id, name, country FROM users WHERE id = $1", [product.shop_id]))[0];
  const seller = sale.seller_id
    ? (await q("SELECT id, name, country FROM users WHERE id = $1", [sale.seller_id]))[0]
    : null;
  const referrer = sale.referred_by
    ? (await q("SELECT id, name, country FROM users WHERE id = $1", [sale.referred_by]))[0]
    : null;
  const livreur = sale.delivered_by
    ? (await q("SELECT id, name, country FROM users WHERE id = $1", [sale.delivered_by]))[0]
    : null;
  const targets = planSalePayouts(sale, { shop, seller, referrer, livreur });
  const results = [];
  for (const target of targets) {
    const methods = await methodsFor(target.user.id, target.kind);
    const result = await providerPayout({
      user: target.user,
      methods,
      amount: target.amount,
      saleId,
      kind: target.kind,
      reference: `PAYOUT:${target.kind}:${saleId}`,
    });
    results.push({ kind: target.kind, amount: target.amount, ...result });
    // Le marquage `paid` / `referral_paid` est géré de façon atomique par
    // `completeAutomaticPayout()` (après un payout iKeePay `completed`) et par
    // `markSalePaid()` (verrou de vente). On ne marque rien ici afin d'éviter
    // tout double effet financier.
  }
  return { ok: results.every((item) => item.ok), results };
}

export async function markSalePaid(saleId, { transactionId, payload, receivedBy } = {}) {
  // Verrou atomique au niveau de la VENTE : UN SEUL appelant (confirm / webhook /
  // deliver) obtient la ligne `payout_initiated=FALSE -> TRUE`. Les autres sont
  // traités comme « déjà payé » sans relancer les reversements.
  const claimed = (
    await q(
      `UPDATE sales SET paid = TRUE, paid_at = COALESCE(paid_at, now()), payment_status = 'paid',
         payment_received_by = COALESCE(payment_received_by, $1),
         commission_claimed_at = NULL,
         payout_initiated = TRUE,
         payout_initiated_at = COALESCE(payout_initiated_at, now())
       WHERE id = $2 AND payout_initiated = FALSE RETURNING id`,
      [receivedBy || null, saleId]
    )
  )[0];
  if (!claimed) {
    // Soit la vente n'existe pas, soit elle a déjà été traitée.
    const existing = (
      await q("SELECT id FROM sales WHERE id = $1", [saleId])
    )[0];
    if (!existing) return { ok: false, error: "Vente introuvable" };
    return { ok: true, already: true, payouts: { initiated: false } };
  }

  const payouts = await paySaleAutomatically(saleId);
  return { ok: true, payouts };
}
