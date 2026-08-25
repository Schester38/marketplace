import { Router } from "express";
import { q } from "../db.js";
import { authRequired } from "../auth.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isId = (v) => Number.isInteger(v) && v > 0;

router.get(
  "/popup",
  authRequired,
  ah(async (req, res) => {
    const uid = req.user.id;
    // LEFT JOIN obligatoire : les messages "all" ont user_id NULL,
    // une jointure interne les exclurait (popup jamais affichée).
    const rows = await q(
      `SELECT am.id, am.message, am.created_at
     FROM admin_messages am
     LEFT JOIN users u ON u.id = am.user_id
     WHERE (am.target = 'all'
            OR (am.target = 'user' AND am.user_id = $1)
            OR (am.target IN ('shop', 'seller', 'client', 'creator')
                AND am.target = u.role))
       AND am.id NOT IN (SELECT message_id FROM admin_message_reads WHERE user_id = $1)
     ORDER BY am.id DESC
     LIMIT 1`,
      [uid]
    );
    res.json({ message: rows[0] || null });
  })
);

router.post(
  "/:id/ack",
  authRequired,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const uid = req.user.id;
    const existing = (
      await q(
        `SELECT am.id
       FROM admin_messages am
       LEFT JOIN users u ON u.id = am.user_id
       WHERE am.id = $1 AND (am.target = 'all'
             OR (am.target = 'user' AND am.user_id = $2)
             OR (am.target IN ('shop', 'seller', 'client', 'creator')
                 AND am.target = u.role))`,
        [id, uid]
      )
    )[0];
    if (!existing) return res.status(404).json({ error: "Message introuvable" });
    await q(
      `INSERT INTO admin_message_reads (message_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
      [id, uid]
    );
    res.json({ ok: true });
  })
);

export default router;
