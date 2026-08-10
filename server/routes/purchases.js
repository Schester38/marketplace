import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function saleRow(s) {
  return {
    ...s,
    total_price: Number(s.total_price),
    commission: Number(s.commission),
    purchase_price: s.purchase_price != null ? Number(s.purchase_price) : null,
    product_price: Math.round((Number(s.total_price) / Number(s.quantity)) * 100) / 100,
  };
}

router.post('/', authRequired, ah(async (req, res) => {
  const { product_id, seller_code, purchase_price, quantity, buyer_name, buyer_phone, buyer_city, buyer_address } = req.body || {};
  if (!product_id || !seller_code) {
    return res.status(400).json({ error: 'Produit et code vendeur sont requis' });
  }

  const code = String(seller_code).trim().toUpperCase();
  const seller = (await q('SELECT id, name, seller_code FROM users WHERE seller_code = $1', [code]))[0];
  if (!seller) {
    return res.status(400).json({ error: 'Code vendeur invalide' });
  }

  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(product_id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const qty = Number(quantity ?? 1);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }

  const price = purchase_price != null ? Number(purchase_price) : Number(product.price);
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'Prix d\'achat invalide' });
  }

  const buyer = req.user;
  const name = buyer_name ? String(buyer_name).trim() : buyer.name;
  const total = Math.round(price * qty * 100) / 100;
  const commission = Math.round(Number(product.price) * (Number(product.commission_percent) / 100) * qty * 100) / 100;

  const created = await q(
    `INSERT INTO sales (product_id, seller_id, quantity, total_price, commission, status, purchase_price, buyer_id, buyer_code, buyer_name, buyer_phone, buyer_city, buyer_address)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      product.id,
      seller.id,
      qty,
      total,
      commission,
      price,
      buyer.id,
      code,
      name,
      buyer_phone ? String(buyer_phone).trim() : null,
      buyer_city ? String(buyer_city).trim() : null,
      buyer_address ? String(buyer_address).trim() : null,
    ]
  );

  await q(
    `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_order', $2), ($3, 'sale_order', $2)`,
    [seller.id, created[0].id, product.shop_id]
  );

  const full = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, u.name AS seller_name, shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1`,
      [created[0].id]
    )
  )[0];

  res.status(201).json({ sale: saleRow(full), ok: true });
}));

router.get('/my', authRequired, ah(async (req, res) => {
  const purchases = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, p.photos, u.name AS seller_name, shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.buyer_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    )
  ).map(saleRow);
  res.json({ purchases });
}));

export default router;
