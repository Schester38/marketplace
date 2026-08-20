import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authRequired, ah(async (req, res) => {
  const notifications = (
    await q(
      `SELECT n.*, s.product_id, COALESCE(p.name, n.product_name) AS product_name,
              seller.name AS seller_name, seller.id AS seller_id, seller.seller_code,
              parrain.name AS parrain_name, parrain.id AS parrain_id,
              shop.name AS shop_name, shop.id AS shop_id, shop.country AS shop_country,
              buyer.name AS buyer_name, buyer.id AS buyer_id, s.referral_commission
       FROM notifications n
       LEFT JOIN sales s ON s.id = n.sale_id
       LEFT JOIN products p ON p.id = s.product_id
       LEFT JOIN users seller ON seller.id = s.seller_id
       LEFT JOIN users parrain ON parrain.id = s.referred_by
       LEFT JOIN users shop ON shop.id = p.shop_id
       LEFT JOIN users buyer ON buyer.id = s.buyer_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    )
  );
  const unread = (
    await q('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE', [req.user.id])
  )[0];
  res.json({ notifications, unread_count: Number(unread.count) });
}));

router.post('/read', authRequired, ah(async (req, res) => {
  await q('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
}));

router.delete('/:id', authRequired, ah(async (req, res) => {
  const deleted = await q(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [Number(req.params.id), req.user.id]
  );
  if (!deleted.length) return res.status(404).json({ error: 'Notification introuvable' });
  res.json({ ok: true });
}));

export default router;
