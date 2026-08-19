import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { listPhotos } from '../photo.js';

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

router.get('/payment-methods', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const m = (
    await q('SELECT full_name, wallets, updated_at FROM shop_payment_methods WHERE shop_id = $1', [req.user.id])
  )[0];
  res.json({ methods: rowMethods(m) });
}));

router.put('/payment-methods', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const { full_name, wallets } = req.body || {};
  const name = full_name ? String(full_name).trim() : null;
  const list = Array.isArray(wallets)
    ? wallets
        .filter((w) => w && String(w.name || '').trim() && String(w.value || '').trim())
        .map((w) => ({
          name: String(w.name).trim(),
          value: String(w.value).trim(),
        }))
    : [];
  const updated = (
    await q(
      `INSERT INTO shop_payment_methods (shop_id, full_name, wallets, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (shop_id)
       DO UPDATE SET full_name = EXCLUDED.full_name, wallets = EXCLUDED.wallets, updated_at = now()
       RETURNING full_name, wallets, updated_at`,
      [req.user.id, name, JSON.stringify(list)]
    )
  )[0];
  res.json({ methods: rowMethods(updated), ok: true });
}));

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

router.get('/:id/payment-methods', ah(async (req, res) => {
  const m = (
    await q(
      `SELECT full_name, wallets FROM shop_payment_methods
       WHERE shop_id = $1
       AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND role IN ('shop', 'creator'))`,
      [Number(req.params.id)]
    )
  )[0];
  if (!m) return res.json({ methods: null });
  res.json({ methods: rowMethods(m) });
}));

const NORMALIZE_TEXT = (col) =>
  `regexp_replace(translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g')`;

router.get('/', ah(async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=60, max-age=30, stale-while-revalidate=30');
  const { city, role } = req.query;
  const where = ["u.role IN ('shop', 'creator')"];
  const params = [];
  if (role === 'shop' || role === 'creator') {
    where.push(`u.role = $${params.length + 1}`);
    params.push(role);
  }
  if (city) {
    const norm = String(city).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    where.push(NORMALIZE_TEXT(`COALESCE(u.city, '') || ' ' || COALESCE(u.location, '')`) + ` ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(norm);
  }
  const sql = `
    SELECT u.id, u.role, u.name, u.city, u.location, u.country, u.phone, u.verified,
           COUNT(p.id) FILTER (WHERE p.quantity > 0)::int AS product_count,
           (SELECT image FROM products p2 WHERE p2.shop_id = u.id AND p2.quantity > 0 ORDER BY p2.created_at DESC LIMIT 1) AS sample_image
    FROM users u
    LEFT JOIN products p ON p.shop_id = u.id
    WHERE ${where.join(' AND ')}
    GROUP BY u.id
    ORDER BY u.name ASC`;
  const shops = await q(sql, params);
  res.json({ shops });
}));

router.get('/:id', ah(async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=120, max-age=60, stale-while-revalidate=30');
  const shop = (
    await q(
      `SELECT id, name, role, location, country, phone, verified, shop_code, created_at
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
       WHERE p.shop_id = $1 AND p.quantity > 0 ORDER BY p.created_at DESC LIMIT 24`,
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
