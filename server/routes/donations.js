import { Router } from 'express';
import { q } from '../db.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/', ah(async (req, res) => {
  const { amount, operator, phone_number, country } = req.body || {};
  const amt = Math.round(Number(amount || 0) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Montant de don invalide' });
  }
  if (!operator) return res.status(400).json({ error: 'Opérateur de paiement requis' });
  const countryName = String(country || 'Cameroun');
  const info = { code: 'CM', prefix: '237' };
  const operatorCode = String(operator).trim().toUpperCase();
  const allowedOperators = ['ORANGE', 'MTN', 'WAVE', 'MOOV', 'MOBICASH', 'AIRTEL', 'VODACOM'];
  if (!allowedOperators.includes(operatorCode)) {
    return res.status(422).json({ error: `Opérateur non disponible pour ${countryName}` });
  }

  const rawPhone = String(phone_number || '').replace(/[^\d]/g, '');
  const normalized = info.prefix + normalizePhone(rawPhone, countryName);
  if (normalized === info.prefix) {
    return res.status(400).json({ error: 'Numéro de téléphone du donateur requis' });
  }

  const created = (await q(
    `INSERT INTO donations (amount, currency, country, donor_phone, operator, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
    [amt, 'XAF', countryName, normalized, operatorCode]
  ))[0];

  res.json({
    ok: true,
    donation_id: created.id,
    external_reference: `DON:${created.id}`,
    payment_link: null,
    requires_otp: false,
    provider_transaction: null,
    manual: true,
    instructions: `Effectuez un virement de ${amt} XAF sur le compte ${operator} du projet Mboppi, puis envoyez la capture d'écran à l'équipe Mboppi pour validation.`
  });
}));

function normalizePhone(phone, countryName) {
  let p = String(phone || '').replace(/[^\d]/g, '');
  if (!p) return '';
  const info = { prefix: '237' };
  if (info && p.startsWith(info.prefix)) p = p.slice(info.prefix.length);
  if (/^0/.test(p)) p = p.slice(1);
  return p;
}

export default router;