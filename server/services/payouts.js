import { q } from "../db.js";
import {
  countryCode,
  currencyForCountry,
  normalizePhone,
  payout,
  providerStatus,
} from "../ikeepay.js";

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

export async function providerPayout({ user, methods, amount, saleId, kind, reference }) {
  const target = paymentTarget(methods, user.country);
  if (!target || !target.country || !target.phoneNumber)
    return { ok: false, error: "Moyen de paiement automatique non configuré" };
  const existing = (
    await q("SELECT * FROM automatic_payouts WHERE external_reference = $1", [reference])
  )[0];
  if (existing?.status === "completed") return { ok: true, already: true };
  if (!existing) {
    await q(
      `INSERT INTO automatic_payouts (external_reference, user_id, sale_id, kind, amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (external_reference) DO NOTHING`,
      [reference, user.id, saleId || null, kind, amount, target.currency]
    );
  }
  try {
    const result = await payout({
      amount,
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
      return { ok: true, pending: true, provider: result };
    }
    await completeAutomaticPayout(
      reference,
      result.provider_reference || result.data?.provider_reference || null
    );
    return { ok: true, provider: result };
  } catch (error) {
    await q(
      "UPDATE automatic_payouts SET status = 'failed', error = $1 WHERE external_reference = $2",
      [error.message, reference]
    );
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
          : "online_collect";
  await q(
    `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description)
     VALUES ($1, $2, $3, $4, 'ikeepay_payout', $5, $6)
     ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
    [
      completed.user_id,
      completed.amount,
      completed.currency,
      transactionType,
      completed.id,
      `Paiement automatique Ikeepay — ${completed.kind}`,
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
  return { ok: true, payout: completed };
}
