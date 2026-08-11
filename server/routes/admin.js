import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { logAudit } from '../security.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isId = (v) => Number.isInteger(v) && v > 0;

router.use(authRequired, roleRequired('admin'));

router.get('/stats', ah(async (req, res) => {
  const [users] = await q('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE role = \'shop\') AS shops, COUNT(*) FILTER (WHERE role = \'creator\') AS creators, COUNT(*) FILTER (WHERE role = \'seller\') AS sellers, COUNT(*) FILTER (WHERE role = \'client\') AS clients, COUNT(*) FILTER (WHERE role = \'livreur\') AS livreurs FROM users');
  const [products] = await q('SELECT COUNT(*) AS total FROM products');
  const [sales] = await q('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = \'pending\') AS pending, COUNT(*) FILTER (WHERE status = \'delivered\') AS delivered, COALESCE(SUM(total_price) FILTER (WHERE status = \'delivered\'), 0) AS revenue FROM sales');
  const [reviews] = await q('SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0)::numeric(3, 2) AS avg FROM reviews');
  const [today] = await q("SELECT COUNT(*) AS users_today FROM users WHERE created_at >= CURRENT_DATE");
  res.json({
    stats: {
      users: Number(users.total),
      shops: Number(users.shops),
      creators: Number(users.creators),
      sellers: Number(users.sellers),
      clients: Number(users.clients),
      livreurs: Number(users.livreurs),
      products: Number(products.total),
      sales: Number(sales.total),
      pending_sales: Number(sales.pending),
      delivered_sales: Number(sales.delivered),
      revenue: Number(sales.revenue),
      reviews: Number(reviews.total),
      rating_avg: Number(reviews.avg),
      users_today: Number(today.users_today),
    },
  });
}));

router.get('/users', ah(async (req, res) => {
  const search = req.query.search ? String(req.query.search).trim().slice(0, 60) : '';
  const users = await q(
    `SELECT id, name, email, role, country, location, phone, verified, seller_code, shop_code, created_at
     FROM users
     WHERE $1 = '' OR name ILIKE $2 OR email ILIKE $2
     ORDER BY created_at DESC LIMIT 100`,
    [search, `%${search}%`]
  );
  res.json({ users });
}));

router.patch('/users/:id/verified', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!isId(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const verified = Boolean(req.body && req.body.verified);
  const updated = await q('UPDATE users SET verified = $1 WHERE id = $2 RETURNING id', [verified, id]);
  if (!updated.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
  await logAudit(req.user.id, 'admin.set_verified', `user=${id} verified=${verified}`, req.ip);
  res.json({ ok: true, verified });
}));

router.get('/products', ah(async (req, res) => {
  const products = (
    await q(
      `SELECT p.id, p.name, p.price, p.category, p.created_at, p.shop_id,
              u.name AS shop_name, u.verified AS shop_verified
       FROM products p JOIN users u ON u.id = p.shop_id
       ORDER BY p.created_at DESC LIMIT 100`
    )
  ).map((p) => ({ ...p, price: Number(p.price) }));
  res.json({ products });
}));

router.delete('/products/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!isId(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const product = (await q('SELECT id FROM products WHERE id = $1', [id]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  await q('DELETE FROM products WHERE id = $1', [product.id]);
  await logAudit(req.user.id, 'admin.delete_product', `product=${product.id}`, req.ip);
  res.json({ ok: true });
}));

router.get('/activity', ah(async (req, res) => {
  const rows = await q(
    `SELECT s.id, s.status, s.total_price, s.created_at,
            p.name AS product_name, shop.name AS shop_name, u.name AS seller_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     JOIN users u ON u.id = s.seller_id
     ORDER BY s.created_at DESC LIMIT 50`
  );
  res.json({
    rows: rows.map((r) => ({ ...r, total_price: Number(r.total_price) })),
  });
}));

export default router;
