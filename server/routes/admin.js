import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired, signToken } from '../auth.js';
import { logAudit } from '../security.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isId = (v) => Number.isInteger(v) && v > 0;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

router.post('/pass', ah(async (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Accès admin non configuré' });
  }
  const { password } = req.body || {};
  if (!password || password.length > 200) {
    return res.status(400).json({ error: 'Mot de passe manquant' });
  }
  if (password !== ADMIN_PASSWORD) {
    logAudit(null, 'admin.pass_failed', null, req.ip);
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const admin = { id: 0, email: 'admin@mboppi.local', role: 'admin', name: 'Administrateur' };
  const token = signToken(admin);
  logAudit(null, 'admin.pass_ok', 'Connexion admin par mot de passe', req.ip);
  res.json({ token, user: { id: admin.id, name: admin.name, role: 'admin', email: admin.email } });
}));

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

router.get('/transactions', ah(async (req, res) => {
  const rows = await q(
    `SELECT s.id, s.status, s.created_at, s.quantity, s.total_price, s.commission,
            s.referral_commission, s.paid, s.referral_paid, s.delivered_at, s.payment_method,
            s.buyer_name, s.buyer_city,
            p.name AS product_name, p.shop_id,
            shop.name AS shop_name, shop.country AS shop_country,
            COALESCE(u.name, '—') AS seller_name, u.seller_code,
            COALESCE(parrain.name, '—') AS parrain_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     LEFT JOIN users u ON u.id = s.seller_id
     LEFT JOIN users parrain ON parrain.id = s.referred_by
     ORDER BY s.created_at DESC
     LIMIT 300`
  );
  const byStatus = await q(
    `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(total_price), 0) AS total
     FROM sales GROUP BY status ORDER BY cnt DESC`
  );
  const byShop = await q(
    `SELECT shop.name AS shop_name, shop.country AS shop_country, COUNT(*) AS cnt,
            COALESCE(SUM(s.total_price), 0) AS revenue,
            COALESCE(SUM(s.commission), 0) + COALESCE(SUM(s.referral_commission), 0) AS commission
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     GROUP BY shop.id, shop.name, shop.country
     ORDER BY revenue DESC LIMIT 20`
  );
  const bySeller = await q(
    `SELECT COALESCE(u.name, '—') AS seller_name, u.seller_code, COUNT(*) AS cnt,
            COALESCE(SUM(s.commission), 0) AS commission,
            COALESCE(SUM(CASE WHEN s.paid THEN s.commission ELSE 0 END), 0) AS paid
     FROM sales s
     LEFT JOIN users u ON u.id = s.seller_id
     GROUP BY u.id, u.name, u.seller_code
     ORDER BY commission DESC LIMIT 20`
  );
  const [direct] = await q(
    'SELECT COUNT(*) AS cnt, COALESCE(SUM(total_price), 0) AS total FROM sales WHERE seller_id IS NULL'
  );
  const [withSeller] = await q(
    'SELECT COUNT(*) AS cnt, COALESCE(SUM(total_price), 0) AS total FROM sales WHERE seller_id IS NOT NULL'
  );
  res.json({
    rows: rows.map((r) => ({
      ...r,
      total_price: Number(r.total_price),
      commission: Number(r.commission),
      referral_commission: Number(r.referral_commission),
    })),
    by_status: byStatus.map((r) => ({ status: r.status, count: Number(r.cnt), total: Number(r.total) })),
    by_shop: byShop.map((r) => ({ shop_name: r.shop_name, country: r.shop_country, count: Number(r.cnt), revenue: Number(r.revenue), commission: Number(r.commission) })),
    by_seller: bySeller.map((r) => ({ seller_name: r.seller_name, seller_code: r.seller_code, count: Number(r.cnt), commission: Number(r.commission), paid: Number(r.paid) })),
    direct: { count: Number(direct.cnt), total: Number(direct.total) },
    with_seller: { count: Number(withSeller.cnt), total: Number(withSeller.total) },
  });
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

router.post('/messages', ah(async (req, res) => {
  const { message, target, userId } = req.body || {};
  const text = String(message || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const kind = target === 'user' ? 'user' : 'all';
  let uid = null;
  if (kind === 'user') {
    uid = Number(userId);
    if (!isId(uid)) return res.status(400).json({ error: 'Utilisateur invalide' });
    const user = (await q('SELECT id FROM users WHERE id = $1', [uid]))[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  }
  const created = await q(
    `INSERT INTO admin_messages (message, target, user_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [text, kind, uid]
  );
  await logAudit(req.user.id, 'admin.send_message', `target=${kind} user=${uid}`, req.ip);
  res.json({ ok: true, id: created[0].id });
}));

router.get('/messages', ah(async (req, res) => {
  const rows = await q(
    `SELECT m.id, m.message, m.target, m.user_id, u.name AS user_name, m.created_at
     FROM admin_messages m
     LEFT JOIN users u ON u.id = m.user_id
     ORDER BY m.id DESC LIMIT 50`
  );
  res.json({ messages: rows });
}));

export default router;
