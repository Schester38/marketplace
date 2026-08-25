import { Router } from "express";
import { q } from "../db.js";
import { authRequired } from "../auth.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ACTIVITY_CACHE_TTL_MS = 30 * 1000;
const activityCache = new Map();

function activityCacheKey(req, params) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    )
  ).toString();
  return `${req.user.id}:${qs}`;
}

function startOfWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return date;
}

function makeBuckets(start, end, period) {
  const buckets = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  let index = 0;
  while (cursor < end && index < 370) {
    let label;
    let key;
    let next;
    if (period === "weekly") {
      const monday = startOfWeek(cursor);
      key = monday.toISOString().slice(0, 10);
      label = monday.toISOString().slice(0, 10);
      next = new Date(monday);
      next.setUTCDate(next.getUTCDate() + 7);
      cursor.setUTCDate(monday.getUTCDate() + 7);
      cursor.setUTCHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
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

router.get(
  "/",
  authRequired,
  ah(async (req, res) => {
    const params = { ...req.query };
    const key = activityCacheKey(req, params);
    const cached = activityCache.get(key);
    if (cached && Date.now() - cached.ts < ACTIVITY_CACHE_TTL_MS) {
      return res.json(cached.data);
    }
    const { from, to, period } = params || {};
    const validPeriod = ["daily", "weekly", "monthly"].includes(String(period || ""));
    const p = validPeriod ? String(period) : "daily";
    const today = new Date();
    const end = to ? new Date(to) : today;
    const start = from
      ? new Date(from)
      : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 29));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "Dates invalides" });
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
      if (p === "monthly")
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (p === "weekly") return startOfWeek(d).toISOString().slice(0, 10);
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
    const data = { period: p, rows };
    activityCache.set(key, { ts: Date.now(), data });
    res.json(data);
  })
);

router.get(
  "/events",
  authRequired,
  ah(async (req, res) => {
    const params = { ...req.query };
    const key = activityCacheKey(req, params);
    const cached = activityCache.get(key);
    if (cached && Date.now() - cached.ts < ACTIVITY_CACHE_TTL_MS) {
      return res.json(cached.data);
    }
    const { from, to } = params || {};
    const today = new Date();
    const end = to ? new Date(to) : today;
    const start = from
      ? new Date(from)
      : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 29));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "Dates invalides" });
    }
    const endInclusive = new Date(end);
    endInclusive.setUTCDate(endInclusive.getUTCDate() + 1);
    endInclusive.setUTCHours(0, 0, 0, 0);
    const sISO = start.toISOString();
    const eISO = endInclusive.toISOString();
    const uid = req.user.id;

    const events = [];
    const push = (date, type, description, amount, status, ref) => {
      if (!date) return;
      events.push({
        date: new Date(date).toISOString(),
        type,
        description,
        amount: Math.round(Number(amount || 0) * 100) / 100,
        status: status || "",
        ref: ref || "",
      });
    };

    const products = await q(
      `SELECT id, name, price, created_at FROM products
     WHERE shop_id = $1 AND created_at >= $2 AND created_at < $3`,
      [uid, sISO, eISO]
    );
    for (const p of products) {
      push(p.created_at, "product", p.name, p.price, "", `#P${p.id}`);
    }

    const salesAsSeller = await q(
      `SELECT s.id, s.status, s.total_price, s.commission, s.created_at, p.name AS product_name
     FROM sales s JOIN products p ON p.id = s.product_id
     WHERE s.seller_id = $1 AND s.created_at >= $2 AND s.created_at < $3`,
      [uid, sISO, eISO]
    );
    for (const s of salesAsSeller) {
      push(
        s.created_at,
        "sale",
        `${s.product_name || ""} — x${s.quantity}`,
        s.total_price,
        s.status,
        `#V${s.id}`
      );
      events[events.length - 1].commission = Math.round(Number(s.commission || 0) * 100) / 100;
    }

    const paidCommissions = await q(
      `SELECT s.id, s.commission, s.paid_at, p.name AS product_name
     FROM sales s JOIN products p ON p.id = s.product_id
     WHERE s.seller_id = $1 AND s.paid = TRUE AND s.paid_at >= $2 AND s.paid_at < $3`,
      [uid, sISO, eISO]
    );
    for (const s of paidCommissions) {
      push(s.paid_at, "payment", s.product_name || "", s.commission, "payé", `#V${s.id}`);
    }

    const paidReferrals = await q(
      `SELECT s.id, s.referral_commission, s.referral_paid_at, p.name AS product_name
     FROM sales s JOIN products p ON p.id = s.product_id
     WHERE s.referred_by = $1 AND s.referral_paid = TRUE AND s.referral_paid_at >= $2 AND s.referral_paid_at < $3`,
      [uid, sISO, eISO]
    );
    for (const s of paidReferrals) {
      push(
        s.referral_paid_at,
        "referral",
        s.product_name || "",
        s.referral_commission,
        "payé",
        `#V${s.id}`
      );
    }

    const purchases = await q(
      `SELECT s.id, s.purchase_price, s.status, s.created_at, p.name AS product_name
     FROM sales s JOIN products p ON p.id = s.product_id
     WHERE s.buyer_id = $1 AND s.created_at >= $2 AND s.created_at < $3`,
      [uid, sISO, eISO]
    );
    for (const s of purchases) {
      push(s.created_at, "purchase", s.product_name || "", s.purchase_price, s.status, `#V${s.id}`);
    }

    const orders = await q(
      `SELECT id, status, total, jsonb_array_length(items) AS items, created_at
     FROM orders WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [uid, sISO, eISO]
    );
    for (const o of orders) {
      push(o.created_at, "order", `${o.items || 0} article(s)`, o.total, o.status, `#C${o.id}`);
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    const data = { events };
    activityCache.set(key, { ts: Date.now(), data });
    res.json(data);
  })
);

export default router;
