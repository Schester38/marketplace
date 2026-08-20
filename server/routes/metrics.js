import { Router } from 'express';
import { q } from '../db.js';
import { listPhotos } from '../photo.js';

const router = Router();
const MAX_BATCH = 50;
const MAX_PATH = 200;

router.post('/views', async (req, res) => {
  const raw = Array.isArray(req.body?.views) ? req.body.views.slice(0, MAX_BATCH) : [];
  const views = [];
  for (const item of raw) {
    const type = String(item?.type || '').trim();
    const id = Number(item?.id);
    if ((type === 'product' || type === 'offer') && Number.isInteger(id) && id > 0) {
      views.push([type, id]);
    }
  }
  if (!views.length) return res.status(400).json({ error: 'Requête invalide' });
  for (const [type, id] of views) {
    await q(
      `INSERT INTO item_views (item_type, item_id, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (item_type, item_id, seen_on)
       DO UPDATE SET count = item_views.count + 1`,
      [type, id]
    );
  }
  res.json({ ok: true, counted: views.length });
});

router.post('/visit', async (req, res) => {
  const path = String((req.body && req.body.path) || req.path || '/').slice(0, MAX_PATH);
  const visitorId = String(req.get('X-Visitor-Id') || '').slice(0, 100);
  if (!visitorId) return res.status(400).json({ error: 'Identifiant visiteur manquant' });
  await q(
    `INSERT INTO daily_visits (visitor_id, path)
     VALUES ($1, $2)
     ON CONFLICT (seen_on, visitor_id, path) DO NOTHING`,
    [visitorId, path]
  );
  res.json({ ok: true });
});

router.get('/trending', async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=120, max-age=60, stale-while-revalidate=30');
  const rows = await q(
    `SELECT p.id, p.name, p.price, p.commission_percent, p.currency, p.quantity, p.shop_id, u.name AS shop_name,
            u.country AS shop_country,
            COALESCE(v.w1_views, 0) AS w1_views, COALESCE(s.n, 0) AS sold
     FROM products p
     JOIN users u ON u.id = p.shop_id
     LEFT JOIN (SELECT item_id, SUM(count) AS w1_views
                FROM item_views
                WHERE item_type = 'product' AND seen_on >= CURRENT_DATE - 6
                GROUP BY item_id) v ON v.item_id = p.id
     LEFT JOIN (SELECT product_id, SUM(quantity) AS n
                FROM sales WHERE status = 'delivered' GROUP BY product_id) s ON s.product_id = p.id
     WHERE p.quantity > 0
       AND NOT EXISTS (SELECT 1 FROM flash_promotions fp WHERE fp.product_id = p.id AND fp.ends_at > now())
       AND (COALESCE(v.w1_views, 0) > 0 OR COALESCE(s.n, 0) > 0)
     ORDER BY (COALESCE(v.w1_views, 0) + COALESCE(s.n, 0) * 3) DESC, p.created_at DESC
     LIMIT 6`
  );
  const products = rows.map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    commission_percent: Number(p.commission_percent),
    commission: Math.round(Number(p.price) * (Number(p.commission_percent) / 100) * 100) / 100,
    currency: p.currency,
    shop_id: p.shop_id,
    shop_name: p.shop_name,
    shop_country: p.shop_country,
    quantity: Number(p.quantity),
    image: null,
    w1_views: Number(p.w1_views),
    sold: Number(p.sold),
  }));
  if (products.length) {
    const ids = products.map((p) => p.id);
    const imgs = await q(
      `SELECT id, photos FROM products WHERE id = ANY($1::int[])`,
      [ids]
    );
    const byId = new Map(imgs.map((r) => [r.id, r]));
    for (const p of products) {
      p.image = (listPhotos(byId.get(p.id)?.photos) || [])[0] || null;
    }
  }
  res.json({ products });
});

export default router;