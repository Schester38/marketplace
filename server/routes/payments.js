import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired, sellerActivationActive, sellerActivationExpiresAt, SELLER_ACTIVATION_DAYS } from '../auth.js';
import { ikeepayPayin, ikeepayPayout, ikeepayEnabled, countryInfo, normalizePhone, operatorFor, ikePayFee, ikePayGrossUp, ikePayFeeNet } from '../ikeepay.js';
import { defaultCurrencyFor } from '../currency.js';
import { markSalePaid, payoutTargetFor } from '../finance.js';
import { handleDonationPaid, donationTarget } from './donations.js';

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SELLER_ACTIVATION_FEE = Number(process.env.SELLER_ACTIVATION_FEE || 1500);
const SELLER_FEE_FAILED_STATUSES = ['failed', 'cancelled', 'expired', 'declined', 'rejected', 'refused'];

function ikeepayConfig() {
  return {
    publicKey: process.env.IKE_PUBLIC_KEY || '',
    checkoutUrl: process.env.IKE_CHECKOUT_URL || 'https://ikeepay.com/checkout/v1/inline',
    webhookUrl: process.env.IKE_WEBHOOK_URL || '',
  };
}

router.get('/config', ah(async (req, res) => {
  const cfg = ikeepayConfig();
  return res.json({
    provider: 'ikeepay',
    enabled: ikeepayEnabled(),
    public_key: cfg.publicKey,
    checkout_url: cfg.checkoutUrl,
  });
}));

router.get('/operators', ah(async (req, res) => {
  const countryName = String(req.query.country || 'Cameroun');
  const info = countryInfo(countryName);
  return res.json({ country: countryName, code: info ? info.code : null, operators: [
    'ORANGE', 'MTN', 'WAVE', 'MOOV', 'MOBICASH', 'AIRTEL', 'VODACOM',
  ] });
}));

router.post('/payin', ah(async (req, res) => {
  const { sale_id, operator, phone_number, shop_code } = req.body || {};
  if (!sale_id) return res.status(400).json({ error: 'Vente requise' });
  if (!operator) return res.status(400).json({ error: 'Opérateur de paiement requis' });
  if (!ikeepayEnabled()) return res.status(503).json({ error: 'Paiement iKeePay non configuré' });

  const sale = (await q(
    `SELECT s.*, p.shop_id, p.currency AS product_currency, u.country AS shop_country
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users u ON u.id = p.shop_id
     WHERE s.id = $1 FOR UPDATE`,
    [Number(sale_id)]
  ))[0];
  if (!sale) return res.status(404).json({ error: 'Vente introuvable' });
  if (!['pending', 'confirmed', 'delivered'].includes(sale.status)) {
    return res.status(409).json({ error: 'Cette commande n\'est pas en cours de livraison' });
  }
  if (sale.paid) return res.status(409).json({ error: 'Cette commande est déjà payée' });

  if (shop_code) {
    const code = String(shop_code).trim().toUpperCase();
    const shopByCode = (await q('SELECT id FROM users WHERE shop_code = $1', [code]))[0];
    if (!shopByCode || Number(shopByCode.id) !== Number(sale.shop_id)) {
      return res.status(403).json({ error: 'Code boutique non autorisé pour cette commande' });
    }
  }

  const currency = sale.product_currency || sale.currency || 'XAF';
  const countryName = sale.shop_country || 'Cameroun';
  const info = countryInfo(countryName);
  if (!info) return res.status(422).json({ error: `Pays de la boutique non pris en charge pour le paiement en ligne : ${countryName}` });

  const total = Math.round((Number(sale.total_price) + Number(sale.delivery_fee || 0)) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) {
    return res.status(422).json({ error: 'Montant invalide pour le paiement' });
  }

  // Le client paie le total majoré des frais iKeePay (total ÷ 0,94) :
  // iKeePay prélève 6 % de la demande, le solde marchand reçoit exactement le total.
  const amount = ikePayGrossUp(total);
  const fee = ikePayFee(amount);

  const phone = phone_number
    ? phone_number
    : sale.buyer_phone
      ? sale.buyer_phone
      : '';
  const normalized = info.prefix + normalizePhone(phone, countryName);
  if (!normalized || normalized === info.prefix) {
    return res.status(400).json({ error: 'Numéro de téléphone du client requis (il recevra la demande de paiement)' });
  }

  const external_reference = `SALE:${sale.id}`;

  const provider = await ikeepayPayin({
    amount,
    currency,
    country: info.code,
    phoneNumber: normalized,
    operator: String(operator).trim().toUpperCase(),
    external_reference,
    customer_email: req.user && req.user.email ? req.user.email : undefined,
  });

  if (!provider) return res.status(502).json({ error: 'Aucune réponse du fournisseur de paiement' });

  await q(
    `UPDATE sales SET online_payment = TRUE, payment_status = 'pending', payment_provider = 'ikeepay',
       provider_order_id = $1, provider_payload = $2
     WHERE id = $3`,
    [external_reference, provider, sale.id]
  );

  const queued = await q(
    `INSERT INTO payment_webhook_logs (provider, provider_order_id, event, payload, status, sale_id, handled)
     VALUES ('ikeepay', $1, 'payin_initiated', $2, 'sent', $3, FALSE) RETURNING id`,
    [external_reference, provider, sale.id]
  );

  res.json({
    ok: true,
    base_total: total,
    amount,
    fee,
    payment_link: provider.payment_link || provider.payment_url || null,
    requires_otp: Boolean(provider.requires_otp || provider.otp_required),
    external_reference,
    provider_transaction: provider.provider_reference || provider.transaction_id || null,
    log_id: queued[0].id,
  });
}));

