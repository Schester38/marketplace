import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UNIT_COMMISSION = 1000;

// Parrainés dont l'adhésion est payée et qui ne font partie d'aucune demande
// PAYÉE. Ils définissent le « solde disponible » affiché : tant que la demande
// est en attente, le montant reste visible et ne disparaît qu'au paiement par
// l'admin.
async function displayMembers(sellerId) {
  return q(
    `SELECT u.id, u.name, u.role, u.reference_number
       FROM users u
       WHERE u.referred_by = $1 AND u.role IN ('seller', 'creator')
         AND u.membership_paid_at IS NOT NULL
         AND u.id NOT IN (
           SELECT wi.member_id FROM activation_withdrawal_items wi
           JOIN activation_withdrawals w ON w.id = wi.withdrawal_id
           WHERE w.seller_id = $1 AND w.status = 'paid'
         )
       ORDER BY u.created_at DESC`,
    [sellerId]
  );
}

// Parrainés éligibles pour UNE NOUVELLE demande : plus restrictif, exclut ceux
// déjà verrouillés par une demande en attente OU payée (pas de double retrait).
async function lockableMembers(sellerId) {
  return q(
    `SELECT u.id, u.name, u.role, u.reference_number
       FROM users u
       WHERE u.referred_by = $1 AND u.role IN ('seller', 'creator')
         AND u.membership_paid_at IS NOT NULL
         AND u.id NOT IN (
           SELECT wi.member_id FROM activation_withdrawal_items wi
           JOIN activation_withdrawals w ON w.id = wi.withdrawal_id
           WHERE w.seller_id = $1
         )
       ORDER BY u.created_at DESC`,
    [sellerId]
  );
}

// Solde disponible + historique des demandes du vendeur courant.
router.get(
  "/me",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const [display, lockable, withdrawals] = await Promise.all([
      displayMembers(req.user.id),
      lockableMembers(req.user.id),
      q(
        `SELECT id, amount, status, comment, email, created_at, paid_at
           FROM activation_withdrawals WHERE seller_id = $1
           ORDER BY created_at DESC`,
        [req.user.id]
      ),
    ]);
    res.json({
      available: display.length * UNIT_COMMISSION,
      available_count: display.length,
      min_amount: 5000,
      locked_by_pending: display.length - lockable.length,
      withdrawals: (withdrawals || []).map((w) => ({
        ...w,
        amount: Number(w.amount),
        created_at: w.created_at,
        paid_at: w.paid_at,
      })),
    });
  })
);

// Crée une demande de retrait. Le montant doit être un multiple de 1 000,
// inférieur ou égal au solde disponible, et ≥ 5 000 F. L'email est obligatoire.
// Les parrainés correspondants sont verrouillés ; le montant ne disparaît du
// solde qu'au paiement par l'admin.
router.post(
  "/",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const { amount, comment, email } = req.body || {};
    const cleanEmail = email ? String(email).trim().slice(0, 200) : "";
    if (!cleanEmail) {
      return res.status(400).json({ error: "L'email est obligatoire." });
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: "Montant invalide." });
    }
    const members = await lockableMembers(req.user.id);
    const maxAvailable = members.length * UNIT_COMMISSION;
    if (maxAvailable < 5000) {
      return res
        .status(400)
        .json({ error: "Le montant minimum de retrait est de 5 000 F." });
    }
    if (value > maxAvailable) {
      return res
        .status(400)
        .json({
          error: "Le montant doit être inférieur ou égal à votre solde disponible.",
        });
    }
    if (value % UNIT_COMMISSION !== 0) {
      return res
        .status(400)
        .json({ error: "Le montant doit être un multiple de 1 000 F." });
    }
    const count = value / UNIT_COMMISSION;
    const toLock = members.slice(0, count);
    if (toLock.length !== count) {
      return res
        .status(400)
        .json({ error: "Solde insuffisant pour ce montant." });
    }
    const cleanComment = comment ? String(comment).trim().slice(0, 500) : null;
    const created = await withTransaction(async (tx) => {
      const [w] = await tx.query(
        `INSERT INTO activation_withdrawals (seller_id, amount, comment, email)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.user.id, value, cleanComment, cleanEmail]
      );
      for (const m of toLock) {
        await tx.query(
          `INSERT INTO activation_withdrawal_items (withdrawal_id, member_id) VALUES ($1, $2)`,
          [w.id, m.id]
        );
      }
      return w;
    });
    await q(
      `INSERT INTO notifications (user_id, type, amount) VALUES ($1, 'activation_withdrawal_requested', $2)`,
      [req.user.id, value]
    );
    res.json({ ok: true, id: created.id, amount: value });
  })
);

export default router;