import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { q } from '../db.js';
import { countryCode, currencyForCountry, normalizePhone, payin } from '../ikeepay.js';
import { completeAutomaticPayout, paySaleAutomatically } from '../finance.js';

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET); } catch {}
  }
  next();
};

router.post('/ikeepay/payin', optionalAuth, ah(async (req, res) => {
  const saleId = Number(req.body?.sale_id);
  const sale = (await q('SELECT * FROM sales WHERE id = $1', [saleId]))[0];
  if (!sale) return res.status(404).json({ error: 'Vente introuvable' });
  if (sale.buyer_id && (!req.user || sale.buyer_id !== req.user.id)) return res.status(403).json({ error: 'Cette commande ne vous appartient pas' });
  if (!sale.buyer_id && String(req.body?.confirm_code || '').trim().toUpperCase() !== String(sale.confirm_code || '').toUpperCase()) return res.status(403).json({ error: 'Code de confirmation incorrect' });
  if (sale.status === 'cancelled') return res.status(409).json({ error: 'Cette commande est annulée' });
  if (sale.payment_status === 'paid' || sale.payment_status === 'completed') return res.json({ ok: true, already_paid: true });
  if (sale.payment_external_reference) return res.json({ ok: true, pending: true, payment_link: sale.payment_link });

  const country = countryCode(req.body?.country || sale.payment_country || req.user.country);
  const operator = String(req.body?.operator || '').trim().toUpperCase();
  const phone = normalizePhone(req.body?.phone || sale.buyer_phone, country);
  if (!country || !operator || !phone) return res.status(400).json({ error: 'Pays, opérateur et numéro Mobile Money requis' });
  const externalReference = `SALE:${sale.id}:${Date.now()}`;
  const result = await payin({
    amount: Number(sale.total_price) + Number(sale.delivery_fee || 0),
    currency: sale.currency || currencyForCountry(country),
    country,
    phoneNumber: phone,
    operator,
    external_reference: externalReference,
    customer_email: req.user?.email || undefined,
  });
  const paymentLink = result.payment_link || result.data?.payment_link || null;
  await q(
    `UPDATE sales SET online_payment = TRUE, payment_status = 'pending', payment_provider = 'ikeepay',
       payment_external_reference = $1, payment_link = $2, payment_country = $3, payment_operator = $4,
       payment_error = NULL WHERE id = $5`,
    [externalReference, paymentLink, country, operator, sale.id]
  );
  res.status(201).json({ ok: true, external_reference: externalReference, payment_link: paymentLink, provider: result });
}));

router.post('/ikeepay/webhook', ah(async (req, res) => {
  const data = req.body?.data || {};
  const external = String(data.external_reference || '').trim();
  if (!external) return res.status(400).json({ error: 'Référence externe manquante' });
  const logged = await q(
    `INSERT INTO payment_webhook_logs (provider, provider_transaction_id, provider_order_id, event, payload, status)
     VALUES ('ikeepay', $1, $2, $3, $4, $5) RETURNING id`,
    [data.provider_reference || null, external, req.body?.event || null, req.body, data.status || null]
  );
  const sale = (await q('SELECT * FROM sales WHERE payment_external_reference = $1', [external]))[0];
  if (String(data.type || '').toLowerCase() === 'payout') {
    const payoutStatus = String(data.status || '').toLowerCase();
    let payoutResult;
    if (payoutStatus === 'failed') {
      await q('UPDATE automatic_payouts SET status = \'failed\', provider_reference = COALESCE($1, provider_reference), error = $2 WHERE external_reference = $3', [data.provider_reference || null, 'Le prestataire a refusé le retrait', external]);
      payoutResult = { ok: false, error: 'Le prestataire a refusé le retrait' };
    } else if (payoutStatus === 'completed') {
      payoutResult = await completeAutomaticPayout(external, data.provider_reference || null);
    } else {
      await q('UPDATE automatic_payouts SET status = \'pending\', provider_reference = COALESCE($1, provider_reference) WHERE external_reference = $2', [data.provider_reference || null, external]);
      payoutResult = { ok: true, pending: true };
    }
    await q('UPDATE payment_webhook_logs SET handled = $1, error = $2 WHERE id = $3', [payoutResult.ok, payoutResult.error || null, logged[0].id]);
  } else if (sale && String(data.type || '').toLowerCase() === 'payin') {
    const status = String(data.status || '').toLowerCase();
    const next = status === 'completed' ? 'paid' : status === 'failed' ? 'failed' : 'pending';
    await q(
      `UPDATE sales SET payment_status = $1, payment_provider_reference = COALESCE($2, payment_provider_reference),
         payment_error = CASE WHEN $1 = 'failed' THEN $3 ELSE NULL END, paid = CASE WHEN $1 = 'paid' THEN TRUE ELSE paid END,
         paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
       WHERE id = $4`,
      [next, data.provider_reference || null, data.status || null, sale.id]
    );
    if (next === 'paid') await paySaleAutomatically(sale.id);
    await q('UPDATE payment_webhook_logs SET sale_id = $1, handled = TRUE WHERE id = $2', [sale.id, logged[0].id]);
  }
  res.json({ ok: true });
}));

export default router;