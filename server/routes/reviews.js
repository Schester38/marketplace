import { Router } from "express";
import { q } from "../db.js";
import { authRequired } from "../auth.js";
import { reviewSchema } from "../validators.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  "/product/:id",
  ah(async (req, res) => {
    const productId = Number(req.params.id);
    const [summary] = await q(
      "SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0)::numeric(3, 2) AS avg FROM reviews WHERE product_id = $1",
      [productId]
    );
    const distribution = await q(
      `SELECT rating, COUNT(*) AS n
     FROM reviews WHERE product_id = $1
     GROUP BY rating`,
      [productId]
    );
    const reviews = await q(
      `SELECT r.*, u.name AS user_name
     FROM reviews r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC LIMIT 50`,
      [productId]
    );
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of distribution) dist[d.rating] = Number(d.n);
    res.json({
      summary: { count: Number(summary.n), avg: Number(summary.avg), distribution: dist },
      reviews: reviews.map((r) => ({ ...r, rating: Number(r.rating) })),
    });
  })
);

router.post(
  "/",
  authRequired,
  validate(reviewSchema),
  ah(async (req, res) => {
    const { product_id, rating, comment } = req.body;
    const pid = Number(product_id);
    const r = Number(rating);
    const product = (await q("SELECT id, shop_id FROM products WHERE id = $1", [pid]))[0];
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    if (Number(product.shop_id) === Number(req.user.id)) {
      return res.status(400).json({ error: "Vous ne pouvez pas noter votre propre produit" });
    }
    const deliveredPurchase = (
      await q(
        `SELECT id FROM sales WHERE product_id = $1 AND buyer_id = $2 AND status = 'delivered' LIMIT 1`,
        [pid, req.user.id]
      )
    )[0];
    if (!deliveredPurchase) {
      return res
        .status(403)
        .json({ error: "Vous devez avoir acheté et reçu ce produit avant de laisser un avis" });
    }
    const existing = (
      await q("SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2", [pid, req.user.id])
    )[0];
    const created = existing
      ? (
          await q(
            `UPDATE reviews SET rating = $1, comment = $2, created_at = now()
           WHERE id = $3 RETURNING *`,
            [r, comment ? String(comment).trim().slice(0, 500) : null, existing.id]
          )
        )[0]
      : (
          await q(
            `INSERT INTO reviews (product_id, user_id, buyer_name, rating, comment)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [
              pid,
              req.user.id,
              req.user.name,
              r,
              comment ? String(comment).trim().slice(0, 500) : null,
            ]
          )
        )[0];
    res
      .status(201)
      .json({ review: { ...created, rating: Number(created.rating) }, updated: !!existing });
  })
);

export default router;
