import { Router } from "express";
import { q } from "../db.js";
import {
  countryCode,
  currencyForCountry,
  normalizePhone as normalizeIkeepayPhone,
  payin,
} from "../ikeepay.js";
import { donationSchema, donationIkeepaySchema } from "../validators.js";
import { validate } from "../middlewares/validate.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  "/",
  validate(donationSchema),
  ah(async (req, res) => {
    const { amount, operator, phone_number, country } = req.body;
    const amt = Math.round(Number(amount || 0) * 100) / 100;
    const countryName = String(country || "Cameroun");
    const operatorCode = String(operator).trim().toUpperCase();
    const allowedOperators = ["ORANGE", "MTN", "WAVE", "MOOV", "MOBICASH", "AIRTEL", "VODACOM"];
    if (!allowedOperators.includes(operatorCode)) {
      return res.status(422).json({ error: `Opérateur non disponible pour ${countryName}` });
    }

    const rawPhone = String(phone_number || "").replace(/[^\d]/g, "");
    const normalized = info.prefix + normalizePhone(rawPhone, countryName);
    if (normalized === info.prefix) {
      return res.status(400).json({ error: "Numéro de téléphone du donateur requis" });
    }

    const created = (
      await q(
        `INSERT INTO donations (amount, currency, country, donor_phone, operator, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [amt, "XAF", countryName, normalized, operatorCode]
      )
    )[0];

    res.json({
      ok: true,
      donation_id: created.id,
      external_reference: `DON:${created.id}`,
      payment_link: null,
      requires_otp: false,
      provider_transaction: null,
      manual: true,
      instructions: `Effectuez un virement de ${amt} XAF sur le compte ${operator} du projet Mboppi, puis envoyez la capture d'écran à l'équipe Mboppi pour validation.`,
    });
  })
);

router.post(
  "/ikeepay",
  validate(donationIkeepaySchema),
  ah(async (req, res) => {
    const { amount, country, operator, phone_number } = req.body;
    const amt = Math.round(Number(amount || 0) * 100) / 100;
    const countryCodeVal = countryCode(country || "CM");
    const operatorCode = String(operator).trim().toUpperCase();
    const phone = normalizeIkeepayPhone(phone_number, countryCodeVal);
    const currency = currencyForCountry(country);
    const reference = `DONATION:${Date.now()}:${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const created = (
      await q(
        "INSERT INTO donations (amount, currency, country, donor_phone, operator, external_reference) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [amount, currency, country, phone, operator, reference]
      )
    )[0];
    try {
      const result = await payin({
        amount,
        currency,
        country: countryCodeVal,
        phoneNumber: phone,
        operator,
        external_reference: reference,
      });
      const link = result.payment_link || result.data?.payment_link || null;
      await q("UPDATE donations SET payment_link = $1 WHERE id = $2", [link, created.id]);
      res.status(201).json({
        ok: true,
        donation_id: created.id,
        payment_link: link,
        external_reference: reference,
        provider: result,
      });
    } catch (error) {
      await q("UPDATE donations SET status = 'failed' WHERE id = $1", [created.id]);
      throw error;
    }
  })
);

function normalizePhone(phone, countryName) {
  let p = String(phone || "").replace(/[^\d]/g, "");
  if (!p) return "";
  const info = { prefix: "237" };
  if (info && p.startsWith(info.prefix)) p = p.slice(info.prefix.length);
  if (/^0/.test(p)) p = p.slice(1);
  return p;
}

export default router;
