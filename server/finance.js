import { q } from './db.js';

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

export function externalReference(kind, saleId) {
  return `${kind}:${saleId}`;
}

export async function sendSalePayouts(sale, { kind }) {
  const redistribution = computeRedistribution(sale);

  const shopId = (
    await q('SELECT shop_id FROM products WHERE id = $1', [sale.product_id])
  )[0];
  const shop = shopId
    ? (await q('SELECT id, name, country, phone FROM users WHERE id = $1', [shopId.shop_id]))[0]
    : null;
  const seller = sale.seller_id
    ? (await q('SELECT id, name, country, phone FROM users WHERE id = $1', [sale.seller_id]))[0]
    : null;
  const referrer = sale.referred_by
    ? (await q('SELECT id, name, country, phone FROM users WHERE id = $1', [sale.referred_by]))[0]
    : null;
  const livreur = sale.delivered_by
    ? (await q('SELECT id, name, country, phone FROM users WHERE id = $1', [sale.delivered_by]))[0]
    : null;

  const payouts = [];

  if (redistribution.shopAmount > 0 && shop) {
    payouts.push({ amount: redistribution.shopAmount, label: 'boutique', saleId: sale.id, user: shop, txn: 'online_collect' });
  }
  if (redistribution.sellerAmount > 0 && seller) {
    payouts.push({ amount: redistribution.sellerAmount, label: 'vendeur', saleId: sale.id, user: seller, txn: 'commission_credit' });
  }
  if (redistribution.referrerAmount > 0 && referrer) {
    payouts.push({ amount: redistribution.referrerAmount, label: 'parrain', saleId: sale.id, user: referrer, txn: 'referral_credit' });
  }
  if (redistribution.livreurAmount > 0 && livreur) {
    payouts.push({ amount: redistribution.livreurAmount, label: 'livreur', saleId: sale.id, user: livreur, txn: 'online_payout' });
  }

  const results = { requested: [], failed: [] };
  for (const p of payouts) {
    const external = externalReference(`PAYOUT_${p.txn}`, sale.id);
    const ref = `${p.label}_${p.txn}`;
    const already = (
      await q('SELECT id FROM wallet_transactions WHERE user_id = $1 AND transaction_type = $2 AND reference_type = $3 AND reference_id = $4', [p.user.id, p.txn, ref, sale.id])
    )[0];
    if (already) continue;

    try {
      await q(
        `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
        [p.user.id, p.amount, sale.currency || 'XAF', p.txn, ref, sale.id, `Reverse auto ${p.label} — vente #${sale.id}`]
      );
      results.requested.push({ label: p.label, amount: p.amount });
    } catch (err) {
      results.failed.push({ label: p.label, amount: p.amount, error: err.message });
    }
  }

  return results;
}

export async function markSalePaid(saleId, { transactionId, payload, receivedBy }) {
  const sale = (await q('SELECT * FROM sales WHERE id = $1', [saleId]))[0];
  if (!sale) return { ok: false, error: 'Vente introuvable' };

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

  const payouts = await sendSalePayouts(sale, { kind: 'automatic' });
  return { ok: true, payouts };
}

export default { computeRedistribution, sendSalePayouts, markSalePaid };