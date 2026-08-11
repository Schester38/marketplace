import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/product/:id', ah(async (req, res) => {
  const productId = Number(req.params.id);
  const [summary] = await q(
    'SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0)::numeric(3, 2) AS avg FROM reviews WHERE product_id = $1',
    [productId]
  );
  const reviews = await q(
    `SELECT r.*, u.name AS user_name
     FROM reviews r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC LIMIT 50`,
    [productId]
  );
  res.json({
    summary: { count: Number(summary.n), avg: Number(summary.avg) },
    reviews: reviews.map((r) => ({ ...r, rating: Number(r.rating) })),
  });
}));

router.post('/', authRequired, ah(async (req, res) => {
  const { product_id, rating, comment } = req.body || {};
  const pid = Number(product_id);
  const r = Number(rating);
  if (!Number.isInteger(pid) || !Number.isInteger(r) || r < 1 || r > 5) {
    return res.status(400).json({ error: 'Avis invalide' });
  }
  const product = (await q('SELECT id, shop_id FROM products WHERE id = $1', [pid]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (Number(product.shop_id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Vous ne pouvez pas noter votre propre produit' });
  }
  const created = await q(
    `INSERT INTO reviews (product_id, user_id, buyer_name, rating, comment)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [pid, req.user.id, req.user.name, r, comment ? String(comment).trim().slice(0, 500) : null]
  );
  res.status(201).json({ review: { ...created[0], rating: Number(created[0].rating) } });
}));

export default router;
