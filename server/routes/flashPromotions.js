import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { listPhotos } from '../photo.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MAX_ACTIVE_PER_SHOP = 3;
const DEFAULT_MINUTES = 180;
const MAX_MINUTES = 720;

async function purgeExpired() {
  await q('DELETE FROM flash_promotions WHERE ends_at <= now()');
}

function promoRow(row) {
  if (!row) return null;
  const photoList = listPhotos(row.photos);
  return {
    id: row.id,
    shop_id: row.shop_id,
    shop_name: row.shop_name,
    shop_verified: row.shop_verified,
    shop_country: row.shop_country,
    product_id: row.product_id,
    product_name: row.name,
    product_category: row.category,
    image: photoList[0] || row.image || null,
    photos: photoList,
    price: Number(row.price),
    promo_price: Number(row.promo_price),
    discount_percent: row.price > 0 ? Math.round((1 - Number(row.promo_price) / Number(row.price)) * 100) : 0,
    currency: row.currency || 'XAF',
    duration_minutes: Number(row.duration_minutes),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    created_at: row.created_at,
  };
}

// Liste publique des promotions actives (les expirées sont purgées de la base).
router.get('/', ah(async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=30, max-age=15, stale-while-revalidate=15');
  await purgeExpired();
  const rows = await q(
    `SELECT fp.*, p.name, p.price, p.category, p.image, p.photos, p.currency,
            u.name AS shop_name, u.verified AS shop_verified, u.country AS shop_country
     FROM flash_promotions fp
     JOIN products p ON p.id = fp.product_id
     JOIN users u ON u.id = fp.shop_id
     WHERE fp.ends_at > now() AND p.quantity > 0
     ORDER BY fp.ends_at ASC
     LIMIT 20`
  );
  res.json({ promotions: rows.map(promoRow) });
}));

// Création par une boutique (le produit doit lui appartenir).
router.post('/', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const { product_id, promo_price, duration_minutes } = req.body || {};
  const product = (
    await q('SELECT id, price, quantity, name, currency FROM products WHERE id = $1 AND shop_id = $2', [
      Number(product_id || 0),
      req.user.id,
    ])
  )[0];
  if (!product) {
    return res.status(400).json({ error: 'Produit introuvable ou ne vous appartient pas.' });
  }
  if (Number(product.quantity || 0) <= 0) {
    return res.status(400).json({ error: 'Ce produit est en rupture de stock.' });
  }
  const price = Number(promo_price);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'Prix promotionnel invalide.' });
  }
  if (price >= Number(product.price)) {
    return res.status(400).json({ error: 'Le prix promotionnel doit être inférieur au prix normal.' });
  }
  const minutes = Math.max(1, Math.min(MAX_MINUTES, Math.round(Number(duration_minutes) || DEFAULT_MINUTES)));
  const conflict = (
    await q(
      `SELECT f.id FROM flash_promotions f
       WHERE f.product_id = $1 AND f.shop_id = $2 AND f.ends_at > now()
       LIMIT 1`,
      [product.id, req.user.id]
    )
  )[0];
  if (conflict) {
    return res.status(400).json({ error: 'Ce produit a déjà une promotion en cours.' });
  }
  const activeCount = (
    await q(
      `SELECT COUNT(*)::int AS cnt FROM flash_promotions
       WHERE shop_id = $1 AND ends_at > now()`,
      [req.user.id]
    )
  )[0].cnt;
  if (activeCount >= MAX_ACTIVE_PER_SHOP) {
    return res.status(400).json({ error: `Maximum ${MAX_ACTIVE_PER_SHOP} promotions en même temps.` });
  }
  const created = (
    await q(
      `INSERT INTO flash_promotions (shop_id, product_id, promo_price, duration_minutes, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, now(), now() + make_interval(mins => $4::int))
       RETURNING *`,
      [req.user.id, product.id, price, minutes]
    )
  )[0];
  const row = await q(
    `SELECT fp.*, p.name, p.price, p.category, p.image, p.photos, p.currency,
            u.name AS shop_name, u.verified AS shop_verified, u.country AS shop_country
     FROM flash_promotions fp
     JOIN products p ON p.id = fp.product_id
     JOIN users u ON u.id = fp.shop_id
     WHERE fp.id = $1`,
    [created.id]
  );
  res.status(201).json({ promotion: promoRow(row[0]), ok: true });
}));

// Promotions de la boutique connectée (actives + récemment expirées).
router.get('/mine', authRequired, roleRequired('shop'), ah(async (req, res) => {
  await purgeExpired();
  const rows = await q(
    `SELECT fp.*, p.name, p.price, p.category, p.image, p.photos, p.currency,
            u.name AS shop_name, u.verified AS shop_verified, u.country AS shop_country
     FROM flash_promotions fp
     JOIN products p ON p.id = fp.product_id
     JOIN users u ON u.id = fp.shop_id
     WHERE fp.shop_id = $1
     ORDER BY fp.ends_at ASC`,
    [req.user.id]
  );
  res.json({ promotions: rows.map(promoRow) });
}));

// Annulation (l'enregistrement disparaît totalement de la base).
router.delete('/:id', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const deleted = await q(
    `DELETE FROM flash_promotions WHERE id = $1 AND shop_id = $2 RETURNING id`,
    [Number(req.params.id), req.user.id]
  );
  if (!deleted.length) {
    return res.status(404).json({ error: 'Promotion introuvable.' });
  }
  res.json({ ok: true });
}));

export default router;