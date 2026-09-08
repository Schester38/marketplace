import { Router } from "express";
import { q } from "../db.js";
import { authRequired } from "../auth.js";
import { vapidPublicKey } from "../push.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/key", (req, res) => {
  res.json({ public_key: vapidPublicKey });
});

router.post(
  "/subscribe",
  authRequired,
  ah(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: "Abonnement push invalide" });
    }
    await q(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
      [req.user.id, String(endpoint), { p256dh: String(keys.p256dh), auth: String(keys.auth) }]
    );
    res.json({ ok: true });
  })
);

router.post(
  "/unsubscribe",
  authRequired,
  ah(async (req, res) => {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await q("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [
        req.user.id,
        String(endpoint),
      ]);
    }
    res.json({ ok: true });
  })
);

// Préférences de notifications push (flash / digest / messages). Absence de
// ligne = tout activé par défaut.
router.get(
  "/prefs",
  authRequired,
  ah(async (req, res) => {
    const row = (
      await q("SELECT flash_ok, digest_ok, messages_ok FROM push_prefs WHERE user_id = $1", [
        req.user.id,
      ])
    )[0];
    res.json({
      prefs: {
        flash: row ? row.flash_ok !== false : true,
        digest: row ? row.digest_ok !== false : true,
        messages: row ? row.messages_ok !== false : true,
      },
    });
  })
);

router.put(
  "/prefs",
  authRequired,
  ah(async (req, res) => {
    const b = req.body || {};
    const toBool = (v, dflt) => (typeof v === "boolean" ? v : dflt);
    // Valeurs actuelles comme base (pour ne pas écraser un canal non envoyé).
    const cur = (
      await q("SELECT flash_ok, digest_ok, messages_ok FROM push_prefs WHERE user_id = $1", [
        req.user.id,
      ])
    )[0];
    const flash = toBool(b.flash, cur ? cur.flash_ok !== false : true);
    const digest = toBool(b.digest, cur ? cur.digest_ok !== false : true);
    const messages = toBool(b.messages, cur ? cur.messages_ok !== false : true);
    await q(
      `INSERT INTO push_prefs (user_id, flash_ok, digest_ok, messages_ok, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id)
       DO UPDATE SET flash_ok = $2, digest_ok = $3, messages_ok = $4, updated_at = now()`,
      [req.user.id, flash, digest, messages]
    );
    res.json({ ok: true, prefs: { flash, digest, messages } });
  })
);

export default router;
