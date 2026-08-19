import { q } from './db.js';
import { ikeepayPayout, countryInfo, operatorFor, normalizePhone, ikePayFeeNet } from './ikeepay.js';
import { defaultCurrencyFor } from './currency.js';
import { sendPush } from './push.js';

export const REFERRAL_AUTO_PAY_MIN = Number(process.env.REFERRAL_AUTO_PAY_MIN || 1500);

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

export async function payoutTargetFor(user, kind) {
  if (!user) return null;
  let wallets = null;
  if (kind === 'shop') {
    const m = (await q('SELECT wallets FROM shop_payment_methods WHERE shop_id = $1', [user.id]))[0];
    wallets = m && m.wallets;
  } else if (kind === 'seller') {
    const m = (await q('SELECT wallets FROM seller_payment_methods WHERE seller_id = $1', [user.id]))[0];
    wallets = m && m.wallets;
  } else if (kind === 'livreur') {
    const m = (await q('SELECT wallets FROM livreur_payment_methods WHERE livreur_id = $1', [user.id]))[0];
    wallets = m && m.wallets;
  }

  const walletList = Array.isArray(wallets) ? wallets : [];
  const country = user.country;
  const info = countryInfo(country);
  const prefix = info ? info.prefix : '';

  const toTarget = (w) => {
    if (!w) return null;
    const operator = operatorFor(w.name);
    const rawPhone = String(w.value || '').replace(/[^\d]/g, '');
    const phone = rawPhone.startsWith(prefix) ? rawPhone : prefix ? prefix + rawPhone : rawPhone;
    if (!operator || !phone) return null;
    return { operator, phone };
  };

  const orangeFirst = (a, b) => {
    const aO = a && String(a.name).toLowerCase().includes('orange') ? 0 : 1;
    const bO = b && String(b.name).toLowerCase().includes('orange') ? 0 : 1;
    return aO - bO;
  };

  for (const w of [...walletList].sort(orangeFirst)) {
    const target = toTarget(w);
    if (target) return target;
  }
  return null;
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
  const livreur = sale.delivered_by
    ? (await q('SELECT id, name, country, phone FROM users WHERE id = $1', [sale.delivered_by]))[0]
    : null;

  const payouts = [];
  const noTarget = [];

  if (redistribution.shopAmount > 0 && shop) {
    const target = await payoutTargetFor(shop, 'shop');
    if (target) payouts.push({ target, amount: ikePayFeeNet(redistribution.shopAmount), label: 'boutique', saleId: sale.id, user: shop, txn: 'online_collect' });
    else noTarget.push({ label: 'boutique', amount: redistribution.shopAmount, user: shop });
  }
  if (redistribution.sellerAmount > 0 && seller) {
    const target = await payoutTargetFor(seller, 'seller');
    if (target) payouts.push({ target, amount: ikePayFeeNet(redistribution.sellerAmount), label: 'vendeur', saleId: sale.id, user: seller, txn: 'commission_credit' });
    else noTarget.push({ label: 'vendeur', amount: redistribution.sellerAmount, user: seller });
  }
  // La commission de parrainage (2%) n'est plus versée à chaque vente :
  // elle s'accumule et est payée automatiquement au vendeur parrain dès le seuil REFERRAL_AUTO_PAY_MIN atteint.
  if (redistribution.livreurAmount > 0 && livreur) {
    const target = await payoutTargetFor(livreur, 'livreur');
    if (target) payouts.push({ target, amount: ikePayFeeNet(redistribution.livreurAmount), label: 'livreur', saleId: sale.id, user: livreur, txn: 'online_payout' });
    else noTarget.push({ label: 'livreur', amount: redistribution.livreurAmount, user: livreur });
  }

  const results = { requested: [], failed: [] };
  for (const nt of noTarget) {
    const label = nt.label;
    const error = `${label} sans portefeuille électronique valide (numéro ou opérateur manquant/incompatible) — reverse non envoyé`;
    results.failed.push({ label, amount: nt.amount, error });
    if (nt.user) {
      await q(
        `INSERT INTO notifications (user_id, type, sale_id)
         SELECT $1, 'payment_need_wallet', $2
         WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'payment_need_wallet' AND sale_id = $2)`,
        [nt.user.id, sale.id]
      );
    }
  }
  for (const p of payouts) {
    const external = externalReference(`PAYOUT_${p.txn}`, sale.id);
    const ref = `${p.label}_${p.txn}`;
    const already = (
      await q('SELECT id FROM wallet_transactions WHERE user_id = $1 AND transaction_type = $2 AND reference_type = $3 AND reference_id = $4', [p.user.id, p.txn, ref, sale.id])
    )[0];
    if (already) continue;

    try {
      const info = countryInfo(p.user.country);
      if (!info) {
        throw new Error(`Pays non pris en charge pour le payout : ${p.user.country}`);
      }
      const provider = await ikeepayPayout({
        amount: p.amount,
        currency: sale.currency || 'XAF',
        country: info.code,
        phoneNumber: p.target.phone,
        operator: p.target.operator,
        external_reference: external,
      });
      await q(
        `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
        [p.user.id, p.amount, sale.currency || 'XAF', p.txn, ref, sale.id, `Reverse auto ${p.label} — vente #${sale.id}`]
      );
      results.requested.push({ label: p.label, amount: p.amount, provider });
    } catch (err) {
      results.failed.push({ label: p.label, amount: p.amount, error: err.message });
    }
  }

  return results;
}

