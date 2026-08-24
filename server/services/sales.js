import { q } from "../db.js";
import { providerPayout } from "./payouts.js";

export const REFERRAL_AUTO_PAY_MIN = 5000;

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
    const methods = await q(
      `SELECT full_name, wallets FROM ${target.kind === "shop" ? "shop_payment_methods" : target.kind === "livreur" ? "livreur_payment_methods" : "seller_payment_methods"} WHERE ${target.kind === "shop" ? "shop_id" : target.kind === "livreur" ? "livreur_id" : "seller_id"} = $1`,
      [target.user.id]
    );
    const result = await providerPayout({
      user: target.user,
      methods: methods[0] || null,
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
  }
  if (sale.referred_by && sale.status === "delivered")
    results.push(await payReferralAutomatically(sale.referred_by));
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
  const methods = await q(
    `SELECT full_name, wallets FROM seller_payment_methods WHERE seller_id = $1`,
    [user.id]
  );
  const pendingIds = await q(
    `SELECT id FROM sales WHERE referred_by = $1 AND status = 'delivered' AND payment_status = 'paid' AND referral_paid = FALSE ORDER BY id`,
    [user.id]
  );
  const reference = `REFERRAL:${user.id}:${pendingIds.map((item) => item.id).join("-")}`;
  const result = await providerPayout({
    user,
    methods: methods[0] || null,
    amount,
    kind: "referral",
    reference,
  });
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
    const external = `PAYOUT_${p.txn}:${sale.id}`;
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
  return { ok: true, payouts };
}
