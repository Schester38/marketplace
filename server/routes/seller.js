import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { updatePaymentMethodsSchema } from "../validators.js";
import { validate } from "../middlewares/validate.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function rowMethods(m) {
  if (!m) return null;
  return {
    full_name: m.full_name,
    wallets: Array.isArray(m.wallets) ? m.wallets : [],
    updated_at: m.updated_at,
  };
}

router.get(
  "/payment-methods",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const m = (
      await q(
        "SELECT full_name, wallets, updated_at FROM seller_payment_methods WHERE seller_id = $1",
        [req.user.id]
      )
    )[0];
    res.json({ methods: rowMethods(m) });
  })
);

router.put(
  "/payment-methods",
  authRequired,
  roleRequired("seller"),
  validate(updatePaymentMethodsSchema),
  ah(async (req, res) => {
    const { full_name, wallets } = req.body;
    const name = full_name ? String(full_name).trim() : null;
    const list = Array.isArray(wallets)
      ? wallets.map((w) => ({
          name: String(w.name).trim(),
          value: String(w.value).trim(),
        }))
      : [];
    const updated = (
      await q(
        `INSERT INTO seller_payment_methods (seller_id, full_name, wallets, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (seller_id)
       DO UPDATE SET full_name = EXCLUDED.full_name, wallets = EXCLUDED.wallets, updated_at = now()
       RETURNING full_name, wallets, updated_at`,
        [req.user.id, name, JSON.stringify(list)]
      )
    )[0];
    res.json({ methods: rowMethods(updated), ok: true });
  })
);

export default router;