router.post('/seller-fee', authRequired, roleRequired('seller'), ah(async (req, res) => {
  if (!ikeepayEnabled()) return res.status(503).json({ error: 'Paiement iKeePay non configuré' });

  const user = (await q('SELECT id, name, country, activation_fee_paid, activation_fee_paid_at FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  if (sellerActivationActive(user)) {
    return res.status(409).json({ error: 'Votre espace vendeur est déjà activé' });
  }

  const info = countryInfo(user.country);
  if (!info) return res.status(422).json({ error: `Pays non pris en charge pour le paiement en ligne : ${user.country || '—'}` });

  const m = (await q('SELECT wallets FROM seller_payment_methods WHERE seller_id = $1', [user.id]))[0];
  const wallets = Array.isArray(m && m.wallets) ? m.wallets : [];
  const wallet = wallets.find((w) => w && operatorFor(w.name) && String(w.value || '').replace(/\D/g, ''));
  if (!wallet) {
    return res.status(422).json({ error: 'Configurez d\'abord votre portefeuille Mobile Money (opérateur + numéro) avant de payer.' });
  }

  const normalized = info.prefix + normalizePhone(wallet.value, user.country);
  if (!normalized || normalized === info.prefix) {
    return res.status(422).json({ error: 'Numéro de portefeuille invalide. Mettez à jour vos moyens de paiement.' });
  }

  const operator = operatorFor(wallet.name);
  const amount = SELLER_ACTIVATION_FEE;
  const currency = defaultCurrencyFor(user.country);
  const external_reference = `FEE:${user.id}`;

  const provider = await ikeepayPayin({
    amount,
    currency,
    country: info.code,
    phoneNumber: normalized,
    operator,
    external_reference,
    customer_email: user.email || undefined,
  });
  if (!provider) return res.status(502).json({ error: 'Aucune réponse du fournisseur de paiement' });

  await q(
    `INSERT INTO seller_activation_payments (seller_id, amount, currency, operator, phone_number, status, external_reference, provider_payload, referrer_id)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, (SELECT referred_by FROM users WHERE id = $1))
     ON CONFLICT (external_reference) DO UPDATE SET status = 'pending', provider_payload = EXCLUDED.provider_payload, paid_at = NULL, created_at = now()`,
    [user.id, amount, currency, operator, normalized, external_reference, provider]
  );

  const queued = await q(
    `INSERT INTO payment_webhook_logs (provider, provider_order_id, event, payload, status, handled)
     VALUES ('ikeepay', $1, 'payin_initiated', $2, 'sent', FALSE) RETURNING id`,
    [external_reference, provider]
  );

  res.json({
    ok: true,
    amount,
    currency,
    payment_link: provider.payment_link || provider.payment_url || null,
    external_reference,
    provider_transaction: provider.provider_reference || provider.transaction_id || null,
    log_id: queued[0].id,
  });
}));

router.get('/seller-fee/status', authRequired, roleRequired('seller'), ah(async (req, res) => {
  const user = (await q('SELECT * FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  const currency = defaultCurrencyFor(user.country);
  const attempt = (await q(
    `SELECT status, amount, currency AS attempt_currency, operator, paid_at, created_at, payout_status
     FROM seller_activation_payments WHERE seller_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  ))[0] || null;
  res.json({
    paid: sellerActivationActive(user),
    amount: SELLER_ACTIVATION_FEE,
    currency,
    activation_period_days: SELLER_ACTIVATION_DAYS,
    activation_expires_at: sellerActivationExpiresAt(user),
    attempt: attempt ? {
      status: attempt.status,
      amount: Number(attempt.amount),
      currency: attempt.attempt_currency,
      operator: attempt.operator,
      paid_at: attempt.paid_at,
      created_at: attempt.created_at,
      payout_status: attempt.payout_status,
    } : null,
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      country: user.country || null,
      activation_fee_paid: sellerActivationActive(user),
      activation_expires_at: sellerActivationExpiresAt(user),
    },
  });
}));

export async function handleSellerActivationPaid(sellerId, { reference, transactionId, payload }) {
  await q(
    `UPDATE seller_activation_payments SET status = 'completed', provider_transaction_id = COALESCE(provider_transaction_id, $1), paid_at = COALESCE(paid_at, now())
     WHERE external_reference = $2`,
    [transactionId || null, reference]
  );
  await q(
    `UPDATE users SET activation_fee_paid = TRUE, activation_fee_paid_at = now() WHERE id = $1`,
    [sellerId]
  );

  const pay = (await q('SELECT * FROM seller_activation_payments WHERE external_reference = $1 LIMIT 1', [reference]))[0];
  if (!pay) return { ok: true, payout: { initiated: false, reason: 'no_attempt' } };
  if (pay.payout_status === 'done' && pay.referral_payout_status === 'done') {
    return { ok: true, already: true, payout: { initiated: false } };
  }

  const feeAmount = Number(pay.amount);
  const referralAmount = Math.min(feeAmount, Number(process.env.SELLER_ACTIVATION_REFERRAL_AMOUNT || 1000));
  const supportAmount = Math.max(0, feeAmount - referralAmount);

  const results = { support: { initiated: false }, referrer: { initiated: false } };

  if (pay.referrer_id && pay.referral_payout_status !== 'done') {
    results.referrer = await payoutActivationReferrer(pay, referralAmount);
  } else if (pay.referrer_id) {
    results.referrer = { initiated: true, already: true };
  }

  if (supportAmount > 0 && pay.payout_status !== 'done') {
    results.support = await payoutActivationSupport(pay, supportAmount);
  } else if (pay.payout_status === 'done') {
    results.support = { initiated: true, already: true };
  }

  return { ok: true, payout: results };
}

async function payoutActivationReferrer(pay, referralAmount) {
  const referrer = (await q('SELECT id, country, name, role FROM users WHERE id = $1', [pay.referrer_id]))[0];
  if (!referrer || referrer.role !== 'seller') {
    await q(
      `UPDATE seller_activation_payments SET referral_payout_status = 'failed', referral_payout_error = 'Parrain introuvable ou plus vendeur' WHERE id = $1`,
      [pay.id]
    );
    return { initiated: false, error: 'Parrain introuvable ou plus vendeur' };
  }

  const target = await payoutTargetFor(referrer, 'seller');
  if (!target) {
    await q(
      `UPDATE seller_activation_payments SET referral_payout_status = 'failed', referral_payout_error = 'Portefeuille du parrain non configuré (seller_payment_methods)' WHERE id = $1`,
      [pay.id]
    );
    return { initiated: false, error: 'Portefeuille du parrain non configuré' };
  }

  await q(`UPDATE seller_activation_payments SET referral_payout_status = 'processing' WHERE id = $1`, [pay.id]);
  try {
    const info = countryInfo(referrer.country);
    if (!info) throw new Error(`Pays du parrain non pris en charge : ${referrer.country}`);
    const currency = defaultCurrencyFor(referrer.country);
    const netAmount = ikePayFeeNet(referralAmount);
    const provider = await ikeepayPayout({
      amount: netAmount,
      currency,
      country: info.code,
      phoneNumber: target.phone,
      operator: target.operator,
      external_reference: `PAYOUT_REFSELLER:${pay.id}`,
    });
    const ref = 'activation_referral';
    await q(
      `INSERT INTO wallet_transactions (user_id, amount, currency, transaction_type, reference_type, reference_id, description)
       VALUES ($1, $2, $3, 'referral_credit', $4, $5, $6)
       ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
      [pay.referrer_id, netAmount, currency, ref, pay.id, `Commission parrainage vendeur — activation #${pay.id} (frais iKeePay déduits)`]
    );
    await q(
      `UPDATE seller_activation_payments SET referral_payout_status = 'done', referral_amount = $1, referral_payout_provider_transaction_id = COALESCE(referral_payout_provider_transaction_id, $2) WHERE id = $3`,
      [netAmount, provider.provider_reference || provider.transaction_id || null, pay.id]
    );
    return { initiated: true, provider };
  } catch (err) {
    await q(
      `UPDATE seller_activation_payments SET referral_payout_status = 'failed', referral_payout_error = $1 WHERE id = $2`,
      [String(err.message || err).slice(0, 1000), pay.id]
    );
    return { initiated: false, error: String(err.message || err) };
  }
}

async function payoutActivationSupport(pay, supportAmount) {
  const target = donationTarget(pay.operator);
  if (!target) {
    await q(
      `UPDATE seller_activation_payments SET payout_status = 'failed', payout_error = 'Portefeuille Mboppi non configuré (MBO_DONATION_ORANGE/MTN)' WHERE id = $1`,
      [pay.id]
    );
    return { initiated: false, error: 'Portefeuille Mboppi non configuré' };
  }

  await q(`UPDATE seller_activation_payments SET payout_status = 'processing' WHERE id = $1`, [pay.id]);
  try {
    const info = countryInfo('Cameroun');
    const provider = await ikeepayPayout({
      amount: ikePayFeeNet(supportAmount),
      currency: defaultCurrencyFor('Cameroun'),
      country: info ? info.code : 'CM',
      phoneNumber: target.phone,
      operator: target.operator,
      external_reference: `PAYOUT_FEE:${pay.id}`,
    });
    await q(
      `UPDATE seller_activation_payments SET payout_status = 'done', payout_provider_transaction_id = COALESCE(payout_provider_transaction_id, $1) WHERE id = $2`,
      [provider.provider_reference || provider.transaction_id || null, pay.id]
    );
    return { initiated: true, provider };
  } catch (err) {
    await q(
      `UPDATE seller_activation_payments SET payout_status = 'failed', payout_error = $1 WHERE id = $2`,
      [String(err.message || err).slice(0, 1000), pay.id]
    );
    return { initiated: false, error: err.message };
  }
}

router.post('/webhook/ikeepay', ah(async (req, res) => {
  const sentKey = String(req.headers['x-api-key'] || '');
  const secretKey = process.env.IKE_SECRET_KEY || '';
  if (secretKey && sentKey && sentKey !== secretKey) {
    return res.status(401).json({ error: 'Signature webhook invalide' });
  }
  const payload = req.body || {};
  const data = payload.data || {};
  const kind = String(data.type || '').toLowerCase();
  const status = String(data.status || '').toLowerCase();
  const reference = String(data.external_reference || '');

  const log = await q(
    `INSERT INTO payment_webhook_logs (provider, provider_transaction_id, provider_order_id, event, payload, status)
     VALUES ('ikeepay', $1, $2, $3, $4, $5) RETURNING id`,
    [data.provider_reference || null, reference || payload.order_id || null, payload.event || null, payload, 'received']
  );
  const logId = log[0].id;

  if (kind === 'payin' && status === 'completed' && reference && reference.startsWith('SALE:')) {
    const saleId = Number(reference.split(':')[1]);
    if (Number.isInteger(saleId)) {
      try {
        const result = await markSalePaid(saleId, {
          transactionId: data.provider_reference || null,
          payload,
          receivedBy: null,
        });
        await q('UPDATE payment_webhook_logs SET handled = TRUE, sale_id = $1, status = $2 WHERE id = $3', [saleId, 'completed', logId]);
        return res.json({ received: true, log_id: logId, payment: 'paid', result });
      } catch (err) {
        await q('UPDATE payment_webhook_logs SET status = $1, error = $2 WHERE id = $3', ['error', String(err.message || err).slice(0, 1000), logId]);
        throw err;
      }
    }
  }

  if (kind === 'payin' && status === 'completed' && reference && reference.startsWith('DON:')) {
    const donationId = Number(reference.split(':')[1]);
    if (Number.isInteger(donationId)) {
      try {
        const result = await handleDonationPaid(donationId, {
          transactionId: data.provider_reference || null,
          payload,
        });
        await q('UPDATE payment_webhook_logs SET handled = TRUE, status = $1 WHERE id = $2', ['donation_paid', logId]);
        return res.json({ received: true, log_id: logId, payment: 'donation', result });
      } catch (err) {
        await q('UPDATE payment_webhook_logs SET status = $1, error = $2 WHERE id = $3', ['error', String(err.message || err).slice(0, 1000), logId]);
        throw err;
      }
    }
  }

  if (kind === 'payin' && status === 'completed' && reference && reference.startsWith('FEE:')) {
    const sellerId = Number(reference.split(':')[1]);
    if (Number.isInteger(sellerId)) {
      try {
        const result = await handleSellerActivationPaid(sellerId, {
          reference,
          transactionId: data.provider_reference || null,
          payload,
        });
        await q('UPDATE payment_webhook_logs SET handled = TRUE, status = $1 WHERE id = $2', ['seller_fee_paid', logId]);
        return res.json({ received: true, log_id: logId, payment: 'seller_fee', result });
      } catch (err) {
        await q('UPDATE payment_webhook_logs SET status = $1, error = $2 WHERE id = $3', ['error', String(err.message || err).slice(0, 1000), logId]);
        throw err;
      }
    }
  }

  if (kind === 'payin' && reference && reference.startsWith('FEE:') && SELLER_FEE_FAILED_STATUSES.includes(status)) {
    await q(
      `UPDATE seller_activation_payments SET status = 'failed', provider_payload = COALESCE(provider_payload, $1)
       WHERE external_reference = $2`,
      [payload, reference]
    );
    await q('UPDATE payment_webhook_logs SET handled = TRUE, status = $1 WHERE id = $2', ['seller_fee_failed', logId]);
    return res.json({ received: true, log_id: logId, payment: 'seller_fee', status: 'failed' });
  }

  if (kind === 'payout') {
    await q('UPDATE payment_webhook_logs SET status = $1, handled = TRUE WHERE id = $2', [status || 'received', logId]);
    return res.json({ received: true, log_id: logId });
  }

  res.status(200).json({ received: true, log_id: logId });
}));

export default router;