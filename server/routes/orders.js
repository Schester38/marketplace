import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { q, withTransaction } from '../db.js';
import { authRequired } from '../auth.js';
import { sendPush } from '../push.js';
import { listPhotos } from '../photo.js';

const router = Router();

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
      /* token invalide/expiré : commande en tant qu'invité */
    }
  }
  next();
};

function orderRow(o) {
  return {
    ...o,
    items: Array.isArray(o.items) ? o.items : [],
    total: Number(o.total),
  };
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len) {
  return Array.from({ length: len }).map(() => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

async function uniqueConfirmCode() {
  for (let i = 0; i < 20; i++) {
    const c = randomCode(6);
    const exists = await q('SELECT id FROM sales WHERE confirm_code = $1', [c]);
    if (!exists.length) return c;
  }
  throw new Error('Impossible de générer un code de commande');
}

router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { items, buyer_name, buyer_phone, buyer_address, buyer_city } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Le panier est vide' });
    if (!buyer_name || !String(buyer_name).trim()) return res.status(400).json({ error: 'Le nom est requis' });
    if (!buyer_phone || !String(buyer_phone).trim()) return res.status(400).json({ error: 'Le numéro de téléphone est requis' });
    if (!buyer_city || !String(buyer_city).trim()) return res.status(400).json({ error: 'La ville est requise' });
    if (!buyer_address || !String(buyer_address).trim()) return res.status(400).json({ error: 'L\'adresse de livraison est requise' });

    const result = await withTransaction(async (tx) => {
      const createdSales = [];
      let orderTotal = 0;
      for (const it of items) {
        const pid = Number(it && it.product_id);
        const qty = Number(it && it.quantity);
        if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty < 1) {
          const e = new Error('Article invalide'); e.statusCode = 400; throw e;
        }
        const p = (await tx.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [pid]))[0];
        if (!p) { const e = new Error('Produit introuvable'); e.statusCode = 400; throw e; }
        if (Number(p.quantity) < qty) { const e = new Error(`Stock insuffisant pour « ${p.name} »`); e.statusCode = 409; throw e; }

        const promo = (await tx.query(
          'SELECT promo_price, commission_percent FROM flash_promotions WHERE product_id = $1 AND ends_at > now()',
          [pid]
        ))[0];
        const price = promo ? Number(promo.promo_price) : Number(p.price);
        const commissionPercent = promo ? Number(promo.commission_percent) : Number(p.commission_percent);
        const total = Math.round(price * qty * 100) / 100;
        const commission = Math.round(price * (commissionPercent / 100) * qty * 100) / 100;
        let referralCommission = 0;
        let referredBy = null;
        if (req.user) {
          const b = (await tx.query('SELECT referred_by FROM users WHERE id = $1', [req.user.id]))[0];
          referredBy = b?.referred_by ? Number(b.referred_by) : null;
          if (referredBy) referralCommission = Math.round(price * qty * 0.02 * 100) / 100;
        }

        const reserved = (await tx.query(
          `UPDATE products SET quantity = quantity - $1, reserved_quantity = COALESCE(reserved_quantity, 0) + $1
           WHERE id = $2 AND quantity >= $1 RETURNING id`, [qty, pid]
        ))[0];
        if (!reserved) { const e = new Error(`Stock insuffisant pour « ${p.name} »`); e.statusCode = 409; throw e; }

        const code = await uniqueConfirmCodeTx(tx);
        const created = (await tx.query(
          `INSERT INTO sales (product_id, seller_id, quantity, total_price, commission, status, purchase_price, currency, buyer_id, buyer_name, buyer_phone, buyer_city, buyer_address, confirm_code, referral_commission, referred_by, payment_method, stock_reserved)
           VALUES ($1, NULL, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'espece', TRUE) RETURNING id`,
          [pid, qty, total, commission, price, p.currency || 'XAF', req.user?.id || null, String(buyer_name).trim(), String(buyer_phone).trim(), String(buyer_city).trim(), String(buyer_address).trim(), code, referralCommission, referredBy]
        ))[0];
        orderTotal += total;
        createdSales.push({ id: created.id, product_id: pid, shop_id: p.shop_id, referred_by: referredBy, referralCommission, name: p.name, quantity: qty, total });
      }

      let orderId = null;
      if (req.user) {
        orderId = (await tx.query(
          `INSERT INTO orders (user_id, buyer_name, buyer_phone, buyer_address, items, total, status)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'new') RETURNING id`,
          [req.user.id, String(buyer_name).trim(), String(buyer_phone).trim(), String(buyer_address).trim(), JSON.stringify(createdSales.map(s => ({ sale_id: s.id, product_id: s.product_id, quantity: s.quantity, total: s.total }))), orderTotal]
        ))[0].id;
      }
      for (const s of createdSales) {
        await tx.query(`INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_order', $2)`, [s.shop_id, s.id]);
        if (s.referred_by) await tx.query(`INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'referral_earned', $2)`, [s.referred_by, s.id]);
      }
      return { createdSales, orderId };
    });

    for (const s of result.createdSales) {
      await sendPush(s.shop_id, { title: 'Nouvelle commande 🛒', body: `${s.name} ×${s.quantity} — ${String(buyer_name).trim()}.`, url: '/shop' });
      if (s.referred_by) await sendPush(s.referred_by, { title: 'Votre filleul a commandé 🎁', body: `${String(buyer_name).trim()} a commandé « ${s.name} » — vous recevrez 2% (${s.referralCommission} F) après livraison.`, url: '/seller' });
    }
    const sales = await q(
      `SELECT s.*, p.name AS product_name, p.price, p.contact AS shop_contact, shop.name AS shop_name, shop.country AS shop_country, shop.location AS shop_location
       FROM sales s JOIN products p ON p.id = s.product_id JOIN users shop ON shop.id = p.shop_id WHERE s.id = ANY($1::int[]) ORDER BY s.id`,
      [result.createdSales.map(s => s.id)]
    );
    res.status(201).json({ order_id: result.orderId, sales: sales.map(s => ({ ...s, total_price: Number(s.total_price), price: Number(s.price) })) });
  } catch (err) { next(err); }
});

async function uniqueConfirmCodeTx(tx) {
  for (let i = 0; i < 20; i++) {
    const c = randomCode(6);
    const exists = (await tx.query('SELECT id FROM sales WHERE confirm_code = $1 FOR SHARE', [c]))[0];
    if (!exists) return c;
  }
  throw new Error('Impossible de générer le code de commande');
}

router.get('/me', authRequired, async (req, res) => {
  const orders = await q(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ orders: orders.map(orderRow) });
});

export default router;