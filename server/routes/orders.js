import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';
import { sendPush } from '../push.js';
import { listPhotos } from '../photo.js';

const router = Router();

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

router.post('/', async (req, res) => {
  const { items, buyer_name, buyer_phone, buyer_address, buyer_city } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Le panier est vide' });
  }
  if (!buyer_name || !String(buyer_name).trim()) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  const sales = [];
  for (const it of items) {
    const pid = Number(it && it.product_id);
    const qty = Number(it && it.quantity);
    if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'Article invalide' });
    }
    const p = (await q('SELECT * FROM products WHERE id = $1', [pid]))[0];
    if (!p) return res.status(400).json({ error: 'Produit introuvable' });
    if (Number(p.quantity) < qty) {
      return res.status(400).json({ error: `Stock insuffisant pour « ${p.name} »` });
    }
    const commission = Math.round(Number(p.price) * (Number(p.commission_percent) / 100) * qty * 100) / 100;
    const code = await uniqueConfirmCode();
    const created = await q(
      `INSERT INTO sales (product_id, seller_id, quantity, total_price, commission, status, confirm_code, payment_method, buyer_name, buyer_phone, buyer_city, buyer_address, buyer_id)
       VALUES ($1, NULL, $2, $3, $4, 'pending', $5, 'espece', $6, $7, $8, $9, $10) RETURNING id`,
      [
        pid,
        qty,
        Math.round(Number(p.price) * qty * 100) / 100,
        commission,
        code,
        String(buyer_name).trim(),
        buyer_phone ? String(buyer_phone).trim() : null,
        buyer_city ? String(buyer_city).trim() : null,
        buyer_address ? String(buyer_address).trim() : null,
        req.user ? req.user.id : null,
      ]
    );
    const sale = (
      await q(
        `SELECT s.*, p.name AS product_name, p.price, p.contact AS shop_contact, shop.name AS shop_name, shop.country AS shop_country, shop.location AS shop_location
         FROM sales s
         JOIN products p ON p.id = s.product_id
         JOIN users shop ON shop.id = p.shop_id
         WHERE s.id = $1`,
        [created[0].id]
      )
    )[0];
    sale.total_price = Number(sale.total_price);
    sale.price = Number(sale.price);
    sales.push(sale);

    await q(
      `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_confirmed', $2)`,
      [p.shop_id, sale.id]
    );
    await sendPush(p.shop_id, {
      title: 'Nouvelle commande 🛒',
      body: `${sale.product_name} ×${qty} — ${String(buyer_name).trim()}.`,
      url: '/shop',
    });
  }
  res.status(201).json({ sales });
});

router.get('/me', authRequired, async (req, res) => {
  const orders = await q(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ orders: orders.map(orderRow) });
});

export default router;