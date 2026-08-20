import { Router } from 'express';
import { q } from '../db.js';
import { ikeepayPayin, ikeepayPayout, ikeepayEnabled, countryInfo, normalizePhone, operatorsForCountry, ikePayFeeNet } from '../ikeepay.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function donationTarget(operator) {
  const info = countryInfo('Cameroun');
  const prefix = info ? info.prefix : '237';
  const withPrefix = (raw) => {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    if (!digits) return '';
    return digits.startsWith(prefix) ? digits : prefix + digits;
  };
  const orange = withPrefix(process.env.MBO_DONATION_ORANGE);
  const mtn = withPrefix(process.env.MBO_DONATION_MTN);
  const op = String(operator || '').toUpperCase();
  if (/^MTN/.test(op) && mtn) return { operator: 'MTN', phone: mtn };
  if (orange) return { operator: 'ORANGE', phone: orange };
  return null;
}

router.post('/', ah(async (req, res) => {
  const { amount, operator, phone_number, country } = req.body || {};
  const amt = Math.round(Number(amount || 0) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Montant de don invalide' });
  }
  if (!ikeepayEnabled()) return res.status(503).json({ error: 'Paiement iKeePay non configuré' });
  if (!operator) return res.status(400).json({ error: 'Opérateur de paiement requis' });
  const countryName = String(country || 'Cameroun');
  const info = countryInfo(countryName);
  if (!info) return res.status(422).json({ error: `Pays non pris en charge : ${countryName}` });
  const operatorCode = String(operator).trim().toUpperCase();
  const allowedOperators = operatorsForCountry(countryName);
  if (!allowedOperators.includes(operatorCode)) {
    return res.status(422).json({ error: `Opérateur non disponible pour ${countryName} (iKeePay : ${allowedOperators.join(', ')} ou aucun)` });
  }

  const rawPhone = String(phone_number || '').replace(/[^\d]/g, '');
  const normalized = info.prefix + normalizePhone(rawPhone, countryName);
  if (normalized === info.prefix) {
    return res.status(400).json({ error: 'Numéro de téléphone du donateur requis (il recevra la demande de paiement)' });
  }

  const created = (await q(
    `INSERT INTO donations (amount, currency, country, donor_phone, operator, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
    [amt, 'XAF', countryName, normalized, operatorCode]
  ))[0];

  const external_reference = `DON:${created.id}`;

  let provider;
  try {
    provider = await ikeepayPayin({
      amount: amt,
      currency: 'XAF',
      country: info.code,
      phoneNumber: normalized,
      operator: operatorCode,
      external_reference,
    });
  } catch (err) {
    await q(`UPDATE donations SET status = 'failed' WHERE id = $1`, [created.id]);
    throw err;
  }

  if (!provider) {
    await q(`UPDATE donations SET status = 'failed' WHERE id = $1`, [created.id]);
    return res.status(502).json({ error: 'Aucune réponse du fournisseur de paiement' });
  }

  await q(
    `UPDATE donations SET external_reference = $1, provider_transaction_id = $2, provider_payload = $3 WHERE id = $4`,
    [external_reference, provider.provider_reference || provider.transaction_id || null, provider, created.id]
  );

  res.json({
    ok: true,
    donation_id: created.id,
    external_reference,
    payment_link: provider.payment_link || provider.payment_url || null,
    requires_otp: Boolean(provider.requires_otp || provider.otp_required),
    provider_transaction: provider.provider_reference || provider.transaction_id || null,
  });
}));

export async function handleDonationPaid(donationId, { transactionId, payload }) {
  const donation = (await q('SELECT * FROM donations WHERE id = $1', [donationId]))[0];
  if (!donation) return { ok: false, error: 'Don introuvable' };

  await q(
    `UPDATE donations SET status = 'paid', paid_at = COALESCE(paid_at, now()),
       provider_transaction_id = COALESCE(provider_transaction_id, $1), provider_payload = COALESCE(provider_payload, $2)
     WHERE id = $3`,
    [transactionId || null, payload || null, donationId]
  );

  if (donation.payout_status === 'done') return { ok: true, already: true, payout: { initiated: false } };

  const target = donationTarget(donation.operator);
  if (!target) {
    await q(
      `UPDATE donations SET payout_status = 'failed', payout_error = 'Portefeuille Mboppi non configuré (MBO_DONATION_ORANGE/MTN)' WHERE id = $1`,
      [donationId]
    );
    return { ok: true, payout: { initiated: false, error: 'Portefeuille Mboppi non configuré' } };
  }

  await q(`UPDATE donations SET payout_status = 'processing' WHERE id = $1`, [donationId]);
  try {
    const info = countryInfo('Cameroun');
    const provider = await ikeepayPayout({
      amount: ikePayFeeNet(donation.amount),
      currency: donation.currency || 'XAF',
      country: info ? info.code : 'CM',
      phoneNumber: target.phone,
      operator: target.operator,
      external_reference: `PAYOUT_DONATION:${donationId}`,
    });
    await q(
      `UPDATE donations SET payout_status = 'done', payout_provider_transaction_id = $1 WHERE id = $2`,
      [provider.provider_reference || provider.transaction_id || null, donationId]
    );
    return { ok: true, payout: { initiated: true, provider } };
  } catch (err) {
    await q(
      `UPDATE donations SET payout_status = 'failed', payout_error = $1 WHERE id = $2`,
      [String(err.message || err).slice(0, 1000), donationId]
    );
    return { ok: true, payout: { initiated: false, error: err.message } };
  }
}

export default router;