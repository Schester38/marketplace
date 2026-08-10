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
  const { product_id, seller_code, purchase_price, buyer_name, buyer_phone } = req.body || {};
  if (!product_id || !seller_code) {
    return res.status(400).json({ error: 'Produit et code vendeur sont requis' });
  }
  const price = Number(purchase_price);
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'Prix d\'achat invalide' });
  }

  const code = String(seller_code).trim().toUpperCase();
  const seller = (await q('SELECT id, name, seller_code FROM users WHERE seller_code = $1', [code]))[0];
  if (!seller) {
    return res.status(400).json({ error: 'Code vendeur invalide' });
  }

  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(product_id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const sale = (
    await q(
      `SELECT * FROM sales WHERE product_id = $1 AND seller_id = $2 AND status = 'pending' ORDER BY id DESC`,
      [product.id, seller.id]
    )
  )[0];
  if (!sale) {
    return res.status(404).json({ error: 'Aucune vente en attente pour ce produit avec ce vendeur' });
  }

  const buyer = req.user;
  const name = buyer_name ? String(buyer_name).trim() : buyer.name;
  const updated = await q(
    `UPDATE sales
     SET status = 'bought', purchase_price = $1, buyer_id = $2, buyer_code = $3,
         buyer_name = $4, buyer_phone = $5
     WHERE id = $6 RETURNING id`,
    [price, buyer.id, code, name, buyer_phone ? String(buyer_phone).trim() : null, sale.id]
  );

  await q(
    `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_bought', $2), ($3, 'sale_bought', $2)`,
    [seller.id, sale.id, product.shop_id]
  );

  const full = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, u.name AS seller_name, shop.name AS shop_name, shop.country AS shop_country
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
