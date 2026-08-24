import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  "/",
  ah(async (req, res) => {
    const message = String(req.body?.message || "")
      .trim()
      .slice(0, 500);
    if (!message) return res.status(400).json({ error: "Message requis" });
    const stack = String(req.body?.stack || "").slice(0, 3000);
    const url = String(req.body?.url || "").slice(0, 300);
    const username = String(req.body?.username || "").slice(0, 80);
    const { name } =
      (await q("SELECT name FROM users WHERE id = $1", [req.user?.id || null]))[0] || {};
    await q(
      "INSERT INTO client_logs (message, stack, url, username, user_id) VALUES ($1, $2, $3, $4, $5)",
      [message, stack || null, url || null, username || name || null, req.user?.id || null]
    );
    res.json({ ok: true });
  })
);

router.get(
  "/list",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const rows = await q(
      `SELECT id, message, LEFT(stack, 500) AS stack, url, username, created_at
     FROM client_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    const [total] = await q("SELECT COUNT(*) AS total FROM client_logs");
    res.json({ logs: rows, total: Number(total.total) });
  })
);

router.delete(
  "/all",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    await q("DELETE FROM client_logs");
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Identifiant invalide" });
    const deleted = await q("DELETE FROM client_logs WHERE id = $1 RETURNING id", [id]);
    if (!deleted.length) return res.status(404).json({ error: "Erreur introuvable" });
    res.json({ ok: true });
  })
);

export default router;
