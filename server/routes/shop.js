import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { listPhotos } from '../photo.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomShopCode() {
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

router.get('/code', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const user = (await q('SELECT shop_code FROM users WHERE id = $1', [req.user.id]))[0];
  res.json({ shop_code: user?.shop_code || null });
}));

router.post('/code', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const existing = (await q('SELECT shop_code FROM users WHERE id = $1', [req.user.id]))[0];
  if (existing && existing.shop_code) {
    return res.json({ shop_code: existing.shop_code });
  }
  let code = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomShopCode();
    const taken = (await q('SELECT id FROM users WHERE shop_code = $1', [candidate]))[0];
    if (!taken) { code = candidate; break; }
  }
  if (!code) return res.status(500).json({ error: 'Impossible de générer un code, réessayez' });
  await q('UPDATE users SET shop_code = $1 WHERE id = $2', [code, req.user.id]);
  res.json({ shop_code: code });
}));

router.get('/:id', ah(async (req, res) => {
  const shop = (
    await q(
      `SELECT id, name, location, country, phone, verified, shop_code, created_at
       FROM users WHERE id = $1 AND role IN ('shop', 'creator')`,
      [Number(req.params.id)]
    )
  )[0];
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
  const products = (
    await q(
      `SELECT p.*, u.name AS shop_name, u.location AS shop_location, u.country AS shop_country,
              s.n, s.pending_n
       FROM products p
       JOIN users u ON u.id = p.shop_id
       LEFT JOIN (SELECT product_id, SUM(quantity) AS n,
                         SUM(quantity) FILTER (WHERE status IN ('pending', 'bought', 'confirmed')) AS pending_n
                  FROM sales GROUP BY product_id) s ON s.product_id = p.id
       WHERE p.shop_id = $1 ORDER BY p.created_at DESC LIMIT 24`,
      [shop.id]
    )
  ).map((p) => ({
    ...p,
    photos: listPhotos(p.photos),
    image: listPhotos(p.photos)[0] || p.image || null,
    price: Number(p.price),
    sold: Number(p.n || 0),
    pending_count: Number(p.pending_n || 0),
  }));
  res.json({ shop, products });
}));

export default router;
