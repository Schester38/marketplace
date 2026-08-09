import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

function parsePhotos(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function orderRow(o) {
  return {
    ...o,
    items: Array.isArray(o.items) ? o.items : [],
    total: Number(o.total),
  };
}

router.post('/', authRequired, async (req, res) => {
  const { items, buyer_name, buyer_phone, buyer_address } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Le panier est vide' });
  }
  if (!buyer_name || !String(buyer_name).trim()) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  const cleanItems = [];
  let total = 0;
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
    const photos = parsePhotos(p.photos);
    cleanItems.push({
      product_id: pid,
      name: p.name,
      price: Number(p.price),
      quantity: qty,
      photo: photos[0] || p.image || null,
    });
    total += Number(p.price) * qty;
  }
  const created = await q(
    `INSERT INTO orders (user_id, buyer_name, buyer_phone, buyer_address, items, total)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      req.user.id,
      String(buyer_name).trim(),
      buyer_phone ? String(buyer_phone).trim() : null,
      buyer_address ? String(buyer_address).trim() : null,
      JSON.stringify(cleanItems),
      Math.round(total * 100) / 100,
    ]
  );
  res.status(201).json({ order: orderRow(created[0]) });
});

router.get('/me', authRequired, async (req, res) => {
  const orders = await q(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ orders: orders.map(orderRow) });
});

export default router;
