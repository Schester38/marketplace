import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/me', authRequired, roleRequired('seller', 'creator'), ah(async (req, res) => {
  const summary = (await q(`
    SELECT COALESCE(SUM(amount), 0) AS balance,
           COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS credits,
           COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS debits,
           MAX(created_at) AS last_transaction_at
    FROM wallet_transactions WHERE user_id = $1
  `, [req.user.id]))[0];
  const transactions = await q(`
    SELECT id, amount, currency, transaction_type, reference_type, reference_id, description, created_at
    FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100
  `, [req.user.id]);
  res.json({
    currency: 'XAF',
    balance: Number(summary.balance),
    credits: Number(summary.credits),
    debits: Number(summary.debits),
    last_transaction_at: summary.last_transaction_at,
    transactions: transactions.map(t => ({ ...t, amount: Number(t.amount) }))
  });
}));

export default router;
