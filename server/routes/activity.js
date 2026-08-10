import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function startOfWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return date;
}

function makeBuckets(start, end, period) {
  const buckets = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let index = 0;
  while (cursor < end && index < 370) {
    let label;
    let key;
    let next;
    if (period === 'weekly') {
      const monday = startOfWeek(cursor);
      key = monday.toISOString().slice(0, 10);
      label = monday.toISOString().slice(0, 10);
      next = new Date(monday);
      next.setUTCDate(next.getUTCDate() + 7);
      cursor.setUTCDate(monday.getUTCDate() + 7);
      cursor.setUTCHours(0, 0, 0, 0);
    } else if (period === 'monthly') {
      key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      label = key;
      next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    } else {
      key = cursor.toISOString().slice(0, 10);
      label = key;
      next = new Date(cursor);
      next.setUTCDate(next.getUTCDate() + 1);
    }
    buckets.push({
      key,
      label,
      start: cursor.toISOString(),
      end: next.toISOString(),
      sales_count: 0,
      sales_total: 0,
      commission: 0,
      commission_paid: 0,
      purchases_count: 0,
      purchases_total: 0,
      orders_count: 0,
      orders_total: 0,
      products_count: 0,
    });
    cursor.setTime(next.getTime());
    index++;
  }
  return buckets;
}

router.get('/', authRequired, ah(async (req, res) => {
  const { from, to, period } = req.query || {};
  const validPeriod = ['daily', 'weekly', 'monthly'].includes(String(period || ''));
  const p = validPeriod ? String(period) : 'daily';
  const today = new Date();
  const end = to ? new Date(to) : today;
  const start = from ? new Date(from) : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 29));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Dates invalides' });
  }
  const endInclusive = new Date(end);
  endInclusive.setUTCDate(endInclusive.getUTCDate() + 1);
  endInclusive.setUTCHours(0, 0, 0, 0);
  const buckets = makeBuckets(start, endInclusive, p);
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  const salesAsSeller = await q(
    `SELECT created_at, status, total_price, commission, paid
     FROM sales WHERE seller_id = $1 AND created_at >= $2 AND created_at < $3`,
    [req.user.id, start.toISOString(), endInclusive.toISOString()]
  );
  const salesAsBuyer = await q(
    `SELECT created_at, purchase_price
     FROM sales WHERE buyer_id = $1 AND created_at >= $2 AND created_at < $3`,
    [req.user.id, start.toISOString(), endInclusive.toISOString()]
  );
  const orders = await q(
    `SELECT created_at, total FROM orders WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
    [req.user.id, start.toISOString(), endInclusive.toISOString()]
  );
  const products = await q(
    `SELECT created_at FROM products WHERE shop_id = $1 AND created_at >= $2 AND created_at < $3`,
    [req.user.id, start.toISOString(), endInclusive.toISOString()]
  );

  const keyOf = (iso) => {
    const d = new Date(iso);
    if (p === 'monthly') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (p === 'weekly') return startOfWeek(d).toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  };

  for (const s of salesAsSeller) {
    const b = byKey.get(keyOf(s.created_at));
    if (!b) continue;
    b.sales_count += 1;
    b.sales_total += Number(s.total_price || 0);
    b.commission += Number(s.commission || 0);
    if (s.paid) b.commission_paid += Number(s.commission || 0);
  }
  for (const s of salesAsBuyer) {
    const b = byKey.get(keyOf(s.created_at));
    if (!b) continue;
    b.purchases_count += 1;
    b.purchases_total += Number(s.purchase_price != null ? s.purchase_price : 0);
  }
  for (const o of orders) {
    const b = byKey.get(keyOf(o.created_at));
    if (!b) continue;
    b.orders_count += 1;
    b.orders_total += Number(o.total || 0);
  }
  for (const pr of products) {
    const b = byKey.get(keyOf(pr.created_at));
    if (!b) continue;
    b.products_count += 1;
  }

  const rows = buckets.map((b) => ({
    period: b.label,
    sales_count: b.sales_count,
    sales_total: Math.round(b.sales_total * 100) / 100,
    commission: Math.round(b.commission * 100) / 100,
    commission_paid: Math.round(b.commission_paid * 100) / 100,
    purchases_count: b.purchases_count,
    purchases_total: Math.round(b.purchases_total * 100) / 100,
    orders_count: b.orders_count,
    orders_total: Math.round(b.orders_total * 100) / 100,
    products_count: b.products_count,
  }));
  res.json({ period: p, rows });
}));

export default router;