export async function maybeAutoPayReferrals(referrerId) {
  if (!referrerId) return null;
  try {
    const referrer = (await q('SELECT id, country, name, role FROM users WHERE id = $1', [referrerId]))[0];
    if (!referrer || referrer.role !== 'seller') return null;

    const pending = await q(
      `SELECT s.id, s.referral_commission
         FROM sales s
        WHERE s.referred_by = $1 AND s.status = 'delivered' AND NOT s.referral_paid
        ORDER BY s.delivered_at ASC, s.id ASC`,
      [referrerId]
    );
    if (!pending.length) return null;

    const total = Math.round(pending.reduce((a, r) => a + Number(r.referral_commission || 0), 0) * 100) / 100;
    if (total < REFERRAL_AUTO_PAY_MIN) {
      return { paid: false, pending: true, total, threshold: REFERRAL_AUTO_PAY_MIN };
    }

    const target = await payoutTargetFor(referrer, 'seller');
    if (!target) {
      await q(
        `INSERT INTO notifications (user_id, type)
         SELECT $1, 'payment_need_wallet'
         WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'payment_need_wallet')`,
        [referrerId]
      );
      return { paid: false, pending: true, total, threshold: REFERRAL_AUTO_PAY_MIN, reason: 'no_wallet' };
    }

    const info = countryInfo(referrer.country);
    if (!info) {
      return { paid: false, pending: true, total, reason: `Pays non pris en charge : ${referrer.country}`, error: true };
    }
    const currency = defaultCurrencyFor(referrer.country);

    const provider = await ikeepayPayout({
      amount: ikePayFeeNet(total),
      currency,
      country: info.code,
      phoneNumber: target.phone,
      operator: target.operator,
      external_reference: `PAYOUT_REFERRAL:${referrerId}:${Date.now()}`,
    });

    const marked = await q(
      `UPDATE sales SET referral_paid = TRUE, referral_paid_at = COALESCE(referral_paid_at, now())
        WHERE id = ANY($1) AND status = 'delivered' AND NOT referral_paid
        RETURNING id, referral_commission`,
      [pending.map((r) => r.id)]
    );
    for (const row of marked) {
      await q(
        `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description)
         VALUES ($1, $2, $3, 'referral_credit', 'sale', $4, $5)
         ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
        [referrerId, ikePayFeeNet(Number(row.referral_commission)), currency, Number(row.id), 'Commission de parrainage (versement automatique, frais iKeePay déduits)']
      );
    }

    const actualPaid = Math.round(marked.reduce((a, r) => a + ikePayFeeNet(Number(r.referral_commission || 0)), 0) * 100) / 100;
    if (actualPaid > 0) {
      await q(
        `INSERT INTO notifications (user_id, type, amount) VALUES ($1, 'referral_paid', $2)`,
        [referrerId, actualPaid]
      );
      await sendPush(referrerId, {
        title: 'Parrainage versé',
        body: `Votre commission de parrainage (${actualPaid} F) a été versée automatiquement sur votre portefeuille.`,
        url: '/seller',
      });
    }
    return { paid: true, total: actualPaid, provider, count: marked.length };
  } catch (err) {
    console.error('Auto-pay parrainage échoué:', err && err.message ? err.message : err);
    return { paid: false, error: String(err && err.message ? err.message : err) };
  }
}

export async function markSalePaid(saleId, { transactionId, payload, receivedBy }) {
  const sale = (await q('SELECT * FROM sales WHERE id = $1', [saleId]))[0];
  if (!sale) return { ok: false, error: 'Vente introuvable' };

  await q(
    `UPDATE sales SET paid = TRUE, paid_at = COALESCE(paid_at, now()), online_payment = TRUE, payment_status = 'paid',
       payment_provider = 'ikeepay', provider_transaction_id = COALESCE(provider_transaction_id, $1),
       provider_payload = COALESCE(provider_payload, $2), payment_received_by = COALESCE(payment_received_by, $3)
     WHERE id = $4`,
    [transactionId || null, payload || null, receivedBy || null, saleId]
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