import { q } from "../db.js";
import {
  countryCode,
  currencyForCountry,
  normalizePhone,
  payout,
  providerStatus,
} from "../ikeepay.js";
import { sendPush } from "../push.js";

export const REFERRAL_AUTO_PAY_MIN = 5000;
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

function paymentTarget(methods, country) {
  const wallet = Array.isArray(methods?.wallets)
    ? methods.wallets.find((item) => item?.value && item?.name)
    : null;
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

export function externalReference(kind, saleId) {
  return `${kind}:${saleId}`;
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

export async function providerPayout({ user, methods, amount, saleId, kind, reference }) {
  const target = paymentTarget(methods, user.country);
  if (!target || !target.country || !target.phoneNumber) {
    // GAP : jusqu'ici l'acteur était ignoré sans aucune trace ni notification :
    // il croyait recevoir l'argent mais n'avait aucun moyen de paiement valide.
    // On enregistre l'échec et on le notifie pour qu'il configure son opérateur.
    try {
      await q(
        `INSERT INTO automatic_payouts (external_reference, user_id, sale_id, kind, amount, currency, status, error)
         VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7) ON CONFLICT (external_reference) DO NOTHING`,
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
    return { ok: false, error: "Moyen de paiement automatique non configuré" };
  }
  const existing = (
    await q("SELECT * FROM automatic_payouts WHERE external_reference = $1", [reference])
  )[0];
  if (existing?.status === "completed") return { ok: true, already: true };

  // Sortie = 90 % du montant : Ikeepay ne transfère que le net au bénéficiaire.
  const fee = Math.round(amount * IKEEPAY_FEE_RATE * 100) / 100;
  const netAmount = Math.round((amount - fee) * 100) / 100;

  if (!existing) {
    await q(
      `INSERT INTO automatic_payouts (external_reference, user_id, sale_id, kind, amount, currency, fee)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (external_reference) DO NOTHING`,
      [reference, user.id, saleId || null, kind, amount, target.currency, fee]
    );
  }
  try {
    const result = await payout({
      amount: netAmount,
      currency: target.currency,
      country: target.country,
      phoneNumber: target.phoneNumber,
      operator: target.operator,
      external_reference: reference,
    });
    const status = providerStatus(result);
    if (status === "failed") throw new Error("Le prestataire a refusé le retrait");
    if (status !== "completed") {
      await q(
        "UPDATE automatic_payouts SET status = 'pending', provider_reference = $1, error = NULL WHERE external_reference = $2",
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
    await q(
      "UPDATE automatic_payouts SET status = 'failed', error = $1 WHERE external_reference = $2",
      [error.message, reference]
    );
    await sendPush(user.id, {
      type: "payout_failed",
      title: "Paiement échoué",
      body: `Le reversement de ${amount} ${target.currency} a échoué : ${error.message}`,
    });
    return { ok: false, error: error.message };
  }
}

export async function completeAutomaticPayout(reference, providerReference) {
  const completed = (
    await q(
      "UPDATE automatic_payouts SET status = 'completed', provider_reference = COALESCE($1, provider_reference), completed_at = COALESCE(completed_at, now()), error = NULL WHERE external_reference = $2 RETURNING *",
      [providerReference || null, reference]
    )
  )[0];
  if (!completed) return { ok: false, error: "Reversement introuvable" };
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
    await q("UPDATE sales SET paid = TRUE, paid_at = COALESCE(paid_at, now()) WHERE id = $1", [
      completed.sale_id,
    ]);
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

  const existing = (
    await q("SELECT * FROM platform_payouts WHERE external_reference = $1", [reference])
  )[0];
  if (existing?.status === "completed") return { ok: true, already: true };

  if (!existing) {
    // NOTE : ne PAS insérer la colonne `fee` ici : la table réellement
    // déployée sur Supabase n'a pas cette colonne (id, external_reference,
    // amount, currency, status, provider_reference, error, created_at,
    // completed_at). Un INSERT avec `fee` lèverait `column "fee" does not
    // exist` et avalerait le reversement. Le fee reste calculé localement
    // pour déterminer le net à envoyer.
    await q(
      "INSERT INTO platform_payouts (external_reference, amount, currency) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [reference, amt, targetCurrency]
    );
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
        "UPDATE platform_payouts SET status = 'completed', provider_reference = $1, completed_at = now() WHERE external_reference = $2",
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
      "UPDATE platform_payouts SET status = 'failed', error = $1 WHERE external_reference = $2",
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

export async function paySaleAutomatically(saleId) {
  const sale = (await q("SELECT * FROM sales WHERE id = $1", [saleId]))[0];
  if (!sale || sale.payment_status !== "paid") return { ok: false, error: "Paiement non confirmé" };
  const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
  if (!product) return { ok: false, error: "Produit introuvable" };
  const targets = [];
  const shop = (await q("SELECT id, name, country FROM users WHERE id = $1", [product.shop_id]))[0];
  if (shop)
    targets.push({ user: shop, kind: "shop", amount: computeRedistribution(sale).shopAmount });
  if (sale.seller_id) {
    const seller = (
      await q("SELECT id, name, country FROM users WHERE id = $1", [sale.seller_id])
    )[0];
    if (seller)
      targets.push({
        user: seller,
        kind: "seller",
        amount: computeRedistribution(sale).sellerAmount,
      });
  }
  // Parrain (2 % — client affilié) : versé immédiatement au moment de la
  // confirmation du paiement, comme les autres acteurs, via iKeePay sur SON
  // moyen de paiement configuré (seller_payment_methods).
  if (sale.referred_by) {
    const referrer = (
      await q("SELECT id, name, country FROM users WHERE id = $1", [sale.referred_by])
    )[0];
    const refAmount = computeRedistribution(sale).referrerAmount;
    if (referrer && refAmount > 0)
      targets.push({ user: referrer, kind: "referral", amount: refAmount });
  }
  if (sale.delivered_by) {
    const livreur = (
      await q("SELECT id, name, country FROM users WHERE id = $1", [sale.delivered_by])
    )[0];
    if (livreur)
      targets.push({
        user: livreur,
        kind: "livreur",
        amount: computeRedistribution(sale).livreurAmount,
      });
  }
  const results = [];
  for (const target of targets.filter((item) => item.amount > 0)) {
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
    if (result.ok && target.kind === "seller")
      await q("UPDATE sales SET paid = TRUE, paid_at = COALESCE(paid_at, now()) WHERE id = $1", [
        saleId,
      ]);
    // Parrain payé par cette vente : le marquer pour éviter tout re-paiement
    // via l'ancien cumul (payReferralAutomatically).
    if (result.ok && target.kind === "referral")
      await q(
        "UPDATE sales SET referral_paid = TRUE, referral_paid_at = COALESCE(referral_paid_at, now()) WHERE id = $1",
        [saleId]
      );
  }
  return { ok: results.every((item) => item.ok), results };
}

export async function payReferralAutomatically(referrerId) {
  const pending = await q(
    `SELECT COALESCE(SUM(referral_commission), 0) AS amount
     FROM sales WHERE referred_by = $1 AND status = 'delivered' AND payment_status = 'paid' AND referral_paid = FALSE`,
    [referrerId]
  );
  const row = pending[0];
  const amount = Math.round(Number(row.amount) * 100) / 100;
  if (amount < REFERRAL_AUTO_PAY_MIN)
    return { kind: "referral", ok: true, pending: true, amount, threshold: REFERRAL_AUTO_PAY_MIN };
  const user = (
    await q("SELECT id, country FROM users WHERE id = $1 AND role = 'seller'", [referrerId])
  )[0];
  if (!user) return { kind: "referral", ok: false, error: "Parrain introuvable" };
  const methods = await methodsFor(user.id, "seller");
  const pendingIds = await q(
    `SELECT id FROM sales WHERE referred_by = $1 AND status = 'delivered' AND payment_status = 'paid' AND referral_paid = FALSE ORDER BY id`,
    [user.id]
  );
  const reference = `REFERRAL:${user.id}:${pendingIds.map((item) => item.id).join("-")}`;
  const result = await providerPayout({ user, methods, amount, kind: "referral", reference });
  if (result.ok)
    await q(
      "UPDATE sales SET referral_paid = TRUE, referral_paid_at = now() WHERE referred_by = $1 AND status = 'delivered' AND payment_status = 'paid' AND referral_paid = FALSE",
      [user.id]
    );
  return { kind: "referral", amount, ...result };
}

export async function sendSalePayouts(sale, { kind }) {
  const redistribution = computeRedistribution(sale);

  const shopId = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
  const shop = shopId
    ? (await q("SELECT id, name, country, phone FROM users WHERE id = $1", [shopId.shop_id]))[0]
    : null;
  const seller = sale.seller_id
    ? (await q("SELECT id, name, country, phone FROM users WHERE id = $1", [sale.seller_id]))[0]
    : null;
  const referrer = sale.referred_by
    ? (await q("SELECT id, name, country, phone FROM users WHERE id = $1", [sale.referred_by]))[0]
    : null;
  const livreur = sale.delivered_by
    ? (await q("SELECT id, name, country, phone FROM users WHERE id = $1", [sale.delivered_by]))[0]
    : null;

  const payouts = [];

  if (redistribution.shopAmount > 0 && shop) {
    payouts.push({
      amount: redistribution.shopAmount,
      label: "boutique",
      saleId: sale.id,
      user: shop,
      txn: "online_collect",
    });
  }
  if (redistribution.sellerAmount > 0 && seller) {
    payouts.push({
      amount: redistribution.sellerAmount,
      label: "vendeur",
      saleId: sale.id,
      user: seller,
      txn: "commission_credit",
    });
  }
  if (redistribution.referrerAmount > 0 && referrer) {
    payouts.push({
      amount: redistribution.referrerAmount,
      label: "parrain",
      saleId: sale.id,
      user: referrer,
      txn: "referral_credit",
    });
  }
  if (redistribution.livreurAmount > 0 && livreur) {
    payouts.push({
      amount: redistribution.livreurAmount,
      label: "livreur",
      saleId: sale.id,
      user: livreur,
      txn: "online_payout",
    });
  }

  const results = { requested: [], failed: [] };
  for (const p of payouts) {
    const external = externalReference(`PAYOUT_${p.txn}`, sale.id);
    const ref = `${p.label}_${p.txn}`;
    const already = (
      await q(
        "SELECT id FROM wallet_transactions WHERE user_id = $1 AND transaction_type = $2 AND reference_type = $3 AND reference_id = $4",
        [p.user.id, p.txn, ref, sale.id]
      )
    )[0];
    if (already) continue;

    try {
      await q(
        `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
        [
          p.user.id,
          p.amount,
          sale.currency || "XAF",
          p.txn,
          ref,
          sale.id,
          `Reverse auto ${p.label} — vente #${sale.id}`,
        ]
      );
      results.requested.push({ label: p.label, amount: p.amount });
    } catch (err) {
      results.failed.push({ label: p.label, amount: p.amount, error: err.message });
    }
  }

  return results;
}

export async function markSalePaid(saleId, { transactionId, payload, receivedBy }) {
  const sale = (await q("SELECT * FROM sales WHERE id = $1", [saleId]))[0];
  if (!sale) return { ok: false, error: "Vente introuvable" };

  await q(
    `UPDATE sales SET paid = TRUE, paid_at = COALESCE(paid_at, now()), payment_status = 'paid',
       payment_received_by = COALESCE(payment_received_by, $1)
       WHERE id = $2`,
    [receivedBy || null, saleId]
  );

  if (sale.payout_initiated) return { ok: true, already: true, payouts: { initiated: false } };

  await q(
    `UPDATE sales SET payout_initiated = TRUE, payout_initiated_at = COALESCE(payout_initiated_at, now()) WHERE id = $1`,
    [saleId]
  );

  const payouts = await sendSalePayouts(sale, { kind: "automatic" });
  if (sale.referred_by) {
    const referralResult = await payReferralAutomatically(sale.referred_by);
    payouts.referral = referralResult;
  }
  return { ok: true, payouts };
}
