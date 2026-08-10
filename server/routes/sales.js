import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function saleRow(s) {
  return {
    ...s,
    total_price: Number(s.total_price),
    commission: Number(s.commission),
    delivery_fee: Number(s.delivery_fee || 0),
    purchase_price: s.purchase_price != null ? Number(s.purchase_price) : null,
    product_price: Math.round((Number(s.total_price) / Number(s.quantity)) * 100) / 100,
  };
}

router.post('/', authRequired, roleRequired('seller'), ah(async (req, res) => {
  const { product_id, quantity } = req.body || {};
  if (!product_id) {
    return res.status(400).json({ error: 'Produit requis' });
  }
  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(product_id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const qty = Number(quantity ?? 1);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }

  const pending = (
    await q(
      'SELECT id FROM sales WHERE product_id = $1 AND seller_id = $2 AND status = $3',
      [product.id, req.user.id, 'pending']
    )
  )[0];
  if (pending) {
    return res.status(409).json({ error: 'Une vente est déjà en attente pour ce produit' });
  }

  const total = Math.round(Number(product.price) * qty * 100) / 100;
  const commission =
    Math.round(Number(product.price) * (Number(product.commission_percent) / 100) * qty * 100) / 100;

  const created = await q(
    `INSERT INTO sales (product_id, seller_id, quantity, total_price, commission)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [product.id, req.user.id, qty, total, commission]
  );

  const sale = saleRow(
    (
      await q(
        `SELECT s.*, p.name AS product_name, p.price, p.commission_percent, u.name AS seller_name
         FROM sales s
         JOIN products p ON p.id = s.product_id
         JOIN users u ON u.id = s.seller_id
         WHERE s.id = $1`,
        [created[0].id]
      )
    )[0]
  );
  res.status(201).json({ sale });
}));

router.get('/my', authRequired, roleRequired('seller'), ah(async (req, res) => {
  const sales = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, p.shop_id, u.name AS shop_name, u.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = p.shop_id
       WHERE s.seller_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    )
  ).map(saleRow);
  const stats = (
    await q(
      `SELECT
         COUNT(*) AS total_sales,
         COALESCE(SUM(commission), 0) AS total_commission,
         COALESCE(SUM(CASE WHEN status IN ('confirmed', 'bought') THEN commission ELSE 0 END), 0) AS earned_commission
       FROM sales WHERE seller_id = $1`,
      [req.user.id]
    )
  )[0];
  res.json({
    sales,
    stats: {
      total_sales: Number(stats.total_sales),
      total_commission: Number(stats.total_commission),
      earned_commission: Number(stats.earned_commission),
    },
  });
}));

router.get('/shop/:shopId', authRequired, roleRequired('shop'), ah(async (req, res) => {
  if (Number(req.params.shopId) !== req.user.id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const sales = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, u.name AS seller_name, u.seller_code, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE p.shop_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    )
  ).map(saleRow);
  const stats = (
    await q(
      `SELECT
         COUNT(*) AS total_sales,
         COALESCE(SUM(s.total_price), 0) AS revenue,
         COALESCE(SUM(s.commission), 0) AS total_commission
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE p.shop_id = $1`,
      [req.user.id]
    )
  )[0];
  res.json({
    sales,
    stats: {
      total_sales: Number(stats.total_sales),
      revenue: Number(stats.revenue),
      total_commission: Number(stats.total_commission),
    },
  });
}));

router.patch('/:id/status', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!['confirmed', 'cancelled', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  const sale = (await q('SELECT * FROM sales WHERE id = $1', [Number(req.params.id)]))[0];
  if (!sale) return res.status(404).json({ error: 'Vente introuvable' });
  const product = (
    await q('SELECT shop_id FROM products WHERE id = $1', [sale.product_id])
  )[0];
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Cette vente ne concerne pas votre boutique' });
  }
  await q('UPDATE sales SET status = $1 WHERE id = $2', [status, sale.id]);
  res.json({ ok: true });
}));

router.get('/livreur', authRequired, roleRequired('livreur'), ah(async (req, res) => {
  const pending = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, p.photos, p.shop_id,
              u.name AS seller_name, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country,
              buyer.name AS buyer_name2
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.status = 'pending'
       ORDER BY s.created_at DESC`
    )
  ).map(saleRow);
  const delivered = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, p.shop_id,
              u.name AS seller_name, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.status = 'delivered' AND s.delivered_by = $1
       ORDER BY s.delivered_at DESC`,
      [req.user.id]
    )
  ).map(saleRow);
  res.json({ pending, delivered });
}));

router.post('/:id/deliver', authRequired, roleRequired('livreur'), ah(async (req, res) => {
  const { delivery_fee, payment_method } = req.body || {};
  const fee = Number(delivery_fee || 0);
  if (!Number.isFinite(fee) || fee < 0) {
    return res.status(400).json({ error: 'Frais de livraison invalides' });
  }
  if (!['espèce', 'mobile', 'espece', 'mobile_money'].includes(String(payment_method || '').toLowerCase())) {
    return res.status(400).json({ error: 'Type de paiement invalide (espèce ou mobile)' });
  }
  const cleanMethod = String(payment_method).toLowerCase().startsWith('m') ? 'mobile' : 'espèce';

  const sale = (await q('SELECT * FROM sales WHERE id = $1', [Number(req.params.id)]))[0];
  if (!sale) return res.status(404).json({ error: 'Vente introuvable' });
  if (sale.status !== 'pending') {
    return res.status(409).json({ error: 'Cette vente n\'est plus en attente' });
  }

  const updated = await q(
    `UPDATE sales
     SET status = 'delivered', delivery_fee = $1, payment_method = $2, delivered_at = now(), delivered_by = $3
     WHERE id = $4 RETURNING id`,
    [fee, cleanMethod, req.user.id, sale.id]
  );

  const product = (await q('SELECT shop_id, quantity FROM products WHERE id = $1', [sale.product_id]))[0];
  if (product && Number(product.quantity) > 0) {
    const remaining = Math.max(0, Number(product.quantity) - Number(sale.quantity));
    await q('UPDATE products SET quantity = $1 WHERE id = $2', [remaining, sale.product_id]);
  }

  await q(
    `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_delivered', $2), ($3, 'sale_delivered', $2)`,
    [sale.seller_id, sale.id, product.shop_id]
  );

  const full = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, u.name AS seller_name, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1`,
      [updated[0].id]
    )
  )[0];

  res.json({ sale: saleRow(full), ok: true });
}));

export default router;

