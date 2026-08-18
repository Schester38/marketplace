import { Router } from 'express';
import { q } from '../db.js';
import { ikeepayPayin, ikeepayEnabled, countryInfo, normalizePhone } from '../ikeepay.js';
import { markSalePaid } from '../finance.js';
import { handleDonationPaid } from './donations.js';

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
  const amount = Number(total);

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
    payment_link: provider.payment_link || provider.payment_url || null,
    requires_otp: Boolean(provider.requires_otp || provider.otp_required),
    external_reference,
    provider_transaction: provider.provider_reference || provider.transaction_id || null,
    log_id: queued[0].id,
  });
}));

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

  if (kind === 'payout') {
    await q('UPDATE payment_webhook_logs SET status = $1, handled = TRUE WHERE id = $2', [status || 'received', logId]);
    return res.json({ received: true, log_id: logId });
  }

  res.status(200).json({ received: true, log_id: logId });
}));

export default router;